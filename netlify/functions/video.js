// Fonction Netlify de l'API vidéo (voir api/ et docs/VIDEO.md).
import serverless from 'serverless-http';
import { createApp } from '../../api/app.js';
import { loadConfig } from '../../api/config.js';
import { createStore } from '../../api/store/index.js';
import { adminAuth } from '../../api/lib/firebase.js';

let cached;

async function getHandler() {
  if (!cached) {
    const config = loadConfig();
    if (config.dataBackend !== 'firestore') throw new Error('DATA_BACKEND doit valoir "firestore" en production.');
    const store = await createStore(config);
    const auth = adminAuth(config);
    // Pas de devUid ni de /media ici : l'authentification est toujours vérifiée, les médias sont servis par le CDN.
    cached = serverless(createApp({ config, store, verifyIdToken: token => auth.verifyIdToken(token) }));
  }
  return cached;
}

export const handler = async (event, context) => {
  try {
    return await (await getHandler())(event, context);
  } catch (error) {
    console.error('[video] Démarrage impossible :', error);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: { code: 'internal_error', message: 'Erreur interne.' } }) };
  }
};
