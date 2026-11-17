import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import security from '../server/security.cjs';
import { seasonLabel, getSeasons } from '../src/utils/seasons.js';
import { isTrustedPlayerMessage, validPlaybackProgress } from '../src/utils/playerMessages.js';
import { getContentType, sanitizeReturnUrl } from '../src/utils/helpers.js';

const { tmdbUrl, validateStreams, arteLimit, BoundedCache, createRateLimiter, fetchJson } = security;
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
test('playback events require the current frame and exact origin', () => {
  const source = {};
  const frame = { contentWindow: source, src: 'https://player.example/tv/1/3/1' };
  assert.equal(isTrustedPlayerMessage({ source, origin: 'https://player.example', data: {} }, frame), true);
  assert.equal(isTrustedPlayerMessage({ source: {}, origin: 'https://player.example', data: {} }, frame), false);
  assert.equal(isTrustedPlayerMessage({ source, origin: 'https://attacker.example', data: {} }, frame), false);
  assert.equal(isTrustedPlayerMessage({ source, origin: 'https://player.example', data: 'ended' }, frame), false);
  for (const [time, duration] of [[Infinity, 100], [-1, 100], [100, 0], [9000, 100], ['1', 100]]) assert.equal(validPlaybackProgress(time, duration), false);
  assert.equal(validPlaybackProgress(50, 100), true);
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
