/**
 * ALTYFLIX Direct Stream Extractor
 * Extrait les flux vidéo haute vitesse (MP4/HLS) directement depuis les nœuds de streaming
 * pour une lecture 100% native dans le lecteur Netflix d'Altyflix (sans iframe).
 */

const pw = require('playwright-core');

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';

let browser = null;
let browserBusy = false;

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--mute-audio'
    ]
  };

  try {
    browser = await pw.chromium.launch(launchOptions);
    return browser;
  } catch (e) {
    console.error('[Extractor] Browser launch failed:', e.message);
    if (e.message.includes("Executable doesn't exist") || e.message.includes("npx playwright install")) {
      try {
        console.log('[Extractor] Auto-installing Playwright Chromium binary...');
        const { execSync } = require('child_process');
        execSync('npx playwright install chromium', { stdio: 'inherit', env: process.env });
        browser = await pw.chromium.launch(launchOptions);
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
    const deadline = Date.now() + 8000;
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
    ctx = await b.newContext({
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });

    const page = await ctx.newPage();

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

    await page.goto(targetUrl, { timeout: 12000, waitUntil: 'domcontentloaded' }).catch(() => {});

    // Attend la réponse API jusqu'à 8.5s
    const start = Date.now();
    while (!resolved && Date.now() - start < 8500) {
      await new Promise(r => setTimeout(r, 150));
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
