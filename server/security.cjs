const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(), payment=()',
  'Content-Security-Policy': "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function positiveInteger(value, max = 1000000000) {
  return /^\d{1,10}$/.test(String(value)) && Number(value) > 0 && Number(value) <= max;
}
function validateStreams({ id, type = 'movie', season = 1, episode = 1, lang }) {
  if (!positiveInteger(id) || !['movie', 'tv'].includes(type) ||
      !positiveInteger(season, 10000) || !positiveInteger(episode, 10000) ||
      (lang !== undefined && !['vf', 'vost', 'vostfr', 'all'].includes(String(lang).toLowerCase()))) {
    throw new HttpError(400, 'Paramètres de lecture invalides.');
  }
}
function arteLimit(value = 20) {
  if (!positiveInteger(value, 100)) throw new HttpError(400, 'La limite doit être comprise entre 1 et 100.');
  return Number(value);
}

const TMDB_PATH = /^(?:trending\/(?:all|movie|tv|person)\/(?:day|week)|(?:movie|tv)\/(?:popular|top_rated|now_playing|upcoming|airing_today|on_the_air)|(?:movie|tv|person)\/\d+(?:\/(?:videos|recommendations|similar|credits|images|external_ids|combined_credits|movie_credits|tv_credits))?|tv\/\d+\/season\/\d+(?:\/episode\/\d+)?(?:\/external_ids)?|search\/(?:multi|movie|tv|person)|discover\/(?:movie|tv)|genre\/(?:movie|tv)\/list)$/;
const QUERY_KEYS = new Set(['language','page','query','include_adult','include_video','include_image_language','include_video_language','append_to_response','region','sort_by','timezone','include_null_first_air_dates','certification_country','certification.lte','with_genres','without_genres','with_keywords','with_original_language','with_origin_country','with_watch_providers','watch_region','with_watch_monetization_types','year','primary_release_year','first_air_date_year','with_networks','with_status','with_type','with_people']);
function tmdbUrl(path, params, key) {
  if (!TMDB_PATH.test(path) || path.length > 180) throw new HttpError(400, 'Chemin TMDB non autorisé.');
  if (!key) throw new HttpError(503, 'Le service catalogue doit être configuré.');
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  for (const [name, raw] of new URLSearchParams(params)) {
    if (name === 'api_key') continue;
    const value = String(raw);
    if (!(QUERY_KEYS.has(name) || /^(?:primary_release_date|release_date|first_air_date|air_date|vote_count|vote_average|with_runtime)\.(?:gte|lte)$/.test(name)) || value.length > 500) {
      throw new HttpError(400, 'Paramètre TMDB non autorisé.');
    }
    if (name === 'page' && !positiveInteger(value, 500)) throw new HttpError(400, 'Page invalide.');
    url.searchParams.set(name, value);
  }
  if (url.search.length > 3500) throw new HttpError(400, 'Requête trop longue.');
  if (!url.searchParams.has('language')) url.searchParams.set('language', 'fr-FR');
  url.searchParams.set('api_key', key);
  url.searchParams.sort();
  return url;
}

class BoundedCache {
  constructor(max = 250) { this.max = max; this.entries = new Map(); }
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expires <= Date.now()) { this.entries.delete(key); return null; }
    return entry.value;
  }
  set(key, value, ttl = 600000) {
    this.entries.delete(key);
    while (this.entries.size >= this.max) this.entries.delete(this.entries.keys().next().value);
    this.entries.set(key, { value, expires: Date.now() + ttl });
  }
}

async function fetchJson(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000), redirect: 'error' });
    if (!response.ok) throw new HttpError(response.status === 404 ? 404 : 502, 'Le service externe est indisponible.');
    return await response.json();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'Le service externe est indisponible.');
  }
}

// Per-process protection. A shared CDN/WAF limit is still needed at deployment.
function createRateLimiter(max = 120, windowMs = 60000) {
  const clients = new Map();
  return key => {
    const now = Date.now();
    for (const [id, entry] of clients) if (entry.reset <= now) clients.delete(id);
    if (!clients.has(key)) {
      if (clients.size >= 10000) return false;
      clients.set(key, { count: 0, reset: now + windowMs });
    }
    return ++clients.get(key).count <= max;
  };
}
const ALLOWED_SUBTITLE_HOSTS = [
  'dl.opensubtitles.org',
  'rest.opensubtitles.org',
  'opensubtitles.org',
  'opensubtitles-v3.strem.io',
  'subs5.strem.io',
  'strem.io'
];

function isAllowedSubtitleUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
    const host = u.hostname.toLowerCase();
    return ALLOWED_SUBTITLE_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

async function readBoundedBuffer(response, maxBytes = 2 * 1024 * 1024) {
  const lenHeader = Number(response.headers?.get?.('content-length') || 0);
  if (lenHeader > maxBytes) throw new HttpError(413, 'Fichier sous-titre trop volumineux.');
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > maxBytes) throw new HttpError(413, 'Fichier sous-titre trop volumineux.');
    return buf;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch {}
        throw new HttpError(413, 'Fichier sous-titre trop volumineux.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  return Buffer.concat(chunks, total);
}

module.exports = { SECURITY_HEADERS, HttpError, positiveInteger, validateStreams, arteLimit, tmdbUrl, BoundedCache, fetchJson, createRateLimiter, isAllowedSubtitleUrl, readBoundedBuffer };
