/**
 * ALTYFLIX — Unified Netlify Function (/api/*)
 * 100 % Serverless sur Netlify (zéro Render requis, zéro exposition de clés API).
 * Réutilise directement les modules sécurisés server/stream-resolver.cjs et server/security.cjs.
 */

import zlib from 'node:zlib';
import streamResolver from '../../server/stream-resolver.cjs';
import security from '../../server/security.cjs';

const { resolveStreamsServer, checkStreamStatus } = streamResolver;
const { SECURITY_HEADERS, HttpError, arteLimit, tmdbUrl, BoundedCache, fetchJson } = security;

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

const DOCUMENTARY_CATEGORIES = [
  { id: 'all', name: 'Tous les Documentaires', icon: '🎬' },
  { id: 'nature', name: 'Nature & Environnement', icon: '🌿' },
  { id: 'history', name: 'Histoire & Civilisations', icon: '📜' },
  { id: 'science', name: 'Sciences & Espace', icon: '🚀' },
  { id: 'crime', name: 'Enquêtes & True Crime', icon: '🔍' },
  { id: 'sport', name: 'Sport & Exploits', icon: '🏆' },
  { id: 'society', name: 'Société & Géopolitique', icon: '🌍' }
];

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-debrid-token, x-debrid-provider, x-frenchio-url',
      ...extraHeaders
    }
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...SECURITY_HEADERS,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-debrid-token, x-debrid-provider, x-frenchio-url'
      }
    });
  }

  if (!['GET', 'HEAD', 'POST'].includes(req.method)) {
    return jsonResponse({ success: false, error: 'Méthode non autorisée.' }, 405, {
      Allow: 'GET, HEAD, POST, OPTIONS'
    });
  }

  const parsedUrl = new URL(req.url);
  const pathname = parsedUrl.pathname;
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

    try {
      const result = await resolveStreamsServer({
        id,
        imdbId,
        type,
        season: parseInt(season, 10) || 1,
        episode: parseInt(episode, 10) || 1,
        lang,
        title,
        userProvider,
        userToken,
        userFrenchioUrl
      });
      return jsonResponse(result, 200, { 'Cache-Control': 'no-store' });
    } catch (err) {
      console.error('[Netlify API /api/stream-resolve] Error:', err);
      return jsonResponse({
        success: false,
        status: 'error',
        error: 'Erreur lors de la résolution du flux : ' + err.message
      }, 500);
    }
  }

  // 4. Polling d'état d'un flux en débridage
  if (pathname === '/api/stream-poll') {
    const targetUrl = query.url;
    if (!targetUrl) {
      return jsonResponse({ success: false, status: 'error', error: 'Paramètre url manquant.' }, 400);
    }
    try {
      const statusData = await checkStreamStatus(targetUrl);
      return jsonResponse(statusData, 200, { 'Cache-Control': 'no-store' });
    } catch (err) {
      return jsonResponse({
        success: false,
        status: 'error',
        error: 'Erreur lors de la vérification : ' + err.message
      }, 500);
    }
  }

  // 5. Redirection directe pour /api/video-stream (sur Netlify serverless sans FFmpeg)
  if (pathname === '/api/video-stream') {
    const targetUrl = query.url;
    if (!targetUrl || !targetUrl.startsWith('http')) {
      return jsonResponse({ error: 'URL invalide.' }, 400);
    }
    return new Response(null, {
      status: 302,
      headers: {
        ...SECURITY_HEADERS,
        Location: targetUrl,
        'Cache-Control': 'no-store'
      }
    });
  }

  // 6. Sous-titres VTT proxy & décompression gzip
  if (pathname === '/api/subtitles-vtt') {
    const targetUrl = query.url;
    if (!targetUrl || !targetUrl.startsWith('http')) {
      return jsonResponse({ error: 'URL invalide.' }, 400);
    }
    try {
      const vttRes = await fetch(targetUrl, {
        headers: { 'User-Agent': 'TemporaryUserAgent' },
        signal: AbortSignal.timeout(8000)
      });
      if (!vttRes.ok) return jsonResponse({ error: 'Erreur sous-titre' }, vttRes.status);
      const rawBuf = Buffer.from(await vttRes.arrayBuffer());
      let text;
      if (rawBuf.length >= 2 && rawBuf[0] === 0x1f && rawBuf[1] === 0x8b) {
        try { text = zlib.gunzipSync(rawBuf).toString('utf8'); }
        catch { text = rawBuf.toString('utf8'); }
      } else {
        text = rawBuf.toString('utf8');
      }

      if (!text.trim().startsWith('WEBVTT')) {
        text = 'WEBVTT\n\n' + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      }
      text = text
        .replace(/.*(?:opensubtitles|osdb\.link|subtitles\.org|devenez membre vip|advertisement).*\n?/gi, '')
        .trim();

      return new Response(text, {
        status: 200,
        headers: {
          ...SECURITY_HEADERS,
          'Content-Type': 'text/vtt; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    } catch (err) {
      return jsonResponse({ error: 'Échec sous-titres : ' + err.message }, 502);
    }
  }

  // 7. Sous-titres multi-sources (OpenSubtitles REST + Stremio v3)
  if (pathname === '/api/subtitles') {
    const { id, type = 'movie', season = 1, episode = 1 } = query;
    try {
      let imdbId = null;
      if (TMDB_API_KEY && id) {
        try {
          const extUrl = type === 'tv'
            ? `https://api.themoviedb.org/3/tv/${id}/external_ids?api_key=${TMDB_API_KEY}`
            : `https://api.themoviedb.org/3/movie/${id}/external_ids?api_key=${TMDB_API_KEY}`;
          const extRes = await fetch(extUrl, { signal: AbortSignal.timeout(3500) });
          if (extRes.ok) {
            const extData = await extRes.json();
            imdbId = extData.imdb_id;
          }
        } catch {
          // Ignore TMDB fallback error
        }
      }

      const formatted = [];
      const cleanImdb = imdbId ? imdbId.replace('tt', '') : null;

      if (cleanImdb) {
        try {
          const osUrlFr = type === 'tv'
            ? `https://rest.opensubtitles.org/search/sublanguageid-fre/imdbid-${cleanImdb}/season-${season}/episode-${episode}`
            : `https://rest.opensubtitles.org/search/sublanguageid-fre/imdbid-${cleanImdb}`;
          const osRes = await fetch(osUrlFr, { headers: { 'User-Agent': 'TemporaryUserAgent' }, signal: AbortSignal.timeout(4000) });
          if (osRes.ok) {
            const osData = await osRes.json();
            if (Array.isArray(osData)) {
              osData.slice(0, 3).forEach((s, idx) => {
                if (s.SubDownloadLink) {
                  formatted.push({
                    id: `fr-os-${idx}`,
                    label: idx === 0 ? 'Français' : `Français [${idx + 1}]`,
                    lang: 'fr',
                    url: `/api/subtitles-vtt?url=${encodeURIComponent(s.SubDownloadLink)}`
                  });
                }
              });
            }
          }
        } catch {
          // Ignore OpenSubtitles FR error
        }
      }

      if (formatted.length === 0 && imdbId) {
        try {
          const stremPath = type === 'tv'
            ? `https://opensubtitles-v3.strem.io/subtitles/series/${imdbId}:${season}:${episode}.json`
            : `https://opensubtitles-v3.strem.io/subtitles/movie/${imdbId}.json`;
          const stremRes = await fetch(stremPath, { signal: AbortSignal.timeout(3500) });
          if (stremRes.ok) {
            const data = await stremRes.json();
            const list = Array.isArray(data?.subtitles) ? data.subtitles : [];
            list.slice(0, 3).forEach((s, idx) => {
              if (s.url) {
                formatted.push({
                  id: `strem-${idx}`,
                  label: s.lang === 'eng' ? (idx === 0 ? 'English' : `English [${idx + 1}]`) : (s.lang || 'Piste ' + (idx + 1)),
                  lang: s.lang || 'en',
                  url: `/api/subtitles-vtt?url=${encodeURIComponent(s.url)}`
                });
              }
            });
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

export const config = {
  path: ['/api', '/api/*']
};
