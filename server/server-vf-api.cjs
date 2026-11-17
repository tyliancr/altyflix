process.on('uncaughtException', err => {
  console.error('[Process] Uncaught exception:', err.message);
});
process.on('unhandledRejection', reason => {
  console.error('[Process] Unhandled rejection:', reason);
});

const streamApi = require('./stream-api.cjs');
const { extractDirectStream } = require('./streamExtractor.cjs');
const { SECURITY_HEADERS, HttpError, validateStreams, arteLimit, tmdbUrl, BoundedCache, fetchJson, createRateLimiter } = require('./security.cjs');
/**
 * ALTYFLIX Backend Server - Node.js (Built-in HTTP, Zero Dependances External)
 * Serveur API VF (Vidzy N°1), Proxy Sécurisé TMDB et Hébergement Statique SPA
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Chargement des variables d'environnement depuis .env
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        if (process.env[key] === undefined) process.env[key] = value.trim();
      }
    });
  }
}
loadEnv();

const PORT = process.env.PORT || 3000;
const TMDB_API_KEY = process.env.TMDB_API_KEY || 'a0819950449844817a0942ca79a4ccb0';

// Map: ancien nom haché → nouveau nom lisible
// Nécessaire car les bundles compilés se référencent mutuellement par leurs anciens noms
const ASSET_ALIASES = {
  // All Vite chunks served directly from dist/ — no aliases needed

};

// Cache mémoire simple
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



const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...SECURITY_HEADERS,
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function resolveCaseInsensitivePath(targetPath) {
  if (fs.existsSync(targetPath)) return targetPath;

  const projectRoot = path.join(__dirname, '..');
  const rel = path.relative(projectRoot, targetPath);
  if (rel.startsWith('..')) return null;

  const parts = rel.split(path.sep);
  let current = projectRoot;

  const norm = (s) => {
    try { s = decodeURIComponent(s); } catch (e) {}
    return s.toLowerCase().replace(/[\s_%-]+/g, '');
  };

  for (const part of parts) {
    if (!part || part === '.') continue;
    const partNorm = norm(part);
    if (!fs.existsSync(current)) return null;

    try {
      const items = fs.readdirSync(current);
      const matched = items.find(item => norm(item) === partNorm);
      if (matched) {
        current = path.join(current, matched);
      } else {
        return null;
      }
    } catch (e) {
      return null;
    }
  }

  return fs.existsSync(current) ? current : null;
}

function serveStaticFile(req, res, pathname) {
  const projectRoot = path.join(__dirname, '..');
  try { pathname = decodeURIComponent(pathname); } catch { return sendJSON(res, 400, { error: 'Chemin invalide.' }); }
  let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');

  // Sécurité renforcée : Bloquer tout Path Traversal et fichiers cachés / sensibles
  if (relativePath.includes('..') || relativePath.includes('\\') || relativePath.includes(':') || relativePath.includes('\0') || /(?:^|[\\/])\./.test(relativePath)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Access denied: Unauthorized file path.');
  }

  // Résolution des alias : ancien nom haché → nouveau nom lisible
  const basename = path.basename(relativePath);
  if (ASSET_ALIASES[basename]) {
    relativePath = relativePath.replace(basename, ASSET_ALIASES[basename]);
  }

  // Distribution STRICTEMENT restreinte aux dossiers 'dist' et 'public' (JAMAIS projectRoot!)
  const distDir = path.resolve(projectRoot, 'dist');
  const publicDir = path.resolve(projectRoot, 'public');

  let directDistPath = path.resolve(distDir, relativePath);
  let directPublicPath = path.resolve(publicDir, relativePath);

  const isWithinDist = (directDistPath === distDir || directDistPath.startsWith(distDir + path.sep));
  const isWithinPublic = (directPublicPath === publicDir || directPublicPath.startsWith(publicDir + path.sep));

  let actualPath = (isWithinDist && fs.existsSync(directDistPath)) ? directDistPath
    : (isWithinPublic && fs.existsSync(directPublicPath)) ? directPublicPath
    : (isWithinDist ? resolveCaseInsensitivePath(directDistPath) : null);

  if (actualPath) {
    const real = fs.realpathSync(actualPath);
    const allowed = [distDir, publicDir].some(dir => {
      if (!fs.existsSync(dir)) return false;
      const base = fs.realpathSync(dir);
      return real.startsWith(base + path.sep);
    });
    if (!allowed) return sendJSON(res, 403, { error: 'Accès interdit.' });
  }
  if (actualPath && fs.statSync(actualPath).isFile()) {
    fs.readFile(actualPath, (readErr, data) => {
      if (readErr) {
        return sendJSON(res, 500, { success: false, error: 'Erreur lecture fichier' });
      }
      const ext = path.extname(actualPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        ...SECURITY_HEADERS
      });
      res.end(data);
    });
    return;
  }

  const ext = path.extname(pathname).toLowerCase();
  const isAsset = ['.js', '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.json', '.ico', '.map'].includes(ext);

  if (isAsset) {
    const contentType = MIME_TYPES[ext] || 'text/plain; charset=utf-8';
    res.writeHead(404, { 'Content-Type': contentType });
    return res.end(`File not found: ${pathname}`);
  }

  // Fallback SPA vers dist/index.html (ou index.html si dev)
  const distIndexPath = path.join(distDir, 'index.html');
  const fallbackPath = fs.existsSync(distIndexPath) ? distIndexPath : path.join(projectRoot, 'index.html');
  fs.readFile(fallbackPath, (readErr, data) => {
    if (readErr) {
      return sendJSON(res, 404, { success: false, error: 'index.html introuvable' });
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPES['.html'],
      ...SECURITY_HEADERS
    });
    res.end(data);
  });
}

function isVidzyUrl(hostname) {
  return hostname && (hostname.includes('vidzy.org') || hostname.includes('vidzy.cc') || hostname.includes('vidzy.net'));
}

const server = http.createServer(async (req, res) => {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
  if (!['GET', 'HEAD', 'POST', 'OPTIONS'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD, POST, OPTIONS');
    return sendJSON(res, 405, { success: false, error: 'Méthode non autorisée.' });
  }
  if ((req.url || '').length > 4096) return sendJSON(res, 414, { error: 'Requête trop longue.' });
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...SECURITY_HEADERS,
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  let parsedUrl;
  try { parsedUrl = new URL(req.url, 'http://localhost'); }
  catch { return sendJSON(res, 400, { error: 'URL invalide.' }); }
  const pathname = parsedUrl.pathname;
  const query = Object.fromEntries(parsedUrl.searchParams);

  if (pathname.startsWith('/api/') && pathname !== '/api/proxy-hls' && pathname !== '/api/video-stream' && !allowRequest(req.socket.remoteAddress || 'local')) {
    res.setHeader('Retry-After', '60');
    return sendJSON(res, 429, { error: 'Trop de requêtes. Réessayez dans une minute.' });
  }

  // Proxy HLS sécurisé - injecte le token gk dans les segments Vidzy
  if (pathname === '/api/proxy-hls') {
    const targetUrl = query.url;
    const referer = query.referer || 'https://vidzy.org/';
    const gk = query.gk || null; // token gate Vidzy optionnel

    if (!targetUrl || !targetUrl.startsWith('https://')) {
      return sendJSON(res, 400, { error: 'URL cible invalide.' });
    }

    // Sécurité : restreindre les domaines autorisés
    let targetHostname;
    try {
      targetHostname = new URL(targetUrl).hostname;
    } catch {
      return sendJSON(res, 400, { error: 'URL malformée.' });
    }
    const ALLOWED_PROXY_DOMAINS = [
      'vidzy.org', 'vidzy.cc', 'vidzy.net',
      'v1.vidzy.org', 'v2.vidzy.org', 'v3.vidzy.org', 'v4.vidzy.org',
      'v5.vidzy.org', 'v6.vidzy.org', 'v7.vidzy.org', 'v8.vidzy.org',
      'u1.vidzy.org', 'u2.vidzy.org', 'u3.vidzy.org', 'u4.vidzy.org',
      'u5.vidzy.org', 'u6.vidzy.org', 'u7.vidzy.org', 'u8.vidzy.org',
      'u9.vidzy.org', 'u10.vidzy.org', 'u11.vidzy.org', 'u12.vidzy.org',
      'u13.vidzy.org', 'u14.vidzy.org', 'u15.vidzy.org', 'u16.vidzy.org',
      'v1.vidzy.cc', 'v2.vidzy.cc', 'v3.vidzy.cc', 'v4.vidzy.cc',
      'v5.vidzy.cc', 'v6.vidzy.cc',
      'test-streams.mux.dev'
    ];
    if (!ALLOWED_PROXY_DOMAINS.some(d => targetHostname === d || targetHostname.endsWith('.' + d))) {
      return sendJSON(res, 403, { error: 'Domaine proxy non autorisé.' });
    }

    try {
      const upstreamRes = await fetch(targetUrl, {
        headers: {
          'Referer': referer,
          'Origin': 'https://vidzy.org'
          // PAS de User-Agent → évite le poisoning Vidzy
        },
        signal: AbortSignal.timeout(15000)
      });

      if (!upstreamRes.ok) {
        return sendJSON(res, upstreamRes.status, { error: 'Échec de récupération en amont: ' + upstreamRes.status });
      }

      const contentType = upstreamRes.headers.get('content-type') || '';
      const isPlaylist = targetUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('application/vnd.apple.mpegurl');

      if (isPlaylist) {
        const text = await upstreamRes.text();
        const targetObj = new URL(targetUrl);
        const lines = text.split(/\r?\n/);
        const rewritten = lines.map(line => {
          const trimmed = line.trim();
          if (!trimmed) return line;
          if (trimmed.startsWith('#')) {
            // Réécrire les URI dans les tags EXT-X-MEDIA et EXT-X-KEY
            return trimmed.replace(/URI=["']([^"']+)["']/g, (m, u) => {
              const resolved = new URL(u, targetUrl);
              if (!resolved.search && targetObj.search) resolved.search = targetObj.search;
              // Injecter gk si segment Vidzy et gk présent
              if (gk && isVidzyUrl(resolved.hostname) && !resolved.searchParams.has('gk')) {
                resolved.searchParams.set('gk', gk);
              }
              return `URI="/api/proxy-hls?url=${encodeURIComponent(resolved.href)}&referer=${encodeURIComponent(referer)}${gk ? '&gk=' + encodeURIComponent(gk) : ''}"`;
            });
          }
          // Ligne de segment ou sous-playlist
          const resolved = new URL(trimmed, targetUrl);
          if (!resolved.search && targetObj.search) resolved.search = targetObj.search;
          // Injecter gk sur les segments Vidzy
          if (gk && isVidzyUrl(resolved.hostname) && !resolved.searchParams.has('gk')) {
            resolved.searchParams.set('gk', gk);
          }
          return `/api/proxy-hls?url=${encodeURIComponent(resolved.href)}&referer=${encodeURIComponent(referer)}${gk ? '&gk=' + encodeURIComponent(gk) : ''}`;
        }).join('\n');

        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Cache-Control': 'no-cache'
        });
        return res.end(rewritten);
      } else {
        // Segment binaire (.ts, .aac, etc.)
        const headers = {
          'Content-Type': contentType || 'video/MP2T',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Cache-Control': 'public, max-age=3600'
        };
        const len = upstreamRes.headers.get('content-length');
        if (len) headers['Content-Length'] = len;
        res.writeHead(upstreamRes.status, headers);
        const buffer = Buffer.from(await upstreamRes.arrayBuffer());
        return res.end(buffer);
      }
    } catch (err) {
      console.error('[proxy-hls] Error:', err.message);
      return sendJSON(res, 502, { error: 'Erreur proxy de flux: ' + err.message });
    }
  }

  // Stream Proxy Universel avec support HTTP 206 Range (Lecture native 100% Altyflix)
  if (pathname === '/api/video-stream') {
    const targetUrl = query.url;
    if (!targetUrl || !targetUrl.startsWith('http')) return sendJSON(res, 400, { error: 'URL invalide.' });

    const upstreamHeaders = {};
    if (req.headers.range) {
      upstreamHeaders['range'] = req.headers.range;
    }

    const abortCtrl = new AbortController();
    req.on('close', () => {
      try { abortCtrl.abort(); } catch {}
    });

    try {
      const upstreamRes = await fetch(targetUrl, {
        headers: upstreamHeaders,
        signal: abortCtrl.signal
      });

      const responseHeaders = {
        'Content-Type': upstreamRes.headers.get('content-type') || 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Cache-Control': 'public, max-age=3600'
      };

      if (upstreamRes.headers.has('content-length')) {
        responseHeaders['Content-Length'] = upstreamRes.headers.get('content-length');
      }
      if (upstreamRes.headers.has('content-range')) {
        responseHeaders['Content-Range'] = upstreamRes.headers.get('content-range');
      }

      res.writeHead(upstreamRes.status, responseHeaders);
      if (upstreamRes.body) {
        const { Readable } = require('stream');
        const stream = Readable.fromWeb(upstreamRes.body);
        stream.on('error', () => {
          try { res.destroy(); } catch {}
        });
        res.on('error', () => {
          try { stream.destroy(); } catch {}
        });
        stream.pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (!res.headersSent) {
        return sendJSON(res, 502, { error: 'Erreur proxy vidéo: ' + err.message });
      }
      try { res.destroy(); } catch {}
    }
    return;
  }

  // Service de proxy / conversion VTT pour les sous-titres
  if (pathname === '/api/subtitles-vtt') {
    const targetUrl = query.url;
    if (!targetUrl || !targetUrl.startsWith('http')) {
      return sendJSON(res, 400, { error: 'URL invalide' });
    }
    try {
      const zlib = require('zlib');
      const vttRes = await fetch(targetUrl, {
        headers: { 'User-Agent': 'TemporaryUserAgent' },
        signal: AbortSignal.timeout(8000)
      });
      if (!vttRes.ok) return sendJSON(res, vttRes.status, { error: 'Erreur sous-titre' });
      const rawBuf = Buffer.from(await vttRes.arrayBuffer());
      let text;
      // Décompresser si fichier gzip (.gz ou magic bytes 0x1F 0x8B)
      if (rawBuf.length >= 2 && rawBuf[0] === 0x1f && rawBuf[1] === 0x8b) {
        try {
          text = zlib.gunzipSync(rawBuf).toString('utf8');
        } catch {
          text = rawBuf.toString('utf8');
        }
      } else {
        text = rawBuf.toString('utf8');
      }

      // Convertir SRT / VTT brut en WebVTT propre
      if (!text.trim().startsWith('WEBVTT')) {
        text = 'WEBVTT\n\n' + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      }

      // Nettoyer les mentions publicitaires / liens externes dans les sous-titres
      text = text
        .replace(/.*(?:opensubtitles|osdb\.link|subtitles\.org|devenez membre vip|advertisement).*\n?/gi, '')
        .trim();

      res.writeHead(200, {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=86400'
      });
      return res.end(text);
    } catch (err) {
      return sendJSON(res, 502, { error: 'Échec sous-titres: ' + err.message });
    }
  }

  // Service de sous-titres universel multi-sources (OpenSubtitles REST + OpenSubtitles v3)
  if (pathname === '/api/subtitles') {
    const { id, type = 'movie', season = 1, episode = 1 } = query;
    try {
      // 1. Obtenir l'IMDB ID depuis TMDB
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
        } catch {}
      }

      const formatted = [];
      const cleanImdb = imdbId ? imdbId.replace('tt', '') : null;

      // 2. Recherche OpenSubtitles REST (La référence mondiale pour le français)
      if (cleanImdb) {
        try {
          const osUrlFr = type === 'tv'
            ? `https://rest.opensubtitles.org/search/sublanguageid-fre/imdbid-${cleanImdb}/season-${season}/episode-${episode}`
            : `https://rest.opensubtitles.org/search/sublanguageid-fre/imdbid-${cleanImdb}`;

          const osRes = await fetch(osUrlFr, {
            headers: { 'User-Agent': 'TemporaryUserAgent' },
            signal: AbortSignal.timeout(4000)
          });
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
        } catch {}

        // Anglais si besoin
        try {
          const osUrlEn = type === 'tv'
            ? `https://rest.opensubtitles.org/search/sublanguageid-eng/imdbid-${cleanImdb}/season-${season}/episode-${episode}`
            : `https://rest.opensubtitles.org/search/sublanguageid-eng/imdbid-${cleanImdb}`;

          const osResEn = await fetch(osUrlEn, {
            headers: { 'User-Agent': 'TemporaryUserAgent' },
            signal: AbortSignal.timeout(3000)
          });
          if (osResEn.ok) {
            const osDataEn = await osResEn.json();
            if (Array.isArray(osDataEn)) {
              osDataEn.slice(0, 2).forEach((s, idx) => {
                if (s.SubDownloadLink) {
                  formatted.push({
                    id: `en-os-${idx}`,
                    label: idx === 0 ? 'English' : `English [${idx + 1}]`,
                    lang: 'en',
                    url: `/api/subtitles-vtt?url=${encodeURIComponent(s.SubDownloadLink)}`
                  });
                }
              });
            }
          }
        } catch {}
      }

      // 3. Fallback Stremio OpenSubtitles v3 si pas encore de sous-titres
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
        } catch {}
      }

      return sendJSON(res, 200, { success: true, subtitles: formatted });
    } catch {
      return sendJSON(res, 200, { success: true, subtitles: [] });
    }
  }

  // Debug Extractor
  if (pathname === '/api/debug-extractor') {
    try {
      const b = await require('./streamExtractor.cjs').getBrowser();
      if (!b) return sendJSON(res, 200, { ok: false, error: 'No browser' });
      const ctx = await b.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      });
      const page = await ctx.newPage();
      const urls = [];
      page.on('response', r => {
        const u = r.url();
        if (!u.includes('.woff') && !u.includes('.css')) {
          urls.push({ status: r.status(), url: u.slice(0, 100) });
        }
      });
      await page.goto('https://vidlink.pro/movie/1248832', { timeout: 12000, waitUntil: 'domcontentloaded' }).catch(e => urls.push({ error: e.message }));
      await new Promise(r => setTimeout(r, 4000));
      const title = await page.title().catch(() => 'no title');
      await ctx.close().catch(() => {});
      return sendJSON(res, 200, { ok: true, title, urlsCount: urls.length, urls: urls.slice(0, 25) });
    } catch (err) {
      return sendJSON(res, 200, { ok: false, error: err.message, stack: err.stack });
    }
  }

  // Direct Stream Extractor (HLS / MP4 direct avec fallback automatique immédiat)
  if (pathname === '/api/direct-stream') {
    const { id, type = 'movie', season = 1, episode = 1, lang = 'vf' } = query;
    try { validateStreams({ id, type, season, episode, lang }); }
    catch (err) { return sendJSON(res, err.status || 400, { error: err.message }); }

    const isTv = type === 'tv';
    const version = String(lang).toLowerCase().includes('vost') ? 'vostfr' : 'vf';

    try {
      // Timeout de 20 secondes pour l'extraction (stealth + Cloudflare challenge)
      const extracted = await Promise.race([
        extractDirectStream({ id, type, season, episode, lang: version }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Extraction timeout')), 20000))
      ]);

      if (extracted && extracted.streamUrl) {
        const payload = {
          success: true,
          tmdb_id: id,
          content_type: type,
          season: isTv ? parseInt(season) : null,
          episode: isTv ? parseInt(episode) : null,
          streamUrl: extracted.streamUrl,
          rawStreamUrl: extracted.rawStreamUrl,
          format: extracted.format || 'mp4',
          lang: extracted.lang,
          provider: extracted.provider,
          captions: extracted.captions || []
        };
        return sendJSON(res, 200, payload);
      }
    } catch (err) {
      // Timeout ou indisponibilité -> bascule immédiate sur fallback
    }

    return sendJSON(res, 200, {
      success: false,
      tmdb_id: id,
      content_type: type,
      provider: 'Altyflix Native Stream',
      error: 'Flux natif direct indisponible. Réessayez dans quelques instants.'
    });
  }

  if (req.method === 'POST' && pathname !== '/api/playback/progress') return sendJSON(res,405,{error:'Méthode non autorisée.'});
  let body = '';
  if (req.method === 'POST') {
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4096) return sendJSON(res,413,{error:'Corps trop long.'});
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks).toString('utf8');
    } catch { return sendJSON(res,400,{error:'Requête interrompue.'}); }
  }

  const result = await streamApi.handle({path:pathname, method:req.method, params:query, auth:req.headers.authorization, body});
  if (result) {
    res.setHeader('Cache-Control','private, no-store');
    return sendJSON(res,result.status,result.data);
  }
  // Altyflix Embedded Player API (Comme Vidzy / VidSrc mais sous votre propre marque)
  // Usage: /player/movie/:id ou /player/tv/:id/:season/:episode
  if (pathname.startsWith('/player/')) {
    const segments = pathname.split('/').filter(Boolean); // ['player', 'movie'|'tv', id, s?, e?]
    const pType = segments[1] || 'movie';
    const pId = segments[2];
    const pSeason = segments[3] || '1';
    const pEpisode = segments[4] || '1';

    if (!pId) return sendJSON(res, 400, { error: 'ID TMDB requis.' });

    const isTv = pType === 'tv';
    const primaryUrl = isTv
      ? `https://vidlink.pro/tv/${pId}/${pSeason}/${pEpisode}?primaryColor=e50914&secondaryColor=141414&iconColor=ffffff&title=true&poster=true&autoplay=true`
      : `https://vidlink.pro/movie/${pId}?primaryColor=e50914&secondaryColor=141414&iconColor=ffffff&title=true&poster=true&autoplay=true`;
    const backupUrl = isTv
      ? `https://vidsrc.me/embed/tv?tmdb=${pId}&season=${pSeason}&episode=${pEpisode}`
      : `https://vidsrc.me/embed/movie?tmdb=${pId}`;

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Altyflix Player</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html { width: 100%; height: 100%; background: #000; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    #player-frame { width: 100%; height: 100%; border: none; }
    .source-btn {
      position: absolute; top: 12px; right: 12px; z-index: 999;
      background: rgba(20,20,20,0.85); color: #fff; border: 1px solid rgba(255,255,255,0.2);
      padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;
      display: flex; align-items: center; gap: 6px; backdrop-filter: blur(8px);
      transition: all 0.2s;
    }
    .source-btn:hover { background: #e50914; border-color: #e50914; }
  </style>
</head>
<body>
  <iframe id="player-frame" src="${primaryUrl}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>
</body>
</html>`;
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(html);
  }

  // Health Check
  if (pathname === '/health') {
    return sendJSON(res, 200, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      memoryUsage: process.memoryUsage().rss
    });
  }

  // Root API info
  if (pathname === '/api') {
    return sendJSON(res, 200, {
      status: 'online',
      version: '2.0.0',
      service: 'VF Stream & TMDB Proxy API',
      endpoints: {
        getStreams: '/api/streams?id={tmdb_id}&type={movie|tv}',
        proxyTmdb: '/api/tmdb/*',
        getCategories: '/api/documentaries/categories',
        getArteDocs: '/api/documentaries/arte'
      }
    });
  }

  // 1. Proxy TMDB sécurisé (La clé API reste uniquement côté serveur!)
  if (pathname.startsWith('/api/tmdb/')) {
    try {
      const tmdbPath = pathname.replace('/api/tmdb/', '');
      const upstreamUrl = tmdbUrl(tmdbPath, parsedUrl.searchParams, TMDB_API_KEY);
      const cacheKey = upstreamUrl.toString();
      const cached = getCache(cacheKey);
      if (cached) {
        return sendJSON(res, 200, cached);
      }

      const data = await fetchJson(upstreamUrl);
      setCache(cacheKey, data);
      return sendJSON(res, 200, data);
    } catch (err) {
      return sendJSON(res, err.status || 502, { success: false, error: err instanceof HttpError ? err.message : 'Service indisponible.' });
    }
  }

  // 2. Catégories Documentaires
  if (pathname === '/api/documentaries/categories') {
    return sendJSON(res, 200, {
      success: true,
      total_categories: DOCUMENTARY_CATEGORIES.length,
      categories: DOCUMENTARY_CATEGORIES
    });
  }

  // 3. Streams API (Vidzy #1 + sandbox sécurisée)
  if (pathname === '/api/documentaries/arte') {
    try {
      const limit = arteLimit(query.limit);
      const cacheKey = `arte_api_${limit}`;
      const cachedData = getCache(cacheKey);
      if (cachedData) {
        return sendJSON(res, 200, { ...cachedData, cached: true });
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
      return sendJSON(res, 200, responsePayload);
    } catch (error) {
      return sendJSON(res, error.status || 502, { success: false, error: error instanceof HttpError ? error.message : 'Service indisponible.' });
    }
  }

  // Serveur web statique
  // Preserve avatar URLs already stored in existing profiles on case-sensitive hosts.
  if (pathname.startsWith('/avatars/Netflix/')) {
    res.writeHead(301, { Location: pathname.replace('/avatars/Netflix/', '/avatars/netflix/') });
    return res.end();
  }
  try { serveStaticFile(req, res, pathname); }
  catch { return sendJSON(res, 400, { error: 'Chemin invalide.' }); }
});

module.exports = server;
if (require.main === module) server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ALTYFLIX (Site Web & API Proxy TMDB/Vidzy #1) démarré sur le port ${PORT} ! (http://localhost:${PORT})`);
});
