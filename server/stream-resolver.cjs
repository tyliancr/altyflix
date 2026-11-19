/**
 * ALTYFLIX STREAM RESOLVER (Server-Side Module)
 * Résolution sécurisée et haute performance des flux vidéo sans exposition de secrets API.
 * 
 * Responsabilités :
 * 1. Appel sécurisé à Torrentio / Debrid avec le token serveur (ou token utilisateur).
 * 2. Distinction stricte entre flux en cache ([TB+], [RD+], etc.) et flux en téléchargement ([TB download], etc.).
 * 3. Filtrage absolu des fausses vidéos de redirection (ex: downloading_v3.mp4).
 * 4. Polling intelligent de l'état de téléchargement pour informer le lecteur quand le flux devient 'ready'.
 * 5. Protection SSRF stricte sur toutes les requêtes sortantes.
 */

const crypto = require('crypto');
const { HttpError, positiveInteger, tmdbUrl, BoundedCache } = require('./security.cjs');

// Caches mémoire haute performance (zéro stockage disque, taille strictement bornée)
const streamResolveCache = new Map();
const inFlightResolves = new Map();
const RESOLVE_CACHE_TTL_MS = 120 * 1000; // 2 minutes
const torboxMylistCache = new BoundedCache(100);
const TORBOX_MYLIST_TTL_MS = 30 * 1000; // 30 secondes
const ALLOWED_PROVIDERS = new Set(['torbox', 'realdebrid', 'alldebrid', 'debridlink', 'premiumize']);

function sha256Short(str) {
  return crypto.createHash('sha256').update(String(str || '')).digest('hex').slice(0, 24);
}

function getCachedResolve(key) {
  const entry = streamResolveCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    streamResolveCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedResolve(key, data) {
  if (streamResolveCache.size > 150) {
    const firstKey = streamResolveCache.keys().next().value;
    if (firstKey) streamResolveCache.delete(firstKey);
  }
  streamResolveCache.set(key, { data, expiresAt: Date.now() + RESOLVE_CACHE_TTL_MS });
}

const ALLOWED_POLL_HOSTS = [
  'torrentio.strem.fun',
  'api.torbox.app',
  'torbox.app',
  'tb-cdn.st',
  'b-cdn.net',
  'bunnycdn.com',
  'api.real-debrid.com',
  'real-debrid.com',
  'rdeb.io',
  'api.alldebrid.com',
  'alldebrid.com',
  'debrid.it',
  'debrid-link.com',
  'debrid-link.fr',
  'premiumize.me'
];

/**
 * Valide et normalise une URL autorisée (prévention SSRF stricte : HTTPS uniquement, sans caractères de contrôle, sans port non standard ni credentials)
 */
function normalizeAllowedUrl(urlStr) {
  if (typeof urlStr !== 'string' || !urlStr || /[\x00-\x1f\x7f]/.test(urlStr)) return null;
  try {
    const u = new URL(urlStr);
    if (u.protocol === 'http:' && (!u.port || u.port === '80')) {
      u.protocol = 'https:';
    }
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
    const host = u.hostname.toLowerCase();
    return ALLOWED_POLL_HOSTS.some(h => host === h || host.endsWith('.' + h)) ? u.href : null;
  } catch {
    return null;
  }
}

function isAllowedUrl(urlStr) {
  return normalizeAllowedUrl(urlStr) !== null;
}

/**
 * Extrait les mots-clés significatifs d'un titre pour filtrer les faux positifs
 */
function extractTitleKeywords(title) {
  if (!title || typeof title !== 'string') return [];
  const clean = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
  const STOPWORDS = new Set([
    'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd',
    'the', 'a', 'an', 'and', 'et', 'in', 'en', 'of', 'for', 'pour',
    'to', 'a', 'on', 'sur', 'with', 'avec', 'par', 'by', 'movie', 'film',
    'saison', 'season', 'episode', 'part', 'partie', 'complete', 'integrale'
  ]);
  return clean.split(/\s+/).filter(w => w.length >= 2 && !STOPWORDS.has(w));
}

/**
 * Vérifie si un nom de torrent est pertinent par rapport au titre recherché (avec support multi-titres / VO / VF)
 */
function isTorrentRelevantToTitle(torrentText, titleCandidates) {
  if (!titleCandidates) return true;
  const candidates = (Array.isArray(titleCandidates) ? titleCandidates : [titleCandidates])
    .filter(t => t && typeof t === 'string' && t.trim().length >= 2);
  if (candidates.length === 0) return true;

  const normalizedTorrent = String(torrentText || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ');

  for (const title of candidates) {
    const keywords = extractTitleKeywords(title);
    if (keywords.length === 0) return true;
    const matches = keywords.some(kw => {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      return regex.test(normalizedTorrent);
    });
    if (matches) return true;
  }
  return false;
}

/**
 * Extrait les octets depuis une chaîne (ex: '2.19 GB')
 */
function parseBytes(str) {
  if (!str) return 0;
  const m = String(str).match(/([\d.]+)\s*([KMGT]B)/i);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  if (unit === 'KB') return val * 1024;
  if (unit === 'MB') return val * 1024 * 1024;
  if (unit === 'GB') return val * 1024 * 1024 * 1024;
  if (unit === 'TB') return val * 1024 * 1024 * 1024 * 1024;
  return val;
}

/**
 * Détecte si un stream Torrentio est une erreur explicite (sans faux positif sur les titres contenant "invalid" ou "failed")
 */
function isTorrentioErrorStream(stream) {
  if (!stream) return true;
  const url = String(stream.url || '');
  const title = String(stream.title || stream.description || '').toLowerCase();
  const name = String(stream.name || '').toLowerCase();
  const fullText = (title + ' ' + name).toLowerCase();

  if (url.includes('failed_access') || url.includes('/videos/failed_') || url.includes('slate.elfhosted.com') || url.includes('slate.') || url.includes('docs.elfhosted.com')) return true;
  if (isDownloadingUrl(url)) return true;
  if (name.includes('[❌]') || fullText.includes('obsolete configuration') || /\b(?:tb|rd|ad|pm|dl)?\s*error\b/i.test(name)) return true;
  if (/(?:invalid\s+(?:api|token|key|debrid|auth)|access\s+denied|rate\s+limit\s+exceeded|failed\s+to\s+(?:resolve|access|connect)|not\s+a\s+valid\s+debrid)/i.test(fullText)) return true;

  return false;
}

/**
 * Détecte si une URL pointe vers le clip d'attente de téléchargement ou d'erreur
 */
function isDownloadingUrl(urlStr) {
  if (!urlStr) return false;
  const clean = String(urlStr).toLowerCase();
  return clean.includes('downloading_') || clean.includes('/videos/downloading') || clean.includes('downloading.mp4') || clean.includes('slate.elfhosted.com') || clean.includes('slate.mp4') || clean.includes('slate.m3u8') || clean.includes('docs.elfhosted.com');
}

/**
 * Parse les métadonnées d'un flux Torrentio
 */
function parseStreamDetails(stream, { isFrenchOriginal = false } = {}) {
  const rawTitle = stream.title || stream.description || '';
  const rawName = stream.name || '';
  const filename = stream.behaviorHints?.filename || rawTitle.split('\n')[0] || '';
  const fullText = (rawTitle + ' ' + rawName + ' ' + filename).toLowerCase().replace(/_/g, ' ');

  // Détection du statut Debrid : Cache (+ ou ⚡) vs Téléchargement (download ou ⬇️)
  // Si vérifié en temps réel contre l'API TorBox (_torboxVerifiedCached), la vérité TorBox prime sur Torrentio
  let isCached = /\[(?:tb|rd|ad|pm|dl)?(?:\+|⚡)\]/i.test(rawName) || /\[\+\]/.test(rawName) || rawName.includes('⚡') || Boolean(stream.isTorboxLibrary);
  let isDownloading = !isCached && (rawName.includes('⬇️') || /\[(?:tb|rd|ad|pm|dl)\s+download\]/i.test(rawName) || /download/i.test(rawName));
  if (typeof stream._torboxVerifiedCached === 'boolean') {
    isCached = stream._torboxVerifiedCached;
    isDownloading = !isCached;
  }

  // Détection de résolution (ne jamais classer un DVDRip / XviD en 1080p par défaut)
  let resolution = '1080p FHD';
  let tierKey = '1080p';
  if (/\b(?:4k|2160p|uhd)\b/i.test(fullText)) {
    resolution = '4K Ultra HD';
    tierKey = '4k';
  } else if (/\b(?:1080p|fhd)\b/i.test(fullText)) {
    resolution = '1080p FHD';
    tierKey = '1080p';
  } else if (/\b720p\b/i.test(fullText)) {
    resolution = '720p HD';
    tierKey = '720p';
  } else if (/\b(?:480p|360p|sd|dvdrip|xvid|divx)\b/i.test(fullText)) {
    resolution = '480p SD';
    tierKey = '480p';
  } else if (/\bhd\b/i.test(fullText)) {
    resolution = '720p HD';
    tierKey = '720p';
  }

  // Audio / Langue
  const titleLines = rawTitle.split('\n');
  const mainReleaseName = (titleLines[0] || '').toLowerCase().replace(/_/g, ' ');
  const metaLines = titleLines.slice(1).join('\n').toLowerCase().replace(/_/g, ' ');
  const cleanFilename = filename.toLowerCase().replace(/_/g, ' ');
  const nameNoMultiSub = mainReleaseName.replace(/\bmulti[\s._-]*subs?\b/gi, '');
  const fileNoMultiSub = cleanFilename.replace(/\bmulti[\s._-]*subs?\b/gi, '');

  // 1. Détection stricte des versions sous-titrées (VOSTFR / SUBFRENCH) :
  // Une release VOSTFR ne doit JAMAIS être classée en VF (ce qui laissait le son en anglais !).
  const isExplicitVostfr = /\b(?:vostfr|subfrench|fansub[\s._-]*vostfr|vost)\b/i.test(fullText) ||
    /\b(?:vostfr|subfrench)\b/i.test(filename) ||
    metaLines.includes('subfrench') ||
    metaLines.includes('multi subs') ||
    metaLines.includes('vostfr');

  const hasFrenchFlag = rawTitle.includes('🇫🇷');
  const isTorrent9 = fullText.includes('torrent9');

  // Groupes de releases et trackers francophones reconnus
  const isFrenchGroup = /\b(?:extreme|pop|f4st|supply|bll|fw|fr5|wawacity|torrent9|qtz|dav1nci|gh0st|duff|ulysse|batgirl|glados|slay3r|nbdy|rzp|jaskier)\b/i.test(fullText);

  // Détection explicite du doublage audio français dans le nom
  const hasFrenchDubInName = /\b(?:truefrench|vff|vfq|vfi|vf2|french|audio[\s._-]*fr|vf[\s._-]*hd|fr-en)\b/i.test(nameNoMultiSub) ||
    /\b(?:truefrench|vff|vfq|vfi|vf2|french|audio[\s._-]*fr|vf[\s._-]*hd|fr-en)\b/i.test(fileNoMultiSub) ||
    /\b(?:truefrench|vff|vfq|vfi|vf2|french)\b/i.test(fullText) ||
    /\bvf\b/i.test(mainReleaseName) ||
    /\bvf\b/i.test(cleanFilename);

  // Scene MULTI : un MULTI scene est français s'il provient d'un tracker/groupe français ou porte des indices FR
  const isSceneMulti = /\b(?:multi|multisite)\b/i.test(mainReleaseName) || /\b(?:multi)\b/i.test(cleanFilename);
  const isForeignOnlyMulti = /\b(?:tam\s*\+\s*hin|dub\s*\+\s*(?:\d+x\s*)?mvo|ita\s*[-/]\s*eng|ger\s*[-/]\s*eng|spa\s*[-/]\s*eng|latino|hindi|tamil|telugu|rus\s*[-/]\s*eng)\b/i.test(fullText);
  const isFrenchMulti = isSceneMulti && !isForeignOnlyMulti && (
    isTorrent9 ||
    hasFrenchFlag ||
    hasFrenchDubInName ||
    isFrenchGroup ||
    /\b(?:fr|fre|francais|vff|vf2|vfq)\b/i.test(fullText)
  );

  const hasFrenchAudioInAudioLine = /(?:multi\s*audio|\bfr\b|\bfre\b|\bfrancais\b|\bfrench\b).*🇫🇷|🇫🇷.*(?:multi\s*audio|\bfr\b|\bfre\b|\bfrancais\b|\bfrench\b)/i.test(rawTitle);

  // Détection des releases Multi où l'anglais est sur Track 0 :
  // Ex: "EN/ITA/FR/ES", "EN/FR", "EN/ES", "English/French", "Multi5", "Multi7"
  const isEnglishPrimaryMulti = /\b(?:en(?:g)?\s*[/|-]\s*(?:ita|es|fr|de|ger|spa|multi))\b/i.test(rawTitle) ||
    /\b(?:en\/ita\/fr|en\/fr|en\/es|english.*french|eng\s*[/|-]\s*fre)\b/i.test(fullText) ||
    /\b(?:multi(?:ple)?\s*audio.*(?:en|eng|english))\b/i.test(fullText) ||
    /\b(?:dual.*(?:eng|en))\b/i.test(fullText);

  // Détection des releases Russes ou étrangères où le français n'est pas en piste 0
  const isForeignPrimaryMulti = /\b(?:dub\s*\+\s*(?:\d+x\s*)?mvo|rus\s*[/|-]\s*eng)\b/i.test(fullText);

  const isNonFrenchDub = /\b(?:german|deutsch|italian|italiano|spanish|espanol|castellano|portuguese|russian|japanese|korean|hindi|tamil)\s*dub\b/i.test(fullText) ||
    /\b(?:ita\s*[-/]\s*eng|ger\s*[-/]\s*eng|spa\s*[-/]\s*eng|latino|hindi|tamil|telugu)\b/i.test(fullText);

  // La VF doit être une vraie version française (jamais une VOSTFR !)
  const hasFrenchAudio = Boolean(!isExplicitVostfr && !isForeignPrimaryMulti && (
    hasFrenchDubInName ||
    isFrenchMulti ||
    hasFrenchAudioInAudioLine ||
    (isTorrent9 && !isExplicitVostfr) ||
    (hasFrenchFlag && !isExplicitVostfr) ||
    (isFrenchOriginal && !isNonFrenchDub)
  ));
  const isPureFrench = Boolean(hasFrenchAudio && !isEnglishPrimaryMulti);
  const isFrench = hasFrenchAudio;

  const isVostfr = !isFrench && Boolean(
    isExplicitVostfr ||
    (hasFrenchFlag && isExplicitVostfr) ||
    metaLines.includes('subfrench') ||
    metaLines.includes('multi subs')
  );

  const isMp4 = /\.mp4(?:\?|$)/i.test(stream?.url || '') || /\.mp4(?:$|\?|\s|["')\]])/i.test(filename);
  const isAvi = /\.avi(?:\?|$)/i.test(stream?.url || '') || /\.avi(?:$|\?|\s|["')\]])/i.test(filename) || /\b(?:xvid|divx)\b/i.test(fullText);
  const isMkv = /\.mkv(?:\?|$)/i.test(stream?.url || '') || /\.mkv(?:$|\?|\s|["')\]])/i.test(filename) || (!isMp4 && !isAvi);
  const isWebm = /\.webm(?:\?|$)/i.test(stream?.url || '') || /\.webm(?:$|\?|\s|["')\]])/i.test(filename);

  // Video Codecs
  const isAv1 = /\b(?:av1|d?av1nci|av01)\b/i.test(fullText);
  const isH265 = /\b(?:[xh][.\s_-]?265|hevc|10bit)\b/i.test(fullText);
  const isH264 = /\b(?:[xh][.\s_-]?264|avc(?:-?1)?)\b/i.test(fullText);

  // Détection audio :
  // 1. Codecs audio universellement compatibles navigateur (AAC stéréo ou 5.1, MP3, Opus, FLAC)
  const hasAac = /\b(?:he-?)?aac(?:\s*\.?\s*[257]\.?[01])?\b/i.test(fullText);
  const hasMp3 = /\bmp3\b/i.test(fullText);
  const hasOpus = /\bopus(?:\s*\.?\s*[257]\.?[01])?\b/i.test(fullText);
  const hasFlac = /\bflac\b/i.test(fullText);
  // Rips TV ou pistes stéréo françaises (LD, MD, Line, Mic, HDTV/PDTV sans DDP/5.1)
  const hasFrenchStereoRip = /\b(?:ld|md|line[\s._-]*dub(?:bed)?|mic[\s._-]*dub(?:bed)?)\b/i.test(fullText) ||
    (/\b(?:hdtv|pdtv|dsr|tvrip)\b/i.test(fullText) && !/\b(?:5\.1|7\.1|ddp|eac3|ac3|dts)\b/i.test(fullText));
  // Groupes de micro-encodages web garantissant des pistes AAC/Opus
  const isWebAudioGroup = /\b(?:yts|yify|galaxytv|tgx|joy|ozlem|psa|megusta|qxr|tigole|utr|qman|ion10|ion265|kontrast|vyndros|minx|vxt|rapta|pir8|lordvako)\b/i.test(fullText);
  
  // 2. Multicanal 7.1 / 8ch ou Opus multicanal sortant muet sans downmix matériel sur PC / navigateur
  const has71Or8ch = /\b(?:7\.1|8ch)\b/i.test(fullText);
  const hasOpusMultichannel = /\bopus(?:\s*\.?\s*[7]\.?[01]|\s*\.?\s*8ch)\b/i.test(fullText);
  const hasMultichannelSilence = has71Or8ch || hasOpusMultichannel;

  // 3. Codecs Dolby AC-3 / E-AC-3 / DDP (jouables nativement sur Safari, Edge Windows, Smart TVs, Android TV, et Chrome avec codec OS)
  const isAc3OrDdp = /(?:\bdd\+(?![a-z])|\b(?:ac3|ac-3|e-?ac-?3|eac3|ddp(?:\s*\.?\s*[257]\.?[01])?|dd\s*\.?\s*[257]\.?[01])\b)/i.test(fullText);

  // 4. Codecs propriétaires non décodés par les navigateurs web (DTS, TrueHD, Atmos sans fallback AAC)
  const isDtsOrTrueHd = /(?:\b(?:truehd|atmos|dts(?:-?hd)?|dts-?x|dts-?ma|lpcm)\b)/i.test(fullText);
  const hasUnsupportedAudioCodec = isAc3OrDdp || isDtsOrTrueHd;
  const hasAtmosOrTrueHdOrDts = isDtsOrTrueHd;
  const hasExplicitWebAudio = Boolean(hasAac || hasMp3 || (hasOpus && !hasMultichannelSilence) || hasFlac || hasFrenchStereoRip);

  // Son 100 % garanti dans le navigateur (Chrome, Firefox, Safari, Edge, Mobile) :
  const isWebAudioSafe = Boolean((hasExplicitWebAudio && !isDtsOrTrueHd && !hasMultichannelSilence) || 
    ((isWebAudioGroup || isMp4) && !hasUnsupportedAudioCodec && !hasMultichannelSilence));

  // Flux nécessitant attention audio :
  // Si le flux a explicitement AAC/MP3 (ou LD), il n'est PAS pénalisé
  const hasUnsupportedAudio = Boolean((!hasExplicitWebAudio && (isAc3OrDdp || !isWebAudioSafe)) || isDtsOrTrueHd || hasMultichannelSilence);

  // Compatibilité MKV / HEVC navigateur : Chrome ne sait PAS démultiplexer le HEVC (H.265) dans un conteneur MKV
  const isMkvHevcUnplayable = Boolean(isMkv && isH265 && !isAv1);

  // Qualité de la source originale : BluRay / WEB-DL garantissent une image nette
  const isHighQualitySource = /\b(?:bluray|bdrip|brrip|web-?dl|web-?rip|hdtv)\b/i.test(fullText);
  // Rejets stricts des captures basse qualité (CAM, Telesync, Screener)
  const isCamOrLowQuality = /\b(?:cam|camrip|hdcam|telesync|ts|hdts|telecine|tc|scr|screener|dvdscr|r5|workprint|wp)\b/i.test(fullText);
  // Doublage de référence : VFF / TrueFrench
  const isVffOrTrueFrench = /\b(truefrench|vff)\b/i.test(fullText);
  const isMulti = /\bmulti\b/i.test(fullText);
  const isProper = /\b(?:proper|repack|rerip)\b/i.test(fullText);
  // Teams de releases réputées pour des encodages propres sans freeze ni désynchronisation
  const isTrustedGroup = /\b(?:extreme|pop|f4st|supply|bll|fw|fr5|wawacity|torrent9|qtz|dav1nci|gh0st|duff|yts|yify|vxt|galaxytv|tgx|qxr|tigole|utr|joy|psa|bone|minx|flux|ntb)\b/i.test(fullText);

  // Taille & seeds
  const sizeMatch = rawTitle.match(/💾\s*([\d.]+\s*[KMGT]B)/i);
  const size = sizeMatch ? sizeMatch[1] : '';
  const sizeBytes = size ? parseBytes(size) : 0;

  const seedsMatch = rawTitle.match(/👤\s*(\d+)/);
  const seeds = seedsMatch ? parseInt(seedsMatch[1], 10) : 0;

  let languageLabel = 'Version Originale';
  if (isFrenchOriginal && isFrench && !hasFrenchDubInName && !hasFrenchFlag) languageLabel = 'Français (Original)';
  else if (isPureFrench) languageLabel = 'Français (VF)';
  else if (isFrench) languageLabel = 'Français (MULTI · VF)';
  else if (isVostfr) languageLabel = 'VOSTFR (Sous-titres FR)';

  return {
    resolution,
    tierKey,
    isCached,
    isDownloading,
    isFrench,
    isVostfr,
    isWebAudioSafe,
    hasUnsupportedAudio,
    isH264,
    isH265,
    isAv1,
    isMp4,
    isAvi,
    isMkv,
    isMkvHevcUnplayable,
    isHighQualitySource,
    isCamOrLowQuality,
    isPureFrench,
    isVffOrTrueFrench,
    isMulti,
    isProper,
    isTrustedGroup,
    size,
    sizeBytes,
    seeds,
    filename: filename || 'Vidéo',
    languageLabel
  };
}

/**
 * Système de score et curation des flux vidéo
 */
function curateStreams(rawStreams, provider, {
  enableAviTranscode = true,
  enableAudioRemux = enableAviTranscode,
  preferredLang = 'vf',
  contentType = 'movie',
  cleanTitle = '',
  titleVariants = [],
  isFrenchOriginal = false
} = {}) {
  const preferVo = String(preferredLang || '').toLowerCase() === 'vo' || String(preferredLang || '').toLowerCase() === 'vostfr';
  const isMovie = String(contentType || 'movie').toLowerCase() !== 'tv';
  const isHd1080Plus = (s) => s.tierKey === '1080p' || s.tierKey === '4k';

  const allVariants = Array.from(new Set([cleanTitle, ...(Array.isArray(titleVariants) ? titleVariants : [titleVariants])].filter(Boolean)));

  const validAll = rawStreams
    .filter(s => {
      if (typeof s.url !== 'string' || normalizeAllowedUrl(s.url) === null || isTorrentioErrorStream(s)) return false;
      const combined = `${s.filename || ''} ${s.title || ''} ${s.name || ''}`;
      if (allVariants.length > 0 && !isTorrentRelevantToTitle(combined, allVariants)) return false;
      return true;
    })
    .map((s, idx) => {
      const normalizedUrl = normalizeAllowedUrl(s.url);
      const details = parseStreamDetails(s, { isFrenchOriginal });
      return {
        id: `stream-${idx}`,
        url: normalizedUrl,
        quality: details.resolution,
        tierKey: details.tierKey,
        isCached: details.isCached,
        isDownloading: details.isDownloading,
        isFrench: details.isFrench,
        isVostfr: details.isVostfr,
        isWebAudioSafe: details.isWebAudioSafe,
        hasUnsupportedAudio: details.hasUnsupportedAudio,
        isH264: details.isH264,
        isH265: details.isH265,
        isAv1: details.isAv1,
        isMp4: details.isMp4,
        isAvi: details.isAvi,
        isMkv: details.isMkv,
        isMkvHevcUnplayable: details.isMkvHevcUnplayable,
        isTorboxLibrary: Boolean(s.isTorboxLibrary),
        isHighQualitySource: details.isHighQualitySource,
        isCamOrLowQuality: details.isCamOrLowQuality,
        isPureFrench: details.isPureFrench,
        isVffOrTrueFrench: details.isVffOrTrueFrench,
        isMulti: details.isMulti,
        isProper: details.isProper,
        isTrustedGroup: details.isTrustedGroup,
        languageLabel: details.languageLabel,
        size: details.size,
        sizeBytes: details.sizeBytes,
        seeds: details.seeds,
        filename: details.filename,
        rawTitle: s.title || s.name || '',
        provider
      };
    });

  // Pour les films, imposer 1080p minimum (1080p / 4K) dès qu'une source >= 1080p est exploitable (sans sacrifier un 720p en cache face à du 1080p non caché)
  const movieHdPool = isMovie ? validAll.filter(isHd1080Plus) : [];
  const anyCachedAll = validAll.some(s => s.isCached);
  const basePool = (isMovie && movieHdPool.length > 0 && (!anyCachedAll || movieHdPool.some(s => s.isCached))) ? movieHdPool : validAll;

  // RÈGLE D'OR : Filtrage intelligent des flux compatibles dans le navigateur
  const isPlayableInBrowser = (s) => {
    // 1. Rejet strict des formats vidéo anciens non décodables nativement (AVI/XviD) si aucun transcodage actif
    if (s.isAvi && !s.isTranscoded && !enableAviTranscode) return false;

    // 2. Rejet strict des MKV contenant du HEVC (H.265) que Chrome ne sait pas démultiplexer (code 4 MEDIA_ERR_SRC_NOT_SUPPORTED)
    if (s.isMkvHevcUnplayable) return false;

    // 3. Rejet des 4K AVI non décodables
    if (s.tierKey === '4k' && s.isAvi) return false;

    return true;
  };

  const playablePool = basePool.filter(isPlayableInBrowser);
  // Le pool valide contient les flux lisibles sans sacrifier la VF
  const valid = (playablePool.length > 0) ? playablePool : basePool.filter(s => !s.isDead);

  if (valid.length === 0) {
    return { streams: [], activeStream: null, hasTrueVf: false, allDownloading: false };
  }

  const scoreStream = (st) => {
    let score = 0;

    // 0. ÉLIMINATION RIGOUREUSE DES COPIES DE BASSE QUALITÉ (CAM, Telesync, Screener)
    if (st.isCamOrLowQuality) score -= 600000;

    // 1. PRIORITÉ ABSOLUE : Flux déjà en cache (+100 000) vs Téléchargement (-500 000)
    // Garantit qu'un flux immédiatement lisible est TOUJOURS choisi avant un flux en attente
    if (st.isCached) score += 100000;
    if (st.isDownloading) score -= 500000;

    // 2. Qualité vidéo : 1080p / 4K fortement privilégiés (1080p minimum sur les films)
    if (st.tierKey === '1080p') score += 45000;
    else if (st.tierKey === '4k') score += 20000;
    else if (st.tierKey === '720p') score += isMovie ? -40000 : 10000;
    else score += isMovie ? -80000 : 0;

    // 3. Audio compatible navigateur HTML5 (AAC / MP3 / Opus) vs codecs silencieux dans Chrome (AC3 / EAC3 / DTS / TrueHD)
    // Sans remux FFmpeg (ex: Netlify serverless), un flux AAC/Opus garantit 100% de son sur tout navigateur
    if (st.isWebAudioSafe) score += enableAudioRemux ? 15000 : 55000;
    if (st.hasUnsupportedAudio) score -= enableAudioRemux ? 10000 : 35000;

    // 4. Langue préférée (VF par défaut, ou VO/VOSTFR si demandé)
    if (preferVo) {
      if (!st.isFrench) score += 130000;
      else score += 500;
    } else {
      if (st.isFrench) score += 130000;
      else if (st.isVostfr) score += 15000;
    }

    // 5. Source d'origine certifiée : BluRay / BDRip / WEB-DL garantissent une image propre
    if (st.isHighQualitySource) score += 18000;

    // 6. Doublage français de référence : VFF / TRUEFRENCH
    if (st.isPureFrench) score += 30000;
    if (st.isVffOrTrueFrench) score += 20000;
    // Une vraie release VF sans MULTI a une seule piste sonore -> son français garanti à 100% au lancement
    if (st.isFrench && !st.isMulti) score += 15000;
    if (st.isProper) score += 5000;
    if (st.isTrustedGroup) score += 8000;

    // 7. Codec et format vidéo : H.264 universellement compatible web vs H.265/HEVC (peut échouer sans extension)
    if (st.isH264) score += 12000;
    if (st.isH265) score -= 15000;
    if (st.isMp4) score += 3000;
    if (st.isAvi && !enableAviTranscode) score -= 400000;

    // 8. Poids adapté à la bande passante (sweet spot streaming 1.2 - 4.5 Go en 1080p)
    const gb = st.sizeBytes / (1024 * 1024 * 1024);
    if (st.tierKey === '1080p') {
      if (gb >= 1.2 && gb <= 4.5) score += 800;
      else if (gb >= 0.7 && gb < 1.2) score += 300;
      else if (gb > 18) score -= 1500;
    } else if (st.tierKey === '4k') {
      if (gb >= 4 && gb <= 14) score += 800;
      else if (gb > 25) score -= 2000;
    }

    // 9. Seeders
    score += Math.min(100, Math.round(st.seeds / 2));
    return score;
  };

  const scored = valid.map(s => ({ ...s, score: scoreStream(s) }));
  scored.sort((a, b) => b.score - a.score);

  const hasTrueVf = scored.some(s => s.isFrench);
  const anyCached = scored.some(s => s.isCached);
  const allDownloading = !anyCached && scored.every(s => s.isDownloading);

  // Détermination du meilleur flux actif (priorité absolue à la langue demandée : VF par défaut !)
  const matchesPrefLang = (s) => (preferVo ? !s.isFrench : s.isFrench);
  const audioPlayable = (s) => enableAudioRemux || s.isWebAudioSafe || !s.hasUnsupportedAudio;

  let defaultActive = null;
  if (anyCached) {
    const cachedPreferred = (!enableAudioRemux)
      ? (
          // Quand aucun remux audio FFmpeg n'est disponible (Netlify/navigateur),
          // priorité aux flux avec son 100% garanti (AAC/Opus) : 1080p puis 4K
          scored.find(s => s.isCached && matchesPrefLang(s) && s.isWebAudioSafe && s.tierKey === '1080p') ||
          scored.find(s => s.isCached && matchesPrefLang(s) && s.isWebAudioSafe && s.tierKey === '4k') ||
          scored.find(s => s.isCached && matchesPrefLang(s) && s.isWebAudioSafe) ||
          // Ensuite les flux avec audio AC3/DDP : 1080p puis 4K
          scored.find(s => s.isCached && matchesPrefLang(s) && audioPlayable(s) && s.tierKey === '1080p') ||
          scored.find(s => s.isCached && matchesPrefLang(s) && audioPlayable(s) && s.tierKey === '4k') ||
          scored.find(s => s.isCached && matchesPrefLang(s) && audioPlayable(s)) ||
          // Autre VF
          scored.find(s => s.isCached && matchesPrefLang(s) && s.tierKey === '1080p') ||
          scored.find(s => s.isCached && matchesPrefLang(s) && s.tierKey === '4k') ||
          scored.find(s => s.isCached && matchesPrefLang(s)) ||
          // Repli VO
          scored.find(s => s.isCached && s.isWebAudioSafe && s.tierKey === '1080p') ||
          scored.find(s => s.isCached && s.isWebAudioSafe && s.tierKey === '4k') ||
          scored.find(s => s.isCached && s.isWebAudioSafe) ||
          scored.find(s => s.isCached && audioPlayable(s) && s.tierKey === '1080p') ||
          scored.find(s => s.isCached && audioPlayable(s) && s.tierKey === '4k') ||
          scored.find(s => s.isCached && audioPlayable(s)) ||
          scored.find(s => s.isCached && s.tierKey === '1080p') ||
          scored.find(s => s.isCached && s.tierKey === '4k') ||
          scored.find(s => s.isCached)
        )
      : (
          // Avec remux audio actif : 1080p est le format roi, même en AC3
          scored.find(s => s.isCached && matchesPrefLang(s) && s.isWebAudioSafe && s.tierKey === '1080p') ||
          scored.find(s => s.isCached && matchesPrefLang(s) && audioPlayable(s) && s.tierKey === '1080p') ||
          scored.find(s => s.isCached && matchesPrefLang(s) && s.tierKey === '1080p') ||
          scored.find(s => s.isCached && matchesPrefLang(s) && s.isWebAudioSafe && s.tierKey === '4k') ||
          scored.find(s => s.isCached && matchesPrefLang(s) && audioPlayable(s) && s.tierKey === '4k') ||
          scored.find(s => s.isCached && matchesPrefLang(s) && s.tierKey === '4k') ||
          scored.find(s => s.isCached && matchesPrefLang(s) && s.isWebAudioSafe) ||
          scored.find(s => s.isCached && matchesPrefLang(s) && audioPlayable(s)) ||
          scored.find(s => s.isCached && matchesPrefLang(s)) ||
          scored.find(s => s.isCached && s.isWebAudioSafe && s.tierKey === '1080p') ||
          scored.find(s => s.isCached && audioPlayable(s) && s.tierKey === '1080p') ||
          scored.find(s => s.isCached && s.tierKey === '1080p') ||
          scored.find(s => s.isCached && s.isWebAudioSafe && s.tierKey === '4k') ||
          scored.find(s => s.isCached && audioPlayable(s) && s.tierKey === '4k') ||
          scored.find(s => s.isCached && s.tierKey === '4k') ||
          scored.find(s => s.isCached && audioPlayable(s)) ||
          scored.find(s => s.isCached)
        );
    defaultActive = cachedPreferred || scored[0];
  } else {
    defaultActive = (!enableAudioRemux)
      ? (
          scored.find(s => matchesPrefLang(s) && s.isWebAudioSafe && s.tierKey === '1080p') ||
          scored.find(s => matchesPrefLang(s) && s.isWebAudioSafe && s.tierKey === '4k') ||
          scored.find(s => matchesPrefLang(s) && s.isWebAudioSafe) ||
          scored.find(s => matchesPrefLang(s) && audioPlayable(s) && s.tierKey === '1080p') ||
          scored.find(s => matchesPrefLang(s) && audioPlayable(s) && s.tierKey === '4k') ||
          scored.find(s => matchesPrefLang(s) && audioPlayable(s)) ||
          scored.find(s => matchesPrefLang(s) && s.tierKey === '1080p') ||
          scored.find(s => matchesPrefLang(s) && s.tierKey === '4k') ||
          scored.find(s => matchesPrefLang(s)) ||
          scored.find(s => s.isWebAudioSafe && s.tierKey === '1080p') ||
          scored.find(s => s.isWebAudioSafe && s.tierKey === '4k') ||
          scored.find(s => s.isWebAudioSafe) ||
          scored[0]
        )
      : (
          scored.find(s => matchesPrefLang(s) && s.isWebAudioSafe && s.tierKey === '1080p') ||
          scored.find(s => matchesPrefLang(s) && audioPlayable(s) && s.tierKey === '1080p') ||
          scored.find(s => matchesPrefLang(s) && s.tierKey === '1080p') ||
          scored.find(s => matchesPrefLang(s) && s.isWebAudioSafe && s.tierKey === '4k') ||
          scored.find(s => matchesPrefLang(s) && audioPlayable(s) && s.tierKey === '4k') ||
          scored.find(s => matchesPrefLang(s) && s.tierKey === '4k') ||
          scored.find(s => matchesPrefLang(s) && s.isWebAudioSafe) ||
          scored.find(s => matchesPrefLang(s) && audioPlayable(s)) ||
          scored.find(s => matchesPrefLang(s)) ||
          scored.find(s => s.isWebAudioSafe && s.tierKey === '1080p') ||
          scored.find(s => audioPlayable(s) && s.tierKey === '1080p') ||
          scored.find(s => s.tierKey === '1080p') ||
          scored.find(s => s.isWebAudioSafe && s.tierKey === '4k') ||
          scored.find(s => s.tierKey === '4k') ||
          scored.find(s => s.isWebAudioSafe) ||
          scored[0]
        );
  }

  // Sélection intelligente par palier de qualité (4K, 1080p, 720p) et langue (VF / VO)
  // Évite les doublons identiques et garantit des boutons de qualité clairs et fonctionnels dans le lecteur
  const selectedList = [];
  const seenKeys = new Set();
  const seenIds = new Set();

  if (defaultActive) {
    const activeKey = `${defaultActive.tierKey}:${defaultActive.isFrench ? 'vf' : (defaultActive.isVostfr ? 'vostfr' : 'vo')}`;
    seenKeys.add(activeKey);
    seenIds.add(defaultActive.id);
    selectedList.push(defaultActive);
  }

  const ensureLangSlot = (predicate) => {
    if (selectedList.some(predicate)) return;
    const candidate =
      scored.find(s => !seenIds.has(s.id) && predicate(s) && s.isCached && s.tierKey === '1080p') ||
      scored.find(s => !seenIds.has(s.id) && predicate(s) && s.isCached && s.tierKey === '4k') ||
      scored.find(s => !seenIds.has(s.id) && predicate(s) && s.isCached) ||
      scored.find(s => !seenIds.has(s.id) && predicate(s));
    if (candidate) {
      const key = `${candidate.tierKey}:${candidate.isFrench ? 'vf' : (candidate.isVostfr ? 'vostfr' : 'vo')}`;
      seenKeys.add(key);
      seenIds.add(candidate.id);
      selectedList.push(candidate);
    }
  };
  ensureLangSlot(s => s.isFrench);
  ensureLangSlot(s => !s.isFrench);

  // Garantie audio universelle : si la VF est présente, s'assurer qu'au moins une version avec son web garanti (AAC/MP3)
  // ET une version multicanal Dolby HD (si présente) sont incluses dans les choix
  if (hasTrueVf) {
    const ensureVfAudioChoice = (wantWebAudio) => {
      if (selectedList.some(s => s.isFrench && Boolean(s.isWebAudioSafe) === wantWebAudio)) return;
      const cand =
        scored.find(s => !seenIds.has(s.id) && s.isFrench && Boolean(s.isWebAudioSafe) === wantWebAudio && s.isCached && s.tierKey === '1080p') ||
        scored.find(s => !seenIds.has(s.id) && s.isFrench && Boolean(s.isWebAudioSafe) === wantWebAudio && s.isCached) ||
        scored.find(s => !seenIds.has(s.id) && s.isFrench && Boolean(s.isWebAudioSafe) === wantWebAudio);
      if (cand) {
        const key = `${cand.tierKey}:${cand.isFrench ? 'vf' : 'vo'}:${cand.isWebAudioSafe ? 'aac' : 'other'}`;
        seenKeys.add(key);
        seenIds.add(cand.id);
        selectedList.push(cand);
      }
    };
    ensureVfAudioChoice(true);  // Version avec son web 100% garanti (AAC/MP3)
    ensureVfAudioChoice(false); // Version Dolby/HD (si présente)
  }

  // 1er passage : Meilleur flux pour chaque combinaison distincte (résolution + langue)
  for (const s of scored) {
    if (selectedList.length >= 6) break;
    if (seenIds.has(s.id)) continue;
    const key = `${s.tierKey}:${s.isFrench ? 'vf' : (s.isVostfr ? 'vostfr' : 'vo')}:${s.isWebAudioSafe ? 'aac' : 'other'}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      seenIds.add(s.id);
      selectedList.push(s);
    }
  }

  // 2e passage : Alternatives restantes pour atteindre au moins 4 choix si disponibles
  for (const s of scored) {
    if (selectedList.length >= 4) break;
    if (seenIds.has(s.id)) continue;
    seenIds.add(s.id);
    selectedList.push(s);
  }

  // Tri propre : Flux en cache D'ABORD, puis 4K -> 1080p -> 720p, puis VF avant VO
  const tierOrder = { '4k': 0, '1080p': 1, '720p': 2, '480p': 3 };
  selectedList.sort((a, b) => {
    if (a.isCached !== b.isCached) return a.isCached ? -1 : 1;
    const ta = tierOrder[a.tierKey] ?? 9;
    const tb = tierOrder[b.tierKey] ?? 9;
    if (ta !== tb) return ta - tb;
    if (a.isFrench !== b.isFrench) return a.isFrench ? -1 : 1;
    return b.score - a.score;
  });

  // Détection des doublons de labels de base pour enrichir le libellé avec l'info audio (AAC vs Dolby)
  const baseCounts = new Map();
  selectedList.forEach(s => {
    const base = `${s.quality} · ${s.isFrench ? 'VF' : (s.isVostfr ? 'VOSTFR' : 'VO')}`;
    baseCounts.set(base, (baseCounts.get(base) || 0) + 1);
  });

  // Ajout des libellés de qualité et routage transcodage AVI si nécessaire
  const formattedStreams = selectedList.map(s => {
    const base = `${s.quality} · ${s.isFrench ? 'VF' : (s.isVostfr ? 'VOSTFR' : 'VO')}`;
    let qLabel = base;
    if ((baseCounts.get(base) || 0) > 1) {
      if (s.isWebAudioSafe) {
        qLabel += ' (Stéréo AAC)';
      } else if (/ddp|eac3|ac3|atmos/i.test(`${s.filename} ${s.rawTitle}`)) {
        qLabel += ' (Dolby 5.1)';
      } else {
        qLabel += ' (Option 2)';
      }
    }

    const canTranscodeAvi = Boolean(s.isAvi && enableAviTranscode);
    const streamPlaybackUrl = (canTranscodeAvi && s.url.startsWith('http')) ? `/api/video-stream?url=${encodeURIComponent(s.url)}` : s.url;

    return {
      ...s,
      url: streamPlaybackUrl,
      originalUrl: s.url,
      isTranscoded: canTranscodeAvi,
      qualityLabel: qLabel
    };
  });

  const activeCanTranscodeAvi = Boolean(defaultActive?.isAvi && enableAviTranscode);
  const activeFormatted = defaultActive ? formattedStreams.find(s => s.id === defaultActive.id) || {
    ...defaultActive,
    url: (activeCanTranscodeAvi && defaultActive.url.startsWith('http')) ? `/api/video-stream?url=${encodeURIComponent(defaultActive.url)}` : defaultActive.url,
    originalUrl: defaultActive.url,
    isTranscoded: activeCanTranscodeAvi,
    qualityLabel: defaultActive.quality
  } : null;

  return {
    streams: formattedStreams,
    activeStream: activeFormatted,
    hasTrueVf,
    allDownloading,
    anyCached
  };
}

/**
 * Tente de réparer un flux Torrentio/TorBox dont le torrent_id est orphelin/expiré en l'attachant au compte TorBox
 */
async function autoRepairTorboxTorrent(torrentioUrl, token) {
  if (!torrentioUrl || !token) return null;
  const match = torrentioUrl.match(/\/resolve\/torbox\/[^/]+\/([a-fA-F0-9]{40})(?:\/([^/]+)\/(\d+))?/i);
  if (!match) return null;
  const hash = match[1];
  let fileIndex = match[3] && match[3] !== 'undefined' ? parseInt(match[3], 10) : null;

  try {
    const form = new FormData();
    form.append('magnet', `magnet:?xt=urn:btih:${hash}`);
    const res = await fetch('https://api.torbox.app/v1/api/torrents/createtorrent', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(3500)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const newTorrentId = data.data?.torrent_id;
    if (!newTorrentId) return null;

    // Toujours s'assurer de sélectionner le fichier vidéo principal (et non un sous-titre .srt ou .nfo)
    try {
      const listRes = await fetch(`https://api.torbox.app/v1/api/torrents/mylist?id=${newTorrentId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3000)
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        const files = listData.data?.files || [];
        if (Array.isArray(files) && files.length > 0) {
          const videoFiles = files.filter(f => {
            const name = (f.name || f.short_name || '').toLowerCase();
            const mime = (f.mimetype || '').toLowerCase();
            return mime.startsWith('video/') || /\.(?:mkv|mp4|avi|mov|webm|m4v|ts)$/i.test(name);
          });
          const candidates = videoFiles.length > 0 ? videoFiles : files;
          candidates.sort((a, b) => (b.size || 0) - (a.size || 0));
          if (candidates[0]?.id !== undefined) {
            fileIndex = candidates[0].id;
          }
        }
      }
    } catch {
      // Conserver fileIndex existant
    }

    if (fileIndex === null || isNaN(fileIndex)) fileIndex = 0;

    const dlUrl = `https://api.torbox.app/v1/api/torrents/requestdl?token=${encodeURIComponent(token)}&torrent_id=${newTorrentId}&file_id=${fileIndex}&redirect=true`;
    const head = await fetch(dlUrl, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(3500)
    });
    if (head.status >= 300 && head.status < 400 && head.headers.get('location')) {
      const loc = head.headers.get('location');
      return normalizeAllowedUrl(loc) || dlUrl;
    }
    if (head.status === 200) {
      return dlUrl;
    }
  } catch (err) {
    console.warn('[Altyflix Stream Resolver] Échec auto-repair TorBox :', err.message);
  }
  return null;
}

/**
 * Vérifie le statut réel d'un lien Torrentio de débridage (détection directe sans CORS)
 */
async function checkStreamStatus(streamUrl, knownFilename = '', { enableAviTranscode = true, token = '' } = {}) {
  const safeStreamUrl = normalizeAllowedUrl(streamUrl);
  if (!safeStreamUrl) {
    return { success: false, status: 'error', isDead: true, statusCode: 400, error: 'Hôte non autorisé pour la vérification.' };
  }

  const isLegacyContainerExt = (str) => /\.(?:avi|wmv|flv|vob|mpe?g|divx)(?:["';?\s]|$)/i.test(String(str || ''));
  const isLegacyContainerMime = (ct) => /msvideo|avi|x-ms-wmv|video\/mpeg|x-flv/i.test(String(ct || ''));

  try {
    const res = await fetch(safeStreamUrl, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(4500)
    });

    const location = res.headers.get('location') || '';

    // Si redirection 301 / 302 / 307 / 308
    if (res.status >= 300 && res.status < 400 && location) {
      let resolvedLocation;
      try {
        resolvedLocation = normalizeAllowedUrl(new URL(location, safeStreamUrl).toString());
      } catch {
        return { success: false, status: 'error', isDead: true, statusCode: 502, error: 'Redirection invalide.' };
      }

      if (!resolvedLocation) {
        return { success: false, status: 'error', isDead: true, statusCode: 403, error: 'Hôte de redirection non autorisé.' };
      }

      if (isDownloadingUrl(resolvedLocation)) {
        console.log(`[Altyflix Stream Poll] Flux en cours de téléchargement (${resolvedLocation.split('?')[0]})`);
        return {
          success: true,
          status: 'downloading',
          ready: false,
          message: 'Préparation du flux vidéo haute définition...'
        };
      }

      // Inspection multi-sauts (Torrentio -> api.torbox.app 307 -> CDN) pour détecter les conteneurs non HTML5 (.avi/.wmv/.mpg/.flv)
      let isAvi = isLegacyContainerExt(resolvedLocation) || isLegacyContainerExt(knownFilename);
      const isModernKnownContainer = /\.(mp4|mkv|webm|m4v|mov)(?:["';?\s]|$)/i.test(knownFilename || resolvedLocation);
      if (!isAvi && !isModernKnownContainer) {
        try {
          let probeUrl = resolvedLocation;
          for (let hop = 0; hop < 3; hop++) {
            const safeProbe = normalizeAllowedUrl(probeUrl);
            if (!safeProbe) break;
            const headTarget = await fetch(safeProbe, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(4000) });
            const nextLoc = headTarget.headers.get('location') || '';
            if (headTarget.status >= 300 && headTarget.status < 400 && nextLoc) {
              try { await headTarget.body?.cancel(); } catch {}
              const resolvedNext = normalizeAllowedUrl(new URL(nextLoc, safeProbe).toString());
              if (!resolvedNext) {
                return { success: false, status: 'error', isDead: true, statusCode: 403, error: 'Hôte de redirection non autorisé.' };
              }
              if (isDownloadingUrl(resolvedNext)) {
                return {
                  success: true,
                  status: 'downloading',
                  ready: false,
                  message: 'Préparation du flux vidéo haute définition...'
                };
              }
              probeUrl = resolvedNext;
              resolvedLocation = resolvedNext;
              if (isLegacyContainerExt(resolvedNext)) { isAvi = true; break; }
              continue;
            }
            const cType = (headTarget.headers.get('content-type') || '').toLowerCase();
            const cDisp = (headTarget.headers.get('content-disposition') || '').toLowerCase();
            try { await headTarget.body?.cancel(); } catch {}
            if (headTarget.status >= 400) {
              // Tentative de réparation automatique si TorBox a renvoyé 500 sur un torrent_id orphelin
              if (token && safeStreamUrl.includes('/resolve/torbox/')) {
                const repaired = await autoRepairTorboxTorrent(safeStreamUrl, token);
                if (repaired) {
                  let isAviRep = isLegacyContainerExt(repaired) || isLegacyContainerExt(knownFilename);
                  if (!isAviRep) {
                    try {
                      const probeRep = await fetch(repaired, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(3000) });
                      const cType = (probeRep.headers.get('content-type') || '').toLowerCase();
                      const cDisp = (probeRep.headers.get('content-disposition') || '').toLowerCase();
                      try { await probeRep.body?.cancel(); } catch {}
                      if (isLegacyContainerMime(cType) || isLegacyContainerExt(cDisp)) {
                        isAviRep = true;
                      }
                    } catch {}
                  }
                  const canTranscodeRep = Boolean(isAviRep && enableAviTranscode);
                  const effectiveUrlRep = canTranscodeRep ? `/api/video-stream?url=${encodeURIComponent(repaired)}` : repaired;
                  return {
                    success: true,
                    status: 'ready',
                    ready: true,
                    isAvi: isAviRep,
                    isTranscoded: canTranscodeRep,
                    playbackUrl: effectiveUrlRep,
                    directUrl: repaired
                  };
                }
              }
              return {
                success: false,
                status: 'error',
                isDead: true,
                statusCode: headTarget.status <= 599 ? headTarget.status : 502,
                error: 'Flux indisponible.'
              };
            }
            if (isLegacyContainerMime(cType) || isLegacyContainerExt(cDisp)) {
              isAvi = true;
            }
            break;
          }
        } catch {}
      }

      console.log(`[Altyflix Stream Poll] Flux prêt ! Redirection vers : ${resolvedLocation.split('?')[0]}${isAvi ? ' [Transcodage AVI->MP4 requis]' : ''}`);
      const canTranscodeAvi = Boolean(isAvi && enableAviTranscode);
      const effectivePlaybackUrl = canTranscodeAvi ? `/api/video-stream?url=${encodeURIComponent(resolvedLocation)}` : resolvedLocation;

      return {
        success: true,
        status: 'ready',
        ready: true,
        isAvi,
        isTranscoded: canTranscodeAvi,
        playbackUrl: effectivePlaybackUrl,
        directUrl: resolvedLocation
      };
    }

    // Réponse directe 200 OK
    if (res.status === 200) {
      if (isDownloadingUrl(safeStreamUrl)) {
        return {
          success: true,
          status: 'downloading',
          ready: false,
          message: 'Préparation du flux vidéo haute définition...'
        };
      }

      const cType = (res.headers.get('content-type') || '').toLowerCase();
      const cDisp = (res.headers.get('content-disposition') || '').toLowerCase();
      const isAvi = isLegacyContainerExt(safeStreamUrl) || isLegacyContainerExt(knownFilename) || isLegacyContainerExt(cDisp) || isLegacyContainerMime(cType);
      const canTranscodeAvi = Boolean(isAvi && enableAviTranscode);
      const effectivePlaybackUrl = canTranscodeAvi ? `/api/video-stream?url=${encodeURIComponent(safeStreamUrl)}` : safeStreamUrl;

      return {
        success: true,
        status: 'ready',
        ready: true,
        isAvi,
        isTranscoded: canTranscodeAvi,
        playbackUrl: effectivePlaybackUrl,
        directUrl: safeStreamUrl
      };
    }

    // Erreur HTTP directe sur la cible
    if (token && safeStreamUrl.includes('/resolve/torbox/')) {
      const repaired = await autoRepairTorboxTorrent(safeStreamUrl, token);
      if (repaired) {
        let isAviRep = isLegacyContainerExt(repaired) || isLegacyContainerExt(knownFilename);
        if (!isAviRep) {
          try {
            const probeRep = await fetch(repaired, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(3000) });
            const cType = (probeRep.headers.get('content-type') || '').toLowerCase();
            const cDisp = (probeRep.headers.get('content-disposition') || '').toLowerCase();
            try { await probeRep.body?.cancel(); } catch {}
            if (isLegacyContainerMime(cType) || isLegacyContainerExt(cDisp)) {
              isAviRep = true;
            }
          } catch {}
        }
        const canTranscodeRep = Boolean(isAviRep && enableAviTranscode);
        const effectiveUrlRep = canTranscodeRep ? `/api/video-stream?url=${encodeURIComponent(repaired)}` : repaired;
        return {
          success: true,
          status: 'ready',
          ready: true,
          isAvi: isAviRep,
          isTranscoded: canTranscodeRep,
          playbackUrl: effectiveUrlRep,
          directUrl: repaired
        };
      }
    }

    return {
      success: false,
      status: 'error',
      isDead: true,
      statusCode: res.status >= 400 && res.status <= 599 ? res.status : 502,
      error: 'Flux temporairement indisponible.'
    };
  } catch (err) {
    console.error('[Altyflix Stream Poll] Erreur de vérification :', err.message);
    return {
      success: false,
      status: 'error',
      statusCode: 502,
      error: 'Délai d\'attente dépassé lors de la vérification du flux.'
    };
  }
}

/**
 * Recherche directement dans la bibliothèque personnelle Torbox de l'utilisateur
 * (ex: torrents ajoutés manuellement, Chouchou)
 */
async function findStreamsInTorboxLibrary({ title, type, season = 1, episode = 1, torboxToken }) {
  if (!torboxToken || !title) return [];
  try {
    let torrents = null;
    const mylistKey = sha256Short(torboxToken);
    const cachedMylist = torboxMylistCache.get(mylistKey);
    if (cachedMylist) {
      torrents = cachedMylist;
    } else {
      const res = await fetch('https://api.torbox.app/v1/api/torrents/mylist', {
        headers: { 'Authorization': `Bearer ${torboxToken}` },
        redirect: 'error',
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) return [];
      const json = await res.json();
      torrents = Array.isArray(json?.data) ? json.data : [];
      torboxMylistCache.set(mylistKey, torrents, TORBOX_MYLIST_TTL_MS);
    }
    if (!torrents || torrents.length === 0) return [];

    const norm = str => (str || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .trim();

    const searchWords = norm(title).split(/\s+/).filter(w => w.length > 2);
    if (searchWords.length === 0) return [];
    const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.m4v'];
    const episodePattern = /\b(?:s\d{1,2}e\d{1,2}|\d{1,2}x\d{2}|saison\s*\d+|season\s*\d+|integrale?|complete\s*series)\b/i;
    const candidateFiles = [];

    for (const t of torrents) {
      if (!t.download_present && t.download_state !== 'completed') continue;
      const tNorm = norm(t.name);
      const isTitleMatch = searchWords.every(w => tNorm.includes(w));
      if (!isTitleMatch) continue;
      // Pour un film, ignorer les torrents de séries TV (ex: S01E01 / Intégrale / Saison)
      if (type === 'movie' && episodePattern.test(t.name || '')) continue;

      const files = Array.isArray(t.files) ? t.files : [];
      for (const f of files) {
        const fName = f.short_name || f.name || '';
        const isVideo = videoExts.some(ext => fName.toLowerCase().endsWith(ext));
        if (!isVideo) continue;

        if (type === 'tv') {
          const epRegex = new RegExp(`(?:^|[^a-z0-9])(?:s0?${season}e0?${episode}|${season}x0?${episode}|ep\\.?\\s*0?${episode})(?!\\d)`, 'i');
          if (!epRegex.test(fName) && !epRegex.test(t.name)) continue;
        } else if (episodePattern.test(fName)) {
          continue;
        }

        const fStr = `${t.name || ''} ${fName}`.toLowerCase();
        // Éliminer d'office les fichiers avec codec audio propriétaire inaudible (Dolby Atmos, TrueHD, DTS, DDP, AC3)
        const hasBadAudio = /(?:\bdd\+(?![a-z])|\b(?:ac3|ac-3|e-?ac-?3|eac3|ddp|dts(?:-?hd)?|dts-?x|truehd|atmos|lpcm)\b)/i.test(fStr);
        if (hasBadAudio) continue;

        // Éliminer les 4K non MP4 / non AV1 et les MKV HEVC qui crashent le navigateur
        const is4k = /\b(?:4k|2160p|uhd)\b/i.test(fStr);
        const isMp4 = fName.toLowerCase().endsWith('.mp4');
        const isAv1 = /\b(?:av1|d?av1nci)\b/i.test(fStr);
        if (is4k && !isMp4 && !isAv1) continue;
        const isMkv = fName.toLowerCase().endsWith('.mkv');
        const isHevc = /\b(?:hevc|x265|h\.?265|10bit)\b/i.test(fStr);
        if (isMkv && isHevc && !isAv1) continue;

        candidateFiles.push({ torrent: t, file: f, fName, size: Number(f.size) || 0 });
      }
    }

    // Limiter aux 3 meilleurs fichiers (privilégier l'audio web AAC/Opus, 1080p et taille équilibrée) et résoudre requestdl EN PARALLÈLE (< 300ms au lieu de 15s)
    const candidateScore = (item) => {
      let sc = 0;
      const str = `${item.torrent?.name || ''} ${item.fName || ''}`.toLowerCase();
      if (/\b(?:aac|mp3|opus|flac)\b/i.test(str)) sc += 50000;
      if (/(?:\bdd\+(?![a-z])|\b(?:ac3|ac-3|e-?ac-?3|eac3|ddp|dts|truehd|atmos)\b)/i.test(str) && !/\b(?:aac|mp3|opus|flac)\b/i.test(str)) sc -= 40000;
      if (/\b1080p\b/i.test(str)) sc += 30000;
      else if (/\b(?:4k|2160p|uhd)\b/i.test(str)) sc += 25000;
      else if (/\b720p\b/i.test(str)) sc += 10000;
      const gb = item.size / (1024 * 1024 * 1024);
      if (gb >= 1.2 && gb <= 6.0) sc += 15000;
      else if (gb > 25) sc -= 20000;
      return sc;
    };
    candidateFiles.sort((a, b) => candidateScore(b) - candidateScore(a));
    const topCandidates = candidateFiles.slice(0, 3);

    const resolved = await Promise.all(
      topCandidates.map(async ({ torrent: t, file: f, fName, size }) => {
        try {
          const dlQuery = new URLSearchParams({
            token: String(torboxToken),
            torrent_id: String(t.id),
            file_id: String(f.id)
          });
          const dlRes = await fetch(`https://api.torbox.app/v1/api/torrents/requestdl?${dlQuery.toString()}`, {
            redirect: 'error',
            signal: AbortSignal.timeout(4500)
          });
          if (dlRes.ok) {
            const dlData = await dlRes.json();
            const safeDlUrl = dlData?.success ? normalizeAllowedUrl(dlData.data) : null;
            if (safeDlUrl) {
              const sizeGb = size ? (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : '';
              const metaStr = `${t.name || ''} ${fName}`.replace(/_/g, ' ');
              const inferredRes = /\b(?:2160p|4k|uhd)\b/i.test(metaStr) ? '4K'
                : /\b1080p\b/i.test(metaStr) ? '1080p'
                : /\b720p\b/i.test(metaStr) ? '720p'
                : /\b(?:480p|dvdrip|xvid|divx)\b/i.test(metaStr) ? '480p'
                : '';
              const hasFr = /\b(french|truefrench|vff|vfq|vf|vf2|audio\.fr|vf\.hd|fr-en|multi)\b/i.test(metaStr);
              return {
                name: `[TB+] Torbox Cloud${inferredRes ? `\n${inferredRes}` : ''}`,
                title: `${t.name || fName}\n${fName}\n👤 1 💾 ${sizeGb} ⚙️ Ma Bibliothèque TorBox${hasFr ? '\n🇫🇷' : ''}`,
                url: safeDlUrl,
                isTorboxLibrary: true
              };
            }
          }
        } catch (dlErr) {
          console.warn('[Altyflix Torbox Library] Erreur requestdl :', dlErr.message);
        }
        return null;
      })
    );

    return resolved.filter(Boolean);
  } catch (err) {
    console.warn('[Altyflix Torbox Library] Erreur inspection mylist :', err.message);
    return [];
  }
}

/**
 * Résout les flux de streaming pour un contenu donné côté serveur
 */
async function resolveStreamsServer({
  id,
  imdbId: initialImdbId,
  type = 'movie',
  season = 1,
  episode = 1,
  lang = 'vf',
  title = '',
  userProvider = null,
  userToken = null,
  userFrenchioUrl = null,
  enableAudioRemux = false,
  enableAviTranscode = enableAudioRemux,
  videoStreamBaseUrl = '',
  tmdbApiKey = null,
  clientAc3 = true
}) {
  const isTv = type === 'tv';
  const streamBase = String(videoStreamBaseUrl || '').trim().replace(/\/+$/, '');
  const normalizedLang = String(lang || 'vf').toLowerCase() === 'vo' || String(lang || 'vf').toLowerCase() === 'vostfr' ? 'vo' : 'vf';
  const rawProvider = ((userProvider && userProvider.trim()) || process.env.DEBRID_PROVIDER || 'torbox').toLowerCase();
  const provider = ALLOWED_PROVIDERS.has(rawProvider) ? rawProvider : 'torbox';
  const token = (userToken && userToken.trim()) || process.env.DEBRID_TOKEN || process.env.TORBOX_TOKEN || '';
  const safeId = positiveInteger(id) ? String(id) : '';
  const safeSeason = positiveInteger(season, 10000) ? Number(season) : 1;
  const safeEpisode = positiveInteger(episode, 10000) ? Number(episode) : 1;
  season = safeSeason;
  episode = safeEpisode;

  if (!token) {
    console.warn('[Altyflix Stream Resolver] Aucun jeton de débridage disponible côté serveur ou utilisateur.');
    return {
      success: false,
      reason: 'NO_TOKEN',
      status: 'no_token',
      message: 'Service de diffusion non configuré.',
      streams: []
    };
  }

  // Résolution IMDb si absent (multi-tentatives sécurisées via tmdbUrl)
  let imdbId = (typeof initialImdbId === 'string' && /^tt\d{5,10}$/.test(initialImdbId.trim())) ? initialImdbId.trim() : null;
  if (!imdbId && typeof id === 'string' && /^tt\d{5,10}$/.test(id.trim())) {
    imdbId = id.trim();
  }
  let cleanTitle = (title || '').trim();
  const tmdbKey = (tmdbApiKey && String(tmdbApiKey).trim()) || process.env.TMDB_API_KEY || '';

  const finalizeStreamUrl = (s) => {
    if (!s) return s;
    const rawDirect = s.directUrl || s.originalUrl || s.url;
    const audioLangParam = s.isFrench ? 'vf' : 'vo';
    if (s.isAvi && enableAviTranscode && rawDirect) {
      if (s.url && s.url.startsWith('/api/video-stream')) {
        let updated = s.url.includes('lang=') ? s.url : `${s.url}&lang=${audioLangParam}`;
        if (!updated.includes('transcode=')) updated = `${updated}&transcode=1`;
        return streamBase ? { ...s, url: `${streamBase}${updated}`, isTranscoded: true } : { ...s, url: updated, isTranscoded: true };
      }
      if (rawDirect.startsWith('http')) {
        return { ...s, url: `${streamBase}/api/video-stream?transcode=1&lang=${audioLangParam}&url=${encodeURIComponent(rawDirect)}`, isTranscoded: true };
      }
    }
    if (!s.isAvi && enableAudioRemux && s.hasUnsupportedAudio && s.verifiedReady && s.url && s.url.startsWith('http')) {
      return {
        ...s,
        url: `${streamBase}/api/video-stream?audio=aac&lang=${audioLangParam}&url=${encodeURIComponent(s.url)}`,
        directUrl: s.directUrl || s.url,
        isTranscoded: true,
        audioRemuxed: true
      };
    }
    return s;
  };

  let isFrenchOriginal = false;
  let originalTitle = '';
  let cinemetaTitle = '';

  if (safeId && tmdbKey) {
    try {
      const detailUrl = tmdbUrl(isTv ? `tv/${safeId}/external_ids` : `movie/${safeId}/external_ids`, {}, tmdbKey);
      const tmdbRes = await fetch(detailUrl, { redirect: 'error', signal: AbortSignal.timeout(4000) });
      if (tmdbRes.ok) {
        const tmdbData = await tmdbRes.json();
        if (!imdbId && /^tt\d{5,10}$/.test(String(tmdbData.imdb_id || ''))) imdbId = tmdbData.imdb_id;
      }
    } catch (e) {
      console.warn('[Altyflix Stream Resolver] Échec de récupération de l\'identifiant IMDb direct :', e.message);
    }
  }

  // Fallback de recherche IMDb et titre via Cinemeta si présent
  if (imdbId) {
    try {
      const cinemetaUrl = `https://v3-cinemeta.strem.io/meta/${isTv ? 'series' : 'movie'}/${imdbId}.json`;
      const cRes = await fetch(cinemetaUrl, { redirect: 'error', signal: AbortSignal.timeout(3000) });
      if (cRes.ok) {
        const cData = await cRes.json();
        const foundName = cData?.meta?.name;
        if (foundName && typeof foundName === 'string') {
          cinemetaTitle = foundName.trim();
          if (!cleanTitle) {
            cleanTitle = cinemetaTitle;
            console.log(`[Altyflix Stream Resolver] Titre résolu via Cinemeta : "${cleanTitle}" pour ${imdbId}`);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (safeId && tmdbKey) {
    try {
      const baseDetailUrl = tmdbUrl(isTv ? `tv/${safeId}` : `movie/${safeId}`, { language: 'fr-FR' }, tmdbKey);
      const baseRes = await fetch(baseDetailUrl, { redirect: 'error', signal: AbortSignal.timeout(4000) });
      if (baseRes.ok) {
        const baseData = await baseRes.json();
        const candidateImdb = baseData.imdb_id || baseData.external_ids?.imdb_id;
        if (!imdbId && /^tt\d{5,10}$/.test(String(candidateImdb || ''))) imdbId = candidateImdb;
        if (!cleanTitle) cleanTitle = baseData.title || baseData.name || baseData.original_title || baseData.original_name || '';
        originalTitle = baseData.original_title || baseData.original_name || '';
        if (baseData.original_language === 'fr') isFrenchOriginal = true;

        // Fallback Cinemeta (couverture 100% TMDB via le catalogue Stremio)
        if (!imdbId) {
          const searchCandidates = [cleanTitle, originalTitle, cleanTitle.replace(/[:\-–—].*$/, '').trim()].filter(Boolean);
          for (const sTitle of searchCandidates) {
            try {
              const cinemetaUrl = `https://v3-cinemeta.strem.io/catalog/${isTv ? 'series' : 'movie'}/top/search=${encodeURIComponent(sTitle)}.json`;
              const cRes = await fetch(cinemetaUrl, { redirect: 'error', signal: AbortSignal.timeout(3500) });
              if (cRes.ok) {
                const cData = await cRes.json();
                const cid = cData?.metas?.[0]?.id;
                if (cid && /^tt\d{5,10}$/.test(cid)) {
                  imdbId = cid;
                  cinemetaTitle = cData?.metas?.[0]?.name || '';
                  console.log(`[Altyflix Stream Resolver] IMDb ID identifié via Cinemeta : ${imdbId} pour "${sTitle}"`);
                  break;
                }
              }
            } catch { /* continue */ }
          }
        }
      }
    } catch (e) {
      console.warn('[Altyflix Stream Resolver] Erreur de recherche IMDb étendue :', e.message);
    }
  }

  // Détection film français si imdbId présent mais TMDB safeId absent
  if (!isFrenchOriginal && imdbId && tmdbKey) {
    try {
      const findUrl = tmdbUrl(`find/${imdbId}`, { external_source: 'imdb_id' }, tmdbKey);
      const findRes = await fetch(findUrl, { redirect: 'error', signal: AbortSignal.timeout(3000) });
      if (findRes.ok) {
        const findData = await findRes.json();
        const item = findData?.movie_results?.[0] || findData?.tv_results?.[0];
        if (item) {
          if (item.original_language === 'fr') isFrenchOriginal = true;
          if (!originalTitle) originalTitle = item.original_title || item.original_name || '';
          if (!cleanTitle) cleanTitle = item.title || item.name || '';
        }
      }
    } catch { /* ignore */ }
  }

  // Recherche TMDB par titre si IMDb ID toujours manquant
  if (!imdbId && cleanTitle && tmdbKey) {
    try {
      const searchCandidates = [cleanTitle, cleanTitle.replace(/[:\-–—].*$/, '').trim()];
      for (const sTitle of searchCandidates) {
        if (!sTitle) continue;
        const searchUrl = tmdbUrl(isTv ? 'search/tv' : 'search/movie', { query: sTitle, language: 'fr-FR' }, tmdbKey);
        const sRes = await fetch(searchUrl, { redirect: 'error', signal: AbortSignal.timeout(3500) });
        if (sRes.ok) {
          const sData = await sRes.json();
          const topResult = sData.results?.[0];
          if (topResult?.id && positiveInteger(topResult.id)) {
            if (topResult.original_language === 'fr') isFrenchOriginal = true;
            if (!originalTitle) originalTitle = topResult.original_title || topResult.original_name || '';
            const extUrl = tmdbUrl(isTv ? `tv/${topResult.id}/external_ids` : `movie/${topResult.id}/external_ids`, {}, tmdbKey);
            const extRes = await fetch(extUrl, { redirect: 'error', signal: AbortSignal.timeout(3000) });
            if (extRes.ok) {
              const extData = await extRes.json();
              if (/^tt\d{5,10}$/.test(String(extData.imdb_id || ''))) {
                imdbId = extData.imdb_id;
                console.log(`[Altyflix Stream Resolver] IMDb ID trouvé via recherche TMDB : ${imdbId} pour "${sTitle}"`);
                break;
              }
            }
          }
        }
      }
    } catch (sErr) {
      console.warn('[Altyflix Stream Resolver] Erreur recherche TMDB par titre :', sErr.message);
    }
  }

  // Fallback Cinemeta direct si IMDb ID toujours manquant
  if (!imdbId && cleanTitle) {
    try {
      const searchCandidates = [cleanTitle, cleanTitle.replace(/[:\-–—].*$/, '').trim()];
      for (const sTitle of searchCandidates) {
        const cinemetaUrl = `https://v3-cinemeta.strem.io/catalog/${isTv ? 'series' : 'movie'}/top/search=${encodeURIComponent(sTitle)}.json`;
        const cRes = await fetch(cinemetaUrl, { redirect: 'error', signal: AbortSignal.timeout(3500) });
        if (cRes.ok) {
          const cData = await cRes.json();
          const cid = cData?.metas?.[0]?.id;
          if (cid && /^tt\d{5,10}$/.test(cid)) {
            imdbId = cid;
            cinemetaTitle = cData?.metas?.[0]?.name || '';
            console.log(`[Altyflix Stream Resolver] IMDb ID identifié via Cinemeta direct : ${imdbId} pour "${sTitle}"`);
            break;
          }
        }
      }
    } catch { /* ignore */ }
  }

  const titleVariants = Array.from(new Set([cleanTitle, originalTitle, cinemetaTitle].filter(t => t && typeof t === 'string' && t.trim().length >= 2)));

  if (!imdbId) {
    // Si l'utilisateur a le film dans son cloud TorBox, on peut tout de même le diffuser sans IMDb ID !
    if (provider === 'torbox' && cleanTitle) {
      try {
        const mylistStreams = await findStreamsInTorboxLibrary({
          title: cleanTitle,
          type,
          season,
          episode,
          torboxToken: token
        });
        if (mylistStreams.length > 0) {
          const curated = curateStreams(mylistStreams, provider, {
            enableAviTranscode,
            enableAudioRemux,
            preferredLang: normalizedLang,
            contentType: type,
            cleanTitle,
            titleVariants,
            isFrenchOriginal
          });
          const readyFallback = curated.streams.map(s => finalizeStreamUrl({ ...s, verifiedReady: true }));
          const activeFallback = curated.activeStream ? (readyFallback.find(s => s.id === curated.activeStream.id) || readyFallback[0]) : readyFallback[0];
          return {
            success: true,
            status: 'ready',
            imdbId: null,
            streams: readyFallback,
            activeStream: activeFallback,
            hasTrueVf: curated.hasTrueVf
          };
        }
      } catch {}
    }

    return {
      success: false,
      reason: 'MISSING_IMDB_ID',
      status: 'error',
      message: 'Identifiant international introuvable pour ce titre.',
      streams: []
    };
  }

  const streamKey = isTv ? `${imdbId}:${season}:${episode}` : `${imdbId}`;
  const cacheKey = `${provider}:${sha256Short(token)}:${streamKey}:${normalizedLang}:${enableAudioRemux ? 'remux' : 'direct'}:${enableAviTranscode ? 'avi' : 'noavi'}:${sha256Short(streamBase)}`;

  const cachedResult = getCachedResolve(cacheKey);
  if (cachedResult) {
    console.log(`[Altyflix Stream Resolver] Réponse instantanée depuis le cache mémoire pour ${streamKey}.`);
    return cachedResult;
  }

  // Coalescing des requêtes identiques simultanées (évite les doubles appels React StrictMode)
  if (inFlightResolves.has(cacheKey)) {
    return inFlightResolves.get(cacheKey);
  }

  const resolvePromise = (async () => {

  const ALL_PROVIDERS = 'torrent9,1337x,thepiratebay,torrentgalaxy,yts,rarbg,eztv,kickasstorrents,magnetdl,rutor,rutracker,ilcorsaronero,mejortorrent,wolfmax4k,cinecalidad,besttorrents,nyaasi,tokyotosho,anidex,nekobt,horriblesubs,animetosho,cinemaz,ibit,torlock,comando,bludv,micoleaodublado,uindex,knaben,ext';

  console.log(`[Altyflix Stream Resolver] Recherche parallèle des flux pour ${type} ${imdbId} (S${season}E${episode}) via ${provider}...`);

  try {
    // Toutes les sources sont interrogées EN PARALLÈLE pour une latence minimale (< 1s)
    const optionsPriorityFr = `providers=${ALL_PROVIDERS}|sort=qualitysize|qualityfilter=scr,cam|foreign_lang=french|${provider}=${encodeURIComponent(token)}`;
    const endpointPriorityFr = `https://torrentio.strem.fun/${optionsPriorityFr}/stream/${isTv ? 'series' : 'movie'}/${streamKey}.json`;

    const optionsVf = `providers=${ALL_PROVIDERS}|sort=qualitysize|qualityfilter=scr,cam|language=french|${provider}=${encodeURIComponent(token)}`;
    const endpointVf = `https://torrentio.strem.fun/${optionsVf}/stream/${isTv ? 'series' : 'movie'}/${streamKey}.json`;

    const optionsGlobal = `providers=${ALL_PROVIDERS}|sort=qualitysize|qualityfilter=scr,cam|${provider}=${encodeURIComponent(token)}`;
    const endpointGlobal = `https://torrentio.strem.fun/${optionsGlobal}/stream/${isTv ? 'series' : 'movie'}/${streamKey}.json`;

    const fetchTorrentio = async (url, label) => {
      try {
        const res = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(7500)
        });
        if (res.ok) {
          const data = await res.json();
          return Array.isArray(data?.streams) ? data.streams : [];
        }
      } catch (e) {
        console.warn(`[Altyflix Stream Resolver] Timeout ou erreur fetch ${label} :`, e.message);
      }
      return [];
    };

    const fetchFrenchio = async () => {
      if (!userFrenchioUrl || typeof userFrenchioUrl !== 'string') return [];
      try {
        const cleanBase = userFrenchioUrl.trim().replace(/\/+$/, '');
        const targetUrl = `${cleanBase}/stream/${isTv ? 'series' : 'movie'}/${streamKey}.json`;
        const res = await fetch(targetUrl, {
          headers: { 'Accept': 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(4000)
        });
        if (res.ok) {
          const data = await res.json();
          return Array.isArray(data?.streams) ? data.streams : [];
        }
      } catch (e) {
        console.warn('[Altyflix Stream Resolver] Erreur fetch Frenchio :', e.message);
      }
      return [];
    };

    const fetchMylist = async () => {
      if (provider !== 'torbox' || !cleanTitle) return [];
      try {
        const streams = await findStreamsInTorboxLibrary({
          title: cleanTitle,
          type,
          season,
          episode,
          torboxToken: token
        });
        if (streams.length > 0) {
          console.log(`[Altyflix Torbox Library] ${streams.length} flux trouvés dans le cloud TorBox pour "${cleanTitle}".`);
        }
        return streams;
      } catch (mlErr) {
        console.warn('[Altyflix Torbox Library] Erreur inspection cloud :', mlErr.message);
        return [];
      }
    };

    const [priorityFrStreams, vfStreams, globalStreams, frenchioStreams, mylistStreams] = await Promise.all([
      fetchTorrentio(endpointPriorityFr, 'FR Priority'),
      fetchTorrentio(endpointVf, 'VF'),
      fetchTorrentio(endpointGlobal, 'Global'),
      fetchFrenchio(),
      fetchMylist()
    ]);

    // Fusion avec déduplication stricte par URL
    const seenUrls = new Set();
    const rawStreams = [];
    for (const s of [...(mylistStreams || []), ...(frenchioStreams || []), ...priorityFrStreams, ...vfStreams, ...globalStreams]) {
      if (s && s.url && !seenUrls.has(s.url)) {
        seenUrls.add(s.url);
        rawStreams.push(s);
      }
    }

    // Détection d'erreurs de clé (sans confondre un clip downloading avec une erreur de clé)
    const errorStream = rawStreams.find(s => isTorrentioErrorStream(s) && !isDownloadingUrl(s?.url));
    if (errorStream && rawStreams.length === 1) {
      return {
        success: false,
        reason: 'INVALID_DEBRID_TOKEN',
        status: 'error',
        message: 'Accès non reconnu. Veuillez vérifier vos paramètres de lecture.',
        imdbId,
        streams: []
      };
    }

    // Vérification temps réel du cache TorBox (élimine les faux [TB+] périmés de Torrentio en 1 appel ~180ms)
    if (provider === 'torbox' && token && rawStreams.length > 0) {
      try {
        const hashRegex = /\/resolve\/torbox\/[^/]+\/([a-fA-F0-9]{40})\//i;
        const hashesSet = new Set();
        // Pour les films, vérifier d'abord les hashes 1080p/4K dans le quota de 35 hashes
        const orderedForCacheCheck = type === 'tv'
          ? rawStreams
          : [...rawStreams].sort((a, b) => {
              const aHd = /2160p|4k|uhd|1080p/i.test(`${a.name || ''} ${a.title || ''}`) ? 1 : 0;
              const bHd = /2160p|4k|uhd|1080p/i.test(`${b.name || ''} ${b.title || ''}`) ? 1 : 0;
              return bHd - aHd;
            });
        const extractTorrentHash = (s) => {
          const m = (s.url || '').match(hashRegex);
          if (m && m[1]) return m[1].toLowerCase();
          if (s.behaviorHints?.bingeGroup) {
            const bg = s.behaviorHints.bingeGroup.match(/([a-fA-F0-9]{40})/i);
            if (bg) return bg[1].toLowerCase();
          }
          return null;
        };

        for (const s of orderedForCacheCheck) {
          if (s.isTorboxLibrary) continue;
          const h = extractTorrentHash(s);
          if (h) hashesSet.add(h);
          if (hashesSet.size >= 40) break;
        }
        if (hashesSet.size > 0) {
          const hashesParam = Array.from(hashesSet).join(',');
          const cacheRes = await fetch(`https://api.torbox.app/v1/api/torrents/checkcached?hash=${hashesParam}&format=object`, {
            headers: { 'Authorization': `Bearer ${token}` },
            redirect: 'error',
            signal: AbortSignal.timeout(2200)
          });
          if (cacheRes.ok) {
            const cacheJson = await cacheRes.json();
            if (cacheJson.success && cacheJson.data && typeof cacheJson.data === 'object') {
              const cachedMap = cacheJson.data;
              for (const s of rawStreams) {
                if (s.isTorboxLibrary) {
                  s._torboxVerifiedCached = true;
                  continue;
                }
                const h = extractTorrentHash(s);
                if (h && hashesSet.has(h)) {
                  s._torboxVerifiedCached = Boolean(cachedMap[h]);
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('[Altyflix Stream Resolver] Vérification batch cache TorBox ignorée :', e.message);
      }
    }

    const curated = curateStreams(rawStreams, provider, {
      enableAviTranscode,
      enableAudioRemux,
      preferredLang: normalizedLang,
      contentType: type,
      cleanTitle,
      titleVariants,
      isFrenchOriginal
    });

    if (!curated.streams || curated.streams.length === 0) {
      return {
        success: false,
        reason: 'NO_STREAMS_FOUND',
        status: 'error',
        message: 'Ce titre n\'est pas disponible pour le moment. Veuillez sélectionner un autre titre.',
        imdbId,
        streams: []
      };
    }

    // Sélection ciblée et pré-résolution ultra-rapide (<250ms) du flux actif :
    // Évite le déluge de 18 requêtes HEAD simultanées qui déclenche les blocages et rate-limits Cloudflare / TorBox
    const supportsAc3 = Boolean(clientAc3);
    const wantVo = normalizedLang === 'vo';
    const matchesLang = (s) => (wantVo ? !s.isFrench : s.isFrench);
    const isPlayableFormat = (s) => !s.isAvi || enableAviTranscode;

    const pickBestCandidate = (list) => {
      if (!supportsAc3) {
        // En priorité absolue : les flux correspondant à la langue demandée (VF)
        return list.find(s => isPlayableFormat(s) && matchesLang(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.isH264 && s.tierKey === '1080p') ||
               list.find(s => isPlayableFormat(s) && matchesLang(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
               list.find(s => isPlayableFormat(s) && matchesLang(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio) ||
               list.find(s => isPlayableFormat(s) && matchesLang(s) && !s.hasUnsupportedAudio && s.isH264 && s.tierKey === '1080p') ||
               list.find(s => isPlayableFormat(s) && matchesLang(s) && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
               list.find(s => isPlayableFormat(s) && matchesLang(s) && !s.hasUnsupportedAudio) ||
               list.find(s => isPlayableFormat(s) && matchesLang(s) && s.tierKey === '1080p') ||
               list.find(s => isPlayableFormat(s) && matchesLang(s)) ||
               // Repli VO/autre langue UNIQUEMENT si aucun flux de la langue demandée n'existe
               list.find(s => isPlayableFormat(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.isH264 && s.tierKey === '1080p') ||
               list.find(s => isPlayableFormat(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
               list.find(s => isPlayableFormat(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio) ||
               list.find(s => isPlayableFormat(s) && !s.hasUnsupportedAudio) ||
               list.find(s => isPlayableFormat(s)) ||
               list[0];
      }
      return list.find(s => isPlayableFormat(s) && matchesLang(s) && !s.hasUnsupportedAudio && s.isH264 && s.tierKey === '1080p') ||
             list.find(s => isPlayableFormat(s) && matchesLang(s) && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
             list.find(s => isPlayableFormat(s) && matchesLang(s) && !s.hasUnsupportedAudio) ||
             list.find(s => isPlayableFormat(s) && matchesLang(s) && s.isH264 && s.tierKey === '1080p') ||
             list.find(s => isPlayableFormat(s) && matchesLang(s) && s.tierKey === '1080p') ||
             list.find(s => isPlayableFormat(s) && matchesLang(s)) ||
             // Repli VO/autre langue
             list.find(s => isPlayableFormat(s) && !s.hasUnsupportedAudio && s.isH264 && s.tierKey === '1080p') ||
             list.find(s => isPlayableFormat(s) && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
             list.find(s => isPlayableFormat(s) && !s.hasUnsupportedAudio) ||
             list.find(s => isPlayableFormat(s)) ||
             list[0];
    };

    let workingStreams = [...curated.streams];
    const cachedCandidates = workingStreams.filter(s => s.isCached && !s.isDownloading);
    const pool = cachedCandidates.length > 0 ? cachedCandidates : workingStreams;

    let active = null;
    let initialStatus = cachedCandidates.length > 0 ? 'ready' : 'downloading';

    // On valide en priorité le meilleur candidat en cache (avec auto-réparation TorBox si id orphelin)
    const testedIds = new Set();
    while (testedIds.size < 3) {
      const remainingPool = pool.filter(s => !testedIds.has(s.id) && !s.isDead);
      if (remainingPool.length === 0) break;
      const candidate = pickBestCandidate(remainingPool);
      if (!candidate) break;
      testedIds.add(candidate.id);

      if (candidate.isTorboxLibrary) {
        active = { ...candidate, isCached: true, isDownloading: false, verifiedReady: true };
        break;
      }

      const rawTarget = candidate.originalUrl || candidate.url;
      if (!rawTarget || !normalizeAllowedUrl(rawTarget)) {
        continue;
      }

      try {
        const check = await checkStreamStatus(rawTarget, candidate.filename || '', { enableAviTranscode, token });
        if (check.ready && check.playbackUrl) {
          const isAviNow = Boolean(candidate.isAvi || check.isAvi);
          active = {
            ...candidate,
            url: check.playbackUrl,
            directUrl: check.directUrl || check.playbackUrl,
            originalUrl: rawTarget,
            isCached: true,
            isDownloading: false,
            isAvi: isAviNow,
            isTranscoded: Boolean(isAviNow && enableAviTranscode),
            verifiedReady: true
          };
          // Mettre à jour dans la liste
          const idx = workingStreams.findIndex(s => s.id === candidate.id);
          if (idx !== -1) workingStreams[idx] = active;
          break;
        } else if (check.status === 'error' || check.isDead) {
          // Source morte ou corrompue : exclue définitivement
          candidate.isDead = true;
          candidate.isCached = false;
          candidate.verifiedReady = false;
        }
      } catch {
        // En cas de simple timeout réseau, la source reste présumée en cache si taguée [TB+]
        active = { ...candidate, verifiedReady: true };
        break;
      }
    }

    if (!active && cachedCandidates.length > 0) {
      const fallback = cachedCandidates.find(s => !s.isDead) || cachedCandidates[0];
      active = { ...fallback, verifiedReady: true };
    }

    if (!active) {
      active = workingStreams[0];
      initialStatus = 'downloading';
    }

    // Pré-résolution en parallèle de TOUS les flux en cache (4K, 1080p, VOSTFR...)
    // afin que le changement de qualité dans le lecteur soit instantané et garanti sans attente ni timeout
    const otherCached = workingStreams.filter(s => s.id !== active?.id && s.isCached && !s.isDownloading && !s.isDead && !s.directUrl);
    if (otherCached.length > 0 && token) {
      await Promise.allSettled(otherCached.map(async (candidate) => {
        const rawTarget = candidate.originalUrl || candidate.url;
        if (!rawTarget || !normalizeAllowedUrl(rawTarget)) return;
        try {
          const check = await checkStreamStatus(rawTarget, candidate.filename || '', { enableAviTranscode, token });
          const idx = workingStreams.findIndex(s => s.id === candidate.id);
          if (idx !== -1) {
            if (check.ready && check.playbackUrl) {
              const isAviNow = Boolean(candidate.isAvi || check.isAvi);
              workingStreams[idx] = {
                ...candidate,
                url: check.playbackUrl,
                directUrl: check.directUrl || check.playbackUrl,
                originalUrl: rawTarget,
                isCached: true,
                isDownloading: false,
                isAvi: isAviNow,
                isTranscoded: Boolean(isAviNow && enableAviTranscode),
                verifiedReady: true
              };
            } else if (check.status === 'error' || check.isDead) {
              workingStreams[idx].isDead = true;
            }
          }
        } catch {
          // ignore
        }
      }));
    }

    // Filtrage strict : éliminer toutes les sources mortes ou incompatibles (.avi sans transcodage si d'autres existent)
    const cleanStreams = workingStreams.filter(s => !s.isDead);
    const cachedClean = cleanStreams.filter(s => s.isCached && !s.isDownloading);
    const baseList = cachedClean.length > 0 ? cachedClean : cleanStreams;
    const playableStreams = baseList.filter(isPlayableFormat);
    const finalStreams = playableStreams.length > 0 ? playableStreams : baseList;

    const finalActive = active
      ? finalizeStreamUrl({ ...active, originalUrl: active.originalUrl || active.url })
      : null;

    const syncedStreams = finalStreams.map(s =>
      (finalActive && s.id === finalActive.id) ? finalActive : finalizeStreamUrl(s)
    );

    console.log(`[Altyflix Stream Resolver] Résolution terminée : ${syncedStreams.length} qualités prêtes. Statut : ${initialStatus}.`);

    const responsePayload = {
      success: true,
      status: initialStatus,
      activeStream: finalActive,
      streams: syncedStreams,
      hasTrueVf: syncedStreams.some(s => s.isFrench) || curated.hasTrueVf,
      imdbId
    };

    if (initialStatus === 'ready') {
      setCachedResolve(cacheKey, responsePayload);
    }

    return responsePayload;
  } catch (err) {
    console.error('[Altyflix Stream Resolver] Erreur réseau lors de la résolution :', err.message);
    return {
      success: false,
      reason: 'NETWORK_ERROR',
      status: 'error',
      message: 'Service de recherche temporairement indisponible.',
      imdbId,
      streams: []
    };
  }
  })();

  inFlightResolves.set(cacheKey, resolvePromise);
  try {
    return await resolvePromise;
  } finally {
    inFlightResolves.delete(cacheKey);
  }
}

module.exports = {
  normalizeAllowedUrl,
  isAllowedUrl,
  isDownloadingUrl,
  isTorrentioErrorStream,
  parseStreamDetails,
  curateStreams,
  checkStreamStatus,
  resolveStreamsServer
};
