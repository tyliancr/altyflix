import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { once } from 'node:events';
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

test('HTTP Range Requests: validation locale deterministe du code 206 Partial Content', async () => {
    const payload = Buffer.alloc(4096, 0x42);
    const mockServer = http.createServer((req, res) => {
        if (req.method === 'HEAD') {
            res.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Content-Length': String(payload.length),
                'Accept-Ranges': 'bytes',
            });
            return res.end();
        }
        const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
        if (!match) {
            res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': String(payload.length) });
            return res.end(payload);
        }
        const start = Number(match[1]);
        const end = match[2] ? Math.min(Number(match[2]), payload.length - 1) : payload.length - 1;
        const slice = payload.subarray(start, end + 1);
        res.writeHead(206, {
            'Content-Type': 'video/mp4',
            'Content-Range': `bytes ${start}-${end}/${payload.length}`,
            'Content-Length': String(slice.length),
            'Accept-Ranges': 'bytes',
        });
        res.end(slice);
    });

    mockServer.listen(0, '127.0.0.1');
    await once(mockServer, 'listening');
    const baseUrl = `http://127.0.0.1:${mockServer.address().port}/video.mp4`;

    try {
        const headRes = await fetch(baseUrl, { method: 'HEAD' });
        assert.equal(headRes.status, 200);
        assert.equal(headRes.headers.get('accept-ranges'), 'bytes');

        const res = await fetch(baseUrl, { headers: { Range: 'bytes=0-1023' } });
        assert.equal(res.status, 206, 'Le serveur doit repondre avec le code 206 Partial Content');
        const contentRange = res.headers.get('content-range');
        assert.equal(contentRange, 'bytes 0-1023/4096', 'Content-Range doit correspondre a RFC 7233');

        const body = await res.arrayBuffer();
        assert.equal(body.byteLength, 1024, 'Seuls les 1024 octets demandes doivent etre transferes');
    } finally {
        mockServer.closeAllConnections();
        await new Promise((resolve) => mockServer.close(resolve));
    }
});

test('Contrainte Zero Stockage Serveur : aucun stockage media permanent sur disque dans les backends', () => {
    const serverSrc = fs.readFileSync(new URL('../server/server-vf-api.cjs', import.meta.url), 'utf8');
    const netlifySrc = fs.readFileSync(new URL('../netlify/functions/api.mjs', import.meta.url), 'utf8');
    for (const [label, src] of [['server-vf-api.cjs', serverSrc], ['api.mjs', netlifySrc]]) {
        assert.equal(/createWriteStream\s*\(/.test(src), false, `${label} ne doit pas ecrire de flux media sur disque`);
        assert.equal(/writeFile(?:Sync)?\s*\(/.test(src), false, `${label} ne doit pas stocker de fichiers media sur disque`);
    }
});
