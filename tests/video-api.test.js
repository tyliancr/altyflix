import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../api/app.js';
import { createFileStore } from '../api/store/file.js';
import { signedMediaUrl, verifyMediaPath } from '../api/lib/signing.js';

const secret = 'x'.repeat(48);
const dir = mkdtempSync(path.join(tmpdir(), 'altyflix-video-'));
const config = {
  allowedOrigins: ['https://altyflix.netlify.app'],
  signingSecret: secret,
  playbackTtl: 3600,
  mediaBaseUrl: 'https://media.test',
  mediaLocalDir: dir,
  dataBackend: 'file',
  dataFile: path.join(dir, 'store.json'),
};
const store = createFileStore(config);
const media = (name, duration) => ({
  dir: `titles/${name}`, duration, thumbnails: 'thumbs/thumbs.vtt',
  audio: [{ lang: 'fr', name: 'Français', default: true }, { lang: 'en', name: 'Version originale', default: false }],
  subtitles: [{ lang: 'fr', name: 'Français', forced: false }],
});

await store.putTitle('film', { type: 'movie', title: 'Film', published: true, media: media('film', 600), markers: { credits: { start: 540 } } });
await store.putTitle('cache', { type: 'movie', title: 'Brouillon', published: false, media: media('cache', 600) });
await store.putTitle('serie', { type: 'series', title: 'Série', published: true, seasons: [{ number: 1, title: 'Saison 1', episodeCount: 2 }] });
for (const episode of [1, 2]) {
  await store.putEpisode('serie', 1, episode, {
    titleId: 'serie', season: 1, episode, title: `Épisode ${episode}`, published: true,
    media: media(`serie/s1e${episode}`, 100), markers: { intro: { start: 5, end: 15 }, credits: { start: 90 } },
  });
}

// Faux vérificateur : le jeton "token-<uid>" est valide, tout le reste est refusé.
const verifyIdToken = async token => {
  if (!token.startsWith('token-')) throw new Error('invalid');
  return { uid: token.slice(6) };
};
const server = createApp({ config, store, verifyIdToken }).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

async function call(pathname, { method = 'GET', body, uid = 'alice', headers = {} } = {}) {
  const response = await fetch(base + pathname, {
    method,
    headers: { ...(uid ? { Authorization: `Bearer token-${uid}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, headers: response.headers, data: await response.json().catch(() => null) };
}

test('signature : chemin valide, expiré, falsifié, hors périmètre', () => {
  const { url } = signedMediaUrl('https://media.test', 'titles/film', 'master.m3u8', { secret, ttl: 60 });
  const pathname = new URL(url).pathname;
  assert.equal(verifyMediaPath(pathname, { secret }), 'titles/film/master.m3u8');
  assert.equal(verifyMediaPath(pathname.replace('master.m3u8', 'v720/seg_00001.m4s'), { secret }), 'titles/film/v720/seg_00001.m4s');
  assert.equal(verifyMediaPath(pathname, { secret, now: Date.now() + 61_000 }), null, 'expiré');
  assert.equal(verifyMediaPath(pathname.replace('titles/film', 'titles/autre'), { secret }), null, 'autre titre');
  assert.equal(verifyMediaPath(pathname.replace('master.m3u8', '../autre/master.m3u8'), { secret }), null, 'remontée de dossier');
  assert.equal(verifyMediaPath(pathname, { secret: 'y'.repeat(48) }), null, 'mauvais secret');
});

test('authentification obligatoire', async () => {
  assert.equal((await call('/api/titles/film', { uid: null })).status, 401);
  assert.equal((await call('/api/titles/film', { uid: null, headers: { Authorization: 'Bearer faux' } })).status, 401);
});

test('métadonnées, titres non publiés et validation', async () => {
  const film = await call('/api/titles/film');
  assert.equal(film.status, 200);
  assert.equal(film.data.type, 'movie');
  assert.equal(film.data.media, undefined, 'le chemin du média ne sort jamais dans les métadonnées');
  assert.equal(film.headers.get('cache-control'), 'private, no-store');
  assert.equal((await call('/api/titles/cache')).status, 404);
  assert.equal((await call('/api/titles/inconnu')).status, 404);
  assert.equal((await call('/api/titles/..%2Fetc')).status, 400);
  assert.equal((await call('/api/titles/serie/playback?season=1')).status, 400);
});

test('lecture : URL signée, pistes, marqueurs, épisode suivant', async () => {
  const { status, data } = await call('/api/titles/serie/playback?season=1&episode=1');
  assert.equal(status, 200);
  assert.equal(verifyMediaPath(new URL(data.hlsUrl).pathname, { secret }), 'titles/serie/s1e1/master.m3u8');
  assert.ok(Date.parse(data.expiresAt) > Date.now());
  assert.deepEqual(data.audioTracks.map(track => track.lang), ['fr', 'en']);
  assert.deepEqual(data.markers.intro, { start: 5, end: 15 });
  assert.equal(data.next.episode, 2);
  assert.equal(data.resume, null);
  assert.equal((await call('/api/titles/serie/playback?season=1&episode=2')).data.next, null);
  assert.equal((await call('/api/titles/serie/next?season=1&episode=1')).data.next.episode, 2);
  assert.equal((await call('/api/series/serie/seasons/1/episodes')).data.episodes.length, 2);
  assert.equal((await call('/api/series/serie/seasons/9/episodes')).status, 404);
});

test('progression, reprise et « Reprendre la lecture »', async () => {
  const saved = await call('/api/me/progress/serie', { method: 'PUT', body: { position: 40, duration: 100, season: 1, episode: 1 } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.progress.completed, false);
  assert.equal((await call('/api/me/progress/serie?season=1&episode=1')).data.progress.position, 40);
  assert.equal((await call('/api/titles/serie/playback')).data.resume.position, 40, 'sans épisode précisé : reprise du dernier épisode');

  let row = (await call('/api/me/continue-watching')).data.items[0];
  assert.deepEqual([row.titleId, row.episode, row.position], ['serie', 1, 40]);

  // Générique atteint : l'épisode est terminé, la rangée propose le suivant depuis le début.
  await call('/api/me/progress/serie', { method: 'PUT', body: { position: 95, duration: 100, season: 1, episode: 1 } });
  row = (await call('/api/me/continue-watching')).data.items[0];
  assert.deepEqual([row.episode, row.position], [2, 0]);
  assert.equal((await call('/api/titles/serie/playback')).data.episode, 2);

  // Cloisonnement : un autre utilisateur et un autre profil ne voient rien.
  assert.deepEqual((await call('/api/me/continue-watching', { uid: 'bob' })).data.items, []);
  assert.deepEqual((await call('/api/me/continue-watching?profileId=enfant')).data.items, []);

  assert.equal((await call('/api/me/progress/serie', { method: 'PUT', body: { position: -1, duration: 100, season: 1, episode: 1 } })).status, 400);
  assert.equal((await call('/api/me/progress/serie', { method: 'PUT', body: { position: 1, duration: 100 } })).status, 400);
  assert.equal((await call('/api/me/progress/film', { method: 'PUT', body: { position: 1, duration: 100, uid: 'bob' } })).status, 400, 'champ inconnu refusé');
});

test('préférences de langue', async () => {
  assert.deepEqual((await call('/api/me/preferences')).data.preferences, { audioLang: 'fr', subtitleLang: null, subtitleForced: false, subtitleSize: 'm' });
  const updated = await call('/api/me/preferences', { method: 'PUT', body: { audioLang: 'en', subtitleLang: 'fr' } });
  assert.equal(updated.data.preferences.audioLang, 'en');
  assert.equal((await call('/api/titles/film/playback')).data.preferences.subtitleLang, 'fr');
  assert.equal((await call('/api/me/preferences', { method: 'PUT', body: { audioLang: 'français' } })).status, 400);
  assert.equal((await call('/api/me/preferences', { method: 'PUT', body: {} })).status, 400);
});

test('CORS limité aux origines autorisées', async () => {
  const allowed = await call('/api/titles/film', { headers: { Origin: 'https://altyflix.netlify.app' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://altyflix.netlify.app');
  const refused = await call('/api/titles/film', { headers: { Origin: 'https://exemple.org' } });
  assert.equal(refused.headers.get('access-control-allow-origin'), null);
});
