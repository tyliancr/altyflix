const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const logosDir = path.join(process.cwd(), 'logos');
const brandingDir = path.join(process.cwd(), 'public', 'branding');

[logosDir, brandingDir].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const svgMark = (width, height) => `
<svg width="${width}" height="${height}" viewBox="0 0 66.67 100" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block; overflow:visible;">
    <defs>
        <linearGradient id="leftLegGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#9e1218" />
            <stop offset="100%" stop-color="#5c0a0d" />
        </linearGradient>
        <linearGradient id="rightLegGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#8a0f12" />
            <stop offset="100%" stop-color="#0e0102" />
        </linearGradient>
        <linearGradient id="diagonalGrad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stop-color="#b8090f" />
            <stop offset="50%" stop-color="#e50914" />
            <stop offset="100%" stop-color="#ff2e35" />
        </linearGradient>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="-2" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.85" />
        </filter>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="30" result="coloredBlur"/>
            <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
        </filter>
    </defs>
    <!-- Left Leg -->
    <path d="M 0 0 L 21.67 0 L 21.67 51.85 L 0 100 Z" fill="url(#leftLegGrad)" />
    <!-- Crossbar -->
    <rect x="21.67" y="40" width="23.33" height="20" fill="url(#leftLegGrad)" />
    <!-- Right Leg -->
    <path d="M 45 48.15 L 66.67 0 L 66.67 100 L 45 100 Z" fill="url(#rightLegGrad)" />
    <!-- Diagonal Slash (on top with drop shadow) -->
    <path d="M 0 100 L 21.67 100 L 66.67 0 L 45 0 Z" fill="url(#diagonalGrad)" filter="url(#shadow)" />
</svg>
`;

const targets = [
    {
        name: 'altyflix-discord-server-icon.png',
        width: 1024,
        height: 1024,
        html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1024px;
    height: 1024px;
    background: radial-gradient(circle at 50% 50%, #1e1113 0%, #0d0d0e 70%, #070708 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
  .glow {
    position: absolute;
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, rgba(229, 9, 20, 0.28) 0%, rgba(229, 9, 20, 0) 70%);
    border-radius: 50%;
    filter: blur(40px);
    pointer-events: none;
  }
  .mark-wrap {
    position: relative;
    z-index: 2;
    filter: drop-shadow(0 20px 40px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 50px rgba(229, 9, 20, 0.45));
  }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="mark-wrap">
    ${svgMark(440, 660)}
  </div>
</body>
</html>`
    },
    {
        name: 'altyflix-icon-transparent.png',
        width: 1024,
        height: 1024,
        html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1024px;
    height: 1024px;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .mark-wrap {
    filter: drop-shadow(0 15px 30px rgba(0, 0, 0, 0.7));
  }
</style>
</head>
<body>
  <div class="mark-wrap">
    ${svgMark(460, 690)}
  </div>
</body>
</html>`
    },
    {
        name: 'altyflix-icon-512.png',
        width: 512,
        height: 512,
        html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 512px;
    height: 512px;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .mark-wrap {
    filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.6));
  }
</style>
</head>
<body>
  <div class="mark-wrap">
    ${svgMark(230, 345)}
  </div>
</body>
</html>`
    },
    {
        name: 'altyflix-full-logo-transparent.png',
        width: 2048,
        height: 600,
        html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@900&family=Bebas+Neue&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 2048px;
    height: 600px;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 55px;
    overflow: hidden;
  }
  .mark-wrap {
    filter: drop-shadow(0 10px 25px rgba(0, 0, 0, 0.8)) drop-shadow(0 0 35px rgba(229, 9, 20, 0.5));
  }
  .wordmark {
    font-family: 'Outfit', 'Bebas Neue', sans-serif;
    font-weight: 900;
    font-size: 200px;
    color: #ffffff;
    letter-spacing: -0.04em;
    line-height: 1;
    text-shadow: 0 10px 30px rgba(0,0,0,0.8), 0 0 50px rgba(229, 9, 20, 0.45);
  }
</style>
</head>
<body>
  <div class="mark-wrap">
    ${svgMark(200, 300)}
  </div>
  <div class="wordmark">ALTYFLIX</div>
</body>
</html>`
    },
    {
        name: 'altyflix-discord-banner.png',
        width: 1920,
        height: 1080,
        html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@900&family=Bebas+Neue&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1920px;
    height: 1080px;
    background: radial-gradient(circle at 50% 50%, #1c0f12 0%, #111113 55%, #080809 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
  .glow {
    position: absolute;
    width: 900px;
    height: 500px;
    background: radial-gradient(ellipse, rgba(229, 9, 20, 0.3) 0%, rgba(229, 9, 20, 0) 70%);
    filter: blur(60px);
    pointer-events: none;
  }
  .logo-row {
    display: flex;
    align-items: center;
    gap: 50px;
    position: relative;
    z-index: 2;
  }
  .mark-wrap {
    filter: drop-shadow(0 15px 35px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 50px rgba(229, 9, 20, 0.6));
  }
  .wordmark {
    font-family: 'Outfit', 'Bebas Neue', sans-serif;
    font-weight: 900;
    font-size: 210px;
    color: #ffffff;
    letter-spacing: -0.04em;
    line-height: 1;
    text-shadow: 0 15px 35px rgba(0,0,0,0.9), 0 0 60px rgba(229, 9, 20, 0.5);
  }
  .tagline {
    font-family: 'Outfit', sans-serif;
    font-weight: 600;
    font-size: 28px;
    letter-spacing: 0.35em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
    margin-top: 25px;
    position: relative;
    z-index: 2;
  }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="logo-row">
    <div class="mark-wrap">
      ${svgMark(210, 315)}
    </div>
    <div class="wordmark">ALTYFLIX</div>
  </div>
  <div class="tagline">Streaming illimité • Films &amp; Séries</div>
</body>
</html>`
    },
    {
        name: 'altyflix-discord-banner-960x540.png',
        width: 960,
        height: 540,
        html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@900&family=Bebas+Neue&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 960px;
    height: 540px;
    background: radial-gradient(circle at 50% 50%, #1c0f12 0%, #111113 55%, #080809 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
  .glow {
    position: absolute;
    width: 500px;
    height: 300px;
    background: radial-gradient(ellipse, rgba(229, 9, 20, 0.32) 0%, rgba(229, 9, 20, 0) 70%);
    filter: blur(40px);
    pointer-events: none;
  }
  .logo-row {
    display: flex;
    align-items: center;
    gap: 25px;
    position: relative;
    z-index: 2;
  }
  .mark-wrap {
    filter: drop-shadow(0 10px 25px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 35px rgba(229, 9, 20, 0.6));
  }
  .wordmark {
    font-family: 'Outfit', 'Bebas Neue', sans-serif;
    font-weight: 900;
    font-size: 105px;
    color: #ffffff;
    letter-spacing: -0.04em;
    line-height: 1;
    text-shadow: 0 10px 25px rgba(0,0,0,0.9), 0 0 40px rgba(229, 9, 20, 0.5);
  }
  .tagline {
    font-family: 'Outfit', sans-serif;
    font-weight: 600;
    font-size: 15px;
    letter-spacing: 0.35em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
    margin-top: 15px;
    position: relative;
    z-index: 2;
  }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="logo-row">
    <div class="mark-wrap">
      ${svgMark(105, 158)}
    </div>
    <div class="wordmark">ALTYFLIX</div>
  </div>
  <div class="tagline">Streaming illimité • Films &amp; Séries</div>
</body>
</html>`
    }
];

async function run() {
    console.log('Generating high-resolution PNG logos...');
    for (const t of targets) {
        const tmpHtml = path.join(os.tmpdir(), `logo_${Date.now()}_${t.name}.html`);
        fs.writeFileSync(tmpHtml, t.html, 'utf8');

        const outPath = path.join(logosDir, t.name);
        const brandingPath = path.join(brandingDir, t.name);

        const cmd = `"${edgePath}" --headless=new --disable-gpu --default-background-color=00000000 --hide-scrollbars --screenshot="${outPath}" --window-size=${t.width},${t.height} "file:///${tmpHtml.replace(/\\\\/g, '/')}"`;
        
        console.log(`Rendering ${t.name} (${t.width}x${t.height})...`);
        try {
            execSync(cmd, { stdio: 'ignore' });
            // Copy to public/branding too
            fs.copyFileSync(outPath, brandingPath);
            const stats = fs.statSync(outPath);
            console.log(`✓ Generated ${t.name} (${Math.round(stats.size / 1024)} KB)`);
        } catch (err) {
            console.error(`Error rendering ${t.name}:`, err);
        } finally {
            try { fs.unlinkSync(tmpHtml); } catch {}
        }
    }
    console.log('All logos generated successfully in /logos and /public/branding!');
}

run();
