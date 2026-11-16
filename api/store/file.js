import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Stockage dans un fichier JSON, pour développer et tester sans compte de service.
 * Même interface que le stockage Firestore. Ne pas utiliser en production.
 */
export function createFileStore(config) {
  const file = path.resolve(config.dataFile);
  const read = () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { titles: {}, episodes: {}, users: {} });
  const write = data => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data, null, 2));
  };
  const update = mutate => {
    const data = read();
    mutate(data);
    write(data);
  };
  const user = (data, uid) => (data.users[uid] ??= { progress: {}, preferences: {} });
  const key = (titleId, season, episode) => `${titleId}_s${season}e${episode}`;

  return {
    async getTitle(id) {
      const title = read().titles[id];
      return title ? { id, ...title } : null;
    },
    async getEpisode(titleId, season, episode) {
      return read().episodes[key(titleId, season, episode)] || null;
    },
    async listEpisodes(titleId, season) {
      return Object.values(read().episodes)
        .filter(item => item.titleId === titleId && (season === undefined || item.season === season))
        .sort((a, b) => a.season - b.season || a.episode - b.episode);
    },
    async getProgress(uid, progressKey) {
      return read().users[uid]?.progress[progressKey] || null;
    },
    async setProgress(uid, progressKey, value) {
      update(data => { user(data, uid).progress[progressKey] = { ...value, updatedAt: Date.now() }; });
    },
    async listProgress(uid, limit) {
      return Object.values(read().users[uid]?.progress || {}).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
    },
    async getPreferences(uid, profileId) {
      return read().users[uid]?.preferences[profileId] || null;
    },
    async setPreferences(uid, profileId, value) {
      update(data => {
        const prefs = user(data, uid).preferences;
        prefs[profileId] = { ...prefs[profileId], ...value, updatedAt: Date.now() };
      });
    },
    async putTitle(id, value) {
      update(data => { data.titles[id] = value; });
    },
    async putEpisode(titleId, season, episode, value) {
      update(data => { data.episodes[key(titleId, season, episode)] = value; });
    },
  };
}
