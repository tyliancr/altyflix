process.on('uncaughtException', err => {
  console.error('[Process] Uncaught exception:', err.message);
});
process.on('unhandledRejection', reason => {
  console.error('[Process] Unhandled rejection:', reason);
});

const streamApi = require('./stream-api.cjs');
const { resolveNativeStream, getDemoVtt } = require('./nativeStreamingEngine.cjs');
const { resolveStreamsServer, checkStreamStatus, normalizeAllowedUrl } = require('./stream-resolver.cjs');
const { SECURITY_HEADERS, DOCUMENTARY_CATEGORIES, HttpError, positiveInteger, validateStreams, arteLimit, tmdbUrl, BoundedCache, fetchJson, createRateLimiter, normalizeAllowedSubtitleUrl, readBoundedBuffer, decodeSubtitleBuffer, cleanSubtitleToVtt, rankOpenSubtitles } = require('./security.cjs');
/**
 * ALTYFLIX Backend Server - Node.js (Built-in HTTP, Zero Dependances External)
 * Proxy sécurisé TMDB, API de lecture et hébergement statique SPA
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { URL } = require('url');
const { spawnSync } = require('child_process');

const HAS_FFMPEG = (() => {
  try {
    return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 3000 }).status === 0;
  } catch {
    return false;
  }
})();
const MAX_CONCURRENT_FFMPEG = 4;
let activeFfmpegJobs = 0;

const COMPRESSIBLE_EXTS = new Set(['.js', '.mjs', '.css', '.html', '.svg', '.json', '.webmanifest', '.txt', '.xml']);
const staticGzipCache = new Map();

function getGzippedStatic(filePath, mtimeMs, rawBuffer) {
  const key = `${filePath}:${mtimeMs}`;
  const cached = staticGzipCache.get(key);
  if (cached) return cached;
  const gz = zlib.gzipSync(rawBuffer, { level: 6 });
  if (staticGzipCache.size > 120) {
    const first = staticGzipCache.keys().next().value;
    if (first) staticGzipCache.delete(first);
  }
  staticGzipCache.set(key, gz);
  return gz;
}

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
const allowRemuxRequest = createRateLimiter(30, 60000);



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
      const matched = items.find(item => !item.startsWith('.') && norm(item) === partNorm);
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
    const stat = fs.statSync(actualPath);
    fs.readFile(actualPath, (readErr, data) => {
      if (readErr) {
        return sendJSON(res, 500, { success: false, error: 'Erreur lecture fichier' });
      }
      const ext = path.extname(actualPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const isHashedAsset = pathname.startsWith('/assets/');
      const isNoCache = ext === '.html' || pathname === '/sw.js' || pathname === '/manifest.webmanifest';
      const cacheControl = isHashedAsset
        ? 'public, max-age=31536000, immutable'
        : isNoCache
          ? 'no-cache'
          : 'public, max-age=86400';

      const acceptsGzip = /\bgzip\b/i.test(req.headers['accept-encoding'] || '');
      const shouldCompress = acceptsGzip && COMPRESSIBLE_EXTS.has(ext) && data.length > 1024;
      const body = shouldCompress ? getGzippedStatic(actualPath, stat.mtimeMs, data) : data;
      const headers = {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'Vary': 'Accept-Encoding',
        ...SECURITY_HEADERS
      };
      if (shouldCompress) headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = body.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
    });
    return;
  }

  const ext = path.extname(pathname).toLowerCase();
  const isAsset = ['.js', '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.json', '.ico', '.map'].includes(ext);

  if (isAsset) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('File not found');
  }

  // Fallback SPA vers dist/index.html (ou index.html si dev)
  const distIndexPath = path.join(distDir, 'index.html');
  const fallbackPath = fs.existsSync(distIndexPath) ? distIndexPath : path.join(projectRoot, 'index.html');
  fs.readFile(fallbackPath, (readErr, data) => {
    if (readErr) {
      return sendJSON(res, 404, { success: false, error: 'index.html introuvable' });
    }
    let mtimeMs = 0;
    try { mtimeMs = fs.statSync(fallbackPath).mtimeMs; } catch { mtimeMs = Date.now(); }
    const acceptsGzip = /\bgzip\b/i.test(req.headers['accept-encoding'] || '');
    const body = acceptsGzip ? getGzippedStatic(fallbackPath, mtimeMs, data) : data;
    const headers = {
      'Content-Type': MIME_TYPES['.html'],
      'Cache-Control': 'no-cache',
      'Vary': 'Accept-Encoding',
      ...SECURITY_HEADERS
    };
    if (acceptsGzip) headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  });
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-debrid-token, x-debrid-provider, x-frenchio-url'
    });
    return res.end();
  }

  let parsedUrl;
  try { parsedUrl = new URL(req.url, 'http://localhost'); }
  catch { return sendJSON(res, 400, { error: 'URL invalide.' }); }
  const pathname = parsedUrl.pathname;
  const query = Object.fromEntries(parsedUrl.searchParams);

  if (req.method === 'POST' && pathname !== '/api/playback/progress') {
    return sendJSON(res, 405, { error: 'Méthode non autorisée.' });
  }

  if (pathname.startsWith('/api/') && pathname !== '/api/video-stream' && !allowRequest(req.socket.remoteAddress || 'local')) {
    res.setHeader('Retry-After', '60');
    return sendJSON(res, 429, { error: 'Trop de requêtes. Réessayez dans une minute.' });
  }

  // Stream Proxy Universel avec protection SSRF, support HTTP 206 Range et remux audio AAC sécurisé
  if (pathname === '/api/video-stream') {
    const targetUrl = normalizeAllowedUrl(query.url);
    if (!targetUrl) {
      return sendJSON(res, 400, { error: 'URL vidéo non autorisée.' });
    }

    const wantsAudioRemux = query.audio === 'aac';
    const clientIp = (process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for'])
      ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
      : (req.socket.remoteAddress || 'local');

    // Répondre immédiatement aux requêtes HEAD sans lancer un processus FFmpeg inutile
    if (req.method === 'HEAD' && wantsAudioRemux) {
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'private, no-store'
      });
      return res.end();
    }

    const spawnFfmpegRemux = (rawInputUrl, { copyVideo }) => {
      if (res.destroyed || res.writableEnded) return;
      if (!HAS_FFMPEG) {
        return sendJSON(res, 503, { error: 'Remux audio indisponible sur ce serveur.' });
      }
      if (!allowRemuxRequest(clientIp)) {
        res.setHeader('Retry-After', '60');
        return sendJSON(res, 429, { error: 'Trop de requêtes de conversion. Réessayez dans un instant.' });
      }
      if (activeFfmpegJobs >= MAX_CONCURRENT_FFMPEG) {
        return sendJSON(res, 503, { error: 'Trop de flux en cours de conversion. Réessayez dans un instant.' });
      }
      const inputUrl = normalizeAllowedUrl(rawInputUrl);
      if (!inputUrl) {
        return sendJSON(res, 400, { error: 'Hôte vidéo non autorisé.' });
      }

      const { spawn } = require('child_process');
      const seekSec = Math.max(0, parseInt(query.t || query.start || '0', 10) || 0);
      const ffmpegArgs = [
        '-protocol_whitelist', 'https,tls,tcp',
        '-rw_timeout', '15000000',
        '-reconnect', '1',
        '-reconnect_delay_max', '3',
        '-probesize', '2000000',
        '-analyzeduration', '2000000'
      ];

      // -noaccurate_seek + -ss + -copyts -start_at_zero AVANT -i :
      // préserve exactement les timestamps d'origine vidéo ET audio au keyframe (sans couper l'audio pré-seek
      // ni créer de trou de 1,8 s à 8 s dans le fMP4 qui décale le son sur Brave/Chromium).
      if (seekSec > 0) {
        ffmpegArgs.push('-noaccurate_seek', '-ss', String(seekSec));
      }
      ffmpegArgs.push('-copyts', '-start_at_zero');

      ffmpegArgs.push('-i', inputUrl);
      if (copyVideo) {
        ffmpegArgs.push(
          '-map', '0:v:0',
          '-map', '0:a:0?',
          '-map_chapters', '-1',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-ac', '2',
          '-b:a', '192k',
          '-af', 'aresample=async=1',
          '-max_muxing_queue_size', '1024'
        );
      } else {
        ffmpegArgs.push(
          '-map', '0:v:0',
          '-map', '0:a:0?',
          '-map_chapters', '-1',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-tune', 'zerolatency',
          '-g', '50',
          '-c:a', 'aac',
          '-ac', '2',
          '-b:a', '160k',
          '-af', 'aresample=async=1',
          '-max_muxing_queue_size', '1024'
        );
      }

      ffmpegArgs.push(
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof+negative_cts_offsets',
        '-f', 'mp4',
        'pipe:1'
      );

      let ffmpegProc;
      try {
        ffmpegProc = spawn('ffmpeg', ffmpegArgs, {
          stdio: ['ignore', 'pipe', 'ignore']
        });
      } catch {
        return sendJSON(res, 502, { error: 'Flux vidéo indisponible.' });
      }

      activeFfmpegJobs++;
      let cleaned = false;
      let killTimer = null;
      let maxLifeTimer = null;
      const cleanupProc = () => {
        if (cleaned) return;
        cleaned = true;
        if (maxLifeTimer) clearTimeout(maxLifeTimer);
        activeFfmpegJobs = Math.max(0, activeFfmpegJobs - 1);
        try {
          if (ffmpegProc.exitCode === null && !ffmpegProc.killed) {
            ffmpegProc.kill('SIGTERM');
            killTimer = setTimeout(() => {
              try {
                if (ffmpegProc.exitCode === null) ffmpegProc.kill('SIGKILL');
              } catch {}
            }, 3000);
            killTimer.unref?.();
          }
        } catch {}
      };

      // Durée de vie maximale d'un job FFmpeg (4h) pour éviter tout blocage permanent d'un slot
      maxLifeTimer = setTimeout(() => {
        cleanupProc();
        try { res.destroy(); } catch {}
      }, 4 * 60 * 60 * 1000);
      maxLifeTimer.unref?.();

      ffmpegProc.on('exit', () => {
        if (killTimer) clearTimeout(killTimer);
        if (maxLifeTimer) clearTimeout(maxLifeTimer);
        if (!cleaned) {
          cleaned = true;
          activeFfmpegJobs = Math.max(0, activeFfmpegJobs - 1);
        }
        if (!res.headersSent) {
          sendJSON(res, 502, { error: 'Échec de conversion du flux vidéo.' });
        }
      });

      req.on('close', cleanupProc);
      res.on('close', cleanupProc);
      res.on('error', cleanupProc);
      ffmpegProc.on('error', () => {
        cleanupProc();
        if (!res.headersSent) sendJSON(res, 502, { error: 'Flux vidéo indisponible.' });
        else try { res.destroy(); } catch {}
      });
      ffmpegProc.stdout.on('error', () => {
        cleanupProc();
        try { res.destroy(); } catch {}
      });

      // Différer writeHead(200) au premier bloc de données FFmpeg pour renvoyer un vrai 502 si FFmpeg échoue au démarrage
      ffmpegProc.stdout.once('data', (firstChunk) => {
        if (res.destroyed || res.writableEnded) {
          cleanupProc();
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Cache-Control': 'private, no-store'
        });
        res.write(firstChunk);
        ffmpegProc.stdout.pipe(res);
      });
    };

    if (wantsAudioRemux) {
      // Pré-résoudre et valider chaque redirection en Node (anti-SSRF) avant d'invoquer FFmpeg
      let resolvedRemuxUrl = targetUrl;
      try {
        for (let hop = 0; hop < 4; hop++) {
          const safeHop = normalizeAllowedUrl(resolvedRemuxUrl);
          if (!safeHop) return sendJSON(res, 403, { error: 'Hôte de redirection non autorisé.' });
          const headRes = await fetch(safeHop, {
            method: 'HEAD',
            redirect: 'manual',
            signal: AbortSignal.timeout(8000)
          });
          if (headRes.status >= 300 && headRes.status < 400 && headRes.headers.get('location')) {
            try { await headRes.body?.cancel(); } catch {}
            resolvedRemuxUrl = new URL(headRes.headers.get('location'), safeHop).toString();
            continue;
          }
          try { await headRes.body?.cancel(); } catch {}
          resolvedRemuxUrl = safeHop;
          break;
        }
      } catch {
        // En cas de HEAD non supporté par le CDN, on continue avec l'URL déjà validée par normalizeAllowedUrl
      }
      if (!normalizeAllowedUrl(resolvedRemuxUrl)) {
        return sendJSON(res, 403, { error: 'Hôte vidéo non autorisé.' });
      }
      console.log(`[Video Stream Proxy] Remux audio instantané (copie vidéo + AC3/DTS -> AAC)...`);
      spawnFfmpegRemux(resolvedRemuxUrl, { copyVideo: true });
      return;
    }

    const upstreamHeaders = {};
    if (req.headers.range) {
      upstreamHeaders['range'] = req.headers.range;
    }

    const abortCtrl = new AbortController();
    const abortUpstream = () => { try { abortCtrl.abort(); } catch {} };
    req.on('close', abortUpstream);
    res.on('close', abortUpstream);

    try {
      // Suivre manuellement les redirections en validant chaque saut (protection SSRF)
      // Timeout uniquement sur l'acquisition des headers (annulé dès réception pour ne jamais couper la lecture à 15 s)
      let currentUrl = targetUrl;
      let upstreamRes = null;
      for (let hop = 0; hop < 4; hop++) {
        const safeHop = normalizeAllowedUrl(currentUrl);
        if (!safeHop) {
          return sendJSON(res, 403, { error: 'Hôte de redirection non autorisé.' });
        }
        const connectTimer = setTimeout(() => { try { abortCtrl.abort(); } catch {} }, 15000);
        try {
          upstreamRes = await fetch(safeHop, {
            method: req.method === 'HEAD' ? 'HEAD' : 'GET',
            headers: upstreamHeaders,
            redirect: 'manual',
            signal: abortCtrl.signal
          });
        } finally {
          clearTimeout(connectTimer);
        }
        if (upstreamRes.status >= 300 && upstreamRes.status < 400 && upstreamRes.headers.get('location')) {
          try { await upstreamRes.body?.cancel(); } catch {}
          currentUrl = new URL(upstreamRes.headers.get('location'), safeHop).toString();
          continue;
        }
        currentUrl = safeHop;
        break;
      }

      if (!upstreamRes || (upstreamRes.status >= 300 && upstreamRes.status < 400)) {
        try { await upstreamRes?.body?.cancel(); } catch {}
        return sendJSON(res, 502, { error: 'Flux vidéo indisponible.' });
      }

      if (upstreamRes.status < 200 || upstreamRes.status >= 300) {
        try { await upstreamRes.body?.cancel(); } catch {}
        const safeErrStatus = (upstreamRes.status >= 400 && upstreamRes.status <= 599) ? upstreamRes.status : 502;
        return sendJSON(res, safeErrStatus, { error: 'Flux vidéo indisponible.' });
      }

      const contentType = (upstreamRes.headers.get('content-type') || '').toLowerCase();
      const contentDisp = (upstreamRes.headers.get('content-disposition') || '').toLowerCase();
      const finalUrl = currentUrl;
      const isAvi = targetUrl.toLowerCase().includes('.avi') ||
                    finalUrl.toLowerCase().includes('.avi') ||
                    contentType.includes('msvideo') ||
                    contentType.includes('avi') ||
                    contentDisp.includes('.avi');

      // Si le format est un AVI ancien non décodé par HTML5, conversion dynamique à la volée vers fMP4
      if (isAvi && req.method !== 'HEAD') {
        console.log(`[Video Stream Proxy] Transcodage dynamique à la volée du flux AVI vers MP4 HTML5...`);
        try { await upstreamRes.body?.cancel(); } catch {}
        if (abortCtrl.signal.aborted || res.destroyed || res.writableEnded) return;
        abortUpstream();
        spawnFfmpegRemux(finalUrl, { copyVideo: false });
        return;
      }

      const responseHeaders = {
        'Content-Type': upstreamRes.headers.get('content-type') || 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Cache-Control': 'private, no-store'
      };

      if (upstreamRes.headers.has('content-length')) {
        responseHeaders['Content-Length'] = upstreamRes.headers.get('content-length');
      }
      if (upstreamRes.headers.has('content-range')) {
        responseHeaders['Content-Range'] = upstreamRes.headers.get('content-range');
      }

      res.writeHead(upstreamRes.status, responseHeaders);
      if (req.method === 'HEAD') {
        try { await upstreamRes.body?.cancel(); } catch {}
        return res.end();
      }
      if (upstreamRes.body) {
        const { Readable } = require('stream');
        const stream = Readable.fromWeb(upstreamRes.body);
        stream.on('error', () => {
          try { res.destroy(); } catch {}
        });
        res.on('close', () => {
          try { stream.destroy(); } catch {}
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
        return sendJSON(res, 502, { error: 'Flux vidéo temporairement indisponible.' });
      }
      try { res.destroy(); } catch {}
    }
    return;
  }

  // Service de proxy / conversion VTT pour les sous-titres (protégé SSRF + anti Gzip Bomb)
  if (pathname === '/api/subtitles-vtt') {
    const targetUrl = normalizeAllowedSubtitleUrl(query.url);
    if (!targetUrl) {
      return sendJSON(res, 400, { error: 'URL de sous-titres non autorisée.' });
    }
    try {
      let currentUrl = targetUrl;
      let vttRes = null;
      for (let hop = 0; hop < 4; hop++) {
        const safeHop = normalizeAllowedSubtitleUrl(currentUrl);
        if (!safeHop) {
          return sendJSON(res, 403, { error: 'Redirection sous-titres non autorisée.' });
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
        return sendJSON(res, 502, { error: 'Trop de redirections pour les sous-titres.' });
      }
      if (!vttRes.ok) {
        const errStatus = (vttRes.status >= 400 && vttRes.status <= 599) ? vttRes.status : 502;
        return sendJSON(res, errStatus, { error: 'Erreur sous-titre.' });
      }
      const rawBuf = await readBoundedBuffer(vttRes, 2 * 1024 * 1024);
      let decodedBuf = rawBuf;
      // Décompression asynchrone bornée à 5 Mo (anti Gzip Bomb — jamais renvoyer du binaire brut en 200 OK)
      if (rawBuf.length >= 2 && rawBuf[0] === 0x1f && rawBuf[1] === 0x8b) {
        try {
          const gunzipAsync = require('util').promisify(zlib.gunzip);
          decodedBuf = await gunzipAsync(rawBuf, { maxOutputLength: 5 * 1024 * 1024 });
        } catch (gzErr) {
          if (gzErr?.code === 'ERR_BUFFER_TOO_LARGE') {
            throw new HttpError(413, 'Fichier sous-titre trop volumineux après décompression.');
          }
          throw new HttpError(502, 'Fichier sous-titre corrompu.');
        }
      }

      // Décodage UTF-8 strict avec fallback Windows-1252 (évite les « » sur les accents français)
      // et nettoyage complet des blocs publicitaires (tryray.app, osdb.link, VIP...)
      const text = cleanSubtitleToVtt(decodeSubtitleBuffer(decodedBuf));

      res.writeHead(200, {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=86400'
      });
      return res.end(req.method === 'HEAD' ? undefined : text);
    } catch (err) {
      return sendJSON(res, err instanceof HttpError ? err.status : 502, {
        error: err instanceof HttpError ? err.message : 'Service de sous-titres indisponible.'
      });
    }
  }

  // Service de sous-titres universel multi-sources (OpenSubtitles REST + OpenSubtitles v3)
  if (pathname === '/api/subtitles') {
    const { id, imdbId: queryImdbId, type = 'movie', season = 1, episode = 1, filename = '' } = query;
    const safeType = type === 'tv' ? 'tv' : 'movie';
    const safeSeason = positiveInteger(season, 10000) ? Number(season) : 1;
    const safeEpisode = positiveInteger(episode, 10000) ? Number(episode) : 1;
    const safeFilename = String(filename || '').slice(0, 260);
    try {
      // 1. Obtenir l'IMDB ID (directement validé ou depuis TMDB)
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
        } catch {}
      }

      const formatted = [];
      const cleanImdb = imdbId ? imdbId.replace('tt', '') : null;

      // 2. Recherche OpenSubtitles REST FR + EN en parallèle avec filtrage & classement par release/FPS
      if (cleanImdb) {
        const fetchOsLang = async (osLang, timeoutMs) => {
          try {
            const osUrl = safeType === 'tv'
              ? `https://rest.opensubtitles.org/search/sublanguageid-${osLang}/imdbid-${cleanImdb}/season-${safeSeason}/episode-${safeEpisode}`
              : `https://rest.opensubtitles.org/search/sublanguageid-${osLang}/imdbid-${cleanImdb}`;
            const osRes = await fetch(osUrl, {
              headers: { 'User-Agent': 'TemporaryUserAgent' },
              signal: AbortSignal.timeout(timeoutMs)
            });
            if (!osRes.ok) return [];
            const osData = await osRes.json();
            return Array.isArray(osData) ? osData : [];
          } catch {
            return [];
          }
        };

        const [frRaw, enRaw] = await Promise.all([
          fetchOsLang('fre', 4000),
          fetchOsLang('eng', 3500)
        ]);

        const rankedFr = rankOpenSubtitles(frRaw, { filename: safeFilename, limit: 4 });
        rankedFr.forEach(({ item: s, hint }, idx) => {
          formatted.push({
            id: `fr-os-${idx}`,
            label: idx === 0 ? 'Français' : `Français (Option ${idx + 1})`,
            hint,
            fps: parseFloat(s.MovieFPS) || null,
            lang: 'fr',
            url: `/api/subtitles-vtt?url=${encodeURIComponent(s.SubDownloadLink)}`
          });
        });

        const rankedEn = rankOpenSubtitles(enRaw, { filename: safeFilename, limit: 3 });
        rankedEn.forEach(({ item: s, hint }, idx) => {
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

      // 3. Fallback Stremio OpenSubtitles v3 si pas encore de sous-titres
      if (formatted.length === 0 && imdbId) {
        try {
          const stremPath = safeType === 'tv'
            ? `https://opensubtitles-v3.strem.io/subtitles/series/${imdbId}:${safeSeason}:${safeEpisode}.json`
            : `https://opensubtitles-v3.strem.io/subtitles/movie/${imdbId}.json`;
          const stremRes = await fetch(stremPath, { redirect: 'error', signal: AbortSignal.timeout(3500) });
          if (stremRes.ok) {
            const data = await stremRes.json();
            const list = Array.isArray(data?.subtitles) ? data.subtitles : [];
            list.slice(0, 3).forEach((s, idx) => {
              const safeSubUrl = normalizeAllowedSubtitleUrl(s.url);
              if (safeSubUrl) {
                formatted.push({
                  id: `strem-${idx}`,
                  label: s.lang === 'eng' ? (idx === 0 ? 'English' : `English [${idx + 1}]`) : (s.lang || 'Piste ' + (idx + 1)),
                  lang: s.lang || 'en',
                  url: `/api/subtitles-vtt?url=${encodeURIComponent(safeSubUrl)}`
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

  // Diagnostic ALTYFLIX Native Streaming Engine
  if (pathname === '/api/debug-engine') {
    const { AUTHORIZED_STREAMS } = require('./nativeStreamingEngine.cjs');
    return sendJSON(res, 200, {
      status: 'operational',
      engine: 'Altyflix Native Streaming Engine v2.0',
      technologies: ['HTML5 Video', 'HLS.js', 'Shaka Player (DASH)', 'Node.js Core'],
      iframes: 0,
      thirdPartyPlayerDependencies: 0,
      authorizedSources: Object.keys(AUTHORIZED_STREAMS).map(k => ({
        id: AUTHORIZED_STREAMS[k].id,
        title: AUTHORIZED_STREAMS[k].title,
        hlsUrl: AUTHORIZED_STREAMS[k].hlsUrl,
        dashUrl: AUTHORIZED_STREAMS[k].dashUrl,
        qualities: AUTHORIZED_STREAMS[k].qualities.map(q => q.label)
      }))
    });
  }

  // ALTYFLIX STREAM RESOLVER SECURISE (Torrentio / TorBox avec gestion de cache)
  if (pathname === '/api/stream-resolve') {
    const { id, imdbId, type = 'movie', season = 1, episode = 1, lang = 'vf', title = '' } = query;
    const userProvider = req.headers['x-debrid-provider'];
    const userToken = req.headers['x-debrid-token'];
    const userFrenchioUrl = req.headers['x-frenchio-url'] || query.frenchioUrl;

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
        userFrenchioUrl,
        enableAudioRemux: HAS_FFMPEG,
        enableAviTranscode: HAS_FFMPEG,
        tmdbApiKey: TMDB_API_KEY
      });
      return sendJSON(res, 200, result);
    } catch (err) {
      console.error('[Stream Resolver Endpoint] Error:', err);
      return sendJSON(res, 500, {
        success: false,
        status: 'error',
        error: 'Erreur interne lors de la résolution du flux.'
      });
    }
  }

  // ALTYFLIX STREAM POLL (Vérifie si un flux en cours de débridage est devenu 'ready')
  if (pathname === '/api/stream-poll') {
    const targetUrl = query.url;
    if (!targetUrl) {
      return sendJSON(res, 400, { success: false, status: 'error', error: 'Paramètre url manquant.' });
    }

    try {
      const statusData = await checkStreamStatus(targetUrl, '', { enableAviTranscode: HAS_FFMPEG });
      const rawStatus = statusData.success === false ? (statusData.statusCode || 400) : 200;
      const httpStatus = (rawStatus === 200 || (rawStatus >= 400 && rawStatus <= 599)) ? rawStatus : 502;
      return sendJSON(res, httpStatus, statusData);
    } catch (err) {
      console.error('[Stream Poll Endpoint] Error:', err);
      return sendJSON(res, 500, {
        success: false,
        status: 'error',
        error: 'Erreur lors de la vérification du flux.'
      });
    }
  }

  // ALTYFLIX NATIVE STREAMING ENGINE (100% Natif HLS / DASH - Zéro iframe - Sources autorisées)
  if (pathname === '/api/direct-stream') {
    const { id, type = 'movie', season = 1, episode = 1, lang = 'vf', format = 'hls' } = query;
    try { validateStreams({ id, type, season, episode, lang }); }
    catch (err) { return sendJSON(res, err.status || 400, { error: err.message }); }

    try {
      const streamData = resolveNativeStream({
        id,
        type,
        season,
        episode,
        lang,
        format
      });
      return sendJSON(res, 200, streamData);
    } catch (err) {
      console.error('[Native Engine] Resolution error:', err);
      return sendJSON(res, 500, {
        success: false,
        error: 'Erreur interne du moteur de lecture natif.'
      });
    }
  }

  // Sous-titres WebVTT de démonstration natifs synchronisés
  if (pathname === '/api/subtitles-demo') {
    const { stream = 'tears-of-steel', lang = 'fr' } = query;
    const vtt = getDemoVtt(stream, lang);
    res.writeHead(200, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'public, max-age=86400'
    });
    return res.end(vtt);
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
  // Redirection automatique des anciennes URLs de lecture vers l'application native Altyflix
  if (pathname.startsWith('/player/')) {
    const segments = pathname.split('/').filter(Boolean); // ['player', 'movie'|'tv', id, s?, e?]
    const pType = segments[1] === 'tv' ? 'tv' : 'movie';
    const pId = segments[2];
    const pSeason = positiveInteger(segments[3], 10000) ? String(Number(segments[3])) : '1';
    const pEpisode = positiveInteger(segments[4], 10000) ? String(Number(segments[4])) : '1';

    if (!positiveInteger(pId)) return sendJSON(res, 400, { error: 'ID TMDB valide requis.' });

    const targetWatchUrl = `/watch/${pType}-${pId}${pType === 'tv' ? `?s=${pSeason}&e=${pEpisode}` : ''}`;
    res.writeHead(302, { Location: targetWatchUrl });
    return res.end();
  }

  // Health Check (compatible Node + Netlify)
  if (pathname === '/health' || pathname === '/api/health') {
    return sendJSON(res, 200, {
      status: 'ok',
      runtime: 'node',
      timestamp: new Date().toISOString(),
      memoryUsage: process.memoryUsage().rss
    });
  }

  // Root API info
  if (pathname === '/api' || pathname === '/api/') {
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
      let data = getCache(cacheKey);
      if (!data) {
        data = await fetchJson(upstreamUrl);
        setCache(cacheKey, data);
      }

      const rawJson = Buffer.from(JSON.stringify(data));
      const acceptsGzip = /\bgzip\b/i.test(req.headers['accept-encoding'] || '');
      const body = (acceptsGzip && rawJson.length > 1024) ? zlib.gzipSync(rawJson, { level: 4 }) : rawJson;
      const headers = {
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'Vary': 'Accept-Encoding',
        'Content-Length': body.length
      };
      if (acceptsGzip && rawJson.length > 1024) headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      return res.end(req.method === 'HEAD' ? undefined : body);
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

  // Toute route /api/* inconnue doit renvoyer 404 JSON (jamais index.html 200 OK)
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return sendJSON(res, 404, { success: false, error: 'Route API introuvable.' });
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
  console.log(`🚀 ALTYFLIX (site web et API) démarré sur le port ${PORT} ! (http://localhost:${PORT})`);
  // Préchauffage silencieux des routes TMDB principales de la page d'accueil
  const warmEndpoints = [
    'trending/all/week?language=fr-FR',
    'movie/popular?language=fr-FR',
    'tv/popular?language=fr-FR',
    'tv/airing_today?language=fr-FR'
  ];
  warmEndpoints.forEach((ep) => {
    try {
      const [p, qs] = ep.split('?');
      const upstreamUrl = tmdbUrl(p, new URLSearchParams(qs), TMDB_API_KEY);
      fetchJson(upstreamUrl).then(d => setCache(upstreamUrl.toString(), d)).catch(() => {});
    } catch {}
  });
});
