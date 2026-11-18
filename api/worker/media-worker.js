/**
 * Worker Cloudflare placé devant le bucket R2 : il vérifie le jeton de lecture puis sert le fichier.
 * Même algorithme que api/lib/signing.js :
 *   /<exp>-<profondeur>-<signature>/titles/mon-film/master.m3u8
 *
 * Liaisons (voir wrangler.toml.example) :
 *   MEDIA                     bucket R2
 *   PLAYBACK_SIGNING_SECRET   secret, identique à celui de l'API
 *   ALLOWED_ORIGINS           origines CORS séparées par des virgules
 */

const TYPES = {
  m3u8: 'application/vnd.apple.mpegurl',
  m4s: 'video/iso.segment',
  mp4: 'video/mp4',
  vtt: 'text/vtt; charset=utf-8',
  jpg: 'image/jpeg',
};

const toBase64Url = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function verify(pathname, secret) {
  const [token, ...segments] = pathname.replace(/^\/+/, '').split('/');
  const match = /^(\d{10})-(\d{1,2})-([A-Za-z0-9_-]{43})$/.exec(token || '');
  if (!match) return null;
  const exp = Number(match[1]);
  const depth = Number(match[2]);
  if (exp * 1000 < Date.now() || depth < 1 || segments.length <= depth) return null;
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return null;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = toBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(`${exp}:${segments.slice(0, depth).join('/')}`)));
  // Comparaison à temps constant.
  let diff = expected.length ^ match[3].length;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (match[3].charCodeAt(i) || 0);
  return diff === 0 ? { key: segments.join('/'), exp } : null;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(item => item.trim());
  const headers = new Headers({ Vary: 'Origin' });
  if (origin && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Range');
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return headers;
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Méthode non autorisée', { status: 405, headers });

    if (!env.PLAYBACK_SIGNING_SECRET) return new Response('Configuration manquante', { status: 503, headers });
    const verified = await verify(new URL(request.url).pathname, env.PLAYBACK_SIGNING_SECRET);
    if (!verified) return new Response('Lien de lecture invalide ou expiré', { status: 403, headers });

    const object = request.method === 'HEAD'
      ? await env.MEDIA.head(verified.key)
      : await env.MEDIA.get(verified.key, { range: request.headers, onlyIf: request.headers });
    if (!object) return new Response('Introuvable', { status: 404, headers });

    headers.set('Content-Type', TYPES[verified.key.split('.').pop()] || 'application/octet-stream');
    headers.set('ETag', object.httpEtag);
    headers.set('Accept-Ranges', 'bytes');
    // Le navigateur peut garder le fichier tant que le jeton est valide, pas au-delà.
    headers.set('Cache-Control', `private, max-age=${Math.max(0, verified.exp - Math.floor(Date.now() / 1000))}`);
    if (request.method === 'HEAD') {
      headers.set('Content-Length', String(object.size));
      return new Response(null, { status: 200, headers });
    }
    if (!('body' in object)) return new Response(null, { status: 304, headers }); // précondition If-None-Match satisfaite
    if (object.range) {
      const offset = 'suffix' in object.range
        ? Math.max(0, object.size - object.range.suffix)
        : (object.range.offset ?? 0);
      const length = 'suffix' in object.range
        ? Math.min(object.range.suffix, object.size)
        : (object.range.length ?? (object.size - offset));
      headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
      headers.set('Content-Length', String(length));
      return new Response(object.body, { status: 206, headers });
    }
    headers.set('Content-Length', String(object.size));
    return new Response(object.body, { status: 200, headers });
  },
};
