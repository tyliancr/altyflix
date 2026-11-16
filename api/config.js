import { z } from 'zod';

const list = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean);

const schema = z.object({
  // Origines autorisées par CORS (séparées par des virgules).
  ALLOWED_ORIGINS: z.string().default('https://altyflix.netlify.app'),
  // Secret HMAC partagé entre l'API et le CDN (Worker). 32 caractères minimum.
  PLAYBACK_SIGNING_SECRET: z.string().min(32, 'PLAYBACK_SIGNING_SECRET doit faire au moins 32 caractères.'),
  // Durée de validité d'une URL de lecture, en secondes.
  PLAYBACK_URL_TTL: z.coerce.number().int().min(300).max(86400).default(21600),
  // Racine publique des médias : https://media.exemple.fr en production, http://localhost:3100/media en local.
  MEDIA_BASE_URL: z.string().url(),
  // Dossier servi par le serveur local sous /media (inutilisé en production).
  MEDIA_LOCAL_DIR: z.string().default('media'),
  // "firestore" en production, "file" pour développer sans compte de service.
  DATA_BACKEND: z.enum(['firestore', 'file']).default('firestore'),
  DATA_FILE: z.string().default('.data/video-store.json'),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  VIDEO_API_PORT: z.coerce.number().int().default(3100),
});

let cached;

export function loadConfig(env = process.env) {
  if (cached) return cached;
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map(issue => `  - ${issue.path.join('.')} : ${issue.message}`).join('\n');
    throw new Error(`Configuration de l'API vidéo invalide (voir .env.example) :\n${details}`);
  }
  const data = parsed.data;
  cached = {
    allowedOrigins: list(data.ALLOWED_ORIGINS),
    signingSecret: data.PLAYBACK_SIGNING_SECRET,
    playbackTtl: data.PLAYBACK_URL_TTL,
    mediaBaseUrl: data.MEDIA_BASE_URL.replace(/\/+$/, ''),
    mediaLocalDir: data.MEDIA_LOCAL_DIR,
    dataBackend: data.DATA_BACKEND,
    dataFile: data.DATA_FILE,
    firebase: {
      projectId: data.FIREBASE_PROJECT_ID,
      clientEmail: data.FIREBASE_CLIENT_EMAIL,
      // Les hébergeurs stockent souvent la clé avec des "\n" littéraux.
      privateKey: data.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    port: data.VIDEO_API_PORT,
  };
  return cached;
}
