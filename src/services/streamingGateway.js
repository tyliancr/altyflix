/**
 * ALTYFLIX STREAMING GATEWAY (Client-Side Architecture)
 * Résolution directe de flux vidéo haute vitesse pour le lecteur natif Altyflix.
 * 
 * 100% Client-Side - 0 Serveur API requis - Déployable sur Netlify.
 * Compatible : Torbox (recommandé pour le multi-accès entre amis), Real-Debrid, AllDebrid, DebridLink, Premiumize.
 */

import { getMovieDetails, getSeriesDetails } from './tmdb.js';

export const DEBRID_PROVIDERS = [
    { id: 'torbox', name: 'Torbox (Recommandé amis / multi-IP)', docsUrl: 'https://torbox.app' },
    { id: 'realdebrid', name: 'Real-Debrid', docsUrl: 'https://real-debrid.com' },
    { id: 'alldebrid', name: 'AllDebrid', docsUrl: 'https://alldebrid.com' },
    { id: 'debridlink', name: 'Debrid-Link', docsUrl: 'https://debrid-link.com' },
    { id: 'premiumize', name: 'Premiumize.me', docsUrl: 'https://premiumize.me' }
];

export const DEFAULT_PROVIDER = 'torbox';
export const DEFAULT_TOKEN = '';

// Clé plateforme sécurisée côté serveur (DEBRID_TOKEN dans .env).
// Les clés secrètes ne sont jamais exposées côté frontend pour protéger les quotas.
const PLATFORM_DEFAULT_PROVIDER = 'torbox';

const STORAGE_KEY_PROVIDER = 'altyflix_stream_provider';
const STORAGE_KEY_TOKEN = 'altyflix_stream_token';
const STORAGE_KEY_FRENCHIO_URL = 'altyflix_frenchio_url';

function checkBrowserAc3Support() {
    if (typeof document === 'undefined') return false;
    try {
        const v = document.createElement('video');
        const canAc3 = v.canPlayType('audio/mp4; codecs="ac-3"');
        const canEc3 = v.canPlayType('audio/mp4; codecs="ec-3"');
        return Boolean((canAc3 && canAc3 !== 'no') || (canEc3 && canEc3 !== 'no'));
    } catch {
        return false;
    }
}

/**
 * Récupère la configuration actuelle de la passerelle
 * Priorité : LocalStorage utilisateur si configuré, sinon clé globale serveur
 */
// Helper compatible Safari < 16 & Smart TV WebViews (évite AbortSignal.timeout / AbortSignal.any absents)
function createTimeoutSignal(ms, parentSignal = null) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
        try { controller.abort(new DOMException('Timeout', 'TimeoutError')); } catch { controller.abort(); }
    }, ms);
    const onParentAbort = () => {
        clearTimeout(timer);
        try { controller.abort(parentSignal?.reason); } catch { controller.abort(); }
    };
    if (parentSignal) {
        if (parentSignal.aborted) {
            onParentAbort();
        } else {
            parentSignal.addEventListener('abort', onParentAbort, { once: true });
        }
    }
    return {
        signal: controller.signal,
        cleanup: () => {
            clearTimeout(timer);
            if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
        }
    };
}

export function getGatewayConfig() {
    let provider = DEFAULT_PROVIDER;
    let customToken = '';
    let frenchioUrl = '';

    if (typeof window !== 'undefined') {
        try {
            const storedProvider = localStorage.getItem(STORAGE_KEY_PROVIDER);
            const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
            const storedFrenchio = localStorage.getItem(STORAGE_KEY_FRENCHIO_URL);
            if (storedProvider && storedProvider.trim()) provider = storedProvider.trim();
            if (storedToken && storedToken.trim().length > 3) customToken = storedToken.trim();
            if (storedFrenchio && storedFrenchio.trim()) frenchioUrl = storedFrenchio.trim();
        } catch { /* stockage restreint */ }
    }

    const hasCustomToken = Boolean(customToken);

    return {
        provider: provider || DEFAULT_PROVIDER,
        token: customToken,
        customToken,
        frenchioUrl,
        hasCustomToken,
        hasToken: true // Le serveur fournit la clé plateforme de manière 100% sécurisée
    };
}

/**
 * Enregistre la configuration de la passerelle
 */
export function saveGatewayConfig({ provider, token, frenchioUrl }) {
    if (typeof window === 'undefined') return;

    try {
        if (provider) {
            localStorage.setItem(STORAGE_KEY_PROVIDER, provider);
        }
        if (typeof token === 'string') {
            const trimmed = token.trim();
            if (trimmed) {
                localStorage.setItem(STORAGE_KEY_TOKEN, trimmed);
            } else {
                localStorage.removeItem(STORAGE_KEY_TOKEN);
            }
        }
        if (typeof frenchioUrl === 'string') {
            const trimmed = frenchioUrl.trim();
            if (trimmed) {
                localStorage.setItem(STORAGE_KEY_FRENCHIO_URL, trimmed);
            } else {
                localStorage.removeItem(STORAGE_KEY_FRENCHIO_URL);
            }
        }
    } catch { /* stockage restreint */ }

    // Déclenche un événement personnalisé pour notifier l'UI
    window.dispatchEvent(new CustomEvent('altyflix-gateway-updated', {
        detail: {
            provider,
            token: (token || '').trim(),
            frenchioUrl: (frenchioUrl || '').trim()
        }
    }));
}

/**
 * Détecte si un flux retourné par Torrentio est un flux d'erreur (vidéo clip d'erreur, clé invalide, etc.)
 */
export function isTorrentioErrorStream(stream) {
    if (!stream) return true;
    const url = String(stream.url || '');
    const title = String(stream.title || '');
    const name = String(stream.name || '');

    if (url.includes('failed_access') || url.includes('/videos/failed_')) return true;
    if (name.toLowerCase().includes('error') || name.toLowerCase().includes('tb error') || name.toLowerCase().includes('rd error')) return true;
    if (title.toLowerCase().includes('invalid') || title.toLowerCase().includes('failed') || title.toLowerCase().includes('rate limit')) return true;

    // Filtre les vidéos de téléchargement Torrentio : ne jamais les considérer comme une vidéo de film valide
    if (url.includes('downloading_') || url.includes('/videos/downloading') || url.includes('downloading.mp4')) return true;

    return false;
}

/**
 * Convertit une chaîne de taille lisible (ex: 2.1 GB) en octets
 */
function parseBytes(str) {
    if (!str) return 0;
    const m = str.match(/([\d.]+)\s*([KMGT]B)/i);
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
 * Analyse les informations d'un flux Torrentio
 */
function parseStreamDetails(stream) {
    const titleText = stream.title || '';
    const nameText = stream.name || '';
    const filename = stream.behaviorHints?.filename || titleText.split('\n')[0] || '';
    const fullText = (titleText + ' ' + nameText + ' ' + filename).toLowerCase();

    // Détection Debrid : flux en cache ([TB+], [RD+], etc.) vs flux en cours de téléchargement
    const isCached = /\[(tb|rd|ad|pm|dl)\+\]/i.test(nameText) || /\[\+\]/.test(nameText) || /\b\+\b/.test(nameText);
    const isDownloading = !isCached && (/\[(tb|rd|ad|pm|dl)\s+download\]/i.test(nameText) || /download/i.test(nameText));

    // Décomposition des lignes Torrentio pour isoler le nom de la release des métadonnées
    const titleLines = titleText.split('\n');
    const mainReleaseName = (titleLines[0] || '').toLowerCase();
    const metaLines = titleLines.slice(1).join('\n').toLowerCase();
    const cleanFilename = filename.toLowerCase();

    // Détection de la résolution (4K, 1080p, 720p, etc.)
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

    // 1. DÉTECTION VRAIE PISTE AUDIO FRANÇAISE (VF / VFF / TRUEFRENCH / VFQ / VFI / MULTI / Torrent9)
    const hasFrenchInName = /\b(french|truefrench|vff|vfq|vf2|vfi|vf|audio\.fr|vf\.hd|fr-en|multi)\b/i.test(mainReleaseName) ||
        /\b(french|truefrench|vff|vfq|vf2|vfi|vf|audio\.fr|vf\.hd|fr-en|multi)\b/i.test(cleanFilename) ||
        /\b(vf|vff|vfq|vfi|vf2|truefrench|french)\b/i.test(fullText);

    const hasFrenchFlag = titleText.includes('🇫🇷');
    const isTorrent9 = fullText.includes('torrent9');
    const hasFrenchAudioInAudioLine = /(?:multi\s*audio|\bfr\b|\bfre\b|\bfrancais\b|\bfrench\b).*🇫🇷|🇫🇷.*(?:multi\s*audio|\bfr\b|\bfre\b|\bfrancais\b|\bfrench\b)/i.test(titleText) ||
        (hasFrenchFlag && !/\b(vostfr|subfrench)\b/i.test(mainReleaseName));

    const isFrench = Boolean(hasFrenchInName || isTorrent9 || hasFrenchAudioInAudioLine || (hasFrenchFlag && !metaLines.includes('subfrench')));

    // 2. SOUS-TITRES FRANÇAIS (VOSTFR)
    // Si la piste audio n'est pas VF mais que des sous-titres FR ou la mention VOSTFR sont présents
    const isVostfr = !isFrench && (
        hasFrenchFlag ||
        /\b(vostfr|subfrench|vost)\b/i.test(fullText) ||
        metaLines.includes('subfrench') ||
        metaLines.includes('multi subs')
    );

    // Détection compatibilité audio navigateur (AAC, MP3, Opus, FLAC...)
    // Évite le silence provoqué par les codecs propriétaires Dolby AC3 / E-AC3 / DTS non décodés par Chrome
    const hasAac = /aac/i.test(fullText);
    const hasMp3 = /mp3/i.test(fullText);
    const hasOpus = /opus/i.test(fullText);
    const hasFlac = /flac/i.test(fullText);
    const isWebAudioGroup = /\b(?:yts|yify|rapta|pir8|joy|ozlem|galaxytv|tgx|qman|lordvako|psa|f4st)\b/i.test(fullText);
    const hasDdp = /ddp|eac3|atmos/i.test(fullText);
    const hasDts = /dts/i.test(fullText);
    const hasAc3 = /\bac3\b/i.test(fullText);
    const hasUnsupportedAudioCodec = /(?:\bdd\+(?![a-z])|\b(?:ac3|ac-3|e-?ac-?3|eac3|ddp(?:\s*\.?\s*[257]\.?[01])?|dd\s*\.?\s*[257]\.?[01]|dts(?:-?hd)?|truehd|atmos|lpcm)\b)/i.test(fullText);
    const hasExplicitWebAudio = Boolean(hasAac || hasMp3 || hasOpus || hasFlac);

    // Détection codec vidéo H.264 (universel) vs H.265/HEVC (incompatible sur certains navigateurs sans extension)
    const isH264 = /\b(?:[xh][.\s_-]?264|avc(?:-?1)?)\b/i.test(fullText);
    const isH265 = /\b(?:[xh][.\s_-]?265|hevc|10bit)\b/i.test(fullText);

    const isMp4 = /\.mp4(\?|$)/i.test(stream?.url || '') || /\.mp4/i.test(filename);
    const isAvi = /\.avi(\?|$)/i.test(stream?.url || '') || /\.avi/i.test(filename) || /xvid|divx/i.test(fullText);

    // Audio garanti sans coupure sonore dans le navigateur
    const isWebAudioSafe = Boolean(hasExplicitWebAudio || ((isWebAudioGroup || isMp4) && !hasUnsupportedAudioCodec));
    // Codecs propriétaires incompatibles Chrome (audio 100% muet en HTML5)
    const hasBadAudio = Boolean(hasUnsupportedAudioCodec && !hasExplicitWebAudio);
    const isPureFrench = /\b(truefrench|vff)\b/i.test(fullText);
    const isHighQualitySource = /\b(?:bluray|bdrip|brrip|web-?dl|web-?rip|hdtv)\b/i.test(fullText);
    const isCamOrLowQuality = /\b(?:cam|camrip|hdcam|telesync|ts|hdts|telecine|tc|scr|screener|dvdscr|r5|workprint|wp)\b/i.test(fullText);
    const isMulti = /\bmulti\b/i.test(fullText);
    const isProper = /\b(?:proper|repack|rerip)\b/i.test(fullText);
    const isTrustedGroup = /\b(?:extreme|pop|f4st|supply|bll|fw|fr5|wawacity|torrent9|qtz|dav1nci|gh0st|duff|yts|yify|vxt|galaxytv|tgx|qxr|tigole|utr|joy|psa|bone|minx|flux|ntb)\b/i.test(fullText);

    // Extraction de la taille du fichier (ex: 2.1 GB)
    const sizeMatch = titleText.match(/💾\s*([\d.]+\s*[KMGT]B)/i);
    const size = sizeMatch ? sizeMatch[1] : '';
    const sizeBytes = size ? parseBytes(size) : 0;

    // Extraction des seeders
    const seedsMatch = titleText.match(/👤\s*(\d+)/);
    const seeds = seedsMatch ? parseInt(seedsMatch[1], 10) : 0;

    let languageLabel = 'Version Originale';
    if (isFrench) {
        languageLabel = 'Français (VF)';
    } else if (isVostfr) {
        languageLabel = 'VOSTFR (Sous-titres FR)';
    }

    return {
        resolution,
        tierKey,
        isCached,
        isDownloading,
        isFrench,
        isVostfr,
        isWebAudioSafe,
        hasBadAudio,
        isH264,
        isH265,
        isPureFrench,
        isHighQualitySource,
        isCamOrLowQuality,
        isMulti,
        isProper,
        isTrustedGroup,
        isMp4,
        isAvi,
        hasDdp,
        hasDts,
        hasAc3,
        languageLabel,
        size,
        sizeBytes,
        seeds,
        filename: filename || 'Vidéo'
    };
}

/**
 * Sélectionne et dédouble intelligemment les flux pour offrir une interface épurée style Netflix :
 * - 3 à 4 qualités maximum (4K, 1080p, 720p, 480p) sans duplication
 * - Priorise le son 100% compatible navigateur (AAC/MP3)
 * - Distingue honnêtement vraie VF et VOSTFR (pas de fausse VF !)
 * - Évite les fichiers géants de 80 GB qui font ramer la 4K
 * - 1080p Full HD sélectionné par défaut pour un démarrage instantané sans freeze
 */
function curateStreams(rawStreams, provider, { contentType = 'movie' } = {}) {
    const isMovie = String(contentType || 'movie').toLowerCase() !== 'tv';
    const validAll = rawStreams
        .filter(s => typeof s.url === 'string' && s.url.startsWith('http') && !isTorrentioErrorStream(s))
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
                hasBadAudio: details.hasBadAudio,
                hasUnsupportedAudio: details.hasBadAudio,
                isH264: details.isH264,
                isH265: details.isH265,
                isPureFrench: details.isPureFrench,
                isHighQualitySource: details.isHighQualitySource,
                isCamOrLowQuality: details.isCamOrLowQuality,
                isMulti: details.isMulti,
                isProper: details.isProper,
                isTrustedGroup: details.isTrustedGroup,
                isMp4: details.isMp4,
                isAvi: details.isAvi,
                languageLabel: details.languageLabel,
                size: details.size,
                sizeBytes: details.sizeBytes,
                seeds: details.seeds,
                filename: details.filename,
                rawTitle: s.title || s.name || '',
                provider
            };
        });

    const movieHdPool = isMovie ? validAll.filter(s => s.tierKey === '1080p' || s.tierKey === '4k') : [];
    const valid = (isMovie && movieHdPool.length > 0) ? movieHdPool : validAll;

    if (valid.length === 0) return { streams: [], activeStream: null, hasTrueVf: false, allDownloading: false, anyCached: false };

    // Y a-t-il au moins un flux avec de la vraie VF ?
    const hasTrueVf = valid.some(s => s.isFrench);

    // Fonction de score : PRIORITÉ ABSOLUE AUX FLUX EN CACHE (+100 000), SON FONCTIONNEL (+25000) ET VF (+15000)
    const scoreStream = (st) => {
        let score = 0;

        // 0. ÉLIMINATION RIGOUREUSE DES COPIES DE BASSE QUALITÉ (CAM, Telesync, Screener)
        if (st.isCamOrLowQuality) score -= 600000;

        // 1. PRIORITÉ ABSOLUE AU STREAM EN CACHE PRÊT INSTANTANÉMENT
        if (st.isCached) {
            score += 100000;
        }
        if (st.isDownloading) {
            score -= 500000;
        }

        // 2. Son 100% garanti dans le navigateur (AAC / MP3 / Opus) : CRITIQUE pour ne jamais avoir de vidéo muette
        if (st.isWebAudioSafe) {
            score += 45000;
        }
        if (st.hasBadAudio) {
            // Codecs propriétaires Dolby/DTS (AC3/DTS/E-AC3) rejetés car non décodés par Chrome/Edge
            score -= 85000;
        }

        // 3. Codec vidéo : H.264 ultra compatible web (+12000) vs H.265/HEVC (-15000)
        if (st.isH264) score += 12000;
        if (st.isH265) score -= 15000;

        // 4. VF prioritaire au lancement (+15000) sinon VOSTFR (+500)
        if (st.isFrench) score += 15000;
        else if (st.isVostfr) score += 500;

        // 5. Source d'origine certifiée : BluRay / BDRip / WEB-DL garantissent une image propre
        if (st.isHighQualitySource) score += 18000;

        // 6. Doublage français de référence : VFF / TRUEFRENCH
        if (st.isPureFrench) score += 20000;
        if (st.isFrench && !st.isMulti) score += 6000;
        if (st.isProper) score += 5000;
        if (st.isTrustedGroup) score += 8000;

        // 7. Format MP4 universel vs AVI éliminé
        if (st.isMp4) score += 3000;
        if (st.isAvi) score -= 250000;

        // 8. Taille optimale pour la fluidité (évite les lags)
        const gb = st.sizeBytes / (1024 * 1024 * 1024);
        if (st.tierKey === '1080p') {
            if (gb >= 1.2 && gb <= 4.5) score += 800;
            else if (gb >= 0.7 && gb < 1.2) score += 300;
            else if (gb > 18) score -= 1500;
        } else if (st.tierKey === '4k') {
            if (gb >= 4 && gb <= 14) score += 800;
            else if (gb > 25) score -= 2000;
        } else if (st.tierKey === '720p') {
            if (gb >= 0.4 && gb <= 2.0) score += 300;
        }

        // 9. Santé du torrent (seeders)
        score += Math.min(100, Math.round(st.seeds / 2));
        return score;
    };

    const scored = valid.map(s => ({ ...s, score: scoreStream(s) }));

    // Regroupement par palier de résolution
    const tiers = { '1080p': [], '4k': [], '720p': [], '480p': [] };
    scored.forEach(s => {
        if (tiers[s.tierKey]) tiers[s.tierKey].push(s);
    });

    const curated = [];

    const anyCached = scored.some(s => s.isCached);
    const allDownloading = !anyCached && scored.every(s => s.isDownloading);

    // Palier 1080p FHD (Le cœur de l'expérience : ultra fluide, VF prioritaire)
    if (tiers['1080p'].length > 0) {
        tiers['1080p'].sort((a, b) => b.score - a.score);
        const best1080p = tiers['1080p'][0];
        
        let label1080 = '1080p FHD';
        if (best1080p.isFrench) label1080 = '1080p FHD · VF';
        else if (best1080p.isVostfr) label1080 = '1080p FHD · VOSTFR';
        else label1080 = '1080p FHD · VO';

        curated.push({
            ...best1080p,
            qualityLabel: label1080
        });

        // Si la meilleure version est en VF, on propose aussi une alternative VO en 1080p
        if (best1080p.isFrench) {
            const altVo = tiers['1080p'].find(s => !s.isFrench && s.id !== best1080p.id);
            if (altVo) {
                curated.push({
                    ...altVo,
                    qualityLabel: `1080p FHD · ${altVo.isVostfr ? 'VOSTFR' : 'VO'}`
                });
            }
        } else if (hasTrueVf) {
            // Si le premier n'était pas VF mais qu'une VF existe dans ce palier, on l'ajoute en tête
            const altVf = tiers['1080p'].find(s => s.isFrench);
            if (altVf) {
                curated.unshift({
                    ...altVf,
                    qualityLabel: '1080p FHD · VF'
                });
            }
        }
    }

    // Palier 4K UHD (L'option ultra haute définition optimisée, sans freeze)
    if (tiers['4k'].length > 0) {
        tiers['4k'].sort((a, b) => b.score - a.score);
        const best4k = tiers['4k'][0];
        const langTag = best4k.isFrench ? 'VF' : (best4k.isVostfr ? 'VOSTFR' : 'VO');
        curated.push({
            ...best4k,
            qualityLabel: `4K Ultra HD · ${langTag}`
        });
    }

    // Palier 720p HD (Économique / Connexions modestes)
    if (tiers['720p'].length > 0) {
        tiers['720p'].sort((a, b) => b.score - a.score);
        const best720 = tiers['720p'][0];
        const langTag = best720.isFrench ? 'VF' : (best720.isVostfr ? 'VOSTFR' : 'VO');
        curated.push({
            ...best720,
            qualityLabel: `720p HD · ${langTag}`
        });
    }

    // Palier 480p SD (si présent)
    if (tiers['480p'].length > 0) {
        tiers['480p'].sort((a, b) => b.score - a.score);
        curated.push({
            ...tiers['480p'][0],
            qualityLabel: '480p SD'
        });
    }

    const rawList = curated.length > 0 ? curated : scored.sort((a, b) => b.score - a.score).slice(0, 4);
    const finalStreams = rawList.map(s => {
        if (s.isAvi && !s.url.startsWith('/api/video-stream')) {
            return {
                ...s,
                url: `/api/video-stream?url=${encodeURIComponent(s.url)}`,
                originalUrl: s.url,
                isTranscoded: true
            };
        }
        return s;
    });
    
    // Sélection par défaut : flux en cache avec audio garanti en priorité absolue !
    let defaultActive = null;
    if (anyCached) {
        defaultActive =
            finalStreams.find(s => s.isCached && s.isFrench && !s.hasBadAudio && s.tierKey === '1080p') ||
            finalStreams.find(s => s.isCached && s.isFrench && !s.hasBadAudio) ||
            finalStreams.find(s => s.isCached && !s.hasBadAudio && s.tierKey === '1080p') ||
            finalStreams.find(s => s.isCached && !s.hasBadAudio) ||
            finalStreams.find(s => s.isCached && s.isFrench && s.tierKey === '1080p') ||
            finalStreams.find(s => s.isCached && s.isFrench) ||
            finalStreams.find(s => s.isCached && s.tierKey === '1080p') ||
            finalStreams.find(s => s.isCached);
    }
    if (!defaultActive) {
        defaultActive =
            finalStreams.find(s => s.isFrench && !s.hasBadAudio && s.tierKey === '1080p') ||
            finalStreams.find(s => s.isFrench && !s.hasBadAudio) ||
            finalStreams.find(s => !s.hasBadAudio && s.tierKey === '1080p') ||
            finalStreams.find(s => !s.hasBadAudio) ||
            (hasTrueVf ? (finalStreams.find(s => s.isFrench && s.tierKey === '1080p') || finalStreams.find(s => s.isFrench)) : null) ||
            finalStreams.find(s => s.tierKey === '1080p') ||
            finalStreams[0];
    }

    if (defaultActive && defaultActive.isAvi && !defaultActive.url.startsWith('/api/video-stream')) {
        defaultActive = {
            ...defaultActive,
            url: `/api/video-stream?url=${encodeURIComponent(defaultActive.url)}`,
            originalUrl: defaultActive.url,
            isTranscoded: true
        };
    }

    return {
        streams: finalStreams,
        activeStream: defaultActive,
        hasTrueVf,
        anyCached,
        allDownloading
    };
}

/**
 * Résout l'identifiant IMDb d'un contenu TMDB (film ou série)
 */
export async function getImdbIdForContent({ id, type = 'movie' }) {
    if (!id) return null;

    try {
        const isTv = type === 'tv';
        const details = isTv ? await getSeriesDetails(id) : await getMovieDetails(id);
        const imdbId = details?.external_ids?.imdb_id || details?.imdb_id;
        return imdbId || null;
    } catch {
        return null;
    }
}

/**
 * Résout les flux de streaming direct pour un film ou un épisode de série
 */
export async function resolvePlaybackStreams({
    id,
    imdbId: initialImdbId,
    type = 'movie',
    season = 1,
    episode = 1,
    title = '',
    signal: callerSignal = null
}) {
    const config = getGatewayConfig();
    const isTv = type === 'tv';

    // Résolution de l'identifiant IMDb si manquant
    let imdbId = initialImdbId;
    if (!imdbId && id) {
        imdbId = await getImdbIdForContent({ id, type });
    }
    if (callerSignal?.aborted) {
        return { success: false, aborted: true, streams: [] };
    }

    if (!imdbId) {
        return {
            success: false,
            reason: 'MISSING_IMDB_ID',
            message: 'Identifiant international non trouvé pour ce titre.',
            streams: []
        };
    }

    // 1. PRIORITÉ ABSOLUE : Résolution via le backend sécurisé (Zero exposition de clé)
    let backendError = null;
    try {
        const queryParams = new URLSearchParams({
            id: String(id || ''),
            imdbId: String(imdbId),
            type: isTv ? 'tv' : 'movie',
            season: String(season || 1),
            episode: String(episode || 1),
            clientAc3: checkBrowserAc3Support() ? '1' : '0'
        });
        if (title) {
            queryParams.set('title', String(title));
        }

        const headers = { 'Accept': 'application/json' };
        if (config.hasCustomToken) {
            headers['x-debrid-token'] = config.token;
            headers['x-debrid-provider'] = config.provider;
        }
        if (config.frenchioUrl) {
            headers['x-frenchio-url'] = config.frenchioUrl;
        }

        const reqSig = createTimeoutSignal(10000, callerSignal);
        console.log(`[Altyflix Stream Resolver] Résolution sécurisée via backend pour ${type} ${imdbId}...`);
        let serverRes;
        try {
            serverRes = await fetch(`/api/stream-resolve?${queryParams.toString()}`, {
                headers,
                cache: 'no-store',
                signal: reqSig.signal
            });
        } finally {
            reqSig.cleanup();
        }

        if (serverRes.ok) {
            const serverData = await serverRes.json();
            if (serverData.success && Array.isArray(serverData.streams) && serverData.streams.length > 0) {
                console.log(`[Altyflix Stream Resolver] Résolution backend réussie : statut=${serverData.status}, ${serverData.streams.length} flux.`);
                return {
                    success: true,
                    status: serverData.status || 'ready',
                    imdbId: serverData.imdbId || imdbId,
                    streams: serverData.streams,
                    activeStream: serverData.activeStream,
                    hasTrueVf: Boolean(serverData.hasTrueVf)
                };
            }
            if (!serverData.success && (serverData.reason || serverData.message)) {
                backendError = {
                    success: false,
                    reason: serverData.reason || 'NO_STREAMS_FOUND',
                    message: serverData.message || serverData.error || 'Aucun flux direct disponible pour ce titre actuellement.',
                    imdbId: serverData.imdbId || imdbId,
                    streams: []
                };
            }
        }
    } catch (backendErr) {
        if (callerSignal?.aborted) return { success: false, aborted: true, streams: [] };
        console.warn('[Altyflix Stream Resolver] Backend non disponible, tentative directe...', backendErr.message);
    }

    // 2. FALLBACK DIRECT CLIENT : Utilisé si le backend est momentanément inaccessible
    const streamKey = isTv ? `${imdbId}:${season}:${episode}` : `${imdbId}`;
    const activeProvider = config.provider || PLATFORM_DEFAULT_PROVIDER;
    const activeToken = config.token || '';

    if (!activeToken) {
        if (backendError) return backendError;
        return {
            success: false,
            reason: 'NO_STREAMS_AVAILABLE',
            message: 'Connexion au serveur de streaming en cours... Réessayez dans un instant.',
            imdbId,
            streams: []
        };
    }

    try {
        const ALL_PROVIDERS = 'yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex,torrent9,rutracker,rutor,cinemaz';
        const options = `providers=${ALL_PROVIDERS}|sort=qualitysize|language=french|${activeProvider}=${encodeURIComponent(activeToken)}`;
        const endpoint = `https://torrentio.strem.fun/${options}/stream/${isTv ? 'series' : 'movie'}/${streamKey}.json`;

        const s1 = createTimeoutSignal(8000, callerSignal);
        let res;
        try {
            res = await fetch(endpoint, {
                headers: { 'Accept': 'application/json' },
                cache: 'no-store',
                signal: s1.signal
            });
        } finally {
            s1.cleanup();
        }

        let rawStreams = [];
        if (res.ok) {
            const data = await res.json();
            rawStreams = Array.isArray(data?.streams) ? data.streams : [];
        }

        // Si aucun flux en VF, élargir au catalogue mondial
        if (!rawStreams || rawStreams.length === 0 || rawStreams.every(isTorrentioErrorStream)) {
            const optionsGlobal = `providers=${ALL_PROVIDERS}|sort=qualitysize|${activeProvider}=${encodeURIComponent(activeToken)}`;
            const endpointGlobal = `https://torrentio.strem.fun/${optionsGlobal}/stream/${isTv ? 'series' : 'movie'}/${streamKey}.json`;

            const s2 = createTimeoutSignal(8000, callerSignal);
            let resGlobal;
            try {
                resGlobal = await fetch(endpointGlobal, {
                    headers: { 'Accept': 'application/json' },
                    cache: 'no-store',
                    signal: s2.signal
                });
            } finally {
                s2.cleanup();
            }

            if (resGlobal.ok) {
                const dataGlobal = await resGlobal.json();
                rawStreams = Array.isArray(dataGlobal?.streams) ? dataGlobal.streams : [];
            }
        }

        // Détection explicite des erreurs d'authentification ou de clé retournées par Torrentio
        const errorStream = rawStreams.find(isTorrentioErrorStream);
        if (errorStream && rawStreams.length === 1) {
            const errTitle = errorStream.title || 'Clé de débridage non reconnue';
            return {
                success: false,
                reason: 'INVALID_DEBRID_TOKEN',
                message: `${errTitle}. Rendez-vous sur https://torbox.app/settings pour copier votre clé API TorBox.`,
                imdbId,
                streams: []
            };
        }

        const curated = curateStreams(rawStreams, config.provider, { contentType: type });

        if (!curated.streams || curated.streams.length === 0) {
            return {
                success: false,
                reason: 'NO_STREAMS_FOUND',
                message: errorStream
                    ? `Erreur de clé TorBox : ${errorStream.title || 'Clé non valide'}`
                    : 'Aucun flux direct disponible pour ce titre actuellement.',
                imdbId,
                streams: []
            };
        }

        const initialStatus = (curated.activeStream?.isDownloading) ? 'downloading' : 'ready';

        return {
            success: true,
            status: initialStatus,
            imdbId,
            streams: curated.streams,
            activeStream: curated.activeStream,
            hasTrueVf: curated.hasTrueVf
        };
    } catch (err) {
        if (callerSignal?.aborted) return { success: false, aborted: true, streams: [] };
        return {
            success: false,
            reason: 'NETWORK_ERROR',
            message: 'Erreur réseau lors de la recherche des flux : ' + err.message,
            imdbId,
            streams: []
        };
    }
}

/**
 * Surveille en continu l'état d'un flux en cours de débridage (Polling intelligent avec backoff et timeout)
 */
export async function pollStreamStatus({
    streamUrl,
    signal,
    maxAttempts = 40,
    intervalMs = 2500,
    onProgress = () => {}
}) {
    if (!streamUrl) throw new Error('URL de flux manquante pour le polling.');

    console.log(`[Altyflix Stream Poll] Démarrage de la surveillance du débridage...`);
    let attempts = 0;
    let consecutiveErrors = 0;
    const startTime = Date.now();

    while (attempts < maxAttempts) {
        if (signal?.aborted) {
            console.log(`[Altyflix Stream Poll] Surveillance interrompue par l'utilisateur.`);
            return { ready: false, aborted: true };
        }

        attempts++;
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        onProgress({ attempt: attempts, maxAttempts, elapsedSec });

        try {
            const pollSig = createTimeoutSignal(10000, signal);
            let res;
            try {
                res = await fetch(`/api/stream-poll?url=${encodeURIComponent(streamUrl)}`, {
                    signal: pollSig.signal,
                    cache: 'no-store'
                });
            } finally {
                pollSig.cleanup();
            }

            let data = null;
            try { data = await res.json(); } catch { /* ignore */ }

            if (res.ok && data) {
                consecutiveErrors = 0;
                if (data.ready && data.playbackUrl) {
                    console.log(`[Altyflix Stream Poll] ✅ Flux PRÊT après ${elapsedSec}s (${attempts} vérifications) !`);
                    return {
                        ready: true,
                        playbackUrl: data.playbackUrl,
                        directUrl: data.directUrl || '',
                        isAvi: Boolean(data.isAvi),
                        isTranscoded: Boolean(data.isTranscoded),
                        elapsedSec
                    };
                }

                if (data.status === 'downloading') {
                    console.log(`[Altyflix Stream Poll] ⏳ En cours de téléchargement vers le debrid (${elapsedSec}s)...`);
                } else if (data.status === 'error' && data.success === false) {
                    return { ready: false, error: data.error || 'Source indisponible.' };
                }
            } else if (res.status === 400 || res.status === 403 || (data?.status === 'error' && data?.success === false)) {
                return { ready: false, error: data?.error || 'Source indisponible.' };
            } else {
                consecutiveErrors++;
                if (consecutiveErrors >= 3) {
                    return { ready: false, error: 'Impossible de vérifier la source pour le moment.' };
                }
            }
        } catch (err) {
            if (signal?.aborted) return { ready: false, aborted: true };
            consecutiveErrors++;
            console.warn(`[Altyflix Stream Poll] Échec de la vérification #${attempts} :`, err.message);
            if (consecutiveErrors >= 3) {
                return { ready: false, error: 'Erreur réseau lors de la vérification du flux.' };
            }
        }

        // Pause annulable immédiatement sur abort
        const waitTime = Math.min(intervalMs + (attempts * 100), 4000);
        await new Promise((resolve) => {
            if (signal?.aborted) return resolve();
            const onAbort = () => { clearTimeout(timer); resolve(); };
            const timer = setTimeout(() => {
                signal?.removeEventListener?.('abort', onAbort);
                resolve();
            }, waitTime);
            signal?.addEventListener?.('abort', onAbort, { once: true });
        });
    }

    console.warn(`[Altyflix Stream Poll] Timeout dépassé après ${maxAttempts} vérifications.`);
    return {
        ready: false,
        timeout: true,
        message: 'Le téléchargement sur le service de débridage prend trop de temps.'
    };
}

/**
 * Teste la validité d'une clé de débridage (test direct API du fournisseur en priorité)
 */
export async function testGatewayToken({ provider, token }) {
    const cleanToken = (token || '').trim();
    if (!cleanToken || cleanToken.length < 4) {
        return { valid: false, message: 'La clé saisie est trop courte.' };
    }

    // 1. Validation directe auprès de l'API TorBox
    if (provider === 'torbox') {
        const s = createTimeoutSignal(6000);
        try {
            const tbRes = await fetch('https://api.torbox.app/v1/api/user/me', {
                headers: {
                    'Authorization': `Bearer ${cleanToken}`,
                    'Accept': 'application/json'
                },
                signal: s.signal
            });

            if (tbRes.status === 200) {
                const tbData = await tbRes.json();
                const planName = tbData?.data?.plan === 2 ? 'Pro' : (tbData?.data?.plan === 1 ? 'Essential' : 'Actif');
                return {
                    valid: true,
                    message: `Connexion réussie à TorBox ! Compte ${planName} vérifié.`
                };
            } else if (tbRes.status === 401) {
                return {
                    valid: false,
                    message: 'Clé TorBox invalide. Copiez bien votre API Token depuis https://torbox.app/settings.'
                };
            }
        } catch {
            // En cas d'erreur réseau directe, continue vers Torrentio
        } finally {
            s.cleanup();
        }
    }

    // 2. Validation directe auprès de l'API Real-Debrid
    if (provider === 'realdebrid') {
        const s = createTimeoutSignal(6000);
        try {
            const rdRes = await fetch('https://api.real-debrid.com/rest/1.0/user', {
                headers: {
                    'Authorization': `Bearer ${cleanToken}`,
                    'Accept': 'application/json'
                },
                signal: s.signal
            });

            if (rdRes.status === 200) {
                const rdData = await rdRes.json();
                return {
                    valid: true,
                    message: `Connexion réussie à Real-Debrid ! (${rdData.username || 'Compte actif'})`
                };
            } else if (rdRes.status === 401) {
                return {
                    valid: false,
                    message: 'Clé Real-Debrid invalide. Vérifiez votre jeton sur real-debrid.com/apitoken.'
                };
            }
        } catch {
            // Continue vers Torrentio
        } finally {
            s.cleanup();
        }
    }

    // 3. Fallback Torrentio
    const s3 = createTimeoutSignal(8000);
    try {
        const options = `providers=yts|${provider}=${encodeURIComponent(cleanToken)}`;
        const endpoint = `https://torrentio.strem.fun/${options}/stream/movie/tt0137523.json`;

        const res = await fetch(endpoint, {
            headers: { 'Accept': 'application/json' },
            signal: s3.signal
        });

        if (!res.ok) {
            return { valid: false, message: `Réponse serveur invalide (${res.status}).` };
        }

        const data = await res.json();
        const streams = Array.isArray(data?.streams) ? data.streams : [];
        const hasValidDirectUrl = streams.some(s =>
            typeof s.url === 'string' && s.url.startsWith('http') && !isTorrentioErrorStream(s)
        );

        if (hasValidDirectUrl) {
            return { valid: true, message: 'Clé vérifiée avec succès ! Connexion active.' };
        }

        const errorStream = streams.find(isTorrentioErrorStream);
        if (errorStream) {
            return {
                valid: false,
                message: errorStream.title || 'Clé non reconnue par le fournisseur.'
            };
        }

        return {
            valid: false,
            message: 'La passerelle n\'a pu générer aucun lien de débridage. Vérifiez votre clé.'
        };
    } catch (err) {
        return { valid: false, message: 'Impossible de contacter la passerelle : ' + err.message };
    } finally {
        s3.cleanup();
    }
}

const OS_SPLIT_RE = /\b(?:cd|disc|disk|part)[\s._-]?[123]\b/i;
const OS_GENERIC_TOKENS = new Set(['french', 'truefrench', 'vff', 'vfq', 'vostfr', 'multi', '1080p', '720p', '2160p', '480p', 'x264', 'h264', 'x265', 'h265', 'hevc', 'xvid', 'divx', 'ac3', 'eac3', 'dts', 'aac', 'mp3', 'mkv', 'mp4', 'avi', 'srt', 'bluray', 'bdrip', 'brrip', 'dvdrip', 'webrip', 'webdl']);

function buildClientSubtitleHint(s) {
    const raw = `${s.SubFileName || ''} ${s.MovieReleaseName || ''}`.toLowerCase();
    const parts = [];
    if (/\bextended\b/.test(raw)) parts.push('Extended');
    else if (/\bunrated\b/.test(raw)) parts.push('Unrated');
    else if (/\bdirector/.test(raw)) parts.push('Director');
    if (/\b(?:blu-?ray|bdrip|brrip)\b/.test(raw)) parts.push('BluRay');
    else if (/\bweb-?(?:dl|rip)\b/.test(raw)) parts.push('WEB');
    else if (/\bdvd(?:rip)?\b/.test(raw)) parts.push('DVDRip');
    const fpsNum = parseFloat(s.MovieFPS);
    if (Number.isFinite(fpsNum) && fpsNum >= 23 && fpsNum <= 30) {
        parts.push(Math.abs(fpsNum - 25) < 0.2 ? '25fps' : (Math.abs(fpsNum - 23.976) < 0.2 ? '23.976' : `${fpsNum.toFixed(0)}fps`));
    }
    if (String(s.SubHearingImpaired) === '1') parts.push('SDH');
    return parts.slice(0, 2).join(' · ');
}

function rankOpenSubtitlesClient(osList, { filename = '', limit = 4 } = {}) {
    if (!Array.isArray(osList)) return [];
    const fnLower = String(filename || '').toLowerCase();
    const fnTokens = fnLower
        ? fnLower.replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length >= 4 && !OS_GENERIC_TOKENS.has(t))
        : [];
    const fnExtended = /\bextended\b/.test(fnLower);
    const fnUnrated = /\bunrated\b/.test(fnLower);
    const fnDirector = /\bdirector/.test(fnLower);
    const fnDoubleEp = /\bs\d+e\d+(?:and|[-._]?e)\d+\b/i.test(fnLower);
    const fnIsDvdPal = /\b(?:dvdrip|pal|dvd)\b/.test(fnLower) && !/\b(?:bluray|bdrip|brrip|web-?dl|ntsc)\b/.test(fnLower);
    const fnIsHd24 = /\b(?:bluray|bdrip|brrip|web-?dl|webrip|1080p|2160p|4k)\b/.test(fnLower) && !/\b(?:dvdrip|pal)\b/.test(fnLower);

    const candidates = osList.filter(s => {
        if (!s?.SubDownloadLink || !/^https:\/\/[a-z0-9.-]*opensubtitles\.org\//i.test(s.SubDownloadLink)) return false;
        const fmt = String(s.SubFormat || 'srt').toLowerCase();
        if (fmt && fmt !== 'srt' && fmt !== 'vtt') return false;
        const nameStr = `${s.SubFileName || ''} ${s.MovieReleaseName || ''}`;
        if (OS_SPLIT_RE.test(nameStr)) return false;
        return true;
    });

    const scored = candidates.map(s => {
        const raw = `${s.SubFileName || ''} ${s.MovieReleaseName || ''}`.toLowerCase();
        let score = 0;
        const downloads = Math.max(0, parseInt(s.SubDownloadsCnt || '0', 10) || 0);
        score += Math.min(1500, Math.log10(downloads + 1) * 400);
        score += (parseFloat(s.SubRating) || 0) * 40;
        if (String(s.SubHearingImpaired) === '1') score -= 450;
        if (String(s.SubBad) && Number(s.SubBad) > 0) score -= 2000;
        if (String(s.SubForeignPartsOnly) === '1') score -= 4000;

        const subExtended = /\bextended\b/.test(raw);
        const subUnrated = /\bunrated\b/.test(raw);
        const subDirector = /\bdirector/.test(raw);
        if (fnLower) {
            if (fnExtended && subExtended) score += 8000;
            else if (fnExtended !== subExtended) score -= 5000;
            if (fnUnrated && subUnrated) score += 6000;
            else if (fnUnrated !== subUnrated) score -= 3500;
            if (fnDirector && subDirector) score += 6000;
            else if (fnDirector !== subDirector) score -= 3500;
        } else if (subExtended || subUnrated || subDirector) {
            score -= 600;
        }

        const subDoubleEp = /\b(?:s\d+e\d+(?:and|[-._]?e)\d+|e01[-._&+]?02|part\s*1\s*(?:&|and)\s*2)\b/i.test(raw);
        if (fnDoubleEp && subDoubleEp) score += 5000;
        else if (fnDoubleEp !== subDoubleEp) score -= 1200;

        if (fnLower) {
            const subIsBluray = /\b(?:blu-?ray|bdrip|brrip)\b/.test(raw);
            const subIsWeb = /\bweb-?(?:dl|rip)\b/.test(raw);
            const subIsDvd = /\bdvd(?:rip)?\b/.test(raw);
            if (/\b(?:blu-?ray|bdrip|brrip)\b/.test(fnLower) && subIsBluray) score += 3500;
            if (/\bweb-?(?:dl|rip)\b/.test(fnLower) && subIsWeb) score += 3500;
            if (/\bdvd(?:rip)?\b/.test(fnLower) && subIsDvd) score += 3500;
            if (/\b(?:blu-?ray|bdrip|brrip|web-?(?:dl|rip))\b/.test(fnLower) && subIsDvd && !subIsBluray && !subIsWeb) score -= 1800;

            const fps = parseFloat(s.MovieFPS);
            if (Number.isFinite(fps) && fps >= 23 && fps <= 30) {
                if (fnIsDvdPal) score += Math.abs(fps - 25) < 0.2 ? 3200 : -1500;
                else if (fnIsHd24) score += Math.abs(fps - 23.976) < 0.25 ? 2400 : (Math.abs(fps - 25) < 0.2 ? -2200 : 0);
            }

            let tokenMatches = 0;
            for (const tok of fnTokens) {
                if (raw.includes(tok)) tokenMatches++;
            }
            score += Math.min(6000, tokenMatches * 1400);
        }

        return { item: s, score, hint: buildClientSubtitleHint(s) };
    });

    scored.sort((a, b) => b.score - a.score);
    const seen = new Set();
    const out = [];
    for (const entry of scored) {
        const key = `${entry.item.IDSubtitleFile || ''}|${entry.item.SubDownloadLink}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(entry);
        if (out.length >= limit) break;
    }
    return out;
}

/**
 * Recherche les sous-titres disponibles pour un film ou un épisode (OpenSubtitles direct en priorité absolue)
 */
export async function fetchSubtitlesForContent({ id, imdbId: initialImdbId, type = 'movie', season = 1, episode = 1, filename = '', streamUrl = '' }) {
    let imdbId = initialImdbId;

    // Si l'identifiant IMDb est absent ou mal formaté, le résoudre automatiquement depuis TMDB
    if ((!imdbId || !/^tt\d+$/i.test(String(imdbId))) && id) {
        try {
            imdbId = await getImdbIdForContent({ id, type });
        } catch {
            imdbId = null;
        }
    }

    const cleanImdbId = (imdbId && /^tt\d+$/i.test(String(imdbId))) ? String(imdbId).toLowerCase() : '';
    const numericImdb = cleanImdbId ? cleanImdbId.replace(/^tt/, '') : '';
    const isTv = type === 'tv';
    const stremKey = cleanImdbId ? (isTv ? `${cleanImdbId}:${season}:${episode}` : `${cleanImdbId}`) : '';

    // 0. Source PREMIUM (synchro frame-accurate) : sous-titres texte intégrés dans le fichier MKV/MP4 (si backend FFmpeg dispo)
    const embeddedPromise = (async () => {
        if (!streamUrl || !/^https?:\/\//i.test(streamUrl)) return [];
        const s = createTimeoutSignal(3500);
        try {
            const res = await fetch(`/api/embedded-subtitles?url=${encodeURIComponent(streamUrl)}`, { signal: s.signal });
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data?.subtitles) ? data.subtitles : [];
        } catch {
            return [];
        } finally {
            s.cleanup();
        }
    })();

    // 1. Source PRINCIPALE : OpenSubtitles REST directement depuis le navigateur (CORS natif, contourne les blocages IP AWS/Netlify)
    const fetchDirectOpenSubtitles = async (osLang, timeoutMs) => {
        if (!numericImdb) return [];
        const s = createTimeoutSignal(timeoutMs);
        try {
            const osUrl = isTv
                ? `https://rest.opensubtitles.org/search/sublanguageid-${osLang}/imdbid-${numericImdb}/season-${season || 1}/episode-${episode || 1}`
                : `https://rest.opensubtitles.org/search/sublanguageid-${osLang}/imdbid-${numericImdb}`;
            const res = await fetch(osUrl, {
                headers: { 'X-User-Agent': 'TemporaryUserAgent' },
                signal: s.signal
            });
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        } finally {
            s.cleanup();
        }
    };

    const directOsPromise = Promise.all([
        fetchDirectOpenSubtitles('fre', 5500),
        fetchDirectOpenSubtitles('eng', 4500)
    ]);

    // 2. Source de secours : Backend /api/subtitles (OpenSubtitles côté serveur si le navigateur est bloqué)
    const backendSubsPromise = (async () => {
        if (!id && !cleanImdbId) return [];
        const s = createTimeoutSignal(5500);
        try {
            const q = new URLSearchParams({
                type: isTv ? 'tv' : 'movie',
                season: String(season || 1),
                episode: String(episode || 1)
            });
            if (id) q.set('id', String(id));
            if (cleanImdbId) q.set('imdbId', cleanImdbId);
            if (filename) q.set('filename', String(filename).slice(0, 260));
            const res = await fetch(`/api/subtitles?${q.toString()}`, {
                signal: s.signal
            });
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data?.subtitles) ? data.subtitles : [];
        } catch {
            return [];
        } finally {
            s.cleanup();
        }
    })();

    try {
        const [embeddedSubs, [directFrRaw, directEnRaw], backendSubs] = await Promise.all([
            embeddedPromise,
            directOsPromise,
            backendSubsPromise
        ]);

        const normalized = [];
        const seenUrls = new Set();
        const canonicalSubUrl = (raw) => {
            const s = String(raw || '').trim();
            if (!s) return '';
            try {
                const u = new URL(s, typeof window !== 'undefined' ? window.location.origin : 'https://altyflix.local');
                if (u.pathname === '/api/subtitles-vtt' && u.searchParams.get('url')) {
                    return u.searchParams.get('url').trim();
                }
            } catch { /* ignore */ }
            return s;
        };
        let frCount = 0;
        let enCount = 0;
        let externalFrCount = 0;
        let externalEnCount = 0;

        // 0. Sous-titres texte intégrés MKV en tête (synchro parfaite avec la vidéo)
        for (const sub of embeddedSubs) {
            const canon = canonicalSubUrl(sub?.url);
            if (!canon || seenUrls.has(canon)) continue;
            seenUrls.add(canon);
            if (sub.lang === 'fr') {
                if (!sub.forced) frCount++;
                normalized.push({
                    id: sub.id || `mkv-fr-${normalized.length}`,
                    lang: 'fr',
                    label: sub.label || (sub.forced ? 'Français (forcés)' : 'Français'),
                    hint: sub.hint || (sub.forced ? 'Forcés · MKV' : 'Synchro MKV'),
                    forced: Boolean(sub.forced),
                    embedded: true,
                    url: sub.url,
                    encoding: 'utf-8'
                });
            } else if (sub.lang === 'en') {
                if (!sub.forced) enCount++;
                normalized.push({
                    id: sub.id || `mkv-en-${normalized.length}`,
                    lang: 'en',
                    label: sub.label || (sub.forced ? 'Anglais (forcés)' : 'Anglais'),
                    hint: sub.hint || (sub.forced ? 'Forcés · MKV' : 'Synchro MKV'),
                    forced: Boolean(sub.forced),
                    embedded: true,
                    url: sub.url,
                    encoding: 'utf-8'
                });
            }
        }

        // A. OpenSubtitles direct (fonctionne sur Netlify ET en local avec classement par release/FPS)
        for (const { item: s, hint } of rankOpenSubtitlesClient(directFrRaw, { filename, limit: 4 })) {
            const canon = canonicalSubUrl(s.SubDownloadLink);
            if (externalFrCount >= 4 || !canon || seenUrls.has(canon)) continue;
            frCount++;
            externalFrCount++;
            seenUrls.add(canon);
            normalized.push({
                id: `os-fr-${externalFrCount}`,
                lang: 'fr',
                label: frCount === 1 ? 'Français' : `Français (Option ${frCount})`,
                hint,
                fps: parseFloat(s.MovieFPS) || null,
                url: s.SubDownloadLink,
                fallbackUrl: `/api/subtitles-vtt?url=${encodeURIComponent(s.SubDownloadLink)}`,
                encoding: s.SubEncoding || 'utf-8'
            });
        }
        for (const { item: s, hint } of rankOpenSubtitlesClient(directEnRaw, { filename, limit: 3 })) {
            const canon = canonicalSubUrl(s.SubDownloadLink);
            if (externalEnCount >= 3 || !canon || seenUrls.has(canon)) continue;
            enCount++;
            externalEnCount++;
            seenUrls.add(canon);
            normalized.push({
                id: `os-en-${externalEnCount}`,
                lang: 'en',
                label: enCount === 1 ? 'Anglais' : `Anglais (Option ${enCount})`,
                hint,
                fps: parseFloat(s.MovieFPS) || null,
                url: s.SubDownloadLink,
                fallbackUrl: `/api/subtitles-vtt?url=${encodeURIComponent(s.SubDownloadLink)}`,
                encoding: s.SubEncoding || 'utf-8'
            });
        }

        // B. Fallback backend /api/subtitles si OpenSubtitles direct n'a rien renvoyé pour une langue
        const needBackendFr = externalFrCount === 0;
        const needBackendEn = externalEnCount === 0;
        for (const sub of backendSubs) {
            const canon = canonicalSubUrl(sub?.url);
            if (!canon || seenUrls.has(canon)) continue;
            const rawLang = String(sub.lang || '').toLowerCase();
            if ((rawLang === 'fr' || rawLang === 'fre' || rawLang === 'fra') && needBackendFr && externalFrCount < 4) {
                frCount++;
                externalFrCount++;
                seenUrls.add(canon);
                normalized.push({
                    id: sub.id || `api-fr-${externalFrCount}`,
                    lang: 'fr',
                    label: frCount === 1 ? 'Français' : `Français (Option ${frCount})`,
                    hint: sub.hint || '',
                    fps: sub.fps || null,
                    url: sub.url,
                    encoding: 'utf-8'
                });
            } else if ((rawLang === 'en' || rawLang === 'eng') && needBackendEn && externalEnCount < 3) {
                enCount++;
                externalEnCount++;
                seenUrls.add(canon);
                normalized.push({
                    id: sub.id || `api-en-${externalEnCount}`,
                    lang: 'en',
                    label: enCount === 1 ? 'Anglais' : `Anglais (Option ${enCount})`,
                    hint: sub.hint || '',
                    fps: sub.fps || null,
                    url: sub.url,
                    encoding: 'utf-8'
                });
            }
        }

        // C. Dernier recours Stremio OpenSubtitles v3 uniquement si FR ou EN externes manquent encore (filtré strictement FR/EN)
        if ((externalFrCount === 0 || externalEnCount === 0) && stremKey) {
            const st = createTimeoutSignal(4500);
            try {
                const endpoint = `https://opensubtitles-v3.strem.io/subtitles/${isTv ? 'series' : 'movie'}/${stremKey}.json`;
                const res = await fetch(endpoint, { headers: { Accept: 'application/json' }, signal: st.signal });
                if (res.ok) {
                    const data = await res.json();
                    const stremSubs = Array.isArray(data?.subtitles) ? data.subtitles : [];
                    const needStremFr = externalFrCount === 0;
                    const needStremEn = externalEnCount === 0;
                    for (const sub of stremSubs) {
                        const rawLang = String(sub.lang || '').toLowerCase();
                        const canon = canonicalSubUrl(sub?.url);
                        if (!canon || seenUrls.has(canon)) continue;
                        if ((rawLang === 'fre' || rawLang === 'fra' || rawLang === 'fr') && needStremFr && externalFrCount < 3) {
                            frCount++;
                            externalFrCount++;
                            seenUrls.add(canon);
                            normalized.push({
                                id: sub.id || `strem-fr-${externalFrCount}`,
                                lang: 'fr',
                                label: frCount === 1 ? 'Français' : `Français (Option ${frCount})`,
                                hint: '',
                                url: sub.url,
                                encoding: sub.SubEncoding || 'utf-8'
                            });
                        } else if ((rawLang === 'eng' || rawLang === 'en') && needStremEn && externalEnCount < 2) {
                            enCount++;
                            externalEnCount++;
                            seenUrls.add(canon);
                            normalized.push({
                                id: sub.id || `strem-en-${externalEnCount}`,
                                lang: 'en',
                                label: enCount === 1 ? 'Anglais' : `Anglais (Option ${enCount})`,
                                hint: '',
                                url: sub.url,
                                encoding: sub.SubEncoding || 'utf-8'
                            });
                        }
                    }
                }
            } catch { /* ignore */ } finally {
                st.cleanup();
            }
        }

        // Tri : Français d'abord, puis Anglais
        normalized.sort((a, b) => {
            const order = { fr: 1, en: 2 };
            return (order[a.lang] || 99) - (order[b.lang] || 99);
        });

        return normalized;
    } catch {
        return [];
    }
}

/**
 * Parse le texte brut SRT ou WebVTT en un tableau de repères temporels structurés
 */
const CUE_TIME_RE = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?\s*-->\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/;

function cueTimeToSec(h, min, s, ms) {
    const frac = ms ? parseInt(ms.padEnd(3, '0'), 10) / 1000 : 0;
    return (h ? parseInt(h, 10) * 3600 : 0) + parseInt(min, 10) * 60 + parseInt(s, 10) + frac;
}

/**
 * Lecture ligne par ligne : gère les lignes vides, les identifiants de cue WebVTT/SRT
 * sans effacer les dialogues numériques ("1999", "42"), les entités HTML et les blocs NOTE/STYLE.
 */
const CUE_AD_SPAM_RE = /(?:opensubtitles|osdb\.link|subtitles\.org|tryray\.app|appuyez sur lecture|une seule app|plus de 200 langues|watch online movies|devenez membre vip|become vip|advertise your product|support us and|sous-titres\.eu|addic7ed|subscene|yifysubtitles|podnapisi|best watched using|sync(?:ed)?\s*(?:&|and)\s*correct|resync(?:ed)?\s*by)/i;

export function parseVttCues(rawText) {
    if (!rawText) return [];
    const lines = String(rawText).replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n').split('\n');
    const cues = [];
    let current = null;

    const flush = (stripTrailingIndex = false) => {
        if (!current) return;
        if (stripTrailingIndex && current.text.length > 1 && /^\s*\d+\s*$/.test(current.text[current.text.length - 1])) {
            current.text.pop();
        }
        const text = current.text.join('\n')
            .replace(/<[^>]+>/g, '')
            .replace(/\{[^}]+\}/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&quot;/g, '"')
            .replace(/&#39;|&apos;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\n\s*\n+/g, '\n')
            .trim();
        if (text && current.end > current.start && !CUE_AD_SPAM_RE.test(text)) {
            cues.push({ start: current.start, end: current.end, text });
        }
        current = null;
    };

    for (const line of lines) {
        const trimmed = line.trim();
        const m = line.match(CUE_TIME_RE);
        if (m) {
            flush(true);
            current = {
                start: cueTimeToSec(m[1], m[2], m[3], m[4]),
                end: cueTimeToSec(m[5], m[6], m[7], m[8]),
                text: []
            };
            continue;
        }
        if (!trimmed) {
            flush(false);
            continue;
        }
        if (!current) {
            // Ignorer les en-têtes WebVTT / NOTE / STYLE / REGION et les identifiants de repère
            continue;
        }
        current.text.push(line);
    }
    flush(false);

    cues.sort((a, b) => a.start - b.start);
    return cues;
}

/**
 * Récupère et parse directement les sous-titres en mémoire (détection gzip par magic bytes + encodages Windows-1252 / UTF-8)
 */
export async function fetchSubtitleCues(subUrl, subEncoding = null, fallbackUrl = null, { onPartialCues = null, signal = null } = {}) {
    if (!subUrl) return [];

    const loadFromUrl = async (targetUrl) => {
        const isProgressiveMkv = targetUrl.includes('/api/embedded-subtitles-vtt');
        if (isProgressiveMkv && typeof onPartialCues === 'function') {
            const firstByteSig = createTimeoutSignal(12000, signal);
            let res;
            try {
                res = await fetch(targetUrl, { signal: firstByteSig.signal });
            } finally {
                firstByteSig.cleanup();
            }
            if (!res.ok) return null;
            if (!res.body || typeof res.body.getReader !== 'function') {
                return parseVttCues(await res.text());
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let acc = '';
            let lastEmit = 0;
            try {
                for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
                    if (signal?.aborted) {
                        try { await reader.cancel(); } catch { /* ignore */ }
                        return [];
                    }
                    acc += decoder.decode(chunk.value, { stream: true });
                    const now = Date.now();
                    if (now - lastEmit > 350) {
                        lastEmit = now;
                        const partial = parseVttCues(acc);
                        if (partial.length > 0) onPartialCues(partial);
                    }
                }
                acc += decoder.decode();
                return parseVttCues(acc);
            } catch {
                try { await reader.cancel(); } catch { /* ignore */ }
                if (signal?.aborted) return [];
                return parseVttCues(acc);
            }
        }

        const st = createTimeoutSignal(8000, signal);
        let buf;
        try {
            const res = await fetch(targetUrl, { signal: st.signal });
            if (!res.ok) return null;
            buf = await res.arrayBuffer();
        } finally {
            st.cleanup();
        }

        const bytes = new Uint8Array(buf);
        const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
        if (isGzip) {
            if (typeof DecompressionStream === 'undefined') return null;
            const ds = new DecompressionStream('gzip');
            const decompressedStream = new Blob([bytes]).stream().pipeThrough(ds);
            buf = await new Response(decompressedStream).arrayBuffer();
        }

        const decodedBytes = new Uint8Array(buf);
        let rawText;
        if (decodedBytes.length >= 2 && decodedBytes[0] === 0xff && decodedBytes[1] === 0xfe) {
            rawText = new TextDecoder('utf-16le').decode(buf);
        } else if (decodedBytes.length >= 2 && decodedBytes[0] === 0xfe && decodedBytes[1] === 0xff) {
            rawText = new TextDecoder('utf-16be').decode(buf);
        } else {
            try {
                rawText = new TextDecoder('utf-8', { fatal: true }).decode(buf);
            } catch {
                if (subEncoding && !/ascii|utf-?8/i.test(subEncoding)) {
                    try {
                        rawText = new TextDecoder(subEncoding).decode(buf);
                    } catch {
                        rawText = new TextDecoder('windows-1252').decode(buf);
                    }
                } else {
                    rawText = new TextDecoder('windows-1252').decode(buf);
                }
            }
        }

        return parseVttCues(rawText);
    };

    try {
        const primary = await loadFromUrl(subUrl);
        if (primary && primary.length > 0) return primary;
        if (fallbackUrl && fallbackUrl !== subUrl && !signal?.aborted) {
            const fallback = await loadFromUrl(fallbackUrl);
            if (fallback && fallback.length > 0) return fallback;
        }
        return [];
    } catch (err) {
        if (signal?.aborted) return [];
        if (fallbackUrl && fallbackUrl !== subUrl) {
            try {
                const fallback = await loadFromUrl(fallbackUrl);
                if (fallback && fallback.length > 0) return fallback;
            } catch { /* ignore */ }
        }
        console.warn('[Altyflix Subtitles] Erreur chargement/décodage :', err);
        return [];
    }
}

/**
 * Télécharge un fichier de sous-titres SRT et le convertit en WebVTT Blob URL
 */
export async function loadSubtitleAsVttUrl(subUrl) {
    if (!subUrl) return null;
    try {
        const st = createTimeoutSignal(8000);
        let res;
        try {
            res = await fetch(subUrl, { signal: st.signal });
        } finally {
            st.cleanup();
        }
        if (!res.ok) return null;
        const text = await res.text();

        // Conversion standard SRT vers WebVTT (gère BOM, MM:SS,mmm et millisecondes 1-3 chiffres)
        const clean = text.replace(/^\uFEFF/, '').replace(/^WEBVTT\s*/i, '').trim();
        const vtt = 'WEBVTT\n\n' + clean
            .replace(/\r\n|\r/g, '\n')
            .replace(/((?:\d{1,2}:)?\d{1,2}:\d{2}),(\d{1,3})/g, '$1.$2');

        const blob = new Blob([vtt], { type: 'text/vtt' });
        return URL.createObjectURL(blob);
    } catch {
        return null;
    }
}

export default {
    DEBRID_PROVIDERS,
    DEFAULT_PROVIDER,
    DEFAULT_TOKEN,
    getGatewayConfig,
    saveGatewayConfig,
    resolvePlaybackStreams,
    pollStreamStatus,
    getImdbIdForContent,
    testGatewayToken,
    fetchSubtitlesForContent,
    loadSubtitleAsVttUrl,
    parseVttCues,
    fetchSubtitleCues
};
