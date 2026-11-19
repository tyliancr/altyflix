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
  'comet.elfhosted.com',
  'api.torbox.app',
  'torbox.app',
  'tb-cdn.st',
  'frenchio.elfhosted.com',
  'api.real-debrid.com',
  'real-debrid.com',
  'api.alldebrid.com',
  'alldebrid.com',
  'debrid-link.com',
  'premiumize.me'
];

/**
 * Valide et normalise une URL autorisée (prévention SSRF stricte : HTTPS uniquement, sans caractères de contrôle, sans port non standard ni credentials)
 */
function normalizeAllowedUrl(urlStr) {
  if (typeof urlStr !== 'string' || !urlStr || /[\x00-\x1f\x7f]/.test(urlStr)) return null;
  try {
    const u = new URL(urlStr);
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

function normalizeFrenchioUrl(urlStr) {
  const normalized = normalizeAllowedUrl(urlStr);
  if (!normalized) return '';
  try {
    const u = new URL(normalized);
    if (u.hostname.toLowerCase() !== 'frenchio.elfhosted.com') return '';
    if (u.search || u.hash) return '';
    return u.href.replace(/\/manifest\.json$/i, '').replace(/\/+$/, '');
  } catch {
    return '';
  }
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

  if (url.includes('failed_access') || url.includes('/videos/failed_')) return true;
  if (isDownloadingUrl(url)) return true;
  if (name.includes('[❌]') || /\b(?:tb|rd|ad|pm|dl)?\s*error\b/i.test(name)) return true;
  if (/(?:invalid\s+(?:api|token|key|debrid|auth)|access\s+denied|rate\s+limit\s+exceeded|failed\s+to\s+(?:resolve|access|connect)|not\s+a\s+valid\s+debrid)/i.test(fullText)) return true;

  return false;
}

/**
 * Détecte si une URL pointe vers le clip d'attente de téléchargement
 */
function isDownloadingUrl(urlStr) {
  if (!urlStr) return false;
  const clean = String(urlStr).toLowerCase();
  return clean.includes('downloading_') || clean.includes('/videos/downloading') || clean.includes('downloading.mp4');
}

/**
 * Parse les métadonnées d'un flux Torrentio
 */
function parseStreamDetails(stream) {
  const rawTitle = stream.title || stream.description || '';
  const rawName = stream.name || '';
  const filename = stream.behaviorHints?.filename || rawTitle.split('\n')[0] || '';
  const fullText = (rawTitle + ' ' + rawName + ' ' + filename).toLowerCase().replace(/_/g, ' ');

  // Détection du statut Debrid : Cache (+) vs Téléchargement (download)
  // Si vérifié en temps réel contre l'API TorBox (_torboxVerifiedCached), la vérité TorBox prime sur Torrentio
  let isCached = /\[(tb|rd|ad|pm|dl)\+\]/i.test(rawName) || /\[\+\]/.test(rawName) || Boolean(stream.isTorboxLibrary);
  let isDownloading = !isCached && (/\[(tb|rd|ad|pm|dl)\s+download\]/i.test(rawName) || /download/i.test(rawName));
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

  const hasFrenchInName = /\b(french|truefrench|vff|vfq|vf2|vfi|vf|audio\.fr|vf\.hd|fr-en|multi)\b/i.test(nameNoMultiSub) ||
    /\b(french|truefrench|vff|vfq|vf2|vfi|vf|audio\.fr|vf\.hd|fr-en|multi)\b/i.test(fileNoMultiSub) ||
    /\b(vf|vff|vfq|vfi|vf2|truefrench|french)\b/i.test(fullText);

  const hasFrenchFlag = rawTitle.includes('🇫🇷');
  const isTorrent9 = fullText.includes('torrent9');
  const isExplicitVostfr = /\b(vostfr|subfrench)\b/i.test(fullText);
  const hasFrenchAudioInAudioLine = /(?:multi\s*audio|\bfr\b|\bfre\b|\bfrancais\b|\bfrench\b).*🇫🇷|🇫🇷.*(?:multi\s*audio|\bfr\b|\bfre\b|\bfrancais\b|\bfrench\b)/i.test(rawTitle) ||
    (hasFrenchFlag && !isExplicitVostfr);

  const isFrench = Boolean(hasFrenchInName || isTorrent9 || hasFrenchAudioInAudioLine || (hasFrenchFlag && !isExplicitVostfr));
  const isVostfr = !isFrench && (
    hasFrenchFlag ||
    /\b(vostfr|subfrench|vost)\b/i.test(fullText) ||
    metaLines.includes('subfrench') ||
    metaLines.includes('multi subs')
  );

  const isMp4 = /\.mp4(?:\?|$)/i.test(stream?.url || '') || /\.mp4(?:$|\?|\s|["')\]])/i.test(filename);
  const isAvi = /\.avi(?:\?|$)/i.test(stream?.url || '') || /\.avi(?:$|\?|\s|["')\]])/i.test(filename) || /\b(?:xvid|divx)\b/i.test(fullText);

  // Détection audio : codecs compatibles navigateur (AAC / MP3 / Opus / FLAC) vs codecs silencieux dans Chrome (AC3 / EAC3 / DTS / TrueHD / Atmos)
  const hasAac = /\b(?:he-?)?aac(?:\s*\.?\s*[257]\.?[01])?\b/i.test(fullText);
  const hasMp3 = /\bmp3\b/i.test(fullText);
  const hasOpus = /\bopus(?:\s*\.?\s*[257]\.?[01])?\b/i.test(fullText);
  const hasFlac = /\bflac\b/i.test(fullText);
  const isWebAudioGroup = /\b(?:yts|yify|rapta|pir8|vxt|ozlem|galaxytv|tgx|qxr|tigole|utr|qman|lordvako|psa|extreme|pop|f4st)\b/i.test(fullText);
  const hasUnsupportedAudioCodec = /(?:\bdd\+(?![a-z])|\b(?:ac3|ac-3|e-?ac-?3|eac3|ddp(?:\s*\.?\s*[257]\.?[01])?|dd\s*\.?\s*[257]\.?[01]|dts(?:-?hd)?|truehd|atmos|lpcm)\b)/i.test(fullText);
  const hasExplicitWebAudio = Boolean(hasAac || hasMp3 || hasOpus || hasFlac);

  // Son garanti dans le navigateur : codec web explicite (AAC/MP3/Opus/FLAC) ou conteneur MP4/groupe web sans codec Dolby/DTS exclusif
  const isWebAudioSafe = Boolean(hasExplicitWebAudio || ((isWebAudioGroup || isMp4) && !hasUnsupportedAudioCodec));
  // Un flux a un son non supporté si un codec propriétaire est présent, OU si c'est un MKV sans codec web explicite (les MKV sans mention AAC sont quasi systématiquement en AC3/DTS muets dans Chrome)
  const isMkvWithoutWebAudio = Boolean(!isMp4 && !isWebAudioGroup && !hasExplicitWebAudio);
  const hasUnsupportedAudio = Boolean((hasUnsupportedAudioCodec || isMkvWithoutWebAudio) && !hasExplicitWebAudio);

  const isH264 = /\b(?:[xh][.\s_-]?264|avc(?:-?1)?)\b/i.test(fullText);
  const isH265 = /\b(?:[xh][.\s_-]?265|hevc|10bit)\b/i.test(fullText);

  // Qualité de la source originale : BluRay / WEB-DL garantissent une image nette
  const isHighQualitySource = /\b(?:bluray|bdrip|brrip|web-?dl|web-?rip|hdtv)\b/i.test(fullText);
  // Rejets stricts des captures basse qualité (CAM, Telesync, Screener)
  const isCamOrLowQuality = /\b(?:cam|camrip|hdcam|telesync|ts|hdts|telecine|tc|scr|screener|dvdscr|r5|workprint|wp)\b/i.test(fullText);
  // Doublage de référence : VFF / TrueFrench
  const isPureFrench = /\b(truefrench|vff)\b/i.test(fullText);
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
  if (isFrench) languageLabel = 'Français (VF)';
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
    isMp4,
    isAvi,
    isHighQualitySource,
    isCamOrLowQuality,
    isPureFrench,
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
function curateStreams(rawStreams, provider, { enableAviTranscode = true, enableAudioRemux = enableAviTranscode, preferredLang = 'vf', contentType = 'movie' } = {}) {
  const preferVo = String(preferredLang || '').toLowerCase() === 'vo' || String(preferredLang || '').toLowerCase() === 'vostfr';
  const isMovie = String(contentType || 'movie').toLowerCase() !== 'tv';
  const isHd1080Plus = (s) => s.tierKey === '1080p' || s.tierKey === '4k';

  const validAll = rawStreams
    .filter(s => typeof s.url === 'string' && normalizeAllowedUrl(s.url) !== null && !isTorrentioErrorStream(s))
    .map((s, idx) => {
      const normalizedUrl = normalizeAllowedUrl(s.url);
      const details = parseStreamDetails(s);
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
        isMp4: details.isMp4,
        isAvi: details.isAvi,
        isTorboxLibrary: Boolean(s.isTorboxLibrary),
        isHighQualitySource: details.isHighQualitySource,
        isCamOrLowQuality: details.isCamOrLowQuality,
        isPureFrench: details.isPureFrench,
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
  const valid = (isMovie && movieHdPool.length > 0 && (!anyCachedAll || movieHdPool.some(s => s.isCached))) ? movieHdPool : validAll;

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
    else if (st.tierKey === '4k') score += 42000;
    else if (st.tierKey === '720p') score += isMovie ? -40000 : 10000;
    else score += isMovie ? -80000 : 0;

    // 3. Audio compatible navigateur HTML5 (AAC / MP3 / Opus) vs codecs silencieux (AC3 / EAC3 / DTS / TrueHD)
    // Sans remux FFmpeg (ex: Netlify serverless), un flux AC3/DTS est muet -> pénalité massive pour privilégier AAC/Opus
    if (st.isWebAudioSafe) score += enableAudioRemux ? 25000 : 45000;
    if (st.hasUnsupportedAudio) score -= enableAudioRemux ? 35000 : 85000;

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
    if (st.isPureFrench) score += 20000;
    // Une vraie release VF sans MULTI a une seule piste sonore -> zéro risque que la piste anglaise démarre par défaut
    if (st.isFrench && !st.isMulti) score += 6000;
    if (st.isProper) score += 5000;
    if (st.isTrustedGroup) score += 8000;

    // 7. Codec et format vidéo : H.264 universellement compatible web vs H.265/HEVC (peut échouer sans extension)
    if (st.isH264) score += 12000;
    if (st.isH265) score -= 15000;
    if (st.isMp4) score += 3000;
    if (st.isAvi && !enableAviTranscode) score -= 250000;

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

  // Détermination du meilleur flux actif (priorité langue demandée + audio fonctionnel sans remux + 1080p/4K en cache)
  const matchesPrefLang = (s) => (preferVo ? !s.isFrench : s.isFrench);
  const audioPlayable = (s) => enableAudioRemux || !s.hasUnsupportedAudio;
  let defaultActive = null;
  if (anyCached) {
    const cachedPreferred =
      scored.find(s => s.isCached && matchesPrefLang(s) && audioPlayable(s) && s.tierKey === '1080p') ||
      scored.find(s => s.isCached && matchesPrefLang(s) && audioPlayable(s) && s.tierKey === '4k') ||
      scored.find(s => s.isCached && matchesPrefLang(s) && audioPlayable(s)) ||
      scored.find(s => s.isCached && audioPlayable(s) && s.tierKey === '1080p') ||
      scored.find(s => s.isCached && audioPlayable(s) && s.tierKey === '4k') ||
      scored.find(s => s.isCached && audioPlayable(s)) ||
      scored.find(s => s.isCached && matchesPrefLang(s) && s.tierKey === '1080p') ||
      scored.find(s => s.isCached && matchesPrefLang(s) && s.tierKey === '4k') ||
      scored.find(s => s.isCached && matchesPrefLang(s)) ||
      scored.find(s => s.isCached && s.tierKey === '1080p') ||
      scored.find(s => s.isCached && s.tierKey === '4k') ||
      scored.find(s => s.isCached);
    defaultActive = cachedPreferred || scored[0];
  } else {
    // Si aucun n'est en cache, on prend le meilleur disponible (langue préférée + audio garanti prioritaire)
    defaultActive =
      scored.find(s => matchesPrefLang(s) && audioPlayable(s) && s.tierKey === '1080p') ||
      scored.find(s => matchesPrefLang(s) && audioPlayable(s) && s.tierKey === '4k') ||
      scored.find(s => matchesPrefLang(s) && audioPlayable(s)) ||
      scored.find(s => audioPlayable(s) && s.tierKey === '1080p') ||
      scored.find(s => audioPlayable(s) && s.tierKey === '4k') ||
      scored.find(s => audioPlayable(s)) ||
      scored.find(s => matchesPrefLang(s) && s.tierKey === '1080p') ||
      scored.find(s => matchesPrefLang(s) && s.tierKey === '4k') ||
      scored.find(s => matchesPrefLang(s)) ||
      scored[0];
  }

  // Sélection intelligente par palier de qualité (4K, 1080p, 720p, 480p) et langue (VF / VO)
  // Évite d'avoir 6 doublons en 1080p et garantit un vrai choix de qualité dans le lecteur
  const selectedList = [];
  const seenKeys = new Set();
  const seenIds = new Set();

  // Toujours inclure le flux actif par défaut
  if (defaultActive) {
    const activeKey = `${defaultActive.tierKey}:${defaultActive.isFrench ? 'vf' : (defaultActive.isVostfr ? 'vostfr' : 'vo')}`;
    seenKeys.add(activeKey);
    seenIds.add(defaultActive.id);
    selectedList.push(defaultActive);
  }

  // Garantir la présence d'au moins une VF et au moins une VO dans les choix du lecteur
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

  // 1er passage : Meilleur flux pour chaque combinaison distincte (résolution + langue)
  for (const s of scored) {
    if (selectedList.length >= 6) break;
    if (seenIds.has(s.id)) continue;
    const key = `${s.tierKey}:${s.isFrench ? 'vf' : (s.isVostfr ? 'vostfr' : 'vo')}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      seenIds.add(s.id);
      selectedList.push(s);
    }
  }

  // 2e passage : Si moins de 4 choix, compléter avec des alternatives en cache (fallback audio/source)
  for (const s of scored) {
    if (selectedList.length >= 4) break;
    if (seenIds.has(s.id)) continue;
    seenIds.add(s.id);
    selectedList.push(s);
  }

  // Tri propre pour l'interface : Flux en cache D'ABORD (priorité absolue), puis 4K -> 1080p -> 720p -> 480p, puis VF avant VO
  const tierOrder = { '4k': 0, '1080p': 1, '720p': 2, '480p': 3 };
  selectedList.sort((a, b) => {
    if (a.isCached !== b.isCached) return a.isCached ? -1 : 1;
    const ta = tierOrder[a.tierKey] ?? 9;
    const tb = tierOrder[b.tierKey] ?? 9;
    if (ta !== tb) return ta - tb;
    if (a.isFrench !== b.isFrench) return a.isFrench ? -1 : 1;
    return b.score - a.score;
  });

  // Ajout des libellés de qualité et routage transcodage AVI si nécessaire
  const formattedStreams = selectedList.map(s => {
    let qLabel = s.quality;
    if (s.isFrench) qLabel += ' · VF';
    else if (s.isVostfr) qLabel += ' · VOSTFR';
    else qLabel += ' · VO';

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
 * Vérifie le statut réel d'un lien Torrentio de débridage (détection directe sans CORS)
 */
async function checkStreamStatus(streamUrl, knownFilename = '', { enableAviTranscode = true } = {}) {
  const safeStreamUrl = normalizeAllowedUrl(streamUrl);
  if (!safeStreamUrl) {
    return { success: false, status: 'error', statusCode: 400, error: 'Hôte non autorisé pour la vérification.' };
  }

  try {
    const res = await fetch(safeStreamUrl, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(2500)
    });

    const location = res.headers.get('location') || '';

    // Si redirection 301 / 302 / 307 / 308
    if (res.status >= 300 && res.status < 400 && location) {
      let resolvedLocation;
      try {
        resolvedLocation = normalizeAllowedUrl(new URL(location, safeStreamUrl).toString());
      } catch {
        return { success: false, status: 'error', statusCode: 502, error: 'Redirection invalide.' };
      }

      if (!resolvedLocation) {
        return { success: false, status: 'error', statusCode: 403, error: 'Hôte de redirection non autorisé.' };
      }

      if (isDownloadingUrl(resolvedLocation)) {
        console.log(`[Altyflix Stream Poll] Flux en cours de téléchargement (${resolvedLocation.split('?')[0]})`);
        return {
          success: true,
          status: 'downloading',
          ready: false,
          message: 'Le torrent est en cours de téléchargement vers le cloud debrid...'
        };
      }

      // Inspection multi-sauts (Torrentio -> api.torbox.app 307 -> CDN) pour détecter les conteneurs non HTML5 (.avi/.wmv/.mpg/.flv)
      const isLegacyContainerExt = (str) => /\.(?:avi|wmv|flv|vob|mpe?g|divx)(?:["';?\s]|$)/i.test(String(str || ''));
      const isLegacyContainerMime = (ct) => /msvideo|avi|x-ms-wmv|video\/mpeg|x-flv/i.test(String(ct || ''));
      let isAvi = isLegacyContainerExt(resolvedLocation) || isLegacyContainerExt(knownFilename);
      const isModernKnownContainer = /\.(mp4|mkv|webm|m4v|mov)(?:["';?\s]|$)/i.test(knownFilename || resolvedLocation);
      if (!isAvi && !isModernKnownContainer) {
        try {
          let probeUrl = resolvedLocation;
          for (let hop = 0; hop < 3; hop++) {
            const safeProbe = normalizeAllowedUrl(probeUrl);
            if (!safeProbe) break;
            const headTarget = await fetch(safeProbe, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(1800) });
            const nextLoc = headTarget.headers.get('location') || '';
            if (headTarget.status >= 300 && headTarget.status < 400 && nextLoc) {
              try { await headTarget.body?.cancel(); } catch {}
              const resolvedNext = normalizeAllowedUrl(new URL(nextLoc, safeProbe).toString());
              if (!resolvedNext) {
                return { success: false, status: 'error', statusCode: 403, error: 'Hôte de redirection non autorisé.' };
              }
              if (isDownloadingUrl(resolvedNext)) {
                return {
                  success: true,
                  status: 'downloading',
                  ready: false,
                  message: 'Le torrent est en cours de téléchargement vers le cloud debrid...'
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
              return {
                success: false,
                status: 'error',
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
          message: 'Le torrent est en cours de téléchargement vers le cloud debrid...'
        };
      }

      const isLegacyContainerExt = (str) => /\.(?:avi|wmv|flv|vob|mpe?g|divx)(?:["';?\s]|$)/i.test(String(str || ''));
      const isLegacyContainerMime = (ct) => /msvideo|avi|x-ms-wmv|video\/mpeg|x-flv/i.test(String(ct || ''));
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

    // Réponse inattendue
    return {
      success: false,
      status: 'error',
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
              return {
                name: `[TB+] Torbox Cloud${inferredRes ? `\n${inferredRes}` : ''}`,
                title: `${fName}\n👤 1 💾 ${sizeGb} ⚙️ Ma Bibliothèque TorBox\n🇫🇷`,
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
      message: 'Aucun service de débridage configuré.',
      streams: []
    };
  }

  // Résolution IMDb si absent (multi-tentatives sécurisées via tmdbUrl)
  let imdbId = (typeof initialImdbId === 'string' && /^tt\d{5,10}$/.test(initialImdbId.trim())) ? initialImdbId.trim() : null;
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

  if ((!imdbId || !cleanTitle) && safeId && tmdbKey) {
    try {
      const detailUrl = tmdbUrl(isTv ? `tv/${safeId}/external_ids` : `movie/${safeId}/external_ids`, {}, tmdbKey);
      const tmdbRes = await fetch(detailUrl, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (tmdbRes.ok) {
        const tmdbData = await tmdbRes.json();
        if (!imdbId && /^tt\d{5,10}$/.test(String(tmdbData.imdb_id || ''))) imdbId = tmdbData.imdb_id;
      }
    } catch (e) {
      console.warn('[Altyflix Stream Resolver] Échec de récupération de l\'identifiant IMDb direct :', e.message);
    }
  }

  // Fallback de recherche IMDb et titre si toujours manquant
  if ((!imdbId || !cleanTitle) && safeId && tmdbKey) {
    try {
      const baseDetailUrl = tmdbUrl(isTv ? `tv/${safeId}` : `movie/${safeId}`, { language: 'fr-FR' }, tmdbKey);
      const baseRes = await fetch(baseDetailUrl, { redirect: 'error', signal: AbortSignal.timeout(4000) });
      if (baseRes.ok) {
        const baseData = await baseRes.json();
        const candidateImdb = baseData.imdb_id || baseData.external_ids?.imdb_id;
        if (!imdbId && /^tt\d{5,10}$/.test(String(candidateImdb || ''))) imdbId = candidateImdb;
        if (!cleanTitle) cleanTitle = baseData.title || baseData.name || baseData.original_title || baseData.original_name || '';

        // Fallback Cinemeta (couverture 100% TMDB via le catalogue Stremio)
        if (!imdbId) {
          const searchTitle = cleanTitle || baseData.original_title || baseData.title;
          if (searchTitle) {
            const cinemetaUrl = `https://v3-cinemeta.strem.io/catalog/${isTv ? 'series' : 'movie'}/top/search=${encodeURIComponent(searchTitle)}.json`;
            const cRes = await fetch(cinemetaUrl, { redirect: 'error', signal: AbortSignal.timeout(4000) });
            if (cRes.ok) {
              const cData = await cRes.json();
              const cid = cData?.metas?.[0]?.id;
              if (cid && /^tt\d{5,10}$/.test(cid)) {
                imdbId = cid;
                console.log(`[Altyflix Stream Resolver] IMDb ID identifié via Cinemeta : ${imdbId} pour "${searchTitle}"`);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Altyflix Stream Resolver] Erreur de recherche IMDb étendue :', e.message);
    }
  }

  // Recherche TMDB par titre si IMDb ID toujours manquant
  if (!imdbId && cleanTitle && tmdbKey) {
    try {
      const searchUrl = tmdbUrl(isTv ? 'search/tv' : 'search/movie', { query: cleanTitle, language: 'fr-FR' }, tmdbKey);
      const sRes = await fetch(searchUrl, { redirect: 'error', signal: AbortSignal.timeout(3500) });
      if (sRes.ok) {
        const sData = await sRes.json();
        const topResult = sData.results?.[0];
        if (topResult?.id && positiveInteger(topResult.id)) {
          const extUrl = tmdbUrl(isTv ? `tv/${topResult.id}/external_ids` : `movie/${topResult.id}/external_ids`, {}, tmdbKey);
          const extRes = await fetch(extUrl, { redirect: 'error', signal: AbortSignal.timeout(3000) });
          if (extRes.ok) {
            const extData = await extRes.json();
            if (/^tt\d{5,10}$/.test(String(extData.imdb_id || ''))) {
              imdbId = extData.imdb_id;
              console.log(`[Altyflix Stream Resolver] IMDb ID trouvé via recherche TMDB : ${imdbId} pour "${cleanTitle}"`);
            }
          }
        }
      }
    } catch (sErr) {
      console.warn('[Altyflix Stream Resolver] Erreur recherche TMDB par titre :', sErr.message);
    }
  }

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
          const curated = curateStreams(mylistStreams, provider, { enableAviTranscode, enableAudioRemux, preferredLang: normalizedLang, contentType: type });
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
  const rawFrenchioUrl = (userFrenchioUrl && userFrenchioUrl.trim()) || process.env.FRENCHIO_URL || '';
  const activeFrenchioUrl = normalizeFrenchioUrl(rawFrenchioUrl);
  const cacheKey = `${provider}:${sha256Short(token)}:${streamKey}:${normalizedLang}:${sha256Short(activeFrenchioUrl)}:${enableAudioRemux ? 'remux' : 'direct'}:${enableAviTranscode ? 'avi' : 'noavi'}:${sha256Short(streamBase)}`;

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

  const ALL_PROVIDERS = 'yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex,torrent9,rutracker,rutor,cinemaz,ibit,torlock';

  console.log(`[Altyflix Stream Resolver] Recherche parallèle des flux pour ${type} ${imdbId} (S${season}E${episode}) via ${provider}...`);

  try {
    // Toutes les sources sont interrogées EN PARALLÈLE pour une latence minimale (< 1s)
    const optionsPriorityFr = `providers=${ALL_PROVIDERS}|sort=qualitysize|foreign_lang=french|${provider}=${encodeURIComponent(token)}`;
    const endpointPriorityFr = `https://torrentio.strem.fun/${optionsPriorityFr}/stream/${isTv ? 'series' : 'movie'}/${streamKey}.json`;

    const optionsVf = `providers=${ALL_PROVIDERS}|sort=qualitysize|language=french|${provider}=${encodeURIComponent(token)}`;
    const endpointVf = `https://torrentio.strem.fun/${optionsVf}/stream/${isTv ? 'series' : 'movie'}/${streamKey}.json`;

    const optionsGlobal = `providers=${ALL_PROVIDERS}|sort=qualitysize|${provider}=${encodeURIComponent(token)}`;
    const endpointGlobal = `https://torrentio.strem.fun/${optionsGlobal}/stream/${isTv ? 'series' : 'movie'}/${streamKey}.json`;

    const fetchTorrentio = async (url, label) => {
      try {
        const res = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(4500)
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
      if (!activeFrenchioUrl) return [];
      try {
        const streamPath = isTv ? `series/${streamKey}.json` : `movie/${streamKey}.json`;
        const fUrl = `${activeFrenchioUrl}/stream/${streamPath}`;
        const fRes = await fetch(fUrl, { headers: { 'Accept': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(4000) });
        if (fRes.ok) {
          const fData = await fRes.json();
          if (Array.isArray(fData?.streams)) return fData.streams;
        }
      } catch (fErr) {
        console.warn('[Altyflix Frenchio] Erreur recherche Frenchio :', fErr.message);
      }
      return [];
    };

    const fetchComet = async () => {
      if (!token) return [];
      try {
        const cometConfig = Buffer.from(JSON.stringify({
          debridService: provider,
          debridApiKey: token
        })).toString('base64url');
        const streamPath = isTv ? `series/${streamKey}.json` : `movie/${streamKey}.json`;
        const cUrl = `https://comet.elfhosted.com/${cometConfig}/stream/${streamPath}`;
        const cRes = await fetch(cUrl, {
          headers: { 'Accept': 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(4000)
        });
        if (cRes.ok) {
          const cData = await cRes.json();
          if (Array.isArray(cData?.streams)) {
            return cData.streams
              .filter(s => s && typeof s.url === 'string' && !isTorrentioErrorStream(s))
              .map(s => ({
                ...s,
                title: s.title || s.description || s.name || '',
                name: s.name || '[TB+] Comet'
              }));
          }
        }
      } catch (cErr) {
        // En cas d'indisponibilité temporaire de Comet, continuer sans bloquer les autres indexeurs
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

    const [priorityFrStreams, vfStreams, globalStreams, frenchioStreams, cometStreams, mylistStreams] = await Promise.all([
      fetchTorrentio(endpointPriorityFr, 'FR Priority'),
      fetchTorrentio(endpointVf, 'VF'),
      fetchTorrentio(endpointGlobal, 'Global'),
      fetchFrenchio(),
      fetchComet(),
      fetchMylist()
    ]);

    // Fusion avec déduplication stricte par URL
    const seenUrls = new Set();
    const rawStreams = [];
    for (const s of [...(mylistStreams || []), ...priorityFrStreams, ...frenchioStreams, ...cometStreams, ...vfStreams, ...globalStreams]) {
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
        message: 'Clé de débridage non reconnue. Vérifiez vos paramètres.',
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
        for (const s of orderedForCacheCheck) {
          if (s.isTorboxLibrary) continue;
          const m = (s.url || '').match(hashRegex);
          if (m && m[1]) hashesSet.add(m[1].toLowerCase());
          if (hashesSet.size >= 35) break;
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
                const m = (s.url || '').match(hashRegex);
                if (m && m[1]) {
                  const h = m[1].toLowerCase();
                  if (hashesSet.has(h)) {
                    s._torboxVerifiedCached = Boolean(cachedMap[h]);
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('[Altyflix Stream Resolver] Vérification batch cache TorBox ignorée :', e.message);
      }
    }

    const curated = curateStreams(rawStreams, provider, { enableAviTranscode, enableAudioRemux, preferredLang: normalizedLang, contentType: type });

    if (!curated.streams || curated.streams.length === 0) {
      return {
        success: false,
        reason: 'NO_STREAMS_FOUND',
        status: 'error',
        message: 'Aucun flux direct disponible pour ce titre actuellement.',
        imdbId,
        streams: []
      };
    }

    // Pré-vérification PARALLÈLE de toutes les qualités sélectionnées (~150-350ms au total) :
    // 1. Élimine définitivement le clip vert "Torrent is being downloaded to debrid..."
    // 2. Pré-résout l'URL CDN directe de CHAQUE qualité (changement de qualité instantané)
    // 3. Choisit automatiquement la meilleure source réellement prête + compatible audio
    const verifiedList = await Promise.all(
      curated.streams.map(async (st) => {
        if (st.isTorboxLibrary) {
          return { ...st, isCached: true, isDownloading: false, verifiedReady: true };
        }
        const rawTarget = st.originalUrl || st.url;
        if (!rawTarget || !normalizeAllowedUrl(rawTarget)) {
          return { ...st, verifiedReady: false };
        }
        try {
          const check = await checkStreamStatus(rawTarget, st.filename || '', { enableAviTranscode });
          if (check.ready && check.playbackUrl) {
            const isAviNow = Boolean(st.isAvi || check.isAvi);
            return {
              ...st,
              url: check.playbackUrl,
              directUrl: check.directUrl || check.playbackUrl,
              originalUrl: rawTarget,
              isCached: true,
              isDownloading: false,
              isAvi: isAviNow,
              isTranscoded: Boolean(isAviNow && enableAviTranscode),
              verifiedReady: true
            };
          }
          if (check.status === 'downloading') {
            return {
              ...st,
              isCached: false,
              isDownloading: true,
              verifiedReady: false
            };
          }
        } catch {
          // Timeout réseau sur cette source -> marquée non vérifiée
        }
        return { ...st, verifiedReady: false };
      })
    );

    const readyStreams = verifiedList.filter(s => s.verifiedReady || (s.isCached && !s.isDownloading));
    let initialStatus = 'ready';
    let active = null;
    let finalStreams = verifiedList;

    if (readyStreams.length > 0) {
      const wantVo = normalizedLang === 'vo';
      const matchesLang = (s) => (wantVo ? !s.isFrench : s.isFrench);
      const isPlayableFormat = (s) => !s.isAvi || enableAviTranscode;
      const isHd1080 = (s) => s.tierKey === '1080p' || s.tierKey === '4k';
      const movieHdReady = type !== 'tv' ? readyStreams.filter(isHd1080) : [];
      const eligibleReady = (type !== 'tv' && movieHdReady.length > 0) ? movieHdReady : readyStreams;

      const supportsAc3 = Boolean(clientAc3);
      const pickBestReady = (list) => {
        if (!supportsAc3) {
          // Sur navigateur sans décodeur AC3 natif (Google Chrome sur Windows, Edge, Android...) :
          // Priorité 1 : flux VF avec son garanti (AAC/Opus/MP4 web)
          return list.find(s => isPlayableFormat(s) && matchesLang(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.isH264 && s.tierKey === '1080p') ||
                 list.find(s => isPlayableFormat(s) && matchesLang(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
                 list.find(s => isPlayableFormat(s) && matchesLang(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.tierKey === '4k') ||
                 list.find(s => isPlayableFormat(s) && matchesLang(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio) ||
                 // Priorité 2 : Si aucun flux VF avec son web n'existe (ex. l'Agence tous risques, vieux films),
                 // basculer sur un flux avec son web garanti (VOSTFR avec sous-titres FR automatiques) pour ne JAMAIS avoir de vidéo muette !
                 list.find(s => isPlayableFormat(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.isH264 && s.tierKey === '1080p') ||
                 list.find(s => isPlayableFormat(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
                 list.find(s => isPlayableFormat(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.tierKey === '4k') ||
                 list.find(s => isPlayableFormat(s) && s.isWebAudioSafe && !s.hasUnsupportedAudio) ||
                 // Dernier recours si absolument aucune version sonore web n'existe
                 list.find(s => isPlayableFormat(s) && matchesLang(s) && s.isH264 && s.tierKey === '1080p') ||
                 list.find(s => isPlayableFormat(s) && matchesLang(s) && s.tierKey === '1080p') ||
                 list.find(s => isPlayableFormat(s) && matchesLang(s) && s.tierKey === '4k') ||
                 list.find(s => isPlayableFormat(s) && matchesLang(s)) ||
                 list.find(s => isPlayableFormat(s)) ||
                 list[0];
        }

        // Sur appareil/navigateur avec support AC3 natif (Safari, Edge avec Dolby, Smart TV...)
        return list.find(s => isPlayableFormat(s) && matchesLang(s) && !s.hasUnsupportedAudio && s.isH264 && s.tierKey === '1080p') ||
               list.find(s => isPlayableFormat(s) && matchesLang(s) && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
               list.find(s => isPlayableFormat(s) && matchesLang(s) && !s.hasUnsupportedAudio && s.tierKey === '4k') ||
               list.find(s => isPlayableFormat(s) && matchesLang(s) && !s.hasUnsupportedAudio) ||
               list.find(s => isPlayableFormat(s) && matchesLang(s) && s.isH264 && s.tierKey === '1080p') ||
               list.find(s => isPlayableFormat(s) && matchesLang(s) && s.isH264 && s.tierKey === '4k') ||
               list.find(s => isPlayableFormat(s) && matchesLang(s) && s.tierKey === '1080p') ||
               list.find(s => isPlayableFormat(s) && matchesLang(s) && s.tierKey === '4k') ||
               list.find(s => isPlayableFormat(s) && matchesLang(s)) ||
               list.find(s => isPlayableFormat(s) && !s.hasUnsupportedAudio && s.isH264 && s.tierKey === '1080p') ||
               list.find(s => isPlayableFormat(s) && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
               list.find(s => isPlayableFormat(s) && !s.hasUnsupportedAudio && s.tierKey === '4k') ||
               list.find(s => isPlayableFormat(s) && !s.hasUnsupportedAudio) ||
               list.find(s => isPlayableFormat(s)) ||
               list[0];
      };

      active = pickBestReady(eligibleReady);
      // Préserver TOUS les flux prêts en tête (classés par palier puis langue), suivis des alternatives en téléchargement
      const readyFallbacks = verifiedList.filter(s => s.verifiedReady || (s.isCached && !s.isDownloading));
      const unreadyFallbacks = verifiedList.filter(s => !readyFallbacks.some(r => (r.id && r.id === s.id) || (r.url && r.url === s.url)));
      finalStreams = [...readyFallbacks, ...unreadyFallbacks];
      initialStatus = 'ready';
    } else {
      // Aucune source en cache : on lance le débridage proprement avec l'écran de chargement
      active = verifiedList.find(s => (normalizedLang === 'vo' ? !s.isFrench : s.isFrench)) || verifiedList[0];
      if (active) {
        active = { ...active, isDownloading: true, isCached: false };
      }
      initialStatus = 'downloading';
    }

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
