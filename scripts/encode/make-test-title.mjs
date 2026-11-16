#!/usr/bin/env node
/**
 * Fabrique le titre de test « Big Buck Bunny » : une mini-série de 2 épisodes d'une minute,
 * avec deux pistes audio (VF / VO), des sous-titres FR, EN et FR forcés.
 *
 * Big Buck Bunny © Blender Foundation, licence CC BY 3.0 – https://peach.blender.org
 * Le film n'a pas de dialogues : la piste « VF » est la bande-son d'origine avec un bip
 * toutes les 15 s, pour qu'on entende le changement de piste pendant les tests.
 *
 *   node scripts/encode/make-test-title.mjs
 *   node scripts/encode/seed.mjs scripts/encode/titles/bbb-test.json
 */
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const SOURCE_FILE = 'big_buck_bunny_720p_h264.mov';
const SOURCE_URL = `https://download.blender.org/peach/bigbuckbunny_movies/${SOURCE_FILE}.zip`;
const EPISODE_SECONDS = 60;
const EPISODES = 2;

const root = fileURLToPath(new URL('../../', import.meta.url));
const work = path.join(root, 'media', '_work');
const source = path.join(work, 'bbb-source.mov');

function ffmpeg(args, label) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-stats', '-y', ...args], { stdio: 'inherit' });
  if (result.error?.code === 'ENOENT') throw new Error('ffmpeg introuvable : installez-le et ajoutez-le au PATH.');
  if (result.status !== 0) throw new Error(`Échec : ${label}`);
}

const srtTime = seconds => `00:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')},000`;

function makeSrt(lines) {
  return lines.map(([start, end, text], index) => `${index + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${text}\n`).join('\n');
}

await mkdir(work, { recursive: true });

if (!existsSync(source)) {
  // blender.org ne distribue plus le film qu'en archive .zip (environ 420 Mo pour le 720p).
  const zip = path.join(work, 'bbb.zip');
  console.log(`\n▶ Téléchargement de Big Buck Bunny 720p (environ 420 Mo)\n  ${SOURCE_URL}`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status}). Placez vous-même le film dans ${source}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(zip));
  // bsdtar (Windows 10+, macOS) sait lire les .zip ; sous Linux on utilise unzip.
  const unzip = process.platform === 'linux' ? spawnSync('unzip', ['-o', zip, '-d', work], { stdio: 'inherit' }) : spawnSync('tar', ['-xf', zip, '-C', work], { stdio: 'inherit' });
  if (unzip.status !== 0) throw new Error(`Décompression impossible : extrayez ${zip} à la main dans ${work}`);
  await rename(path.join(work, SOURCE_FILE), source);
  await rm(zip, { force: true });
}

for (let episode = 1; episode <= EPISODES; episode++) {
  const start = (episode - 1) * EPISODE_SECONDS;
  const dir = path.join(work, `e${episode}`);
  await mkdir(dir, { recursive: true });

  const vo = path.join(dir, 'vo.wav');
  const vf = path.join(dir, 'vf.wav');
  ffmpeg(['-ss', String(start), '-t', String(EPISODE_SECONDS), '-i', source, '-vn', '-ac', '2', '-ar', '48000', vo], `Épisode ${episode} : piste VO`);
  ffmpeg([
    '-i', vo, '-f', 'lavfi', '-t', String(EPISODE_SECONDS), '-i', 'sine=frequency=880:sample_rate=48000',
    '-filter_complex', "[1:a]volume='0.25*lt(mod(t,15),0.3)':eval=frame[beep];[0:a][beep]amix=inputs=2:duration=first:normalize=0[a]",
    '-map', '[a]', '-ac', '2', vf,
  ], `Épisode ${episode} : piste VF (avec bips)`);

  const slots = Array.from({ length: EPISODE_SECONDS / 5 - 1 }, (_, index) => [index * 5 + 2, index * 5 + 6]);
  await writeFile(path.join(dir, 'fr.srt'), makeSrt(slots.map(([a, b], i) => [a, b, `Épisode ${episode} – sous-titre français n° ${i + 1}\nAccents : é è à ç ù œ`])), 'utf8');
  await writeFile(path.join(dir, 'en.srt'), makeSrt(slots.map(([a, b], i) => [a, b, `Episode ${episode} – English subtitle #${i + 1}`])), 'utf8');
  await writeFile(path.join(dir, 'fr.forced.srt'), makeSrt([[20, 24, '[Panneau] FORÊT – ENTRÉE INTERDITE'], [40, 44, '[Panneau] SOUS-TITRE FORCÉ']]), 'utf8');

  const out = path.join(root, 'media', 'titles', 'bbb-test', `s1e${episode}`);
  console.log(`\n=== Encodage de l'épisode ${episode} ===`);
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'encode', 'encode.mjs'),
    '--input', source, '--out', out, '--start', String(start), '--duration', String(EPISODE_SECONDS), '--preset', 'veryfast',
    '--audio', `lang=fr,name=Français,file=${vf},default`,
    '--audio', `lang=en,name=Anglais – Version originale,file=${vo}`,
    '--sub', `lang=fr,name=Français,file=${path.join(dir, 'fr.srt')}`,
    '--sub', `lang=en,name=Anglais,file=${path.join(dir, 'en.srt')}`,
    '--sub', `lang=fr,name=Français (forcés),file=${path.join(dir, 'fr.forced.srt')},forced`,
  ], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('\n✔ Titre de test prêt dans media/titles/bbb-test');
console.log('  Étape suivante : node scripts/encode/seed.mjs scripts/encode/titles/bbb-test.json');
