import { execSync } from 'node:child_process';
import https from 'node:https';
import fs from 'node:fs';

const SITE_ID = '8629ec21-dbbd-487f-90f6-f6aaad1e2490';
const CONFIG_PATH = 'C:\\Users\\Tylian\\AppData\\Roaming\\netlify\\Config\\config.json';

function getNetlifyToken() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN;
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return cfg.users?.['6a880686efcb74a1a74aa527']?.auth?.token || Object.values(cfg.users || {})[0]?.auth?.token;
  } catch (e) {
    throw new Error('Impossible de trouver le token Netlify : ' + e.message);
  }
}

async function restoreDeploy(deployId, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(`https://api.netlify.com/api/v1/sites/${SITE_ID}/deploys/${deployId}/restore`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'AltyflixDeployer'
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('🚀 Déploiement des fichiers et des fonctions sur Netlify...');
  const token = getNetlifyToken();
  const cliOutput = execSync('npx --yes netlify-cli@17 deploy --dir=dist --functions=netlify/functions --json', {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe']
  });

  // Extraire le JSON de la sortie CLI
  const jsonMatch = cliOutput.match(/\{[\s\S]*"deploy_id"[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Impossible de parser la sortie du déploiement Netlify :\n' + cliOutput);
  }

  const deployData = JSON.parse(jsonMatch[0]);
  const deployId = deployData.deploy_id;
  console.log(`📦 Déploiement créé avec succès (ID: ${deployId}).`);
  console.log('🌐 Activation et publication immédiate en production...');

  await restoreDeploy(deployId, token);
  console.log('✅ Déploiement publié et en ligne sur https://altyflix.netlify.app !');
}

main().catch(err => {
  console.error('❌ Erreur de déploiement :', err.message);
  process.exit(1);
});
