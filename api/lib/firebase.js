import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let app;

/** Initialise firebase-admin une seule fois (les fonctions serverless réutilisent le processus). */
export function getAdminApp(config) {
  if (app) return app;
  if (getApps().length) return (app = getApps()[0]);
  const { projectId, clientEmail, privateKey } = config.firebase;
  if (clientEmail && privateKey) {
    app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIRESTORE_EMULATOR_HOST) {
    app = initializeApp({ credential: applicationDefault(), projectId });
  } else {
    throw new Error('Compte de service Firebase manquant : renseignez FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY.');
  }
  return app;
}

export const adminAuth = config => getAuth(getAdminApp(config));
export const adminDb = config => getFirestore(getAdminApp(config));
