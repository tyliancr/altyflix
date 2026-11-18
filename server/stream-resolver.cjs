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

const { HttpError } = require('./security.cjs');

// Caches mémoire haute performance (zéro stockage disque)
const streamResolveCache = new Map();
const inFlightResolves = new Map();
const RESOLVE_CACHE_TTL_MS = 120 * 1000; // 2 minutes
const torboxMylistCache = new Map();
const TORBOX_MYLIST_TTL_MS = 30 * 1000; // 30 secondes

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
  'frenchio.elfhosted.com',
  'api.real-debrid.com',
  'real-debrid.com',
  'api.alldebrid.com',
  'alldebrid.com',
  'debrid-link.com',
  'premiumize.me'
];

/**
 * Valide qu'une URL est sécurisée et autorisée (prévention SSRF)
 */
function isAllowedUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    return ALLOWED_POLL_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch {
    return false;
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
 * Détecte si un stream Torrentio est une erreur explicite
 */
function isTorrentioErrorStream(stream) {
  if (!stream) return true;
  const url = String(stream.url || '');
  const title = String(stream.title || '');
  const name = String(stream.name || '');

  if (url.includes('failed_access') || url.includes('/videos/failed_')) return true;
  if (isDownloadingUrl(url)) return true;
  if (name.toLowerCase().includes('error') || name.toLowerCase().includes('tb error') || name.toLowerCase().includes('rd error')) return true;
  if (title.toLowerCase().includes('invalid') || title.toLowerCase().includes('failed') || title.toLowerCase().includes('rate limit')) return true;

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
  const rawTitle = stream.title || '';
  const rawName = stream.name || '';
  const filename = stream.behaviorHints?.filename || rawTitle.split('\n')[0] || '';
  const fullText = (rawTitle + ' ' + rawName + ' ' + filename).toLowerCase();

  // Détection du statut Debrid : Cache (+) vs Téléchargement (download)
  // Si vérifié en temps réel contre l'API TorBox (_torboxVerifiedCached), la vérité TorBox prime sur Torrentio
  let isCached = /\[(tb|rd|ad|pm|dl)\+\]/i.test(rawName) || /\[\+\]/.test(rawName) || /\b\+\b/.test(rawName) || Boolean(stream.isTorboxLibrary);
  let isDownloading = !isCached && (/\[(tb|rd|ad|pm|dl)\s+download\]/i.test(rawName) || /download/i.test(rawName));
  if (typeof stream._torboxVerifiedCached === 'boolean') {
    isCached = stream._torboxVerifiedCached;
    isDownloading = !isCached;
  }

  // Détection de résolution
  let resolution = '1080p FHD';
  let tierKey = '1080p';
  if (/4k|2160p|uhd/i.test(fullText)) {
    resolution = '4K Ultra HD';
    tierKey = '4k';
  } else if (/1080p|fhd/i.test(fullText)) {
    resolution = '1080p FHD';
    tierKey = '1080p';
  } else if (/720p|hd/i.test(fullText)) {
    resolution = '720p HD';
    tierKey = '720p';
  } else if (/480p|sd|xvid/i.test(fullText)) {
    resolution = '480p SD';
    tierKey = '480p';
  }

  // Audio / Langue
  const titleLines = rawTitle.split('\n');
  const mainReleaseName = (titleLines[0] || '').toLowerCase();
  const metaLines = titleLines.slice(1).join('\n').toLowerCase();
  const cleanFilename = filename.toLowerCase();
  const nameNoMultiSub = mainReleaseName.replace(/\bmulti[\s._-]*subs?\b/gi, '');
  const fileNoMultiSub = cleanFilename.replace(/\bmulti[\s._-]*subs?\b/gi, '');

  const hasFrenchInName = /\b(french|truefrench|vff|vfq|vf2|vfi|vf|audio\.fr|vf\.hd|fr-en|multi)\b/i.test(nameNoMultiSub) ||
    /\b(french|truefrench|vff|vfq|vf2|vfi|vf|audio\.fr|vf\.hd|fr-en|multi)\b/i.test(fileNoMultiSub) ||
    /\b(vf|vff|vfq|vfi|vf2|truefrench|french)\b/i.test(fullText);

  const hasFrenchFlag = rawTitle.includes('🇫🇷');
  const isTorrent9 = fullText.includes('torrent9');
  const hasFrenchAudioInAudioLine = /(?:multi\s*audio|\bfr\b|\bfre\b|\bfrancais\b|\bfrench\b).*🇫🇷|🇫🇷.*(?:multi\s*audio|\bfr\b|\bfre\b|\bfrancais\b|\bfrench\b)/i.test(rawTitle) ||
    (hasFrenchFlag && !/\b(vostfr|subfrench)\b/i.test(mainReleaseName));

  const isFrench = Boolean(hasFrenchInName || isTorrent9 || hasFrenchAudioInAudioLine || (hasFrenchFlag && !metaLines.includes('subfrench')));
  const isVostfr = !isFrench && (
    hasFrenchFlag ||
    /\b(vostfr|subfrench|vost)\b/i.test(fullText) ||
    metaLines.includes('subfrench') ||
    metaLines.includes('multi subs')
  );

  // Détection audio : codecs compatibles navigateur (AAC / MP3 / Opus / FLAC) vs codecs silencieux dans Chrome (AC3 / EAC3 / DTS / TrueHD / Atmos)
  const hasAac = /\baac\b/i.test(fullText);
  const hasMp3 = /\bmp3\b/i.test(fullText);
  const hasOpus = /\bopus\b/i.test(fullText);
  const hasFlac = /\bflac\b/i.test(fullText);
  const hasUnsupportedAudio = /\b(ac3|ac-3|e-?ac-?3|eac3|ddp\s*5\.?1|ddp5\.?1|dd\s*5\.?1|dd5\.?1|dd\+|dts(?:-?hd)?|truehd|atmos|lpcm)\b/i.test(fullText);
  const isWebAudioSafe = (hasAac || hasMp3 || hasOpus || hasFlac || /yts|yify|rapta|pir8/i.test(fullText)) && !hasUnsupportedAudio;

  const isMp4 = /\.mp4(\?|$)/i.test(stream?.url || '') || /\.mp4/i.test(filename);
  const isAvi = /\.avi(\?|$)/i.test(stream?.url || '') || /\.avi/i.test(filename) || /xvid|divx/i.test(fullText);

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
    isMp4,
    isAvi,
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
function curateStreams(rawStreams, provider) {
  const valid = rawStreams
    .filter(s => typeof s.url === 'string' && (s.url.startsWith('http') || s.url.startsWith('/api/')) && !isTorrentioErrorStream(s))
    .map((s, idx) => {
      const details = parseStreamDetails(s);
      return {
        id: `stream-${idx}`,
        url: s.url,
        quality: details.resolution,
        tierKey: details.tierKey,
        isCached: details.isCached,
        isDownloading: details.isDownloading,
        isFrench: details.isFrench,
        isVostfr: details.isVostfr,
        isWebAudioSafe: details.isWebAudioSafe,
        hasUnsupportedAudio: details.hasUnsupportedAudio,
        isMp4: details.isMp4,
        isAvi: details.isAvi,
        isTorboxLibrary: Boolean(s.isTorboxLibrary),
        languageLabel: details.languageLabel,
        size: details.size,
        sizeBytes: details.sizeBytes,
        seeds: details.seeds,
        filename: details.filename,
        rawTitle: s.title || s.name || '',
        provider
      };
    });

  if (valid.length === 0) {
    return { streams: [], activeStream: null, hasTrueVf: false, allDownloading: false };
  }

  const scoreStream = (st) => {
    let score = 0;

    // 1. PRIORITÉ ABSOLUE : Flux déjà en cache (+100 000) vs Téléchargement (-50 000)
    // Garantit qu'un flux immédiatement lisible est TOUJOURS choisi avant un flux en attente
    if (st.isCached) score += 100000;
    if (st.isDownloading) score -= 50000;

    // 2. Audio compatible navigateur HTML5 (AAC / MP3 / Opus) vs codecs silencieux (AC3 / EAC3 / DTS / TrueHD)
    if (st.isWebAudioSafe) score += 25000;
    if (st.hasUnsupportedAudio) score -= 35000;

    // 3. Langue française prioritaire
    if (st.isFrench) score += 15000;
    else if (st.isVostfr) score += 500;

    // 4. Format MP4 universel
    if (st.isMp4) score += 3000;

    // 5. Poids adapté à la bande passante
    const gb = st.sizeBytes / (1024 * 1024 * 1024);
    if (st.tierKey === '1080p') {
      if (gb >= 0.7 && gb <= 4.5) score += 400;
      else if (gb > 18) score -= 1500;
    } else if (st.tierKey === '4k') {
      if (gb >= 3 && gb <= 14) score += 400;
      else if (gb > 25) score -= 2000;
    }

    // 6. Seeders
    score += Math.min(100, Math.round(st.seeds / 2));
    return score;
  };

  const scored = valid.map(s => ({ ...s, score: scoreStream(s) }));
  scored.sort((a, b) => b.score - a.score);

  const hasTrueVf = scored.some(s => s.isFrench);
  const anyCached = scored.some(s => s.isCached);
  const allDownloading = !anyCached && scored.every(s => s.isDownloading);

  // Détermination du meilleur flux actif
  // S'il y a de la VF en cache, priorité absolue à la VF en cache !
  let defaultActive = null;
  if (anyCached) {
    const cachedVf = scored.find(s => s.isCached && s.isFrench && s.tierKey === '1080p') ||
                     scored.find(s => s.isCached && s.isFrench) ||
                     scored.find(s => s.isCached && s.tierKey === '1080p') ||
                     scored.find(s => s.isCached);
    defaultActive = cachedVf || scored[0];
  } else {
    // Si aucun n'est en cache, on prend le meilleur disponible (VF prioritaire)
    defaultActive = scored.find(s => s.isFrench) || scored[0];
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

  // Tri propre pour l'interface : 4K -> 1080p -> 720p -> 480p, puis VF avant VO, puis En cache avant En attente
  const tierOrder = { '4k': 0, '1080p': 1, '720p': 2, '480p': 3 };
  selectedList.sort((a, b) => {
    const ta = tierOrder[a.tierKey] ?? 9;
    const tb = tierOrder[b.tierKey] ?? 9;
    if (ta !== tb) return ta - tb;
    if (a.isFrench !== b.isFrench) return a.isFrench ? -1 : 1;
    if (a.isCached !== b.isCached) return a.isCached ? -1 : 1;
    return b.score - a.score;
  });

  // Ajout des libellés de qualité et routage transcodage AVI si nécessaire
  const formattedStreams = selectedList.map(s => {
    let qLabel = s.quality;
    if (s.isFrench) qLabel += ' · VF';
    else if (s.isVostfr) qLabel += ' · VOSTFR';
    else qLabel += ' · VO';

    const streamPlaybackUrl = (s.isAvi && s.url.startsWith('http')) ? `/api/video-stream?url=${encodeURIComponent(s.url)}` : s.url;

    return {
      ...s,
      url: streamPlaybackUrl,
      originalUrl: s.url,
      isTranscoded: Boolean(s.isAvi),
      qualityLabel: qLabel
    };
  });

  const activeFormatted = defaultActive ? formattedStreams.find(s => s.id === defaultActive.id) || {
    ...defaultActive,
    url: (defaultActive.isAvi && defaultActive.url.startsWith('http')) ? `/api/video-stream?url=${encodeURIComponent(defaultActive.url)}` : defaultActive.url,
    originalUrl: defaultActive.url,
    isTranscoded: Boolean(defaultActive.isAvi),
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
async function checkStreamStatus(streamUrl, knownFilename = '') {
  if (!streamUrl || typeof streamUrl !== 'string') {
    return { success: false, status: 'error', error: 'URL manquante ou invalide.' };
  }

  if (!isAllowedUrl(streamUrl)) {
    return { success: false, status: 'error', error: 'Hôte non autorisé pour la vérification.' };
  }

  try {
    const res = await fetch(streamUrl, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(2500)
    });

    const location = res.headers.get('location') || '';

    // Si redirection 301 / 302 / 307 / 308
    if (res.status >= 300 && res.status < 400 && location) {
      if (isDownloadingUrl(location)) {
        console.log(`[Altyflix Stream Poll] Flux en cours de téléchargement (location: ${location})`);
        return {
          success: true,
          status: 'downloading',
          ready: false,
          message: 'Le torrent est en cours de téléchargement vers le cloud debrid...'
        };
      }

      // Inspection de la cible finale pour détection AVI / Transcodage
      // Uniquement si le nom du fichier n'est pas déjà un conteneur moderne (.mp4/.mkv/.webm/.m4v)
      let isAvi = /\.avi(\?|$)/i.test(location) || /\.avi$/i.test(knownFilename);
      const isModernKnownContainer = /\.(mp4|mkv|webm|m4v|mov)(\?|$)/i.test(knownFilename || location);
      if (!isAvi && !isModernKnownContainer) {
        try {
          const headTarget = await fetch(location, { method: 'HEAD', signal: AbortSignal.timeout(1500) });
          const cType = (headTarget.headers.get('content-type') || '').toLowerCase();
          const cDisp = (headTarget.headers.get('content-disposition') || '').toLowerCase();
          if (cType.includes('msvideo') || cType.includes('avi') || cDisp.includes('.avi')) {
            isAvi = true;
          }
        } catch {}
      }

      console.log(`[Altyflix Stream Poll] Flux prêt ! Redirection vers : ${location.split('?')[0]}${isAvi ? ' [Transcodage AVI->MP4 requis]' : ''}`);
      const effectivePlaybackUrl = isAvi ? `/api/video-stream?url=${encodeURIComponent(location)}` : location;

      return {
        success: true,
        status: 'ready',
        ready: true,
        isAvi,
        isTranscoded: isAvi,
        playbackUrl: effectivePlaybackUrl,
        directUrl: location
      };
    }

    // Réponse directe 200 OK
    if (res.status === 200) {
      if (isDownloadingUrl(streamUrl)) {
        return {
          success: true,
          status: 'downloading',
          ready: false,
          message: 'Le torrent est en cours de téléchargement vers le cloud debrid...'
        };
      }

      const cType = (res.headers.get('content-type') || '').toLowerCase();
      const isAvi = /\.avi(\?|$)/i.test(streamUrl) || cType.includes('msvideo') || cType.includes('avi');
      const effectivePlaybackUrl = isAvi ? `/api/video-stream?url=${encodeURIComponent(streamUrl)}` : streamUrl;

      return {
        success: true,
        status: 'ready',
        ready: true,
        isAvi,
        isTranscoded: isAvi,
        playbackUrl: effectivePlaybackUrl,
        directUrl: streamUrl
      };
    }

    // Réponse inattendue
    return {
      success: false,
      status: 'error',
      statusCode: res.status,
      error: `Réponse serveur inattendue (${res.status}).`
    };
  } catch (err) {
    console.error('[Altyflix Stream Poll] Erreur de vérification :', err.message);
    return {
      success: false,
      status: 'error',
      error: 'Délai d\'attente dépassé ou erreur réseau lors du polling : ' + err.message
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
    const cachedMylist = torboxMylistCache.get(torboxToken);
    if (cachedMylist && Date.now() < cachedMylist.expiresAt) {
      torrents = cachedMylist.data;
    } else {
      const res = await fetch('https://api.torbox.app/v1/api/torrents/mylist?bypass_cache=true', {
        headers: { 'Authorization': `Bearer ${torboxToken}` },
        signal: AbortSignal.timeout(2500)
      });
      if (!res.ok) return [];
      const json = await res.json();
      torrents = Array.isArray(json?.data) ? json.data : [];
      torboxMylistCache.set(torboxToken, { data: torrents, expiresAt: Date.now() + TORBOX_MYLIST_TTL_MS });
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
          const sNum = String(season).padStart(2, '0');
          const eNum = String(episode).padStart(2, '0');
          const epRegex = new RegExp(`(?:s${sNum}e${eNum}|${season}x${eNum}|ep\\s*0?${episode})`, 'i');
          if (!epRegex.test(fName) && !epRegex.test(t.name)) continue;
        } else if (episodePattern.test(fName)) {
          continue;
        }

        candidateFiles.push({ torrent: t, file: f, fName, size: Number(f.size) || 0 });
      }
    }

    // Limiter aux 2 meilleurs fichiers (plus gros en taille) et résoudre requestdl EN PARALLÈLE (< 300ms au lieu de 15s)
    candidateFiles.sort((a, b) => b.size - a.size);
    const topCandidates = candidateFiles.slice(0, 2);

    const resolved = await Promise.all(
      topCandidates.map(async ({ torrent: t, file: f, fName, size }) => {
        try {
          const dlRes = await fetch(`https://api.torbox.app/v1/api/torrents/requestdl?token=${torboxToken}&torrent_id=${t.id}&file_id=${f.id}`, {
            signal: AbortSignal.timeout(2200)
          });
          if (dlRes.ok) {
            const dlData = await dlRes.json();
            if (dlData.success && dlData.data) {
              const sizeGb = size ? (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : '';
              return {
                name: `[TB+] Torbox Cloud\n1080p`,
                title: `${fName}\n👤 1 💾 ${sizeGb} ⚙️ Ma Bibliothèque TorBox\n🇫🇷`,
                url: dlData.data,
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
  enableAudioRemux = false
}) {
  const isTv = type === 'tv';
  const provider = (userProvider && userProvider.trim()) || process.env.DEBRID_PROVIDER || 'torbox';
  const token = (userToken && userToken.trim()) || process.env.DEBRID_TOKEN || process.env.TORBOX_TOKEN || '';

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

  // Résolution IMDb si absent (multi-tentatives pour couvrir 100% du catalogue)
  let imdbId = initialImdbId;
  let cleanTitle = (title || '').trim();
  const tmdbKey = process.env.TMDB_API_KEY || 'a0819950449844817a0942ca79a4ccb0';

  if ((!imdbId || !cleanTitle) && id) {
    try {
      const detailUrl = isTv
        ? `https://api.themoviedb.org/3/tv/${id}/external_ids?api_key=${tmdbKey}`
        : `https://api.themoviedb.org/3/movie/${id}/external_ids?api_key=${tmdbKey}`;
      const tmdbRes = await fetch(detailUrl, { signal: AbortSignal.timeout(5000) });
      if (tmdbRes.ok) {
        const tmdbData = await tmdbRes.json();
        if (!imdbId) imdbId = tmdbData.imdb_id;
      }
    } catch (e) {
      console.warn('[Altyflix Stream Resolver] Échec de récupération de l\'identifiant IMDb direct :', e.message);
    }
  }

  // Fallback de recherche IMDb et titre si toujours manquant
  if ((!imdbId || !cleanTitle) && id) {
    try {
      const baseDetailUrl = isTv
        ? `https://api.themoviedb.org/3/tv/${id}?api_key=${tmdbKey}&language=fr-FR`
        : `https://api.themoviedb.org/3/movie/${id}?api_key=${tmdbKey}&language=fr-FR`;
      const baseRes = await fetch(baseDetailUrl, { signal: AbortSignal.timeout(4000) });
      if (baseRes.ok) {
        const baseData = await baseRes.json();
        if (!imdbId) imdbId = baseData.imdb_id || baseData.external_ids?.imdb_id;
        if (!cleanTitle) cleanTitle = baseData.title || baseData.name || baseData.original_title || baseData.original_name || '';

        // Fallback Cinemeta (couverture 100% TMDB via le catalogue Stremio)
        if (!imdbId) {
          const searchTitle = cleanTitle || baseData.original_title || baseData.title;
          if (searchTitle) {
            const cinemetaUrl = `https://v3-cinemeta.strem.io/catalog/${isTv ? 'series' : 'movie'}/top/search=${encodeURIComponent(searchTitle)}.json`;
            const cRes = await fetch(cinemetaUrl, { signal: AbortSignal.timeout(4000) });
            if (cRes.ok) {
              const cData = await cRes.json();
              if (Array.isArray(cData?.metas) && cData.metas.length > 0 && cData.metas[0].id) {
                imdbId = cData.metas[0].id;
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
  if (!imdbId && cleanTitle) {
    try {
      const searchUrl = isTv
        ? `https://api.themoviedb.org/3/search/tv?api_key=${tmdbKey}&query=${encodeURIComponent(cleanTitle)}&language=fr-FR`
        : `https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=${encodeURIComponent(cleanTitle)}&language=fr-FR`;
      const sRes = await fetch(searchUrl, { signal: AbortSignal.timeout(3500) });
      if (sRes.ok) {
        const sData = await sRes.json();
        const topResult = sData.results?.[0];
        if (topResult?.id) {
          const extUrl = isTv
            ? `https://api.themoviedb.org/3/tv/${topResult.id}/external_ids?api_key=${tmdbKey}`
            : `https://api.themoviedb.org/3/movie/${topResult.id}/external_ids?api_key=${tmdbKey}`;
          const extRes = await fetch(extUrl, { signal: AbortSignal.timeout(3000) });
          if (extRes.ok) {
            const extData = await extRes.json();
            imdbId = extData.imdb_id;
            console.log(`[Altyflix Stream Resolver] IMDb ID trouvé via recherche TMDB : ${imdbId} pour "${cleanTitle}"`);
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
          const curated = curateStreams(mylistStreams, provider);
          return {
            success: true,
            status: 'ready',
            imdbId: null,
            streams: curated.streams,
            activeStream: curated.activeStream,
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
  const activeFrenchioUrl = (userFrenchioUrl && userFrenchioUrl.trim()) || process.env.FRENCHIO_URL || '';
  const cacheKey = `${provider}:${token.slice(-6)}:${streamKey}:${activeFrenchioUrl ? 'fr' : ''}`;

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
    const optionsVf = `providers=${ALL_PROVIDERS}|sort=qualitysize|language=french|${provider}=${encodeURIComponent(token)}`;
    const endpointVf = `https://torrentio.strem.fun/${optionsVf}/stream/${isTv ? 'series' : 'movie'}/${streamKey}.json`;

    const optionsGlobal = `providers=${ALL_PROVIDERS}|sort=qualitysize|${provider}=${encodeURIComponent(token)}`;
    const endpointGlobal = `https://torrentio.strem.fun/${optionsGlobal}/stream/${isTv ? 'series' : 'movie'}/${streamKey}.json`;

    const fetchTorrentio = async (url, label) => {
      try {
        const res = await fetch(url, {
          headers: { 'Accept': 'application/json' },
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
        const cleanBase = activeFrenchioUrl.replace(/\/manifest\.json$/, '').replace(/\/$/, '');
        const fUrl = `${cleanBase}/stream/${streamPath}`;
        const fRes = await fetch(fUrl, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(4000) });
        if (fRes.ok) {
          const fData = await fRes.json();
          if (Array.isArray(fData?.streams)) return fData.streams;
        }
      } catch (fErr) {
        console.warn('[Altyflix Frenchio] Erreur recherche Frenchio :', fErr.message);
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

    const [vfStreams, globalStreams, frenchioStreams, mylistStreams] = await Promise.all([
      fetchTorrentio(endpointVf, 'VF'),
      fetchTorrentio(endpointGlobal, 'Global'),
      fetchFrenchio(),
      fetchMylist()
    ]);

    // Fusion avec déduplication stricte par URL (Bibliothèque TorBox en tête)
    const seenUrls = new Set();
    const rawStreams = [];
    for (const s of [...mylistStreams, ...frenchioStreams, ...vfStreams, ...globalStreams]) {
      if (s && s.url && !seenUrls.has(s.url)) {
        seenUrls.add(s.url);
        rawStreams.push(s);
      }
    }

    // Détection d'erreurs de clé
    const errorStream = rawStreams.find(isTorrentioErrorStream);
    if (errorStream && rawStreams.length === 1) {
      return {
        success: false,
        reason: 'INVALID_DEBRID_TOKEN',
        status: 'error',
        message: `${errorStream.title || 'Clé de débridage non reconnue'}. Vérifiez vos paramètres.`,
        imdbId,
        streams: []
      };
    }

    // Vérification temps réel du cache TorBox (élimine les faux [TB+] périmés de Torrentio en 1 appel ~180ms)
    if (provider === 'torbox' && token && rawStreams.length > 0) {
      try {
        const hashRegex = /\/resolve\/torbox\/[^/]+\/([a-fA-F0-9]{40})\//i;
        const hashesSet = new Set();
        for (const s of rawStreams) {
          if (s.isTorboxLibrary) continue;
          const m = (s.url || '').match(hashRegex);
          if (m && m[1]) hashesSet.add(m[1].toLowerCase());
          if (hashesSet.size >= 35) break;
        }
        if (hashesSet.size > 0) {
          const hashesParam = Array.from(hashesSet).join(',');
          const cacheRes = await fetch(`https://api.torbox.app/v1/api/torrents/checkcached?hash=${hashesParam}&format=object`, {
            headers: { 'Authorization': `Bearer ${token}` },
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

    const curated = curateStreams(rawStreams, provider);

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
        if (!rawTarget || !rawTarget.startsWith('http')) {
          return { ...st, verifiedReady: !st.isDownloading };
        }
        try {
          const check = await checkStreamStatus(rawTarget, st.filename || '');
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
              isTranscoded: isAviNow,
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

    const readyStreams = verifiedList.filter(s => s.verifiedReady);
    let initialStatus = 'ready';
    let active = null;
    let finalStreams = verifiedList;

    if (readyStreams.length > 0) {
      // Préférer VF + audio web compatible (AAC/MP3/Opus) + 1080p, sinon meilleure source prête
      const pickBestReady = (list) =>
        list.find(s => s.isFrench && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
        list.find(s => s.isFrench && !s.hasUnsupportedAudio) ||
        list.find(s => !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
        list.find(s => !s.hasUnsupportedAudio) ||
        list.find(s => s.isFrench && s.tierKey === '1080p') ||
        list.find(s => s.isFrench) ||
        list[0];

      active = pickBestReady(readyStreams);
      // Ne montrer que les qualités réellement prêtes dans le menu : zéro écran vert au changement de qualité !
      finalStreams = readyStreams;
      initialStatus = 'ready';
    } else {
      // Aucune source en cache : on lance le débridage proprement avec l'écran de chargement
      active = verifiedList.find(s => s.isFrench) || verifiedList[0];
      if (active) {
        active = { ...active, isDownloading: true, isCached: false };
      }
      initialStatus = 'downloading';
    }

    // Synchroniser l'élément actif dans la liste streams et activer le remux audio AAC pour AC3/DTS si FFmpeg est dispo
    const finalizeStreamUrl = (s) => {
      if (!s) return s;
      if (s.isAvi && s.url && !s.url.startsWith('/api/video-stream')) {
        return { ...s, url: `/api/video-stream?url=${encodeURIComponent(s.url)}`, isTranscoded: true };
      }
      if (enableAudioRemux && s.hasUnsupportedAudio && s.verifiedReady && s.url && s.url.startsWith('http')) {
        return {
          ...s,
          url: `/api/video-stream?audio=aac&url=${encodeURIComponent(s.url)}`,
          directUrl: s.directUrl || s.url,
          isTranscoded: true,
          audioRemuxed: true
        };
      }
      return s;
    };

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
      message: 'Erreur réseau lors de la recherche des flux : ' + err.message,
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
  isAllowedUrl,
  isDownloadingUrl,
  isTorrentioErrorStream,
  parseStreamDetails,
  curateStreams,
  checkStreamStatus,
  resolveStreamsServer
};
