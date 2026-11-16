import { unauthorized } from '../lib/errors.js';

/**
 * Vérifie l'ID token Firebase envoyé en "Authorization: Bearer <token>" et pose req.uid.
 *
 * devUid : identifiant imposé SANS vérification. Il n'est transmis que par le serveur local
 * (api/server.js, variable AUTH_DEV_UID) ; la fonction Netlify ne le transmet jamais.
 */
export function requireAuth({ verifyIdToken, devUid }) {
  return async (req, _res, next) => {
    try {
      if (devUid) {
        req.uid = devUid;
        return next();
      }
      const header = req.get('authorization') || '';
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
      if (!token) throw unauthorized();
      try {
        const decoded = await verifyIdToken(token);
        req.uid = decoded.uid;
      } catch {
        throw unauthorized('Session expirée ou jeton invalide.');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
