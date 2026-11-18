/**
 * ALTYFLIX — Unified Netlify Function (/.netlify/functions/api, routée via /api et /api/* dans _redirects)
 * 100 % Serverless sur Netlify (zéro Render requis, zéro exposition de clés API).
 * Réutilise directement les modules sécurisés server/stream-resolver.cjs et server/security.cjs.
 */

import zlib from 'node:zlib';
import { promisify } from 'node:util';
import streamResolver from '../../server/stream-resolver.cjs';
import security from '../../server/security.cjs';

const gunzipAsync = promisify(zlib.gunzip);
const { resolveStreamsServer, checkStreamStatus, normalizeAllowedUrl } = streamResolver;
const {
  SECURITY_HEADERS,
  DOCUMENTARY_CATEGORIES,
  HttpError,
  positiveInteger,
  arteLimit,
  tmdbUrl,
  BoundedCache,
  fetchJson,
  normalizeAllowedSubtitleUrl,
  readBoundedBuffer,
  decodeSubtitleBuffer,
  cleanSubtitleToVtt,
  rankOpenSubtitles
} = security;

const memoryCache = new BoundedCache(200);

function getEnv(name, fallback = '') {
  try {
    const netlifyVal = globalThis.Netlify?.env?.get?.(name);
    if (netlifyVal !== undefined && netlifyVal !== '') return netlifyVal;
  } catch {
    // Hors runtime Netlify
  }
  return process.env[name] || fallback;
}

export function getStreamBackendUrl(rawInput = getEnv('STREAM_BACKEND_URL', '')) {
  const raw = String(rawInput || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return '';
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return '';
    if (parsed.pathname && parsed.pathname !== '/') return '';
    if (parsed.port) {
      const portNum = Number(parsed.port);
      if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) return '';
    }
    const host = parsed.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return '';
    if (host.includes(':') || /^[\d.]+$/.test(host) || /^0x[\da-f]+$/i.test(host)) return '';
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host)) return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

function getCorsOrigin(req) {
  const origin = req?.headers?.get?.('origin') || '';
  if (!origin) return '*';
  const configured = getEnv('ALLOWED_ORIGINS', '');
  const allowed = configured
    ? configured.split(',').map(s => s.trim()).filter(Boolean)
    : ['https://altyflix.netlify.app', 'http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];
  try {
    const reqOrigin = new URL(req.url).origin;
    if (origin === reqOrigin) return origin;
  } catch {}
  return allowed.includes(origin) ? origin : 'null';
}

function makeJsonResponse(req) {
  const corsOrigin = getCorsOrigin(req);
  return function jsonResponse(data, status = 200, extraHeaders = {}) {
    const safeStatus = (status >= 200 && status <= 599 && status !== 204 && status !== 304) ? status : 502;
    return new Response(JSON.stringify(data), {
      status: safeStatus,
      headers: {
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': corsOrigin,
        'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-debrid-token, x-debrid-provider, x-frenchio-url',
        ...extraHeaders
      }
    });
  };
}

export default async function handler(req) {
  const corsOrigin = getCorsOrigin(req);
  const jsonResponse = makeJsonResponse(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...SECURITY_HEADERS,
        'Access-Control-Allow-Origin': corsOrigin,
        'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-debrid-token, x-debrid-provider, x-frenchio-url'
      }
    });
  }

  if (!['GET', 'HEAD'].includes(req.method)) {
    return jsonResponse({ success: false, error: 'Méthode non autorisée.' }, 405, {
      Allow: 'GET, HEAD, OPTIONS'
    });
  }

  const parsedUrl = new URL(req.url);
  // Supporte aussi les appels directs /.netlify/functions/api
  const pathname = parsedUrl.pathname.replace(/^\/\.netlify\/functions\/api/, '/api');
  const query = Object.fromEntries(parsedUrl.searchParams);

  const TMDB_API_KEY = getEnv('TMDB_API_KEY', 'a0819950449844817a0942ca79a4ccb0');
  const SERVER_DEBRID_PROVIDER = getEnv('DEBRID_PROVIDER', 'torbox');
  const SERVER_DEBRID_TOKEN = getEnv('DEBRID_TOKEN') || getEnv('TORBOX_TOKEN') || '';

  // 1. Info & Health
  if (pathname === '/api' || pathname === '/api/' || pathname === '/api/health') {
    return jsonResponse({
      status: 'ok',
      runtime: 'netlify-functions',
      version: '3.0.0',
      debridConfigured: Boolean(SERVER_DEBRID_TOKEN),
      timestamp: new Date().toISOString()
    }, 200, { 'Cache-Control': 'no-store' });
  }

  // 2. Proxy TMDB sécurisé (caché sur le CDN Netlify + RAM)
  if (pathname.startsWith('/api/tmdb/')) {
    try {
      const tmdbPath = pathname.replace('/api/tmdb/', '');
      const upstreamUrl = tmdbUrl(tmdbPath, parsedUrl.searchParams, TMDB_API_KEY);
      const cacheKey = upstreamUrl.toString();
      let data = memoryCache.get(cacheKey);
      if (!data) {
        data = await fetchJson(upstreamUrl);
        memoryCache.set(cacheKey, data);
      }
      return jsonResponse(data, 200, {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600'
      });
    } catch (err) {
      return jsonResponse(
        { success: false, error: err instanceof HttpError ? err.message : 'Service TMDB indisponible.' },
        err.status || 502
      );
    }
  }

  // 3. Résolution de flux sécurisée (TorBox / Torrentio / Cloud TorBox)
  if (pathname === '/api/stream-resolve') {
    const { id, imdbId, type = 'movie', season = 1, episode = 1, lang = 'vf', title = '' } = query;
    const userProvider = req.headers.get('x-debrid-provider') || SERVER_DEBRID_PROVIDER;
    const userToken = req.headers.get('x-debrid-token') || SERVER_DEBRID_TOKEN;
    const userFrenchioUrl = req.headers.get('x-frenchio-url') || query.frenchioUrl || getEnv('FRENCHIO_URL');
    const streamBackendUrl = getStreamBackendUrl();
    const hasRemoteFfmpeg = Boolean(streamBackendUrl);

    try {
      const result = await resolveStreamsServer({
        id,
        imdbId,
        type,
        season: positiveInteger(season, 10000) ? Number(season) : 1,
        episode: positiveInteger(episode, 10000) ? Number(episode) : 1,
        lang,
        title,
        userProvider,
        userToken,
        userFrenchioUrl,
        enableAudioRemux: hasRemoteFfmpeg,
        enableAviTranscode: hasRemoteFfmpeg,
        videoStreamBaseUrl: streamBackendUrl,
        tmdbApiKey: TMDB_API_KEY
      });
      return jsonResponse(result, 200, { 'Cache-Control': 'no-store' });
    } catch (err) {
      console.error('[Netlify API /api/stream-resolve] Error:', err);
      return jsonResponse({
        success: false,
        status: 'error',
        error: 'Erreur interne lors de la résolution du flux.'
      }, 500);
    }
  }

  // 4. Polling d'état d'un flux en débridage
  if (pathname === '/api/stream-poll') {
    const targetUrl = query.url;
    if (!targetUrl) {
      return jsonResponse({ success: false, status: 'error', error: 'Paramètre url manquant.' }, 400);
    }
    const streamBackendUrl = getStreamBackendUrl();
    const hasRemoteFfmpeg = Boolean(streamBackendUrl);
    try {
      const statusData = await checkStreamStatus(targetUrl, '', { enableAviTranscode: hasRemoteFfmpeg });
      if (hasRemoteFfmpeg && typeof statusData?.playbackUrl === 'string' && statusData.playbackUrl.startsWith('/api/video-stream')) {
        statusData.playbackUrl = `${streamBackendUrl}${statusData.playbackUrl}`;
      }
      const rawStatus = statusData.success === false ? (statusData.statusCode || 400) : 200;
      const httpStatus = (rawStatus === 200 || (rawStatus >= 400 && rawStatus <= 599)) ? rawStatus : 502;
      return jsonResponse(statusData, httpStatus, { 'Cache-Control': 'no-store' });
    } catch (err) {
      console.error('[Netlify API /api/stream-poll] Error:', err);
      return jsonResponse({
        success: false,
        status: 'error',
        error: 'Erreur lors de la vérification du flux.'
      }, 500);
    }
  }

  // 5. Redirection sécurisée pour /api/video-stream (relai STREAM_BACKEND_URL si configuré, sinon CDN allowlisté)
  if (pathname === '/api/video-stream') {
    const safeTargetUrl = normalizeAllowedUrl(query.url);
    if (!safeTargetUrl) {
      return jsonResponse({ error: 'URL vidéo non autorisée.' }, 400);
    }
    const streamBackendUrl = getStreamBackendUrl();
    const redirectLocation = streamBackendUrl
      ? `${streamBackendUrl}/api/video-stream${parsedUrl.search}`
      : safeTargetUrl;
    return new Response(null, {
      status: 302,
      headers: {
        ...SECURITY_HEADERS,
        'Access-Control-Allow-Origin': corsOrigin,
        'Vary': 'Origin',
        Location: redirectLocation,
        'Cache-Control': 'no-store'
      }
    });
  }

  // 6. Sous-titres VTT proxy & décompression gzip bornée (anti SSRF + anti Gzip Bomb)
  if (pathname === '/api/subtitles-vtt') {
    const safeTargetUrl = normalizeAllowedSubtitleUrl(query.url);
    if (!safeTargetUrl) {
      return jsonResponse({ error: 'URL de sous-titres non autorisée.' }, 400);
    }
    try {
      let currentUrl = safeTargetUrl;
      let vttRes = null;
      for (let hop = 0; hop < 4; hop++) {
        const safeHop = normalizeAllowedSubtitleUrl(currentUrl);
        if (!safeHop) {
          return jsonResponse({ error: 'Redirection sous-titres non autorisée.' }, 403);
        }
        vttRes = await fetch(safeHop, {
          headers: { 'User-Agent': 'TemporaryUserAgent' },
          redirect: 'manual',
          signal: AbortSignal.timeout(8000)
        });
        if (vttRes.status >= 300 && vttRes.status < 400 && vttRes.headers.get('location')) {
          try { await vttRes.body?.cancel(); } catch {}
          currentUrl = new URL(vttRes.headers.get('location'), safeHop).toString();
          continue;
        }
        break;
      }
      if (!vttRes || (vttRes.status >= 300 && vttRes.status < 400)) {
        try { await vttRes?.body?.cancel(); } catch {}
        return jsonResponse({ error: 'Trop de redirections pour les sous-titres.' }, 502);
      }
      if (!vttRes.ok) {
        const errStatus = (vttRes.status >= 400 && vttRes.status <= 599) ? vttRes.status : 502;
        return jsonResponse({ error: 'Erreur sous-titre.' }, errStatus);
      }
      const rawBuf = await readBoundedBuffer(vttRes, 2 * 1024 * 1024);
      let decodedBuf = rawBuf;
      if (rawBuf.length >= 2 && rawBuf[0] === 0x1f && rawBuf[1] === 0x8b) {
        try {
          decodedBuf = await gunzipAsync(rawBuf, { maxOutputLength: 5 * 1024 * 1024 });
        } catch (gzErr) {
          if (gzErr?.code === 'ERR_BUFFER_TOO_LARGE') {
            throw new HttpError(413, 'Fichier sous-titre trop volumineux après décompression.');
          }
          throw new HttpError(502, 'Fichier sous-titre corrompu.');
        }
      }

      const text = cleanSubtitleToVtt(decodeSubtitleBuffer(decodedBuf));

      return new Response(req.method === 'HEAD' ? null : text, {
        status: 200,
        headers: {
          ...SECURITY_HEADERS,
          'Content-Type': 'text/vtt; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    } catch (err) {
      return jsonResponse(
        { error: err instanceof HttpError ? err.message : 'Service de sous-titres indisponible.' },
        err instanceof HttpError ? err.status : 502
      );
    }
  }

  // 6b. Sous-titres intégrés MKV (relai vers STREAM_BACKEND_URL si configuré, sinon liste vide)
  if (pathname === '/api/embedded-subtitles') {
    const streamBackendUrl = getStreamBackendUrl();
    const safeUrl = normalizeAllowedUrl(query.url);
    if (!streamBackendUrl || !safeUrl) {
      return jsonResponse({ success: true, subtitles: [] });
    }
    try {
      const r = await fetch(`${streamBackendUrl}/api/embedded-subtitles?url=${encodeURIComponent(safeUrl)}`, {
        redirect: 'error',
        signal: AbortSignal.timeout(4000)
      });
      if (!r.ok) return jsonResponse({ success: true, subtitles: [] });
      const data = await r.json();
      const subs = Array.isArray(data?.subtitles)
        ? data.subtitles.map(s => ({
            ...s,
            url: (typeof s.url === 'string' && s.url.startsWith('/api/embedded-subtitles-vtt?')) ? `${streamBackendUrl}${s.url}` : s.url
          }))
        : [];
      return jsonResponse({ success: true, subtitles: subs });
    } catch {
      return jsonResponse({ success: true, subtitles: [] });
    }
  }

  // 7. Sous-titres multi-sources (OpenSubtitles REST FR + EN + Stremio v3)
  if (pathname === '/api/subtitles') {
    const { id, imdbId: queryImdbId, type = 'movie', season = 1, episode = 1, filename = '' } = query;
    const safeType = type === 'tv' ? 'tv' : 'movie';
    const safeSeason = positiveInteger(season, 10000) ? Number(season) : 1;
    const safeEpisode = positiveInteger(episode, 10000) ? Number(episode) : 1;
    const safeFilename = String(filename || '').slice(0, 260);
    try {
      let imdbId = /^tt\d{5,10}$/i.test(String(queryImdbId || '')) ? String(queryImdbId).toLowerCase() : null;
      if (!imdbId && TMDB_API_KEY && positiveInteger(id)) {
        try {
          const extUrl = tmdbUrl(safeType === 'tv' ? `tv/${id}/external_ids` : `movie/${id}/external_ids`, {}, TMDB_API_KEY);
          const extRes = await fetch(extUrl, { signal: AbortSignal.timeout(3500) });
          if (extRes.ok) {
            const extData = await extRes.json();
            if (/^tt\d{5,10}$/.test(String(extData.imdb_id || ''))) {
              imdbId = extData.imdb_id;
            }
          }
        } catch {
          // Ignore TMDB fallback error
        }
      }

      const formatted = [];
      const cleanImdb = imdbId ? imdbId.replace('tt', '') : null;

      if (cleanImdb) {
        const fetchOsLang = async (osLang, timeoutMs) => {
          try {
            const osUrl = safeType === 'tv'
              ? `https://rest.opensubtitles.org/search/sublanguageid-${osLang}/imdbid-${cleanImdb}/season-${safeSeason}/episode-${safeEpisode}`
              : `https://rest.opensubtitles.org/search/sublanguageid-${osLang}/imdbid-${cleanImdb}`;
            const osRes = await fetch(osUrl, { headers: { 'User-Agent': 'TemporaryUserAgent' }, signal: AbortSignal.timeout(timeoutMs) });
            if (!osRes.ok) return [];
            const osData = await osRes.json();
            return Array.isArray(osData) ? osData : [];
          } catch { return []; }
        };

        const [frRaw, enRaw] = await Promise.all([
          fetchOsLang('fre', 4000),
          fetchOsLang('eng', 3500)
        ]);

        rankOpenSubtitles(frRaw, { filename: safeFilename, limit: 4 }).forEach(({ item: s, hint }, idx) => {
          formatted.push({
            id: `fr-os-${idx}`,
            label: idx === 0 ? 'Français' : `Français (Option ${idx + 1})`,
            hint,
            fps: parseFloat(s.MovieFPS) || null,
            lang: 'fr',
            url: `/api/subtitles-vtt?url=${encodeURIComponent(s.SubDownloadLink)}`
          });
        });
        rankOpenSubtitles(enRaw, { filename: safeFilename, limit: 3 }).forEach(({ item: s, hint }, idx) => {
          formatted.push({
            id: `en-os-${idx}`,
            label: idx === 0 ? 'Anglais' : `Anglais (Option ${idx + 1})`,
            hint,
            fps: parseFloat(s.MovieFPS) || null,
            lang: 'en',
            url: `/api/subtitles-vtt?url=${encodeURIComponent(s.SubDownloadLink)}`
          });
        });
      }

      if (formatted.length === 0 && imdbId) {
        try {
          const stremPath = safeType === 'tv'
            ? `https://opensubtitles-v3.strem.io/subtitles/series/${imdbId}:${safeSeason}:${safeEpisode}.json`
            : `https://opensubtitles-v3.strem.io/subtitles/movie/${imdbId}.json`;
          const stremRes = await fetch(stremPath, { redirect: 'error', signal: AbortSignal.timeout(3500) });
          if (stremRes.ok) {
            const data = await stremRes.json();
            const list = Array.isArray(data?.subtitles) ? data.subtitles : [];
            let frAdded = 0;
            let enAdded = 0;
            for (const s of list) {
              const rawLang = String(s.lang || '').toLowerCase();
              const isFr = rawLang === 'fre' || rawLang === 'fra' || rawLang === 'fr';
              const isEn = rawLang === 'eng' || rawLang === 'en';
              if (!isFr && !isEn) continue;
              if (isFr && frAdded >= 3) continue;
              if (isEn && enAdded >= 2) continue;
              const safeSubUrl = normalizeAllowedSubtitleUrl(s.url);
              if (!safeSubUrl) continue;
              if (isFr) {
                frAdded++;
                formatted.push({
                  id: `strem-fr-${frAdded}`,
                  label: frAdded === 1 ? 'Français' : `Français (Option ${frAdded})`,
                  lang: 'fr',
                  url: `/api/subtitles-vtt?url=${encodeURIComponent(safeSubUrl)}`
                });
              } else {
                enAdded++;
                formatted.push({
                  id: `strem-en-${enAdded}`,
                  label: enAdded === 1 ? 'Anglais' : `Anglais (Option ${enAdded})`,
                  lang: 'en',
                  url: `/api/subtitles-vtt?url=${encodeURIComponent(safeSubUrl)}`
                });
              }
            }
          }
        } catch {
          // Ignore Stremio fallback error
        }
      }

      return jsonResponse({ success: true, subtitles: formatted }, 200, {
        'Cache-Control': 'public, max-age=1800'
      });
    } catch {
      return jsonResponse({ success: true, subtitles: [] });
    }
  }

  // 8. Documentaires & ARTE TV
  if (pathname === '/api/documentaries/categories') {
    return jsonResponse({
      success: true,
      total_categories: DOCUMENTARY_CATEGORIES.length,
      categories: DOCUMENTARY_CATEGORIES
    }, 200, { 'Cache-Control': 'public, max-age=3600' });
  }

  if (pathname === '/api/documentaries/arte') {
    try {
      const limit = arteLimit(query.limit);
      const cacheKey = `arte_api_${limit}`;
      const cachedData = memoryCache.get(cacheKey);
      if (cachedData) {
        return jsonResponse({ ...cachedData, cached: true }, 200, { 'Cache-Control': 'public, max-age=900' });
      }

      const data = await fetchJson(`https://api.arte.tv/api/opa/v3/programs/fr?limit=${limit}`);
      const docs = (data.programs || []).map(item => ({
        id: item.id,
        title: item.title,
        subtitle: item.subtitle || '',
        teaser: item.teaserText || item.description || '',
        poster: item.images?.landscape?.url || item.images?.portrait?.url || null,
        duration: item.duration ? Math.round(item.duration / 60) + ' min' : null,
        player_embed: `https://www.arte.tv/player/v7/index.html?json_url=https://api.arte.tv/api/player/v2/config/fr/${item.id}`,
        language: 'VF (Français)'
      }));

      const payload = {
        success: true,
        category: 'Documentaires ARTE TV',
        total: docs.length,
        documentaries: docs
      };
      memoryCache.set(cacheKey, payload, 15 * 60 * 1000);
      return jsonResponse(payload, 200, { 'Cache-Control': 'public, max-age=900' });
    } catch (error) {
      return jsonResponse(
        { success: false, error: error instanceof HttpError ? error.message : 'Service ARTE indisponible.' },
        error.status || 502
      );
    }
  }

  return jsonResponse({ success: false, error: 'Route API introuvable.' }, 404);
}
