import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import security from '../server/security.cjs';
import netlifyApiHandler from '../netlify/functions/api.mjs';
import { seasonLabel, getSeasons } from '../src/utils/seasons.js';
import { getContentType, sanitizeReturnUrl } from '../src/utils/helpers.js';

const {
  tmdbUrl, validateStreams, arteLimit, BoundedCache, createRateLimiter, fetchJson,
  cleanSubtitleToVtt, normalizeAllowedSubtitleUrl, rankOpenSubtitles
} = security;
const require = createRequire(import.meta.url);
process.env.TMDB_API_KEY = 'test-key-not-a-real-credential';

test('return links cannot escape the site through backslash URLs', () => {
  for (const url of ['//evil.example', '/\\evil.example', '/\n/evil.example', 'https://evil.example']) assert.equal(sanitizeReturnUrl(url), '/');
  assert.equal(sanitizeReturnUrl('/tv/96677?part=4'), '/tv/96677?part=4');
});

test('Lupin Part 4 keeps TMDB season 3 and displays its name', () => {
  const show = { seasons: [{ season_number: 0 }, { season_number: 1, name: 'Partie 1 - 2' }, { season_number: 2, name: 'Partie 3' }, { season_number: 3, name: 'Partie 4' }] };
  assert.equal(getSeasons(show).length, 3);
  assert.equal(getSeasons(show)[2].season_number, 3);
  assert.equal(seasonLabel(getSeasons(show)[2]), 'Partie 4');
  assert.equal(seasonLabel({ season_number: 7 }), 'Saison 7');
});
test('legacy film history is not mistaken for a TV series', () => {
  assert.equal(getContentType({ type: 'movie', season: 1, episode: 1 }), 'movie');
  assert.equal(getContentType({ first_air_date: '2021-01-08', seasons: [] }), 'tv');
});
test('TMDB blocks account endpoints, traversal and credential injection', () => {
  for (const path of ['authentication/token/new', '../account', '//evil.example', 'tv/1/../../account', 'tv/1?x=1', 'tv/%2e%2e/account']) assert.throws(() => tmdbUrl(path, {}, 'key'), { status: 400 });
  assert.throws(() => tmdbUrl('tv/1', {}, ''), { status: 503 });
  assert.throws(() => tmdbUrl('discover/movie', { page: 501 }, 'key'), { status: 400 });
  assert.throws(() => tmdbUrl('tv/1', { session_id: 'secret' }, 'key'), { status: 400 });
  const url = tmdbUrl('tv/96677/season/3', { api_key: 'injected', language: 'fr-FR' }, 'server-key');
  assert.equal(url.searchParams.get('api_key'), 'server-key');
  assert.equal(url.pathname, '/3/tv/96677/season/3');
});
test('stream URLs reject HTML, query injection and invalid identifiers', () => {
  for (const id of ['1" onload="alert(1)', '1&x=2', '-1', 'NaN', '1/2', '0']) assert.throws(() => validateStreams({ id }), { status: 400 });
  assert.throws(() => validateStreams({ id: '1', type: 'oops' }), { status: 400 });
  assert.throws(() => validateStreams({ id: '1', episode: 0 }), { status: 400 });
  validateStreams({ id: '96677', type: 'tv', season: 3, episode: 8 });
  assert.equal(arteLimit('100'), 100);
  assert.throws(() => arteLimit('1&limit=99999'), { status: 400 });
});
test('cache eviction and request limits are enforced', () => {
  const cache = new BoundedCache(2);
  cache.set('a', 1); cache.set('b', 2); cache.set('c', 3);
  assert.equal(cache.get('a'), null); assert.equal(cache.get('c'), 3);
  cache.set('expired', 1, -1); assert.equal(cache.get('expired'), null);
  const allow = createRateLimiter(2);
  assert.equal(allow('a'), true); assert.equal(allow('a'), true); assert.equal(allow('a'), false); assert.equal(allow('b'), true);
});
// The Netlify function these tests used to exercise was removed (the API now
// runs on the Node server only), so only the shared fetch helper is covered here.
test('upstream failures hide internal details', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('secret-key internal-host'); };
    await assert.rejects(fetchJson('https://example.com'), error => error.status === 502 && !error.message.includes('secret-key'));
  } finally { globalThis.fetch = originalFetch; }
});
test('HTTP server rejects traversal, malformed URLs and unsafe methods', async () => {
  const server = require('../server/server-vf-api.cjs');
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const legacyAvatar = await fetch(base + '/avatars/Netflix/users-1.png', { redirect: 'manual' });
    assert.equal(legacyAvatar.status, 301);
    assert.equal(legacyAvatar.headers.get('location'), '/avatars/netflix/users-1.png');
    for (const path of ['/.env', '/%2eenv', '/a%5c..%5c.env', '/%00test', '/C:%5cWindows', '/%ZZ']) {
      const response = await fetch(base + path);
      assert.ok([400, 403].includes(response.status), `${path}: ${response.status}`);
    }
    assert.equal((await fetch(base + '/api/streams?id=1', { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/api/streams?id=%22%3E%3Cscript%3E')).status, 400);
    assert.equal((await fetch(base + '/api/tmdb/authentication/token/new')).status, 400);
    const response = await fetch(base + '/api/streams?id=96677&type=tv&season=3&episode=1');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal((await response.json()).season, 3);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('subtitle helpers clean ad cues, handle blank whitespace lines and block SSRF/CRLF URLs', () => {
  const srtWithAdsAndSpaces = [
    '1',
    '0:00:01,000 --> 0:00:04,000',
    'Watch Online Movies and Series for FREE',
    'www.osdb.link/lm',
    '   ',
    '2',
    '0:00:05,500 --> 0:00:08,000',
    'Bonjour l’équipe !',
  ].join('\n');
  const vtt = cleanSubtitleToVtt(srtWithAdsAndSpaces);
  assert.ok(vtt.startsWith('WEBVTT\n\n'));
  assert.ok(!vtt.includes('osdb.link'), 'Ad cue must be stripped');
  assert.ok(vtt.includes('00:00:05.500 --> 00:00:08.000'), '1-digit hour timestamp must be zero-padded');
  assert.ok(vtt.includes('Bonjour l’équipe !'));

  const allAds = cleanSubtitleToVtt('1\n00:00:01,000 --> 00:00:05,000\nOpenSubtitles.org\n');
  assert.equal(allAds, 'WEBVTT\n\n');

  assert.equal(normalizeAllowedSubtitleUrl('https://dl.opensubtitles.org/en/download/file/123'), 'https://dl.opensubtitles.org/en/download/file/123');
  assert.equal(normalizeAllowedSubtitleUrl('https://dl.opensubtitles.org/file\r\nX-Test:1'), null);
  assert.equal(normalizeAllowedSubtitleUrl('http://127.0.0.1/sub.srt'), null);

  const ranked = rankOpenSubtitles([
    { SubFileName: 'Show.S01E01.CD1.srt', SubFormat: 'srt', SubDownloadsCnt: '9999', SubDownloadLink: 'https://dl.opensubtitles.org/en/download/file/1' },
    { SubFileName: 'Show.S01E01.WEB-DL.srt', SubFormat: 'srt', SubDownloadsCnt: '-50', SubDownloadLink: 'https://dl.opensubtitles.org/en/download/file/2' },
    { SubFileName: 'Show.S01E01.sub', SubFormat: 'sub', SubDownloadsCnt: '500', SubDownloadLink: 'https://dl.opensubtitles.org/en/download/file/3' },
  ]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].item.SubFileName, 'Show.S01E01.WEB-DL.srt');
  assert.equal(Number.isFinite(ranked[0].score), true);
});

test('Netlify API function enforces health, SSRF and CRLF protections', async () => {
  const healthRes = await netlifyApiHandler(new Request('https://altyflix.netlify.app/api/health'));
  assert.equal(healthRes.status, 200);

  const ssrfVideo = await netlifyApiHandler(new Request('https://altyflix.netlify.app/api/video-stream?url=http://127.0.0.1:3000/secret'));
  assert.ok([400, 403].includes(ssrfVideo.status), `Expected 400/403, got ${ssrfVideo.status}`);

  const crlfVideo = await netlifyApiHandler(new Request('https://altyflix.netlify.app/api/video-stream?url=' + encodeURIComponent('https://api.torbox.app/x\r\nSet-Cookie:a=1')));
  assert.ok([400, 403].includes(crlfVideo.status), `Expected 400/403, got ${crlfVideo.status}`);

  const ssrfSub = await netlifyApiHandler(new Request('https://altyflix.netlify.app/api/subtitles-vtt?url=http://169.254.169.254/latest/meta-data'));
  assert.ok([400, 403].includes(ssrfSub.status), `Expected 400/403, got ${ssrfSub.status}`);

  const embeddedNetlify = await netlifyApiHandler(new Request('https://altyflix.netlify.app/api/embedded-subtitles?url=http://127.0.0.1/a.mkv'));
  assert.equal(embeddedNetlify.status, 200);
  assert.deepEqual((await embeddedNetlify.json()).subtitles, []);
});
