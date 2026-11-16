import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { verifyMediaPath } from './lib/signing.js';
import { requireAuth } from './middleware/auth.js';
import { createRoutes } from './routes.js';

/**
 * Construit l'application Express.
 *  - verifyIdToken : fonction de vérification des ID tokens Firebase (firebase-admin).
 *  - devUid        : court-circuite l'authentification (serveur local uniquement).
 *  - serveMedia    : sert aussi les fichiers HLS locaux sous /media (serveur local uniquement).
 */
export function createApp({ config, store, verifyIdToken, devUid, serveMedia = false }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // derrière le proxy Netlify : l'IP du client est dans X-Forwarded-For

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    // Sans en-tête Origin (curl, même origine), CORS ne s'applique pas ; sinon l'origine doit être dans la liste.
    origin: (origin, callback) => callback(null, !origin || config.allowedOrigins.includes(origin)),
    methods: ['GET', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  }));

  if (serveMedia) {
    const root = path.resolve(config.mediaLocalDir);
    app.use('/media', (req, res) => {
      const file = req.method === 'GET' || req.method === 'HEAD' ? verifyMediaPath(req.path, { secret: config.signingSecret }) : null;
      if (!file) return res.status(403).json({ error: { code: 'forbidden', message: 'Lien de lecture invalide ou expiré.' } });
      res.sendFile(file, { root, dotfiles: 'deny', cacheControl: false }, error => {
        if (error && !res.headersSent) res.status(404).end();
      });
    });
  }

  app.use(rateLimit({
    windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Trop de requêtes. Réessayez dans une minute.' } },
  }));
  app.use(express.json({ limit: '4kb' }));
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });

  const routes = createRoutes({ store, config, auth: requireAuth({ verifyIdToken, devUid }) });
  // Netlify transmet le chemin d'origine (/api/...) ou celui de la fonction selon le mode d'appel.
  app.use(['/api', '/.netlify/functions/video'], routes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
