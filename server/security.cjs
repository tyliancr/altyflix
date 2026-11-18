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

const SUBTITLE_AD_PATTERN = /(?:opensubtitles|osdb\.link|subtitles\.org|tryray\.app|appuyez sur lecture|une seule app|plus de 200 langues|watch online movies|devenez membre vip|become vip|advertise your product|support us and|sous-titres\.eu|addic7ed|subscene|yifysubtitles|podnapisi|best watched using|sync(?:ed)?\s*(?:&|and)\s*correct|resync(?:ed)?\s*by|allsubs\.org|tvsubtitles|subdivx)/i;

function decodeSubtitleBuffer(buf) {
  if (!buf || !buf.length) return '';
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buf);
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buf);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

function cleanSubtitleToVtt(rawText) {
  let text = String(rawText || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  // Normaliser les timestamps SRT (00:01:02,345 ou 0:01:02,345 -> 00:01:02.345)
  text = text.replace(/\b(\d{1,2}):(\d{2}:\d{2}),(\d{3})\b/g, (_m, h, rest, ms) => `${h.padStart(2, '0')}:${rest}.${ms}`);
  const blocks = text.split(/\n{2,}/);
  const kept = [];
  const timeRe = /^\d{1,2}:\d{2}(?::\d{2})?\.\d{3}\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?\.\d{3}/;

  for (const rawBlock of blocks) {
    const lines = rawBlock.split('\n').map(l => l.trimEnd());
    const timeIdx = lines.findIndex(l => timeRe.test(l.trim()));
    if (timeIdx === -1) continue;
    const payload = lines.slice(timeIdx + 1).filter(l => l.trim().length > 0);
    if (payload.length === 0) continue;
    if (payload.some(l => SUBTITLE_AD_PATTERN.test(l))) continue;
    kept.push(`${lines[timeIdx].trim()}\n${payload.join('\n')}`);
  }

  if (kept.length === 0) {
    const fallback = text.trim();
    return fallback.startsWith('WEBVTT') ? fallback : `WEBVTT\n\n${fallback}`;
  }
  return `WEBVTT\n\n${kept.join('\n\n')}`;
}

function buildSubtitleHint(s) {
  const raw = `${s.SubFileName || ''} ${s.MovieReleaseName || ''}`.toLowerCase();
  const parts = [];
  if (/\bextended\b/.test(raw)) parts.push('Extended');
  else if (/\bunrated\b/.test(raw)) parts.push('Unrated');
  else if (/\bdirector/.test(raw)) parts.push('Director');
  if (/\b(?:blu-?ray|bdrip|brrip)\b/.test(raw)) parts.push('BluRay');
  else if (/\bweb-?(?:dl|rip)\b/.test(raw)) parts.push('WEB');
  else if (/\bdvd(?:rip)?\b/.test(raw)) parts.push('DVDRip');
  const fpsNum = parseFloat(s.MovieFPS);
  if (Number.isFinite(fpsNum) && fpsNum >= 23 && fpsNum <= 30) {
    parts.push(Math.abs(fpsNum - 25) < 0.2 ? '25fps' : (Math.abs(fpsNum - 23.976) < 0.2 ? '23.976' : `${fpsNum.toFixed(0)}fps`));
  }
  if (String(s.SubHearingImpaired) === '1') parts.push('SDH');
  return parts.slice(0, 2).join(' · ');
}

function rankOpenSubtitles(osList, { filename = '', limit = 4 } = {}) {
  if (!Array.isArray(osList)) return [];
  const fnLower = String(filename || '').toLowerCase();
  const isSplitRe = /\b(?:cd|disc|disk|part)[\s._-]?[123]\b/i;
  const genericTokens = new Set(['french', 'truefrench', 'vff', 'vfq', 'vostfr', 'multi', '1080p', '720p', '2160p', '480p', 'x264', 'h264', 'x265', 'h265', 'hevc', 'xvid', 'divx', 'ac3', 'eac3', 'dts', 'aac', 'mp3', 'mkv', 'mp4', 'avi', 'srt', 'bluray', 'bdrip', 'brrip', 'dvdrip', 'webrip', 'webdl']);
  const fnTokens = fnLower
    ? fnLower.replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length >= 4 && !genericTokens.has(t))
    : [];

  const fnExtended = /\bextended\b/.test(fnLower);
  const fnUnrated = /\bunrated\b/.test(fnLower);
  const fnDirector = /\bdirector/.test(fnLower);
  const fnDoubleEp = /\bs\d+e\d+(?:and|[-._]?e)\d+\b/i.test(fnLower);
  const fnIsDvdPal = /\b(?:dvdrip|pal|dvd)\b/.test(fnLower) && !/\b(?:bluray|bdrip|brrip|web-?dl|ntsc)\b/.test(fnLower);
  const fnIsHd24 = /\b(?:bluray|bdrip|brrip|web-?dl|webrip|1080p|2160p|4k)\b/.test(fnLower) && !/\b(?:dvdrip|pal)\b/.test(fnLower);

  const candidates = osList.filter(s => {
    if (!s?.SubDownloadLink || !isAllowedSubtitleUrl(s.SubDownloadLink)) return false;
    const fmt = String(s.SubFormat || 'srt').toLowerCase();
    if (fmt && fmt !== 'srt' && fmt !== 'vtt') return false;
    const nameStr = `${s.SubFileName || ''} ${s.MovieReleaseName || ''}`;
    if (isSplitRe.test(nameStr)) return false;
    return true;
  });

  const scored = candidates.map(s => {
    const raw = `${s.SubFileName || ''} ${s.MovieReleaseName || ''}`.toLowerCase();
    let score = 0;

    // Popularité et note OpenSubtitles
    const downloads = parseInt(s.SubDownloadsCnt || '0', 10) || 0;
    score += Math.min(1500, Math.log10(downloads + 1) * 400);
    score += (parseFloat(s.SubRating) || 0) * 40;
    if (String(s.SubHearingImpaired) === '1') score -= 1200;

    if (fnLower) {
      const subExtended = /\bextended\b/.test(raw);
      const subUnrated = /\bunrated\b/.test(raw);
      const subDirector = /\bdirector/.test(raw);
      if (fnExtended && subExtended) score += 8000;
      else if (fnExtended !== subExtended) score -= 6000;
      if (fnUnrated && subUnrated) score += 6000;
      else if (fnUnrated !== subUnrated) score -= 4500;
      if (fnDirector && subDirector) score += 6000;
      else if (fnDirector !== subDirector) score -= 4500;

      const subDoubleEp = /\bs\d+e\d+(?:and|[-._]?e)\d+\b/i.test(raw);
      if (fnDoubleEp && subDoubleEp) score += 2000;

      // Correspondance de source (DVDRip / BluRay / WEB)
      if (/\bdvd(?:rip)?\b/.test(fnLower) && /\bdvd(?:rip)?\b/.test(raw)) score += 2500;
      if (/\b(?:blu-?ray|bdrip|brrip)\b/.test(fnLower) && /\b(?:blu-?ray|bdrip|brrip)\b/.test(raw)) score += 2500;
      if (/\bweb-?(?:dl|rip)\b/.test(fnLower) && /\bweb-?(?:dl|rip)\b/.test(raw)) score += 2500;

      // Correspondance FPS (PAL 25fps vs BluRay/WEB 23.976fps)
      const fps = parseFloat(s.MovieFPS) || 0;
      if (fnIsDvdPal && Math.abs(fps - 25) < 0.25) score += 2600;
      if (fnIsDvdPal && Math.abs(fps - 23.976) < 0.25) score -= 1800;
      if (fnIsHd24 && (Math.abs(fps - 23.976) < 0.25 || Math.abs(fps - 24) < 0.25)) score += 2200;
      if (fnIsHd24 && Math.abs(fps - 25) < 0.25) score -= 1600;

      // Correspondance des tokens de release
      let tokenHits = 0;
      for (const tok of fnTokens) {
        if (raw.includes(tok)) tokenHits++;
      }
      score += Math.min(2500, tokenHits * 500);
    }

    return { item: s, score, hint: buildSubtitleHint(s) };
  });

  scored.sort((a, b) => b.score - a.score);

  // Dédupliquer par URL de téléchargement
  const seen = new Set();
  const out = [];
  for (const entry of scored) {
    if (seen.has(entry.item.SubDownloadLink)) continue;
    seen.add(entry.item.SubDownloadLink);
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

module.exports = {
  SECURITY_HEADERS,
  HttpError,
  positiveInteger,
  validateStreams,
  arteLimit,
  tmdbUrl,
  BoundedCache,
  fetchJson,
  createRateLimiter,
  isAllowedSubtitleUrl,
  readBoundedBuffer,
  decodeSubtitleBuffer,
  cleanSubtitleToVtt,
  rankOpenSubtitles
};
