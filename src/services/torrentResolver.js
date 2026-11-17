/**
 * ALTYFLIX NATIVE TORRENT & STREAM RESOLVER
 * Résolution directe de flux P2P WebTorrent et flux directs sans aucun stockage serveur.
 * Utilise les indexeurs ouverts (Torrentio / trackers WebRTC) via IMDb ID.
 */

const WEBRTC_TRACKERS = [
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.btorrent.xyz',
    'wss://tracker.webtorrent.dev',
    'wss://tracker.fastcast.nz',
    'wss://tracker.files.fm:7073/announce'
];

const trackerParams = WEBRTC_TRACKERS.map(t => `&tr=${encodeURIComponent(t)}`).join('');

/**
 * Extrait les informations clés d'un titre Torrentio (seeders, taille, langue)
 */
function parseTorrentioDetails(titleText = '') {
    let seeds = 0;
    let size = '';
    let isFrench = false;

    // Seeds : 👤 297
    const seedMatch = titleText.match(/👤\s*(\d+)/);
    if (seedMatch) {
        seeds = parseInt(seedMatch[1], 10);
    }

    // Size : 💾 8.91 GB
    const sizeMatch = titleText.match(/💾\s*([\d.]+\s*[KMGT]B)/i);
    if (sizeMatch) {
        size = sizeMatch[1];
    }

    // Langues : drapeau français ou mention FR / VF / VFF / VFQ / VF2 / VFI / FRENCH / TRUEFRENCH / MULTI / Torrent9
    if (titleText.includes('🇫🇷') || /\b(FR|VF|VFF|VFQ|VF2|VFI|FRENCH|TRUEFRENCH|MULTI|TORRENT9)\b/i.test(titleText)) {
        isFrench = true;
    }

    return { seeds, size, isFrench };
}

/**
 * Résout les flux Torrentio pour un titre donné (film ou série)
 */
export async function resolveTorrentStreams({ imdbId, type = 'movie', season = 1, episode = 1, title = '' }) {
    if (!imdbId) return [];

    const isTv = type === 'tv';
    const endpoint = isTv
        ? `https://torrentio.strem.fun/stream/series/${imdbId}:${season}:${episode}.json`
        : `https://torrentio.strem.fun/stream/movie/${imdbId}.json`;

    try {
        const res = await fetch(endpoint, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        });

        if (!res.ok) return [];

        const data = await res.json();
        if (!Array.isArray(data?.streams) || data.streams.length === 0) {
            return [];
        }

        const formatted = data.streams.map((stream, idx) => {
            const rawTitle = stream.title || stream.name || '';
            const details = parseTorrentioDetails(rawTitle);
            const qualityName = (stream.name || '').replace(/Torrentio\n?/i, '').trim() || '1080p';
            const cleanTitle = (stream.behaviorHints?.filename || title || `Video-${qualityName}`).replace(/[^\w.-]/g, '_');

            const magnet = `magnet:?xt=urn:btih:${stream.infoHash}&dn=${encodeURIComponent(cleanTitle)}${trackerParams}`;

            return {
                id: `torrent-${stream.infoHash || idx}`,
                infoHash: stream.infoHash,
                quality: qualityName,
                name: `${qualityName} ${details.isFrench ? '🇫🇷 VF/VOSTFR' : 'Original'}`,
                filename: stream.behaviorHints?.filename || cleanTitle,
                fileIdx: typeof stream.fileIdx === 'number' ? stream.fileIdx : 0,
                seeds: details.seeds,
                size: details.size,
                isFrench: details.isFrench,
                magnetUrl: magnet,
                format: 'webtorrent'
            };
        });

        // Tri intelligent : prioriser les flux français avec le plus de seeds, puis par seeders totaux
        formatted.sort((a, b) => {
            if (a.isFrench && !b.isFrench) return -1;
            if (!a.isFrench && b.isFrench) return 1;
            return (b.seeds || 0) - (a.seeds || 0);
        });

        return formatted;
    } catch (err) {
        console.warn('[TorrentResolver] Erreur de récupération des flux :', err.message);
        return [];
    }
}

export default {
    resolveTorrentStreams,
    WEBRTC_TRACKERS
};
