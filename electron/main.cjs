const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let serverProcess = null;
let mainWindow = null;

const PORT = 3000;
const SERVER_URL = `http://localhost:${PORT}`;

function checkServerReady() {
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get(`${SERVER_URL}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          setTimeout(check, 250);
        }
      });
      req.on('error', () => {
        setTimeout(check, 250);
      });
    };
    check();
  });
}

function startBackendServer() {
  return new Promise(async (resolve) => {
    // Vérifier si le serveur tourne déjà
    try {
      const isAlreadyRunning = await new Promise((resCheck) => {
        const req = http.get(`${SERVER_URL}/health`, (res) => resCheck(res.statusCode === 200));
        req.on('error', () => resCheck(false));
      });
      if (isAlreadyRunning) {
        console.log('[Altyflix Electron] Le serveur backend tourne déjà.');
        return resolve();
      }
    } catch {}

    console.log('[Altyflix Electron] Démarrage du serveur audio FFmpeg...');
    const serverScript = path.join(__dirname, '..', 'server', 'server-vf-api.cjs');
    serverProcess = spawn(process.platform === 'win32' ? 'node.exe' : 'node', [serverScript], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(PORT), ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'pipe'
    });

    serverProcess.stdout?.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('démarré sur le port')) {
        console.log('[Altyflix Backend]', msg.trim());
      }
    });

    serverProcess.stderr?.on('data', (d) => {
      console.error('[Altyflix Backend Error]', d.toString().trim());
    });

    await checkServerReady();
    resolve();
  });
}

async function createWindow() {
  await startBackendServer();

  const iconPath = path.join(__dirname, '..', 'public', 'icons', 'icon-512.png');

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: 'ALTYFLIX',
    backgroundColor: '#060608',
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
    } catch {}
    serverProcess = null;
  }
});
