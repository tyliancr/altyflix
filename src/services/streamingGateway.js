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

/**
 * Récupère la configuration actuelle de la passerelle
 * Priorité : LocalStorage utilisateur si configuré, sinon clé globale serveur
 */
export function getGatewayConfig() {
    let provider = DEFAULT_PROVIDER;
    let customToken = '';
    let frenchioUrl = '';

    if (typeof window !== 'undefined') {
        const storedProvider = localStorage.getItem(STORAGE_KEY_PROVIDER);
        const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
        const storedFrenchio = localStorage.getItem(STORAGE_KEY_FRENCHIO_URL);
        if (storedProvider && storedProvider.trim()) provider = storedProvider.trim();
        if (storedToken && storedToken.trim().length > 3) customToken = storedToken.trim();
        if (storedFrenchio && storedFrenchio.trim()) frenchioUrl = storedFrenchio.trim();
    }

    const hasCustomToken = Boolean(customToken);

    return {
        provider: provider || DEFAULT_PROVIDER,
        token: customToken,
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

    if (provider) {
        localStorage.setItem(STORAGE_KEY_PROVIDER, provider);
    }
    if (typeof token === 'string') {
        localStorage.setItem(STORAGE_KEY_TOKEN, token.trim());
    }
    if (typeof frenchioUrl === 'string') {
        localStorage.setItem(STORAGE_KEY_FRENCHIO_URL, frenchioUrl.trim());
    }

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
    // Évite le silence provoqué par les codecs propriétaires Dolby AC3 / E-AC3 / DTS non décodés par Chrome/Edge
    const hasAac = /aac/i.test(fullText);
    const hasMp3 = /mp3/i.test(fullText);
    const hasOpus = /opus/i.test(fullText);
    const hasFlac = /flac/i.test(fullText);
    const isWebAudioGroup = /yts|yify|rapta|pir8|joy/i.test(fullText);
    const hasDdp = /ddp|eac3|atmos/i.test(fullText);
    const hasDts = /dts/i.test(fullText);
    const hasAc3 = /\bac3\b/i.test(fullText);

    // Audio garanti sans coupure sonore dans le navigateur
    const isWebAudioSafe = hasAac || hasMp3 || hasOpus || hasFlac || isWebAudioGroup;
    // Codecs propriétaires incompatibles Chrome (audio 100% muet en HTML5)
    const hasBadAudio = (hasDts || hasAc3 || hasDdp) && !hasAac && !hasMp3;
    const isPureFrench = /\b(truefrench|vff)\b/i.test(fullText);
    const isMp4 = /\.mp4(\?|$)/i.test(stream?.url || '') || /\.mp4/i.test(filename);
    const isAvi = /\.avi(\?|$)/i.test(stream?.url || '') || /\.avi/i.test(filename) || /xvid|divx/i.test(fullText);

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
        isPureFrench,
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
function curateStreams(rawStreams, provider) {
    const valid = rawStreams
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
                isPureFrench: details.isPureFrench,
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

    if (valid.length === 0) return { streams: [], activeStream: null, hasTrueVf: false, allDownloading: false, anyCached: false };

    // Y a-t-il au moins un flux avec de la vraie VF ?
    const hasTrueVf = valid.some(s => s.isFrench);

    // Fonction de score : PRIORITÉ ABSOLUE AUX FLUX EN CACHE (+100 000), SON FONCTIONNEL (+25000) ET VF (+15000)
    const scoreStream = (st) => {
        let score = 0;

        // 0. PRIORITÉ ABSOLUE AU STREAM EN CACHE PRÊT INSTANTANÉMENT
        if (st.isCached) {
            score += 100000;
        }
        if (st.isDownloading) {
            score -= 50000;
        }

        // 1. Son 100% garanti dans le navigateur (AAC / MP3 / Opus) : CRITIQUE pour ne jamais avoir de vidéo muette
        if (st.isWebAudioSafe) {
            score += 25000;
        }
        if (st.hasBadAudio) {
            // Codecs propriétaires Dolby/DTS (AC3/DTS/E-AC3) rejetés car non décodés par Chrome/Edge
            score -= 20000;
        }

        // 2. VF prioritaire au lancement (+15000) sinon VOSTFR (+500)
        if (st.isFrench) score += 15000;
        else if (st.isVostfr) score += 500;

        // 3. Vraie VF pure (TRUEFRENCH / VFF) plutôt que MULTI (où la piste 1 est souvent l'anglais)
        if (st.isPureFrench) score += 5000;

        // 4. Format MP4 universel (audio AAC garanti et seek instantané)
        if (st.isMp4) score += 3000;

        // 5. Taille optimale pour la fluidité (évite les lags)
        const gb = st.sizeBytes / (1024 * 1024 * 1024);
        if (st.tierKey === '1080p') {
            if (gb >= 0.7 && gb <= 4.5) score += 400; // taille parfaite pour 1080p
            else if (gb > 18) score -= 1500; // fichier trop lourd pour du streaming direct
        } else if (st.tierKey === '4k') {
            if (gb >= 3 && gb <= 14) score += 400; // taille 4K web parfaite
            else if (gb > 25) score -= 2000; // remux géant de 80GB qui fait crasher/ramer
        } else if (st.tierKey === '720p') {
            if (gb >= 0.4 && gb <= 2.0) score += 300;
        }

        // 6. Santé du torrent (seeders)
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
    
    // Sélection par défaut : flux en cache en priorité absolue !
    let defaultActive = null;
    if (anyCached) {
        defaultActive = finalStreams.find(s => s.isCached && s.isFrench && s.tierKey === '1080p') ||
                        finalStreams.find(s => s.isCached && s.isFrench) ||
                        finalStreams.find(s => s.isCached && s.tierKey === '1080p') ||
                        finalStreams.find(s => s.isCached);
    }
    if (!defaultActive) {
        defaultActive = (hasTrueVf
            ? (finalStreams.find(s => s.isFrench && s.tierKey === '1080p') || finalStreams.find(s => s.isFrench))
            : null) || finalStreams.find(s => s.tierKey === '1080p') || finalStreams[0];
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
    title = ''
}) {
    const config = getGatewayConfig();
    const isTv = type === 'tv';

    // Résolution de l'identifiant IMDb si manquant
    let imdbId = initialImdbId;
    if (!imdbId && id) {
        imdbId = await getImdbIdForContent({ id, type });
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
    try {
        const queryParams = new URLSearchParams({
            id: String(id || ''),
            imdbId: String(imdbId),
            type: isTv ? 'tv' : 'movie',
            season: String(season || 1),
            episode: String(episode || 1)
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

        console.log(`[Altyflix Stream Resolver] Résolution sécurisée via backend pour ${type} ${imdbId}...`);
        const serverRes = await fetch(`/api/stream-resolve?${queryParams.toString()}`, {
            headers,
            cache: 'no-store',
            signal: AbortSignal.timeout(9000)
        });

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
        }
    } catch (backendErr) {
        console.warn('[Altyflix Stream Resolver] Backend non disponible, tentative directe...', backendErr.message);
    }

    // 2. FALLBACK DIRECT CLIENT : Utilisé si le backend est momentanément inaccessible
    const streamKey = isTv ? `${imdbId}:${season}:${episode}` : `${imdbId}`;
    const activeProvider = config.provider || PLATFORM_DEFAULT_PROVIDER;
    const activeToken = config.token || '';

    if (!activeToken) {
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

        let res = await fetch(endpoint, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
            signal: AbortSignal.timeout(8000)
        });

        let rawStreams = [];
        if (res.ok) {
            const data = await res.json();
            rawStreams = Array.isArray(data?.streams) ? data.streams : [];
        }

        // Si aucun flux en VF, élargir au catalogue mondial
        if (!rawStreams || rawStreams.length === 0 || rawStreams.every(isTorrentioErrorStream)) {
            const optionsGlobal = `providers=${ALL_PROVIDERS}|sort=qualitysize|${activeProvider}=${encodeURIComponent(activeToken)}`;
            const endpointGlobal = `https://torrentio.strem.fun/${optionsGlobal}/stream/${isTv ? 'series' : 'movie'}/${streamKey}.json`;

            const resGlobal = await fetch(endpointGlobal, {
                headers: { 'Accept': 'application/json' },
                cache: 'no-store',
                signal: AbortSignal.timeout(8000)
            });

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

        const curated = curateStreams(rawStreams, config.provider);

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
            const res = await fetch(`/api/stream-poll?url=${encodeURIComponent(streamUrl)}`, {
                signal,
                cache: 'no-store'
            });

            if (res.ok) {
                const data = await res.json();

                if (data.ready && data.playbackUrl) {
                    console.log(`[Altyflix Stream Poll] ✅ Flux PRÊT après ${elapsedSec}s (${attempts} vérifications) !`);
                    return {
                        ready: true,
                        playbackUrl: data.playbackUrl,
                        elapsedSec
                    };
                }

                if (data.status === 'downloading') {
                    console.log(`[Altyflix Stream Poll] ⏳ En cours de téléchargement vers le debrid (${elapsedSec}s)...`);
                }
            }
        } catch (err) {
            if (signal?.aborted) return { ready: false, aborted: true };
            console.warn(`[Altyflix Stream Poll] Échec de la vérification #${attempts} :`, err.message);
        }

        // Pause avec backoff raisonnable
        const waitTime = Math.min(intervalMs + (attempts * 100), 4000);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
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
        try {
            const tbRes = await fetch('https://api.torbox.app/v1/api/user/me', {
                headers: {
                    'Authorization': `Bearer ${cleanToken}`,
                    'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(6000)
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
        }
    }

    // 2. Validation directe auprès de l'API Real-Debrid
    if (provider === 'realdebrid') {
        try {
            const rdRes = await fetch('https://api.real-debrid.com/rest/1.0/user', {
                headers: {
                    'Authorization': `Bearer ${cleanToken}`,
                    'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(6000)
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
        }
    }

    // 3. Fallback Torrentio
    try {
        const options = `providers=yts|${provider}=${encodeURIComponent(cleanToken)}`;
        const endpoint = `https://torrentio.strem.fun/${options}/stream/movie/tt0137523.json`;

        const res = await fetch(endpoint, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000)
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
    }
}

/**
 * Recherche les sous-titres disponibles pour un film ou un épisode (Multi-sources : OpenSubtitles v3 + OpenSubtitles REST)
 */
export async function fetchSubtitlesForContent({ id, imdbId: initialImdbId, type = 'movie', season = 1, episode = 1 }) {
    let imdbId = initialImdbId;

    // Si l'identifiant IMDb est absent ou mal formaté, le résoudre automatiquement depuis TMDB
    if ((!imdbId || !/^tt\d+$/i.test(String(imdbId))) && id) {
        try {
            imdbId = await getImdbIdForContent({ id, type });
        } catch {
            imdbId = null;
        }
    }

    if (!imdbId || !/^tt\d+$/i.test(String(imdbId))) {
        return [];
    }

    const cleanImdbId = String(imdbId).toLowerCase();
    const numericImdbId = cleanImdbId.replace(/^tt/, '');
    const isTv = type === 'tv';
    const stremKey = isTv ? `${cleanImdbId}:${season}:${episode}` : `${cleanImdbId}`;

    // 1. Source 1 : Stremio OpenSubtitles v3
    const stremPromise = (async () => {
        try {
            const endpoint = `https://opensubtitles-v3.strem.io/subtitles/${isTv ? 'series' : 'movie'}/${stremKey}.json`;
            const res = await fetch(endpoint, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(6000)
            });
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data?.subtitles) ? data.subtitles : [];
        } catch {
            return [];
        }
    })();

    // 2. Source 2 : OpenSubtitles REST (très riche en sous-titres français)
    const restPromise = (async () => {
        try {
            const restUrl = isTv
                ? `https://rest.opensubtitles.org/search/episode-${episode}/imdbid-${numericImdbId}/season-${season}/sublanguageid-fre`
                : `https://rest.opensubtitles.org/search/imdbid-${numericImdbId}/sublanguageid-fre`;
            const res = await fetch(restUrl, {
                headers: { 'User-Agent': 'TemporaryUserAgent' },
                signal: AbortSignal.timeout(6000)
            });
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        }
    })();

    try {
        const [stremSubs, restSubs] = await Promise.all([stremPromise, restPromise]);

        const normalized = [];
        const seenUrls = new Set();
        let frCount = 0;
        let enCount = 0;
        let esCount = 0;

        // A. Sous-titres français depuis OpenSubtitles REST
        for (const sub of restSubs) {
            const downloadUrl = sub.SubDownloadLink || sub.ZipDownloadLink;
            if (downloadUrl && !seenUrls.has(downloadUrl) && frCount < 3) {
                frCount++;
                seenUrls.add(downloadUrl);
                normalized.push({
                    id: `rest-fr-${frCount}-${sub.IDSubtitleFile || sub.IDSubtitle || frCount}`,
                    lang: 'fr',
                    label: frCount === 1 ? 'Français' : `Français (Option ${frCount})`,
                    url: downloadUrl,
                    encoding: sub.SubEncoding || 'windows-1252',
                    fileName: sub.SubFileName || ''
                });
            }
        }

        // B. Sous-titres depuis Stremio OpenSubtitles v3
        const langMap = {
            fre: 'fr', fra: 'fr', fr: 'fr',
            eng: 'en', en: 'en',
            spa: 'es', es: 'es'
        };

        for (const sub of stremSubs) {
            const rawLang = String(sub.lang || '').toLowerCase();
            const standardLang = langMap[rawLang];
            if (!standardLang || !sub.url || seenUrls.has(sub.url)) continue;

            if (standardLang === 'fr' && frCount < 3) {
                frCount++;
                seenUrls.add(sub.url);
                normalized.push({
                    id: sub.id || `strem-fr-${frCount}`,
                    lang: 'fr',
                    label: frCount === 1 ? 'Français' : `Français (Option ${frCount})`,
                    url: sub.url,
                    encoding: sub.SubEncoding || 'utf-8'
                });
            } else if (standardLang === 'en' && enCount < 2) {
                enCount++;
                seenUrls.add(sub.url);
                normalized.push({
                    id: sub.id || `strem-en-${enCount}`,
                    lang: 'en',
                    label: enCount === 1 ? 'Anglais' : `Anglais (Option ${enCount})`,
                    url: sub.url,
                    encoding: sub.SubEncoding || 'utf-8'
                });
            } else if (standardLang === 'es' && esCount < 1) {
                esCount++;
                seenUrls.add(sub.url);
                normalized.push({
                    id: sub.id || `strem-es-${esCount}`,
                    lang: 'es',
                    label: 'Espagnol',
                    url: sub.url,
                    encoding: sub.SubEncoding || 'utf-8'
                });
            }
        }

        // Tri : Français d'abord, puis Anglais, puis Espagnol
        normalized.sort((a, b) => {
            const order = { fr: 1, en: 2, es: 3 };
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
export function parseVttCues(rawText) {
    if (!rawText) return [];
    const text = String(rawText).replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n');
    const cues = [];
    const blocks = text.split(/\n\s*\n/);

    for (const block of blocks) {
        const lines = block.trim().split('\n');
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})/);
            if (m) {
                const toSec = (h, min, s, ms) =>
                    (h ? parseInt(h, 10) * 3600 : 0) +
                    parseInt(min, 10) * 60 +
                    parseInt(s, 10) +
                    parseInt(ms, 10) / 1000;
                const start = toSec(m[1], m[2], m[3], m[4]);
                const end = toSec(m[5], m[6], m[7], m[8]);
                const rawContent = lines.slice(i + 1).join('\n')
                    .replace(/<[^>]+>/g, '')
                    .replace(/\{[^}]+\}/g, '')
                    .trim();
                if (rawContent && end > start) {
                    cues.push({ start, end, text: rawContent });
                }
                break;
            }
        }
    }
    return cues;
}

/**
 * Récupère et parse directement les sous-titres en mémoire (avec support transparent .gz et encodages Windows-1252 / UTF-8)
 */
export async function fetchSubtitleCues(subUrl, subEncoding = null) {
    if (!subUrl) return [];
    try {
        const isGz = subUrl.endsWith('.gz') || subUrl.includes('/filead/');
        const res = await fetch(subUrl, {
            headers: isGz ? { 'User-Agent': 'TemporaryUserAgent' } : {},
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) return [];

        let rawText;
        if (isGz && typeof DecompressionStream !== 'undefined') {
            const ds = new DecompressionStream('gzip');
            const decompressedStream = res.body.pipeThrough(ds);
            const buf = await new Response(decompressedStream).arrayBuffer();
            const enc = subEncoding && !/ascii|utf-?8/i.test(subEncoding) ? 'windows-1252' : (subEncoding || 'utf-8');
            try {
                rawText = new TextDecoder(enc).decode(buf);
            } catch {
                rawText = new TextDecoder('utf-8').decode(buf);
            }
        } else {
            rawText = await res.text();
        }

        return parseVttCues(rawText);
    } catch (err) {
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
        const res = await fetch(subUrl, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const text = await res.text();

        // Conversion standard SRT vers WebVTT
        const clean = text.replace(/^WEBVTT\s*/i, '').trim();
        const vtt = 'WEBVTT\n\n' + clean
            .replace(/\r\n|\r/g, '\n')
            .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

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
