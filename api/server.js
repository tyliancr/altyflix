/**
 * Serveur local de l'API vidéo : `npm run video-api`.
 * Sert aussi les fichiers HLS de MEDIA_LOCAL_DIR sous /media, avec la même vérification
 * de jeton que le CDN de production.
 */
import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createStore } from './store/index.js';

const config = loadConfig();
const store = await createStore(config);

// Contournement de l'authentification pour les tests locaux : jamais en production.
const devUid = process.env.NODE_ENV !== 'production' ? process.env.AUTH_DEV_UID || undefined : undefined;

let verifyIdToken = async () => { throw new Error('firebase-admin non configuré'); };
if (!devUid) {
  const { adminAuth } = await import('./lib/firebase.js');
  const auth = adminAuth(config);
  verifyIdToken = token => auth.verifyIdToken(token);
}

const app = createApp({ config, store, verifyIdToken, devUid, serveMedia: true });
const bindHost = devUid ? '127.0.0.1' : undefined;
app.listen(config.port, bindHost, () => {
  console.log(`API vidéo ALTYFLIX : http://${bindHost || 'localhost'}:${config.port}/api  (données : ${config.dataBackend})`);
  if (devUid) console.warn(`⚠ AUTH_DEV_UID actif (localhost uniquement) : toutes les requêtes sont traitées comme l'utilisateur "${devUid}".`);
});
