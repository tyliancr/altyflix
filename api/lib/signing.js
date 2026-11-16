import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * URLs de lecture signées.
 *
 * Le jeton est placé dans le CHEMIN, pas dans la query string :
 *   <base>/<exp>-<profondeur>-<signature>/titles/mon-film/master.m3u8
 *
 * Les playlists HLS utilisent des URLs relatives ; chaque playlist, segment, sous-titre et
 * miniature hérite donc du jeton sans réécriture, y compris avec le HLS natif de Safari.
 * La signature couvre l'expiration et les <profondeur> premiers segments du chemin (le
 * dossier du titre) : un jeton ne donne accès qu'à ce dossier.
 *
 * Le Worker Cloudflare (api/worker/media-worker.js) applique le même algorithme.
 */

function hmac(secret, exp, scope) {
  return createHmac('sha256', secret).update(`${exp}:${scope}`).digest('base64url');
}

const clean = value => String(value).replace(/^\/+|\/+$/g, '');

export function signMediaPath(mediaDir, { secret, ttl, now = Date.now() }) {
  const scope = clean(mediaDir);
  const depth = scope.split('/').length;
  const exp = Math.floor(now / 1000) + ttl;
  return { token: `${exp}-${depth}-${hmac(secret, exp, scope)}`, expiresAt: new Date(exp * 1000).toISOString(), scope };
}

export function signedMediaUrl(baseUrl, mediaDir, file, options) {
  const { token, expiresAt, scope } = signMediaPath(mediaDir, options);
  return { url: `${baseUrl}/${token}/${scope}/${clean(file)}`, base: `${baseUrl}/${token}/${scope}/`, expiresAt };
}

/** Vérifie "/<token>/<chemin>" et renvoie le chemin du fichier, ou null si le jeton est invalide ou expiré. */
export function verifyMediaPath(pathname, { secret, now = Date.now() }) {
  const [token, ...segments] = clean(pathname).split('/');
  const match = /^(\d{10})-(\d{1,2})-([A-Za-z0-9_-]{43})$/.exec(token || '');
  if (!match) return null;
  const exp = Number(match[1]);
  const depth = Number(match[2]);
  if (exp * 1000 < now || depth < 1 || segments.length <= depth) return null;
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) return null;
  const expected = Buffer.from(hmac(secret, exp, segments.slice(0, depth).join('/')));
  const given = Buffer.from(match[3]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return segments.join('/');
}
