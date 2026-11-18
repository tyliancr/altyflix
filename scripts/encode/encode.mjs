#!/usr/bin/env node
/**
 * ALTYFLIX – encodage HLS adaptatif (ffmpeg requis dans le PATH).
 *
 * Produit dans --out :
 *   master.m3u8
 *   v1080/ v720/ v480/ v360/     vidéo H.264, segments fMP4 de 6 s
 *   audio/<lang>/                une rendition AAC par langue
 *   subs/<lang>[-forced]/        WebVTT + playlist
 *   thumbs/sprite_001.jpg ...    planches de miniatures + thumbs.vtt
 *   manifest.json                résumé lu par seed.mjs et par l'API
 *
 * Exemple :
 *   node scripts/encode/encode.mjs --input film.mkv --out media/titles/mon-film \
 *     --audio lang=fr,name=Français,file=vf.wav,default \
 *     --audio lang=en,name="Version originale",file=film.mkv \
 *     --sub lang=fr,name=Français,file=fr.srt \
 *     --sub lang=fr,name="Français (forcés)",file=fr.forced.srt,forced
 *
 * Ou avec un fichier de travail : node scripts/encode/encode.mjs --job job.json
 */
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { srtToVtt } from './srt-to-vtt.mjs';

const SEGMENT_SECONDS = 6;
const AUDIO_BITRATE = 128_000;

// Échelle de qualités. Seules celles dont la hauteur ne dépasse pas la source sont produites.
const LADDER = [
  { height: 1080, bitrate: 5000, maxrate: 5350, bufsize: 7500, profile: 'high', level: '4.0', codec: 'avc1.640028' },
  { height: 720, bitrate: 2800, maxrate: 2996, bufsize: 4200, profile: 'high', level: '3.1', codec: 'avc1.64001f' },
  { height: 480, bitrate: 1400, maxrate: 1498, bufsize: 2100, profile: 'main', level: '3.1', codec: 'avc1.4d401f' },
  { height: 360, bitrate: 800, maxrate: 856, bufsize: 1200, profile: 'main', level: '3.0', codec: 'avc1.4d401e' },
];

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function run(bin, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'] });
    let out = '';
    let err = '';
    if (capture) {
      child.stdout.on('data', chunk => { out += chunk; });
      child.stderr.on('data', chunk => { err += chunk; });
    }
    child.on('error', error => reject(error.code === 'ENOENT' ? new Error(`${bin} introuvable : installez ffmpeg et ajoutez-le au PATH.`) : error));
    child.on('close', code => (code === 0 ? resolve(out) : reject(new Error(`${bin} a échoué (code ${code}).\n${err.slice(-2000)}`))));
  });
}

/** "lang=fr,name=Français,file=a.wav,default" → { lang, name, file, default: true } */
function parseSpec(spec) {
  const result = {};
  for (const part of spec.split(',')) {
    const index = part.indexOf('=');
    if (index === -1) result[part.trim()] = true;
    else result[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return result;
}

async function loadJob() {
  const { values } = parseArgs({
    options: {
      job: { type: 'string' },
      input: { type: 'string', short: 'i' },
      out: { type: 'string', short: 'o' },
      audio: { type: 'string', multiple: true },
      sub: { type: 'string', multiple: true },
      preset: { type: 'string' },
      start: { type: 'string' },
      duration: { type: 'string' },
      'thumb-interval': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log((await readFile(new URL(import.meta.url), 'utf8')).split('*/')[0].replace(/^#!.*\n\/\*\*/, ''));
    process.exit(0);
  }
  let job = {};
  if (values.job) {
    job = JSON.parse(await readFile(values.job, 'utf8'));
    const base = path.dirname(path.resolve(values.job));
    const abs = file => (file ? path.resolve(base, file) : file);
    job.input = abs(job.input);
    job.out = abs(job.out);
    for (const item of [...(job.audio || []), ...(job.subtitles || [])]) item.file = abs(item.file);
  }
  job.input = values.input ? path.resolve(values.input) : job.input;
  job.out = values.out ? path.resolve(values.out) : job.out;
  job.audio = values.audio ? values.audio.map(parseSpec) : job.audio || [];
  job.subtitles = values.sub ? values.sub.map(parseSpec) : job.subtitles || [];
  job.preset = values.preset || job.preset || 'medium';
  job.start = values.start ?? job.start;
  job.duration = values.duration ?? job.duration;
  job.thumbInterval = Number(values['thumb-interval'] || job.thumbInterval || 0);

  if (!job.input || !job.out) fail('Indiquez --input et --out (ou --job). Voir --help.');
  if (!job.audio.length) job.audio = [{ lang: 'und', name: 'Audio', file: job.input, default: true }];
  for (const track of job.audio) {
    if (!track.lang || !track.name) fail('Chaque --audio demande lang= et name=.');
    track.file = path.resolve(track.file || job.input);
    track.stream = Number(track.stream || 0);
  }
  if (!job.audio.some(track => track.default)) job.audio[0].default = true;
  for (const sub of job.subtitles) {
    if (!sub.lang || !sub.name || !sub.file) fail('Chaque --sub demande lang=, name= et file=.');
    sub.file = path.resolve(sub.file);
    sub.forced = Boolean(sub.forced);
  }
  const keys = new Set();
  for (const sub of job.subtitles) {
    sub.key = sub.forced ? `${sub.lang}-forced` : sub.lang;
    if (keys.has(sub.key)) fail(`Sous-titres en double : ${sub.key}`);
    keys.add(sub.key);
  }
  if (new Set(job.audio.map(track => track.lang)).size !== job.audio.length) fail('Deux pistes audio ont la même langue.');
  return job;
}

async function probe(file) {
  const out = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { capture: true });
  const data = JSON.parse(out);
  const video = data.streams.find(stream => stream.codec_type === 'video' && stream.disposition?.attached_pic !== 1);
  if (!video) fail(`Aucune piste vidéo dans ${file}`);
  const [num, den] = (video.avg_frame_rate && video.avg_frame_rate !== '0/0' ? video.avg_frame_rate : video.r_frame_rate).split('/').map(Number);
  // Tenir compte d'une éventuelle rotation (vidéos de téléphone).
  const rotation = Math.abs(Number(video.side_data_list?.find(side => side.rotation !== undefined)?.rotation || 0));
  const rotated = rotation === 90 || rotation === 270;
  return {
    width: rotated ? video.height : video.width,
    height: rotated ? video.width : video.height,
    fps: den ? num / den : 25,
    duration: Number(data.format.duration),
  };
}

const even = value => Math.max(2, Math.round(value / 2) * 2);
const posix = file => file.split(path.sep).join('/');

function hlsOutput(dir) {
  return [
    '-f', 'hls',
    '-hls_time', String(SEGMENT_SECONDS),
    '-hls_playlist_type', 'vod',
    '-hls_segment_type', 'fmp4',
    '-hls_flags', 'independent_segments',
    '-hls_fmp4_init_filename', 'init.mp4',
    '-hls_segment_filename', posix(path.join(dir, 'seg_%05d.m4s')),
    posix(path.join(dir, 'index.m3u8')),
  ];
}

function trimArgs(job) {
  const args = [];
  if (job.start !== undefined) args.push('-ss', String(job.start));
  if (job.duration !== undefined) args.push('-t', String(job.duration));
  return args;
}

async function encodeVideo(job, source, renditions) {
  console.log(`\n▶ Vidéo : ${renditions.map(r => `${r.height}p`).join(', ')} (preset ${job.preset})`);
  const split = renditions.map((_, index) => `[v${index}]`).join('');
  const filters = [`[0:v:0]split=${renditions.length}${split}`];
  renditions.forEach((rendition, index) => {
    filters.push(`[v${index}]scale=${rendition.width}:${rendition.height}:flags=lanczos,setsar=1[o${index}]`);
  });
  const args = ['-hide_banner', '-loglevel', 'error', '-stats', '-y', ...trimArgs(job), '-i', job.input, '-filter_complex', filters.join(';')];
  for (const [index, rendition] of renditions.entries()) {
    const dir = path.join(job.out, rendition.name);
    await mkdir(dir, { recursive: true });
    args.push(
      '-map', `[o${index}]`,
      '-c:v', 'libx264', '-preset', job.preset,
      '-profile:v', rendition.profile, '-level:v', rendition.level, '-pix_fmt', 'yuv420p',
      '-b:v', `${rendition.bitrate}k`, '-maxrate', `${rendition.maxrate}k`, '-bufsize', `${rendition.bufsize}k`,
      // Images clés toutes les 2 s, alignées entre les qualités : indispensable pour changer de qualité sans à-coup.
      '-force_key_frames', 'expr:gte(t,n_forced*2)', '-sc_threshold', '0',
      '-an', '-sn', '-map_metadata', '-1',
      ...hlsOutput(dir),
    );
  }
  await run('ffmpeg', args);
}

async function encodeAudio(job) {
  for (const track of job.audio) {
    console.log(`\n▶ Audio : ${track.name} (${track.lang})`);
    const dir = path.join(job.out, 'audio', track.lang);
    await mkdir(dir, { recursive: true });
    // Le découpage --start/--duration ne s'applique qu'aux pistes tirées du fichier source.
    const trim = track.file === job.input ? trimArgs(job) : job.duration !== undefined ? ['-t', String(job.duration)] : [];
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', ...trim, '-i', track.file,
      '-map', `0:a:${track.stream}`, '-vn', '-sn', '-map_metadata', '-1',
      '-c:a', 'aac', '-b:a', `${AUDIO_BITRATE / 1000}k`, '-ac', '2', '-ar', '48000',
      ...hlsOutput(dir),
    ]);
  }
}

async function writeSubtitles(job, duration) {
  for (const sub of job.subtitles) {
    console.log(`▶ Sous-titres : ${sub.name} (${sub.key})`);
    const dir = path.join(job.out, 'subs', sub.key);
    await mkdir(dir, { recursive: true });
    const raw = await readFile(sub.file);
    await writeFile(path.join(dir, 'subs.vtt'), srtToVtt(raw, { hls: true }), 'utf8');
    await writeFile(path.join(dir, 'index.m3u8'), [
      '#EXTM3U',
      '#EXT-X-VERSION:7',
      `#EXT-X-TARGETDURATION:${Math.ceil(duration)}`,
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      `#EXTINF:${duration.toFixed(3)},`,
      'subs.vtt',
      '#EXT-X-ENDLIST',
      '',
    ].join('\n'), 'utf8');
  }
}

function vttTime(seconds) {
  const totalMs = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function parseSeconds(value, label) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${label} invalide : ${value}`);
    return value;
  }
  const str = String(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(str)) return Number(str);
  const hms = str.match(/^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  const msMatch = str.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (msMatch) return Number(msMatch[1]) * 60 + Number(msMatch[2]);
  throw new Error(`${label} invalide : ${value}`);
}

async function makeThumbnails(job, source, duration) {
  const interval = job.thumbInterval || (duration <= 600 ? 5 : 10);
  const width = 240;
  const height = even((width * source.height) / source.width);
  const columns = 10;
  const rows = 10;
  const count = Math.max(1, Math.ceil(duration / interval));
  const dir = path.join(job.out, 'thumbs');
  await mkdir(dir, { recursive: true });
  console.log(`\n▶ Miniatures : ${count} vignettes, une toutes les ${interval} s`);
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', ...trimArgs(job), '-i', job.input,
    '-vf', `fps=1/${interval},scale=${width}:${height},tile=${columns}x${rows}`,
    '-an', '-sn', '-q:v', '5', posix(path.join(dir, 'sprite_%03d.jpg')),
  ]);
  const lines = ['WEBVTT', ''];
  for (let index = 0; index < count; index++) {
    const sheet = Math.floor(index / (columns * rows)) + 1;
    const cell = index % (columns * rows);
    const x = (cell % columns) * width;
    const y = Math.floor(cell / columns) * height;
    const start = index * interval;
    const end = Math.min(duration, start + interval);
    lines.push(`${vttTime(start)} --> ${vttTime(end)}`, `sprite_${String(sheet).padStart(3, '0')}.jpg#xywh=${x},${y},${width},${height}`, '');
  }
  await writeFile(path.join(dir, 'thumbs.vtt'), lines.join('\n'), 'utf8');
  return { vtt: 'thumbs/thumbs.vtt', interval, width, height };
}

const quote = value => `"${String(value).replace(/"/g, "'")}"`;

async function writeMaster(job, source, renditions) {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:7', '#EXT-X-INDEPENDENT-SEGMENTS', ''];
  for (const track of job.audio) {
    lines.push(`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE=${quote(track.lang)},NAME=${quote(track.name)},DEFAULT=${track.default ? 'YES' : 'NO'},AUTOSELECT=YES,CHANNELS="2",URI="audio/${track.lang}/index.m3u8"`);
  }
  for (const sub of job.subtitles) {
    // DEFAULT=NO partout : c'est le lecteur qui applique la préférence de l'utilisateur.
    lines.push(`#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE=${quote(sub.lang)},NAME=${quote(sub.name)},DEFAULT=NO,AUTOSELECT=${sub.forced ? 'YES' : 'NO'},FORCED=${sub.forced ? 'YES' : 'NO'},URI="subs/${sub.key}/index.m3u8"`);
  }
  lines.push('');
  const frameRate = source.fps.toFixed(3);
  for (const rendition of renditions) {
    const attributes = [
      `BANDWIDTH=${rendition.maxrate * 1000 + AUDIO_BITRATE}`,
      `AVERAGE-BANDWIDTH=${rendition.bitrate * 1000 + AUDIO_BITRATE}`,
      `RESOLUTION=${rendition.width}x${rendition.height}`,
      `CODECS="${rendition.codec},mp4a.40.2"`,
      `FRAME-RATE=${frameRate}`,
      'AUDIO="audio"',
    ];
    if (job.subtitles.length) attributes.push('SUBTITLES="subs"');
    lines.push(`#EXT-X-STREAM-INF:${attributes.join(',')}`, `${rendition.name}/index.m3u8`);
  }
  lines.push('');
  await writeFile(path.join(job.out, 'master.m3u8'), lines.join('\n'), 'utf8');
}

async function main() {
  const job = await loadJob();
  const source = await probe(job.input);
  const startSec = parseSeconds(job.start, '--start');
  const sourceDur = Number(source.duration);
  let duration = Number.isFinite(sourceDur) && sourceDur > 0 ? sourceDur - startSec : NaN;
  if (job.duration !== undefined) {
    const reqDur = parseSeconds(job.duration, '--duration');
    duration = Number.isFinite(duration) ? Math.min(duration, reqDur) : reqDur;
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Durée résultante invalide (${duration} s) : vérifiez --start et --duration.`);
  }

  let ladder = LADDER.filter(step => step.height <= source.height);
  if (!ladder.length) ladder = [{ ...LADDER.at(-1), height: even(source.height) }];
  const renditions = ladder.map(step => ({
    ...step,
    name: `v${step.height}`,
    width: even((step.height * source.width) / source.height),
  }));

  console.log(`Source : ${source.width}x${source.height}, ${source.fps.toFixed(2)} i/s, ${Math.round(duration)} s`);
  console.log(`Sortie : ${job.out}`);
  await rm(job.out, { recursive: true, force: true });
  await mkdir(job.out, { recursive: true });

  await encodeVideo(job, source, renditions);
  await encodeAudio(job);
  await writeSubtitles(job, duration);
  const thumbnails = await makeThumbnails(job, source, duration);
  await writeMaster(job, source, renditions);

  const manifest = {
    duration: Math.round(duration * 1000) / 1000,
    master: 'master.m3u8',
    renditions: renditions.map(({ name, width, height, bitrate }) => ({ name, width, height, bitrate: bitrate * 1000 })),
    audio: job.audio.map(track => ({ lang: track.lang, name: track.name, default: Boolean(track.default) })),
    subtitles: job.subtitles.map(sub => ({ lang: sub.lang, name: sub.name, forced: sub.forced })),
    thumbnails,
  };
  await writeFile(path.join(job.out, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n✔ Terminé : ${path.join(job.out, 'master.m3u8')}`);
}

main().catch(error => fail(error.message));
