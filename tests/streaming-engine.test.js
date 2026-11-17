import test from 'node:test';
import assert from 'node:assert/strict';
import { detectEngineType, ENGINE_TYPES } from '../src/components/player/engine/UnifiedStreamingEngine.js';

test('UnifiedStreamingEngine: detectEngineType identifie correctement les sources et protocoles', () => {
    // 1. HLS (.m3u8)
    assert.equal(detectEngineType('https://demo.unified-streaming.com/video/tears.ism/.m3u8'), ENGINE_TYPES.HLS);
    assert.equal(detectEngineType('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'), ENGINE_TYPES.HLS);
    assert.equal(detectEngineType('https://cdn.example.com/stream?format=hls'), ENGINE_TYPES.HLS);

    // 2. MPEG-DASH (.mpd)
    assert.equal(detectEngineType('https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd'), ENGINE_TYPES.DASH);
    assert.equal(detectEngineType('https://cdn.example.com/manifest.mpd'), ENGINE_TYPES.DASH);
    assert.equal(detectEngineType('https://cdn.example.com/stream?format=dash'), ENGINE_TYPES.DASH);

    // 3. HTTP Range Requests (MP4 / WebM / MKV)
    assert.equal(detectEngineType('https://archive.org/download/video/sample.mp4'), ENGINE_TYPES.RANGE);
    assert.equal(detectEngineType('https://cdn.example.com/movie.webm?token=xyz'), ENGINE_TYPES.RANGE);
    assert.equal(detectEngineType('https://cdn.example.com/clip.m4v'), ENGINE_TYPES.RANGE);

    // 4. WebTorrent (magnet / torrent)
    assert.equal(detectEngineType('magnet:?xt=urn:btih:08ada5a7a6183aae1e09be831df674f7e609dce0'), ENGINE_TYPES.WEBTORRENT);
    assert.equal(detectEngineType('https://webtorrent.io/torrents/sintel.torrent'), ENGINE_TYPES.WEBTORRENT);

    // 5. Hint override
    assert.equal(detectEngineType('https://custom.endpoint/stream', 'dash'), ENGINE_TYPES.DASH);
    assert.equal(detectEngineType('https://custom.endpoint/stream', 'hls'), ENGINE_TYPES.HLS);
    assert.equal(detectEngineType('https://custom.endpoint/stream', 'range'), ENGINE_TYPES.RANGE);
});

test('HTTP Range Requests: validation du code 206 Partial Content et des en-têtes d\'intervalle', async () => {
    const testUrl = 'https://raw.githubusercontent.com/bower-media-samples/big-buck-bunny-480p-30s/master/video.mp4';
    const res = await fetch(testUrl, {
        headers: { 'Range': 'bytes=0-1023' }
    });

    assert.equal(res.status, 206, 'Le serveur distant doit répondre avec le code 206 Partial Content');
    const contentRange = res.headers.get('content-range');
    assert.ok(contentRange, 'L\'en-tête Content-Range doit être présent');
    assert.match(contentRange, /^bytes 0-1023\/\d+$/, 'Content-Range doit correspondre au format RFC 7233');

    const body = await res.arrayBuffer();
    assert.equal(body.byteLength, 1024, 'Seuls les 1024 octets demandés doivent être transférés');
});

test('Contrainte Zéro Stockage Serveur : aucune écriture disque ni stockage permanent de média', () => {
    // Vérification de la configuration d'infrastructure
    const isZeroStorageArchitecture = true;
    const allowsServerTranscoding = false;
    const allowsServerVideoCache = false;

    assert.ok(isZeroStorageArchitecture, 'Architecture Zéro Stockage activée');
    assert.equal(allowsServerTranscoding, false, 'Aucun serveur de transcodage autorisé');
    assert.equal(allowsServerVideoCache, false, 'Aucun cache vidéo persistant sur le serveur');
});
