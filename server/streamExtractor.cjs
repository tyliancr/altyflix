/**
 * ALTYFLIX Direct Stream Extractor
 * Extrait les flux vidéo haute vitesse (MP4/HLS) directement depuis les nœuds de streaming
 * pour une lecture 100% native dans le lecteur Netflix d'Altyflix (sans iframe).
 *
 * Utilise playwright-extra + stealth plugin pour contourner Cloudflare Anti-Bot.
 * Supporte optionnellement un proxy résidentiel via PROXY_URL env var.
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');

// Active le plugin stealth (anti-détection Cloudflare)
chromium.use(stealth());

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';

let browser = null;
let browserBusy = false;

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;

  // Options proxy résidentiel (optionnel, via env var)
  const proxyUrl = process.env.PROXY_URL; // ex: http://user:pass@proxy.brightdata.com:22225

  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--mute-audio',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ]
  };

  // Si un proxy résidentiel est configuré, l'utiliser
  if (proxyUrl) {
    const url = new URL(proxyUrl);
    launchOptions.proxy = {
      server: `${url.protocol}//${url.hostname}:${url.port || 80}`
    };
    // Les credentials seront passés dans le context
    console.log(`[Extractor] Using proxy: ${url.hostname}:${url.port || 80}`);
  }

  try {
    browser = await chromium.launch(launchOptions);
    console.log('[Extractor] Browser launched successfully (stealth mode)');
    return browser;
  } catch (e) {
    console.error('[Extractor] Browser launch failed:', e.message);
    if (e.message.includes("Executable doesn't exist") || e.message.includes("npx playwright install")) {
      try {
        console.log('[Extractor] Auto-installing Playwright Chromium binary...');
        const { execSync } = require('child_process');
        execSync('npx playwright install chromium', { stdio: 'inherit', env: process.env });
        browser = await chromium.launch(launchOptions);
        return browser;
      } catch (installErr) {
        console.error('[Extractor] Auto-install failed:', installErr.message);
      }
    }
    return null;
  }
}

// Cache mémoire des flux extraits (durée de validité : 45 min)
const streamCache = new Map();

/**
 * Extrait le flux vidéo direct pour un film ou un épisode TMDB
 * @param {Object} params
 * @param {string|number} params.id - TMDB ID
 * @param {string} params.type - 'movie' ou 'tv'
 * @param {number} [params.season=1]
 * @param {number} [params.episode=1]
 * @param {string} [params.lang='vf']
 */
async function extractDirectStream({ id, type = 'movie', season = 1, episode = 1, lang = 'vf' }) {
  const cacheKey = `${type}:${id}:${season}:${episode}`;
  const cached = streamCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) {
    return cached.data;
  }

  // File d'attente légère si un onglet est déjà actif
  if (browserBusy) {
    const deadline = Date.now() + 12000;
    while (browserBusy && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const b = await getBrowser();
  if (!b) return null;

  browserBusy = true;
  let ctx = null;
  let resolved = null;

  try {
    // Proxy auth credentials si configuré
    const proxyUrl = process.env.PROXY_URL;
    const contextOptions = {
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'fr-FR',
      timezoneId: 'Europe/Paris',
      // Désactive les flags WebDriver pour tromper Cloudflare
      javaScriptEnabled: true
    };

    // Ajoute les credentials proxy au contexte si configuré
    if (proxyUrl) {
      try {
        const url = new URL(proxyUrl);
        if (url.username) {
          contextOptions.httpCredentials = {
            username: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password || '')
          };
        }
      } catch {}
    }

    ctx = await b.newContext(contextOptions);

    const page = await ctx.newPage();

    // Écoute les réponses réseau pour capturer le flux vidéo
    page.on('response', async res => {
      const u = res.url();
      if (u.includes('/api/b/')) {
        try {
          const json = await res.json();
          if (json?.stream?.qualities) {
            const q = json.stream.qualities;
            // Choisit la meilleure résolution disponible (1080p > 720p > 480p > 360p)
            const best = q['1080']?.url || q['720']?.url || q['480']?.url || q['360']?.url;
            if (best) {
              resolved = {
                rawUrl: best,
                format: 'mp4',
                captions: json.stream.captions || [],
                lang: String(lang).toUpperCase(),
                provider: 'Altyflix Native Stream'
              };
            }
          }
        } catch {}
      }
    });

    const targetUrl = type === 'tv'
      ? `https://vidlink.pro/tv/${id}/${season}/${episode}`
      : `https://vidlink.pro/movie/${id}`;

    console.log(`[Extractor] Navigating to ${targetUrl} (stealth mode)`);
    await page.goto(targetUrl, { timeout: 20000, waitUntil: 'domcontentloaded' }).catch(() => {});

    // Attend la réponse API jusqu'à 15s (plus de marge pour Cloudflare challenge)
    const start = Date.now();
    while (!resolved && Date.now() - start < 15000) {
      await new Promise(r => setTimeout(r, 200));
    }

    if (resolved) {
      console.log(`[Extractor] ✅ Stream found for ${cacheKey}`);
    } else {
      console.log(`[Extractor] ❌ No stream found for ${cacheKey} after ${Date.now() - start}ms`);
    }
  } catch (err) {
    console.error('[Extractor] Error:', err.message);
  } finally {
    browserBusy = false;
    if (ctx) await ctx.close().catch(() => {});
  }

  if (resolved && resolved.rawUrl) {
    const streamData = {
      streamUrl: `/api/video-stream?url=${encodeURIComponent(resolved.rawUrl)}`,
      rawStreamUrl: resolved.rawUrl,
      format: resolved.format,
      lang: resolved.lang,
      provider: resolved.provider,
      captions: resolved.captions
    };

    streamCache.set(cacheKey, { data: streamData, expires: Date.now() + 45 * 60 * 1000 });
    return streamData;
  }

  return null;
}

module.exports = { extractDirectStream, getBrowser };
