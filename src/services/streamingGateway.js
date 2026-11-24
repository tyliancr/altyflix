/**
 * ALTYFLIX STREAMING GATEWAY (Client-Side Architecture)
 * Résolution directe de flux vidéo haute vitesse pour le lecteur natif Altyflix.
 * 
 * 100% Client-Side - 0 Serveur API requis - Déployable sur Netlify.
 * Compatible : Torbox (recommandé pour le multi-accès entre amis), Real-Debrid, AllDebrid, DebridLink, Premiumize.
 */

import { getMovieDetails, getSeriesDetails } from './tmdb.js';
import streamParser from '../../server/stream-parser.cjs';

const { isTorrentioErrorStream, parseStreamDetails } = streamParser;
export { isTorrentioErrorStream };

const API_BASE = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const apiUrl = (path) => (typeof path === 'string' && path.startsWith('/api/') && API_BASE ? `${API_BASE}${path}` : path);

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
    if (typeof document === 'undefined' || typeof navigator === 'undefined') return false;
    try {
        const ua = navigator.userAgent || '';
        // Safari (macOS / iOS), Edge sous Windows (avec codecs Media Foundation intégrés) et Smart TVs décodent l'AC3/E-AC3.
        const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
        const isEdgeWindows = /Edg\//i.test(ua) && /Windows/i.test(ua);
        const isSmartTv = /SmartTV|Web0S|Tizen|Android TV|GoogleTV|AppleTV|BRAVIA/i.test(ua);

        if (!isSafari && !isEdgeWindows && !isSmartTv) {
            return false;
        }

        const v = document.createElement('video');
        const canAc3 = v.canPlayType('audio/mp4; codecs="ac-3"');
        const canEc3 = v.canPlayType('audio/mp4; codecs="ec-3"');
        return canAc3 === 'probably' || canEc3 === 'probably' || (isEdgeWindows && canAc3 === 'maybe') || (isSmartTv && canAc3 !== '');
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

// isTorrentioErrorStream, parseBytes et parseStreamDetails sont partagés depuis server/stream-parser.cjs

/**
 * Sélectionne et dédouble intelligemment les flux pour offrir une interface épurée style Netflix :
 * - 3 à 4 qualités maximum (4K, 1080p, 720p, 480p) sans duplication
 * - Priorise le son 100% compatible navigateur (AAC/MP3)
 * - Distingue honnêtement vraie VF et VOSTFR (pas de fausse VF !)
 * - Évite les fichiers géants de 80 GB qui font ramer la 4K
 * - 1080p Full HD sélectionné par défaut pour un démarrage instantané sans freeze
 */
function curateStreams(rawStreams, provider, { contentType = 'movie', isFrenchOriginal = false } = {}) {
    const isMovie = String(contentType || 'movie').toLowerCase() !== 'tv';
    const validAll = rawStreams
        .filter(s => typeof s.url === 'string' && s.url.startsWith('http') && !isTorrentioErrorStream(s))
        .map((s, idx) => {
            const details = parseStreamDetails(s, { isFrenchOriginal });
            return {
                id: `stream-${idx}`,
                url: s.url,
                quality: details.resolution,
                tierKey: details.tierKey,
                isCached: details.isCached,
                isDownloading: details.isDownloading,
                isFrench: details.isFrench,
                isPureFrench: details.isPureFrench,
                isVffOrTrueFrench: details.isVffOrTrueFrench,
                isVostfr: details.isVostfr,
                isWebAudioSafe: details.isWebAudioSafe,
                hasBadAudio: details.hasBadAudio,
                hasUnsupportedAudio: details.hasBadAudio,
                isH264: details.isH264,
                isH265: details.isH265,
                isAv1: details.isAv1,
                isMp4: details.isMp4,
                isAvi: details.isAvi,
                isMkv: details.isMkv,
                isMkvHevcUnplayable: details.isMkvHevcUnplayable,
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
    const basePool = (isMovie && movieHdPool.length > 0) ? movieHdPool : validAll;

    // RÈGLE D'OR : Élimination des formats conteneurs incompatibles sans transcodage
    const isStreamPlayableInBrowser = (s) => {
        if (s.isAvi && !s.isTranscoded) return false;
        return true;
    };

    const valid = basePool.filter(isStreamPlayableInBrowser);

    if (valid.length === 0) return { streams: [], activeStream: null, hasTrueVf: false, allDownloading: false, anyCached: false };

    // Y a-t-il au moins un flux avec de la vraie VF ?
    const hasTrueVf = valid.some(s => s.isFrench);

    // Fonction de score : PRIORITÉ ABSOLUE AUX FLUX EN CACHE ET À LA VF AVEC AUDIO FONCTIONNEL
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

        // 2. Gestion audio intelligente :
        if (st.isFrench) {
            if (st.isWebAudioSafe) {
                score += 185000; // VF avec audio web (AAC/MP3/Opus) = priorité suprême
            } else if (!st.hasBadAudio) {
                score += 145000; // VF avec audio standard (AC3/DDP) = conservé avec fort bonus
            } else {
                score += 110000; // Autre VF
            }
        } else {
            if (st.isWebAudioSafe) {
                score += 55000;  // VO avec audio web
            }
        }

        if (st.hasBadAudio && /dts|truehd/i.test(`${st.rawTitle} ${st.filename}`)) {
            score -= 50000;
        }

        // 3. Codec vidéo : H.264 ultra compatible web (+12000) vs H.265/HEVC (-15000)
        if (st.isH264) score += 12000;
        if (st.isH265) score -= 15000;

        // 4. VOSTFR si pas VF (+20000)
        if (st.isVostfr && !st.isFrench) score += 20000;

        // 5. Source d'origine certifiée : BluRay / BDRip / WEB-DL garantissent une image propre
        if (st.isHighQualitySource) score += 18000;

        // 6. Doublage français de référence : VFF / TRUEFRENCH
        if (st.isPureFrench) score += 20000;
        if (st.isVffOrTrueFrench) score += 20000;
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

        // Si deux flux 1080p VF existent avec des codecs audio distincts (AAC vs Dolby), proposer les deux !
        const altVfAudio = best1080p.isFrench
            ? tiers['1080p'].find(s => s.isFrench && s.id !== best1080p.id && Boolean(s.isWebAudioSafe) !== Boolean(best1080p.isWebAudioSafe))
            : null;

        if (altVfAudio) {
            label1080 = `1080p FHD · VF (${best1080p.isWebAudioSafe ? 'Stéréo Web' : 'Dolby 5.1'})`;
        }

        curated.push({
            ...best1080p,
            qualityLabel: label1080
        });

        if (altVfAudio) {
            curated.push({
                ...altVfAudio,
                qualityLabel: `1080p FHD · VF (${altVfAudio.isWebAudioSafe ? 'Stéréo Web' : 'Dolby 5.1'})`
            });
        }

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
            // Si le premier n'était pas VF mais qu'une VF existe dans ce palier, on l'ajoute
            // Uniquement en tête si elle est déjà en cache (ou si les deux sont non-cachées)
            const altVf = tiers['1080p'].find(s => s.isFrench);
            if (altVf) {
                const vfItem = {
                    ...altVf,
                    qualityLabel: '1080p FHD · VF'
                };
                if (altVf.isCached || !best1080p.isCached) {
                    curated.unshift(vfItem);
                } else {
                    curated.push(vfItem);
                }
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
    
    // Sélection par défaut : flux en cache et non en téléchargement avec audio garanti en priorité absolue !
    let defaultActive = null;
    if (anyCached) {
        defaultActive =
            finalStreams.find(s => s.isCached && !s.isDownloading && s.isFrench && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
            finalStreams.find(s => s.isCached && !s.isDownloading && s.isFrench && s.isWebAudioSafe && !s.hasUnsupportedAudio) ||
            finalStreams.find(s => s.isCached && !s.isDownloading && s.isFrench && s.tierKey === '1080p') ||
            finalStreams.find(s => s.isCached && !s.isDownloading && s.isFrench) ||
            finalStreams.find(s => s.isCached && !s.isDownloading && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
            finalStreams.find(s => s.isCached && !s.isDownloading && s.isWebAudioSafe && !s.hasUnsupportedAudio) ||
            finalStreams.find(s => s.isCached && !s.isDownloading && s.tierKey === '1080p') ||
            finalStreams.find(s => s.isCached && !s.isDownloading);
    }
    if (!defaultActive) {
        defaultActive =
            finalStreams.find(s => s.isFrench && s.isWebAudioSafe && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
            finalStreams.find(s => s.isFrench && s.isWebAudioSafe && !s.hasUnsupportedAudio) ||
            finalStreams.find(s => s.isFrench && s.tierKey === '1080p') ||
            finalStreams.find(s => s.isFrench) ||
            finalStreams.find(s => s.isWebAudioSafe && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
            finalStreams.find(s => s.isWebAudioSafe && !s.hasUnsupportedAudio) ||
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
 * Résout l'identifiant IMDb d'un contenu TMDB (film ou série) avec fallback Cinemeta
 */
export async function getImdbIdForContent({ id, type = 'movie', title = '' }) {
    if (!id && !title) return null;

    try {
        const isTv = type === 'tv';
        let foundTitle = title;
        if (id) {
            const details = isTv ? await getSeriesDetails(id) : await getMovieDetails(id);
            const imdbId = details?.external_ids?.imdb_id || details?.imdb_id;
            if (imdbId && /^tt\d{5,10}$/i.test(imdbId)) return imdbId;
            if (!foundTitle) {
                foundTitle = details?.title || details?.name || details?.original_title || details?.original_name || '';
            }
        }
        if (foundTitle) {
            const searchTerms = [foundTitle, foundTitle.replace(/[:\-–—].*$/, '').trim()];
            for (const term of searchTerms) {
                if (!term) continue;
                try {
                    const cUrl = `https://v3-cinemeta.strem.io/catalog/${isTv ? 'series' : 'movie'}/top/search=${encodeURIComponent(term)}.json`;
                    const res = await fetch(cUrl, { headers: { 'Accept': 'application/json' }, signal: createTimeoutSignal(3500).signal });
                    if (res.ok) {
                        const data = await res.json();
                        const cid = data?.metas?.[0]?.id;
                        if (cid && /^tt\d{5,10}$/.test(cid)) return cid;
                    }
                } catch { /* continue */ }
            }
        }
        return null;
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
    lang = 'vf',
    title = '',
    signal: callerSignal = null
}) {
    const config = getGatewayConfig();
    const isTv = type === 'tv';

    // Résolution de l'identifiant IMDb si manquant
    let imdbId = initialImdbId;
    if (!imdbId && id) {
        imdbId = await getImdbIdForContent({ id, type, title });
    }
    if (callerSignal?.aborted) {
        return { success: false, aborted: true, streams: [] };
    }

    if (!imdbId && !id && !title) {
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
            imdbId: String(imdbId || ''),
            type: isTv ? 'tv' : 'movie',
            season: String(season || 1),
            episode: String(episode || 1),
            lang: String(lang || 'vf'),
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

        const reqSig = createTimeoutSignal(18000, callerSignal);
        console.log(`[Altyflix Stream Resolver] Résolution sécurisée via backend pour ${type} ${imdbId}...`);
        let serverRes;
        try {
            serverRes = await fetch(apiUrl(`/api/stream-resolve?${queryParams.toString()}`), {
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
                const prefixStream = (s) => (s && typeof s.url === 'string' && s.url.startsWith('/api/') ? { ...s, url: apiUrl(s.url) } : s);
                return {
                    success: true,
                    status: serverData.status || 'ready',
                    imdbId: serverData.imdbId || imdbId,
                    streams: serverData.streams.map(prefixStream),
                    activeStream: prefixStream(serverData.activeStream),
                    hasTrueVf: Boolean(serverData.hasTrueVf)
                };
            }
            backendError = {
                success: false,
                reason: serverData.reason || 'NO_STREAMS_FOUND',
                message: serverData.message || serverData.error || 'Aucun flux direct disponible pour ce titre actuellement.',
                imdbId: serverData.imdbId || imdbId,
                streams: []
            };
        } else {
            backendError = {
                success: false,
                reason: 'SERVER_ERROR',
                message: 'Le serveur de diffusion est momentanément indisponible. Veuillez réessayer dans quelques instants.',
                imdbId,
                streams: []
            };
        }
    } catch (backendErr) {
        if (callerSignal?.aborted) return { success: false, aborted: true, streams: [] };
        console.warn('[Altyflix Stream Resolver] Backend non disponible, tentative directe...', backendErr.message);
        backendError = {
            success: false,
            reason: 'NETWORK_ERROR',
            message: 'Connexion au serveur de diffusion impossible. Veuillez vérifier votre connexion réseau.',
            imdbId,
            streams: []
        };
    }

    // 2. FALLBACK DIRECT CLIENT : Utilisé si le backend est momentanément inaccessible
    if (!imdbId) {
        if (backendError) return backendError;
        return {
            success: false,
            reason: 'MISSING_IMDB_ID',
            message: 'Identifiant international non trouvé pour ce titre.',
            streams: []
        };
    }

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
        const ALL_PROVIDERS = 'torrent9,1337x,thepiratebay,torrentgalaxy,yts,rarbg,eztv,kickasstorrents,magnetdl,rutor,rutracker,ilcorsaronero,mejortorrent,wolfmax4k,cinecalidad,besttorrents,nyaasi,tokyotosho,anidex,nekobt,horriblesubs,animetosho,cinemaz,ibit,torlock,comando,bludv,micoleaodublado,uindex,knaben,ext';
        const optionsPriorityFr = `providers=${ALL_PROVIDERS}|sort=qualitysize|qualityfilter=scr,cam|foreign_lang=french|${activeProvider}=${encodeURIComponent(activeToken)}`;
        const endpointPriorityFr = `https://torrentio.strem.fun/${optionsPriorityFr}/stream/${isTv ? 'series' : 'movie'}/${streamKey}.json`;

        const optionsVf = `providers=${ALL_PROVIDERS}|sort=qualitysize|qualityfilter=scr,cam|language=french|${activeProvider}=${encodeURIComponent(activeToken)}`;
        const endpointVf = `https://torrentio.strem.fun/${optionsVf}/stream/${isTv ? 'series' : 'movie'}/${streamKey}.json`;

        const optionsGlobal = `providers=${ALL_PROVIDERS}|sort=qualitysize|qualityfilter=scr,cam|${activeProvider}=${encodeURIComponent(activeToken)}`;
        const endpointGlobal = `https://torrentio.strem.fun/${optionsGlobal}/stream/${isTv ? 'series' : 'movie'}/${streamKey}.json`;

        const fetchEndpoint = async (url) => {
            const s = createTimeoutSignal(8000, callerSignal);
            try {
                const res = await fetch(url, {
                    headers: { 'Accept': 'application/json' },
                    cache: 'no-store',
                    signal: s.signal
                });
                if (!res.ok) return [];
                const data = await res.json();
                return Array.isArray(data?.streams) ? data.streams : [];
            } catch {
                return [];
            } finally {
                s.cleanup();
            }
        };

        const [streamsFr, streamsVf, streamsGlobal] = await Promise.all([
            fetchEndpoint(endpointPriorityFr),
            fetchEndpoint(endpointVf),
            fetchEndpoint(endpointGlobal)
        ]);

        const seenUrls = new Set();
        const rawStreams = [];
        for (const s of [...streamsFr, ...streamsVf, ...streamsGlobal]) {
            if (s && s.url && !seenUrls.has(s.url)) {
                seenUrls.add(s.url);
                rawStreams.push(s);
            }
        }

        // Détection explicite des erreurs d'authentification ou de clé retournées par Torrentio
        const errorStream = rawStreams.find(isTorrentioErrorStream);
        if (errorStream && rawStreams.length === 1) {
            return {
                success: false,
                reason: 'INVALID_DEBRID_TOKEN',
                message: 'Accès non reconnu. Veuillez vérifier vos paramètres de lecture.',
                imdbId,
                streams: []
            };
        }

        const curated = curateStreams(rawStreams, config.provider, { contentType: type });

        if (!curated.streams || curated.streams.length === 0) {
            return {
                success: false,
                reason: 'NO_STREAMS_FOUND',
                message: 'Ce titre n\'est pas disponible pour le moment. Veuillez sélectionner un autre titre.',
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
    maxAttempts = 8,
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
                res = await fetch(apiUrl(`/api/stream-poll?url=${encodeURIComponent(streamUrl)}`), {
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
                    console.log(`[Altyflix Stream Poll] Flux pret apres ${elapsedSec}s (${attempts} verifications)`);
                    return {
                        ready: true,
                        playbackUrl: apiUrl(data.playbackUrl),
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
        message: 'Ce titre met plus de temps que prévu à charger. Veuillez réessayer dans quelques instants.'
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

/**
 * Recherche les sous-titres disponibles pour un film ou un épisode
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
    const isTv = type === 'tv';
    const stremKey = cleanImdbId ? (isTv ? `${cleanImdbId}:${season}:${episode}` : `${cleanImdbId}`) : '';

    // 0. Source PREMIUM (synchro frame-accurate) : sous-titres texte intégrés dans le fichier MKV/MP4 (si backend FFmpeg dispo)
    const embeddedPromise = (async () => {
        if (!streamUrl || !/^https?:\/\//i.test(streamUrl)) return [];
        const s = createTimeoutSignal(3500);
        try {
            const res = await fetch(apiUrl(`/api/embedded-subtitles?url=${encodeURIComponent(streamUrl)}`), { signal: s.signal });
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data?.subtitles) ? data.subtitles.map(sub => sub?.url ? { ...sub, url: apiUrl(sub.url) } : sub) : [];
        } catch {
            return [];
        } finally {
            s.cleanup();
        }
    })();

    // 1. Source de sous-titres : Backend /api/subtitles (OpenSubtitles côté serveur avec rate-limiting et conversion VTT sécurisée)
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
            const res = await fetch(apiUrl(`/api/subtitles?${q.toString()}`), {
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
        const [embeddedSubs, backendSubs] = await Promise.all([
            embeddedPromise,
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

        // A. Sous-titres du backend /api/subtitles (OpenSubtitles et indexeurs sécurisés sans CORS)
        for (const sub of backendSubs) {
            const canon = canonicalSubUrl(sub?.url);
            if (!canon || seenUrls.has(canon)) continue;
            const rawLang = String(sub.lang || '').toLowerCase();
            if ((rawLang === 'fr' || rawLang === 'fre' || rawLang === 'fra') && externalFrCount < 4) {
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
            } else if ((rawLang === 'en' || rawLang === 'eng') && externalEnCount < 3) {
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
