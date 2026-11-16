import streamApi from '../../server/stream-api.cjs';
import security from '../../server/security.cjs';
const { SECURITY_HEADERS, HttpError, validateStreams, arteLimit, tmdbUrl, BoundedCache, fetchJson, createRateLimiter } = security;


const TMDB_API_KEY = process.env.TMDB_API_KEY || 'a0819950449844817a0942ca79a4ccb0';

const memoryCache = new BoundedCache(250);
const getCache = key => memoryCache.get(key);
const setCache = (key, value, ttl) => memoryCache.set(key, value, ttl);
const allowRequest = createRateLimiter();

const DOCUMENTARY_CATEGORIES = [
  { id: 'all', name: 'Tous les Documentaires', icon: '🎬' },
  { id: 'nature', name: 'Nature & Environnement', icon: '🌿' },
  { id: 'history', name: 'Histoire & Civilisations', icon: '📜' },
  { id: 'science', name: 'Science & Espace', icon: '🚀' },
  { id: 'truecrime', name: 'Crime & Enquêtes (True Crime)', icon: '🔍' },
  { id: 'society', name: 'Société & Géopolitique', icon: '🌍' },
  { id: 'music', name: 'Musique & Art', icon: '🎨' },
  { id: 'sports', name: 'Sport & Aventure Extrême', icon: '⚽' }
];



function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...SECURITY_HEADERS,
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    body: JSON.stringify(data)
  };
}

export const handler = async function (event, _context) {
  if (!['GET', 'HEAD', 'POST', 'OPTIONS'].includes(event.httpMethod)) return { ...jsonResponse(405, { error: 'Méthode non autorisée.' }), headers: { ...SECURITY_HEADERS, Allow: 'GET, HEAD, POST, OPTIONS', 'Content-Type': 'application/json' } };
  if (!allowRequest(event.headers?.['x-nf-client-connection-ip'] || 'unknown')) return { ...jsonResponse(429, { error: 'Trop de requêtes.' }), headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json', 'Retry-After': '60' } };
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        ...SECURITY_HEADERS,
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    };
  }

  const rawPath = event.path || '';
  const queryParams = event.queryStringParameters || {};

  let pathname = rawPath;
  if (pathname.startsWith('/.netlify/functions/api')) {
    pathname = pathname.replace('/.netlify/functions/api', '');
  }

  const apiPath = pathname.startsWith('/api/') ? pathname : '/api' + pathname;
  if (event.httpMethod === 'POST' && apiPath !== '/api/playback/progress') return jsonResponse(405,{error:'Méthode non autorisée.'});

  if (apiPath === '/api/direct-stream' || pathname === '/api/direct-stream' || pathname === '/direct-stream') {
    const { id, type = 'movie', season = 1, episode = 1, lang = 'vf' } = queryParams;
    try { validateStreams({ id, type, season, episode, lang }); }
    catch (err) { return jsonResponse(err.status || 400, { error: err.message }); }

    const isTv = type === 'tv';
    const fallbackUrl = isTv
      ? `https://vidlink.pro/tv/${id}/${season}/${episode}?primaryColor=e50914&secondaryColor=141414&iconColor=ffffff&title=true&poster=true&autoplay=true`
      : `https://vidlink.pro/movie/${id}?primaryColor=e50914&secondaryColor=141414&iconColor=ffffff&title=true&poster=true&autoplay=true`;

    return jsonResponse(200, {
      success: false,
      tmdb_id: id,
      content_type: type,
      fallbackUrl
    });
  }
      content_type: type,
      fallbackUrl
    });
  }

  const result = await streamApi.handle({path:apiPath, method:event.httpMethod, params:queryParams,
    auth:event.headers?.authorization || event.headers?.Authorization, body:event.body || ''});
  if (result) {
    const response = jsonResponse(result.status, result.data);
    response.headers['Cache-Control'] = 'private, no-store';
    return response;
  }
  if (pathname === '/health' || pathname === '/api/health') {
    return jsonResponse(200, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      serverless: true
    });
  }

  if (pathname.startsWith('/api/tmdb/') || pathname.startsWith('/tmdb/')) {
    try {
      const tmdbPath = pathname.replace('/api/tmdb/', '').replace('/tmdb/', '');
      const upstreamUrl = tmdbUrl(tmdbPath, queryParams, TMDB_API_KEY);
      const cacheKey = upstreamUrl.toString();
      const cached = getCache(cacheKey);
      if (cached) {
        return jsonResponse(200, cached);
      }

      const data = await fetchJson(upstreamUrl);
      setCache(cacheKey, data);
      return jsonResponse(200, data);
    } catch (err) {
      return jsonResponse(err.status || 502, { success: false, error: err instanceof HttpError ? err.message : 'Service indisponible.' });
    }
  }

  if (pathname === '/api/documentaries/categories' || pathname === '/documentaries/categories') {
    return jsonResponse(200, {
      success: true,
      total_categories: DOCUMENTARY_CATEGORIES.length,
      categories: DOCUMENTARY_CATEGORIES
    });
  }

  if (pathname === '/api/documentaries/arte' || pathname === '/documentaries/arte') {
    try {
      const limit = arteLimit(queryParams.limit);
      const cacheKey = `arte_api_${limit}`;
      const cachedData = getCache(cacheKey);
      if (cachedData) {
        return jsonResponse(200, { ...cachedData, cached: true });
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

      const responsePayload = {
        success: true,
        category: 'Documentaires ARTE TV',
        total: docs.length,
        documentaries: docs
      };

      setCache(cacheKey, responsePayload, 15 * 60 * 1000);
      return jsonResponse(200, responsePayload);
    } catch (error) {
      return jsonResponse(error.status || 502, { success: false, error: error instanceof HttpError ? error.message : 'Service indisponible.' });
    }
  }

  return jsonResponse(404, { success: false, error: `Route non trouvée: ${pathname}` });
};
