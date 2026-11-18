import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../lib/firebase.js';

export const episodeDocId = (titleId, season, episode) => `${titleId}_s${season}e${episode}`;

const millis = value => (value?.toMillis ? value.toMillis() : value ?? null);
const withTime = data => (data ? { ...data, updatedAt: millis(data.updatedAt) } : null);

/** Stockage Firestore (production). Schéma détaillé dans docs/VIDEO.md. */
export function createFirestoreStore(config) {
  const db = adminDb(config);
  const user = uid => db.collection('users').doc(uid);

  return {
    async getTitle(id) {
      const snap = await db.collection('titles').doc(id).get();
      return snap.exists ? { id: snap.id, ...snap.data() } : null;
    },
    async getEpisode(titleId, season, episode) {
      const snap = await db.collection('episodes').doc(episodeDocId(titleId, season, episode)).get();
      return snap.exists ? snap.data() : null;
    },
    async listEpisodes(titleId, season) {
      let query = db.collection('episodes').where('titleId', '==', titleId);
      if (season !== undefined) query = query.where('season', '==', season);
      const snap = await query.get();
      return snap.docs.map(doc => doc.data()).sort((a, b) => a.season - b.season || a.episode - b.episode);
    },
    async getProgress(uid, key) {
      const snap = await user(uid).collection('progress').doc(key).get();
      return snap.exists ? withTime(snap.data()) : null;
    },
    async setProgress(uid, key, data) {
      await user(uid).collection('progress').doc(key).set({ ...data, updatedAt: FieldValue.serverTimestamp() });
    },
    async listProgress(uid, limit, profileId) {
      let query = user(uid).collection('progress');
      if (profileId) query = query.where('profileId', '==', profileId);
      const snap = await query.orderBy('updatedAt', 'desc').limit(limit).get();
      return snap.docs.map(doc => withTime(doc.data()));
    },
    async getPreferences(uid, profileId) {
      const snap = await user(uid).collection('preferences').doc(profileId).get();
      return snap.exists ? snap.data() : null;
    },
    async setPreferences(uid, profileId, data) {
      await user(uid).collection('preferences').doc(profileId).set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    },
    // Écritures du catalogue : réservées à scripts/encode/seed.mjs.
    async putTitle(id, data) {
      await db.collection('titles').doc(id).set({ ...data, updatedAt: FieldValue.serverTimestamp() });
    },
    async putEpisode(titleId, season, episode, data) {
      await db.collection('episodes').doc(episodeDocId(titleId, season, episode)).set({ ...data, updatedAt: FieldValue.serverTimestamp() });
    },
  };
}
