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

// Clé plateforme par défaut pour tous les visiteurs du site.
// Permet à tous vos utilisateurs de profiter immédiatement du streaming haute vitesse VF/VO sans configuration.
// Protégée : jamais affichée dans les champs de formulaire des Réglages.
const PLATFORM_DEFAULT_PROVIDER = 'torbox';
const PLATFORM_DEFAULT_TOKEN = '0ee09dc1-1d3f-4cc4-b806-950e471df905';

const STORAGE_KEY_PROVIDER = 'altyflix_stream_provider';
const STORAGE_KEY_TOKEN = 'altyflix_stream_token';

/**
 * Récupère la configuration actuelle de la passerelle
 * Priorité : LocalStorage utilisateur uniquement (la clé globale plateforme reste 100% sécurisée côté serveur)
 */
export function getGatewayConfig() {
    let provider = DEFAULT_PROVIDER;
    let customToken = '';

    if (typeof window !== 'undefined') {
        const storedProvider = localStorage.getItem(STORAGE_KEY_PROVIDER);
        const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
        if (storedProvider && storedProvider.trim()) provider = storedProvider.trim();
        if (storedToken && storedToken.trim().length > 3) customToken = storedToken.trim();
    }

    const hasCustomToken = Boolean(customToken);

    return {
        provider: provider || DEFAULT_PROVIDER,
        token: customToken,
        hasCustomToken,
        hasToken: true // Le serveur fournit la clé plateforme de manière transparente
    };
}

/**
 * Enregistre la configuration de la passerelle
 */
export function saveGatewayConfig({ provider, token }) {
    if (typeof window === 'undefined') return;

    if (provider) {
        localStorage.setItem(STORAGE_KEY_PROVIDER, provider);
    }
    if (typeof token === 'string') {
        localStorage.setItem(STORAGE_KEY_TOKEN, token.trim());
    }

    // Déclenche un événement personnalisé pour notifier l'UI
    window.dispatchEvent(new CustomEvent('altyflix-gateway-updated', {
        detail: { provider, token: (token || '').trim() }
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
        isFrench,
        isVostfr,
        isWebAudioSafe,
        hasBadAudio,
        isPureFrench,
        isMp4,
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
                isFrench: details.isFrench,
                isVostfr: details.isVostfr,
                isWebAudioSafe: details.isWebAudioSafe,
                hasBadAudio: details.hasBadAudio,
                isPureFrench: details.isPureFrench,
                isMp4: details.isMp4,
                languageLabel: details.languageLabel,
                size: details.size,
                sizeBytes: details.sizeBytes,
                seeds: details.seeds,
                filename: details.filename,
                rawTitle: s.title || s.name || '',
                provider
            };
        });

    if (valid.length === 0) return { streams: [], activeStream: null, hasTrueVf: false };

    // Y a-t-il au moins un flux avec de la vraie VF ?
    const hasTrueVf = valid.some(s => s.isFrench);

    // Fonction de score pour chaque flux dans sa catégorie : PRIORITÉ ABSOLUE AU SON FONCTIONNEL (+25000) ET À LA VF (+15000)
    const scoreStream = (st) => {
        let score = 0;

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

    // Palier 1080p FHD (Le cœur de l'expérience : ultra fluide, VF prioritaire)
    if (tiers['1080p'].length > 0) {
        tiers['1080p'].sort((a, b) => b.score - a.score);
        const best1080p = tiers['1080p'][0];
        
        let label1080 = '1080p FHD';
        if (best1080p.isFrench) label1080 = '1080p FHD · VF (Français)';
        else if (best1080p.isVostfr) label1080 = '1080p FHD · VOSTFR (Sous-titres FR)';
        else label1080 = '1080p FHD · VO (Original)';

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
                    qualityLabel: `1080p FHD · ${altVo.isVostfr ? 'VOSTFR' : 'VO (Original)'}`
                });
            }
        } else if (hasTrueVf) {
            // Si le premier n'était pas VF mais qu'une VF existe dans ce palier, on l'ajoute en tête
            const altVf = tiers['1080p'].find(s => s.isFrench);
            if (altVf) {
                curated.unshift({
                    ...altVf,
                    qualityLabel: '1080p FHD · VF (Français)'
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
            qualityLabel: `4K Ultra HD (${langTag})`
        });
    }

    // Palier 720p HD (Économique / Connexions modestes)
    if (tiers['720p'].length > 0) {
        tiers['720p'].sort((a, b) => b.score - a.score);
        const best720 = tiers['720p'][0];
        const langTag = best720.isFrench ? 'VF' : (best720.isVostfr ? 'VOSTFR' : 'VO');
        curated.push({
            ...best720,
            qualityLabel: `720p HD (${langTag})`
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

    const finalStreams = curated.length > 0 ? curated : scored.sort((a, b) => b.score - a.score).slice(0, 4);
    
    // Sélection par défaut : flux VF prioritaire au lancement !
    const defaultActive = (hasTrueVf
        ? (finalStreams.find(s => s.isFrench && s.tierKey === '1080p') || finalStreams.find(s => s.isFrench))
        : null) || finalStreams.find(s => s.tierKey === '1080p') || finalStreams[0];

    return {
        streams: finalStreams,
        activeStream: defaultActive,
        hasTrueVf
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
    episode = 1
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

    const streamKey = isTv ? `${imdbId}:${season}:${episode}` : `${imdbId}`;

    // Détermination du fournisseur et de la clé (clé perso utilisateur si présente, sinon clé globale plateforme)
    const activeProvider = config.provider || PLATFORM_DEFAULT_PROVIDER;
    const activeToken = config.hasCustomToken ? config.token : (PLATFORM_DEFAULT_TOKEN || '');

    if (!activeToken) {
        return {
            success: false,
            reason: 'NO_STREAMS_AVAILABLE',
            message: 'Aucun flux direct disponible pour ce titre actuellement.',
            imdbId,
            streams: []
        };
    }

    try {
        const options = `providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,torrent9|sort=qualitysize|language=french|${activeProvider}=${encodeURIComponent(activeToken)}`;
        const endpoint = `https://torrentio.strem.fun/${options}/stream/${isTv ? 'series' : 'movie'}/${streamKey}.json`;

        const res = await fetch(endpoint, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        });

        if (!res.ok) {
            return {
                success: false,
                reason: 'GATEWAY_ERROR',
                message: `La passerelle a répondu avec le statut ${res.status}.`,
                imdbId,
                streams: []
            };
        }

        const data = await res.json();
        const rawStreams = Array.isArray(data?.streams) ? data.streams : [];

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

        // Sélection et curation intelligente des flux (3 à 4 options propres max, son AAC garanti, pas de lag 4K)
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

        return {
            success: true,
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
 * Recherche les sous-titres disponibles pour un film ou un épisode (OpenSubtitles via strem.io)
 */
export async function fetchSubtitlesForContent({ imdbId, type = 'movie', season = 1, episode = 1 }) {
    if (!imdbId) return [];

    try {
        const isTv = type === 'tv';
        const key = isTv ? `${imdbId}:${season}:${episode}` : `${imdbId}`;
        const endpoint = `https://opensubtitles-v3.strem.io/subtitles/${isTv ? 'series' : 'movie'}/${key}.json`;

        const res = await fetch(endpoint, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(6000)
        });

        if (!res.ok) return [];
        const data = await res.json();
        const rawSubs = Array.isArray(data?.subtitles) ? data.subtitles : [];

        const normalized = [];
        const langMap = {
            fre: 'Français',
            fra: 'Français',
            fr: 'Français',
            eng: 'Anglais',
            en: 'Anglais',
            spa: 'Espagnol',
            es: 'Espagnol'
        };

        for (const sub of rawSubs) {
            const rawLang = String(sub.lang || '').toLowerCase();
            const label = langMap[rawLang];
            if (label && sub.url) {
                if (!normalized.some(s => s.label === label)) {
                    normalized.push({
                        id: sub.id || `${rawLang}-${normalized.length}`,
                        lang: rawLang,
                        label,
                        url: sub.url
                    });
                }
            }
        }

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
    const text = String(rawText).replace(/\r\n|\r/g, '\n');
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
 * Récupère et parse directement les sous-titres en mémoire
 */
export async function fetchSubtitleCues(subUrl) {
    if (!subUrl) return [];
    try {
        const res = await fetch(subUrl, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [];
        const rawText = await res.text();
        return parseVttCues(rawText);
    } catch {
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
    getImdbIdForContent,
    testGatewayToken,
    fetchSubtitlesForContent,
    loadSubtitleAsVttUrl,
    parseVttCues,
    fetchSubtitleCues
};
