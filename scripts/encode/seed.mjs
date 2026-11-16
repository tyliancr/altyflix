#!/usr/bin/env node
/**
 * Inscrit un titre dans le catalogue (Firestore, ou fichier JSON si DATA_BACKEND=file).
 *
 *   node scripts/encode/seed.mjs scripts/encode/titles/bbb-test.json
 *
 * Le fichier décrit le titre ; pour chaque film / épisode, "mediaDir" pointe vers le dossier
 * produit par encode.mjs (relatif à MEDIA_LOCAL_DIR). Durée, pistes audio, sous-titres et
 * miniatures sont lus dans son manifest.json : rien à recopier à la main.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../../api/config.js';
import { createStore } from '../../api/store/index.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage : node scripts/encode/seed.mjs <titre.json>');
  process.exit(1);
}

const config = loadConfig();
const store = await createStore(config);
const title = JSON.parse(await readFile(file, 'utf8'));
if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(title.id || '')) throw new Error('"id" invalide : lettres, chiffres, tirets, 80 caractères max.');
if (!['movie', 'series'].includes(title.type)) throw new Error('"type" doit valoir "movie" ou "series".');

async function loadMedia(mediaDir) {
  const dir = mediaDir.replace(/^\/+|\/+$/g, '');
  const manifest = JSON.parse(await readFile(path.join(config.mediaLocalDir, dir, 'manifest.json'), 'utf8'));
  return { dir, duration: manifest.duration, audio: manifest.audio, subtitles: manifest.subtitles, thumbnails: manifest.thumbnails?.vtt ?? null };
}

const uniqueBy = (items, key) => [...new Map(items.map(item => [key(item), item])).values()];

const base = {
  type: title.type,
  title: title.title,
  synopsis: title.synopsis || '',
  year: title.year ?? null,
  posterUrl: title.posterUrl ?? null,
  backdropUrl: title.backdropUrl ?? null,
  published: title.published !== false,
};

if (title.type === 'movie') {
  const media = await loadMedia(title.mediaDir);
  await store.putTitle(title.id, {
    ...base, media, markers: title.markers || {},
    audioLanguages: media.audio.map(({ lang, name }) => ({ lang, name })),
    subtitleLanguages: media.subtitles,
  });
  console.log(`✔ Film "${title.title}" (${title.id}) – ${Math.round(media.duration / 60)} min`);
} else {
  const allMedia = [];
  const seasons = [];
  for (const season of title.seasons || []) {
    for (const item of season.episodes) {
      const media = await loadMedia(item.mediaDir);
      allMedia.push(media);
      await store.putEpisode(title.id, season.number, item.episode, {
        titleId: title.id, season: season.number, episode: item.episode,
        title: item.title, synopsis: item.synopsis || '', stillUrl: item.stillUrl ?? null,
        published: item.published !== false, media, markers: item.markers || {},
      });
      console.log(`  ✔ S${season.number}E${item.episode} "${item.title}"`);
    }
    seasons.push({ number: season.number, title: season.title || `Saison ${season.number}`, episodeCount: season.episodes.length });
  }
  await store.putTitle(title.id, {
    ...base, seasons,
    audioLanguages: uniqueBy(allMedia.flatMap(media => media.audio.map(({ lang, name }) => ({ lang, name }))), item => item.lang),
    subtitleLanguages: uniqueBy(allMedia.flatMap(media => media.subtitles), item => `${item.lang}:${item.forced}`),
  });
  console.log(`✔ Série "${title.title}" (${title.id}) – ${seasons.length} saison(s)`);
}
process.exit(0);
