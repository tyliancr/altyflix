import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ALL_AVATARS } from '../src/config/avatars.js';

const root = fileURLToPath(new URL('../', import.meta.url));
async function exactPath(relative) {
  let directory = root;
  for (const segment of relative.split('/')) {
    assert.ok((await readdir(directory)).includes(segment), `Missing or incorrectly cased path: ${relative}`);
    directory = path.join(directory, segment);
  }
}
for (const avatar of ALL_AVATARS) await exactPath(`public${avatar}`);
const html = await readFile(path.join(root, 'index.html'), 'utf8');
assert.ok(!html.includes('rel="manifest"'), 'The PWA plugin owns the manifest link.');
assert.ok(!(await readdir(path.join(root, 'public'))).includes('manifest.webmanifest'), 'Keep a single manifest source in vite.config.js.');
for (const file of ['README.md', 'docs/AUDIT-ALTYFLIX.md', 'docs/LIRE-AVANT-DEPLOIEMENT.md', 'firestore.rules', 'netlify/functions/api.js']) await exactPath(file);
console.log(`Structure validée : ${ALL_AVATARS.length} avatars, casse exacte, manifeste unique et documentation présente.`);
