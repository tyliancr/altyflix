import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedUrl,
  isDownloadingUrl,
  isTorrentioErrorStream,
  parseStreamDetails,
  curateStreams,
  checkStreamStatus
} from '../server/stream-resolver.cjs';

test('Debrid Stream Resolver: Détection stricte entre flux en cache et en cours de téléchargement', () => {
  // 1. Flux TorBox en cache [TB+]
  const cachedStream = {
    name: '[TB+] Torrentio\n1080p',
    title: 'Kaizen (2024) 1080p WEBRip x265 10bit-WORLD\n👤 2 💾 2.19 GB ⚙️ ThePirateBay',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/hash/file.mp4'
  };
  const cachedDetails = parseStreamDetails(cachedStream);
  assert.equal(cachedDetails.isCached, true, 'Le flux avec [TB+] doit être marqué isCached=true');
  assert.equal(cachedDetails.isDownloading, false, 'Le flux en cache ne doit pas être en downloading');
  assert.equal(cachedDetails.tierKey, '1080p');

  // 2. Flux TorBox en téléchargement [TB download]
  const downloadingStream = {
    name: '[TB download] Torrentio\n1080p',
    title: 'Kaizen (2024) 1080p WEBRip-WORLD\n👤 20 💾 2.45 GB ⚙️ ThePirateBay',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/hash2/file2.mp4'
  };
  const downloadingDetails = parseStreamDetails(downloadingStream);
  assert.equal(downloadingDetails.isCached, false, 'Le flux [TB download] ne doit pas être en cache');
  assert.equal(downloadingDetails.isDownloading, true, 'Le flux [TB download] doit être marqué isDownloading=true');
});

test('Debrid Stream Resolver: Priorisation absolue des flux en cache par rapport aux téléchargements', () => {
  // Même si le flux en téléchargement a 20 seeders et le flux en cache n'en a que 2,
  // le flux en cache doit OBLIGATOIREMENT être sélectionné en premier pour éviter le blocage !
  const rawStreams = [
    {
      name: '[TB download] Torrentio\n1080p',
      title: 'Film (2024) 1080p WEBRip-WORLD\n👤 20 💾 2.45 GB ⚙️ ThePirateBay',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/hash_dl/file_dl.mp4'
    },
    {
      name: '[TB+] Torrentio\n1080p',
      title: 'Film (2024) 1080p WEBRip x265 10bit-WORLD\n👤 2 💾 2.19 GB ⚙️ ThePirateBay',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/hash_cached/file_cached.mp4'
    }
  ];

  const curated = curateStreams(rawStreams, 'torbox');
  assert.ok(curated.activeStream, 'Un flux actif doit être sélectionné');
  assert.equal(curated.activeStream.isCached, true, 'Le flux actif sélectionné DOIT être celui en cache');
  assert.equal(curated.activeStream.url, 'https://torrentio.strem.fun/resolve/torbox/tok/hash_cached/file_cached.mp4');
  assert.equal(curated.anyCached, true);
  assert.equal(curated.allDownloading, false);
});

test('Debrid Stream Resolver: Détection quand TOUS les flux sont en cours de téléchargement', () => {
  const rawStreams = [
    {
      name: '[TB download] Torrentio\n1080p',
      title: 'Film Rare (2024) 1080p\n👤 3 💾 2.0 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/hash1/file1.mp4'
    },
    {
      name: '[TB download] Torrentio\n720p',
      title: 'Film Rare (2024) 720p\n👤 2 💾 1.0 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/hash2/file2.mp4'
    }
  ];

  const curated = curateStreams(rawStreams, 'torbox');
  assert.equal(curated.anyCached, false, 'Aucun flux en cache');
  assert.equal(curated.allDownloading, true, 'Tous les flux doivent être détectés en téléchargement');
  assert.ok(curated.activeStream.isDownloading, 'Le flux actif sélectionné doit avoir isDownloading=true');
});

test('Debrid Stream Resolver: Filtrage des clips d\'erreur et de fausses vidéos downloading', () => {
  // 1. URL de fausse vidéo "Torrent is being downloaded to debrid..."
  assert.equal(isDownloadingUrl('https://torrentio.strem.fun/videos/downloading_v3.mp4'), true);
  assert.equal(isDownloadingUrl('https://torrentio.strem.fun/videos/downloading.mp4'), true);
  assert.equal(isDownloadingUrl('https://api.torbox.app/v1/api/torrents/requestdl?token=xyz'), false);

  // 2. isTorrentioErrorStream doit rejeter les downloading_*.mp4
  const errorClip = {
    name: 'Torrentio',
    title: 'Download in progress',
    url: 'https://torrentio.strem.fun/videos/downloading_v3.mp4'
  };
  assert.equal(isTorrentioErrorStream(errorClip), true, 'Le clip downloading_v3.mp4 doit être rejeté');

  // 3. Un vrai stream direct
  const validStream = {
    name: '[TB+] Torrentio',
    title: 'Film.2024.1080p.mp4',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/hash/film.mp4'
  };
  assert.equal(isTorrentioErrorStream(validStream), false, 'Un flux valide ne doit pas être considéré en erreur');
});

test('Debrid Stream Resolver: Protection SSRF stricte sur le polling', async () => {
  // Hôtes autorisés
  assert.equal(isAllowedUrl('https://torrentio.strem.fun/resolve/torbox/test'), true);
  assert.equal(isAllowedUrl('https://tb-cdn.st/dld/test'), true);
  assert.equal(isAllowedUrl('https://api.torbox.app/v1/api/torrents/requestdl'), true);
  assert.equal(isAllowedUrl('https://api.real-debrid.com/rest/1.0/downloads'), true);

  // Hôtes interdits (attaques SSRF)
  assert.equal(isAllowedUrl('http://localhost:3000/api/admin'), false);
  assert.equal(isAllowedUrl('http://127.0.0.1:8080/secret'), false);
  assert.equal(isAllowedUrl('http://169.254.169.254/latest/meta-data'), false);
  assert.equal(isAllowedUrl('file:///etc/passwd'), false);
  assert.equal(isAllowedUrl('gopher://evil.com'), false);

  // checkStreamStatus doit refuser immédiatement une URL non autorisée
  const badResult = await checkStreamStatus('http://169.254.169.254/latest/meta-data');
  assert.equal(badResult.success, false);
  assert.equal(badResult.status, 'error');
});

test('Debrid Stream Resolver: Détection AVI et réécriture automatique vers /api/video-stream', () => {
  const aviStream = {
    name: '[TB+] Torrentio\n1080p',
    title: 'Chouchou (2003) XviD French.avi\n👤 5 💾 700 MB',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/hash_avi/Chouchou.avi'
  };

  const details = parseStreamDetails(aviStream);
  assert.equal(details.isAvi, true, 'Le fichier .avi doit être détecté comme isAvi=true');

  const curated = curateStreams([aviStream], 'torbox');
  assert.ok(curated.activeStream, 'Un flux actif doit être sélectionné');
  assert.equal(curated.activeStream.isTranscoded, true, 'Le flux AVI doit être marqué isTranscoded=true');
  assert.ok(curated.activeStream.url.startsWith('/api/video-stream?url='), 'L\'URL du flux AVI doit être routée via /api/video-stream');
  assert.equal(curated.activeStream.qualityLabel, '1080p FHD · VF', 'Le libellé qualité doit être sobre et sans emojis');
});

test('Debrid Stream Resolver: Support Cloud TorBox (hôte CDN autorisé et flux bibliothèque)', () => {
  assert.equal(isAllowedUrl('https://nexus-324.ceur.tb-cdn.st/dld/test'), true);

  const cloudStream = {
    name: '[TB+] Torbox Cloud\n1080p',
    title: 'Shu-shu.2003.Chouchou_[1,45GB].avi\n👤 1 💾 1.45 GB ⚙️ Ma Bibliothèque TorBox\n🇫🇷',
    url: 'https://nexus-324.ceur.tb-cdn.st/dld/1ee113ff',
    isTorboxLibrary: true
  };

  const curated = curateStreams([cloudStream], 'torbox');
  assert.ok(curated.activeStream);
  assert.equal(curated.activeStream.isCached, true);
  assert.equal(curated.activeStream.isTranscoded, true);
  assert.equal(curated.activeStream.qualityLabel, '1080p FHD · VF');
  assert.ok(curated.activeStream.url.startsWith('/api/video-stream?url='));
});

test('Debrid Stream Resolver: regressions DD+, HDR10+DV cache, CRLF et titres avec "Failed"', () => {
  // 1. DD+ (E-AC-3) doit declencher hasUnsupportedAudio -> needsTranscode
  const ddpStream = {
    name: '[TB+] Torrentio\n1080p',
    title: 'Film.2024.FRENCH.1080p.WEB.DD+5.1.H264.mkv\n👤 10 💾 3.2 GB',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/hash_ddp/film.mkv'
  };
  const ddpDetails = parseStreamDetails(ddpStream);
  assert.equal(ddpDetails.hasUnsupportedAudio, true);
  assert.equal(ddpDetails.isWebAudioSafe, false);

  // 2. [TB download] avec HDR10+DV ne doit JAMAIS etre marque isCached=true
  const hdrDlStream = {
    name: '[TB download] Torrentio\n4k',
    title: 'Film.2024.2160p.HDR10+DV.DD+5.1.mkv\n👤 5 💾 12.0 GB',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/hash_hdr/film.mkv'
  };
  const hdrDetails = parseStreamDetails(hdrDlStream);
  assert.equal(hdrDetails.isCached, false);
  assert.equal(hdrDetails.isDownloading, true);

  // 3. Les caracteres de controle / CRLF dans une URL sont rejetes
  assert.equal(isAllowedUrl('https://api.torbox.app/v1/file\r\nSet-Cookie:a=1'), false);
  assert.equal(isAllowedUrl('https://api.torbox.app/v1/file\nX-Inject:1'), false);

  // 4. Un titre legitime contenant "Failed" ou "Invalid" n'est pas un clip d'erreur Torrentio
  assert.equal(isTorrentioErrorStream({
    name: '[TB+] Torrentio\n1080p',
    title: 'How.I.Failed.My.Exam.2023.1080p.FRENCH.mp4',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/hash_ok/movie.mp4'
  }), false);

  // 5. En mode serverless (enableAviTranscode: false), un flux AVI n'est pas reecrit en /api/video-stream
  const aviServerless = {
    name: '[TB+] Torrentio\n1080p',
    title: 'OldMovie.2003.FRENCH.XviD.avi\n👤 4 💾 700 MB',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/hash_avi2/movie.avi'
  };
  const serverlessCurated = curateStreams([aviServerless], 'torbox', { enableAviTranscode: false });
  assert.equal(serverlessCurated.activeStream.isTranscoded, false);
  assert.ok(serverlessCurated.activeStream.url.startsWith('https://torrentio.strem.fun/'));
});

test('Debrid Stream Resolver: 1080p minimum impose sur les films (avec fallback series conserve)', () => {
  const mixedStreams = [
    {
      name: '[TB+] Torrentio\n720p',
      title: 'Film.2024.FRENCH.720p.WEB.AAC.mp4\n👤 50 💾 1.1 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/hash720/film720.mp4'
    },
    {
      name: '[TB+] Torrentio\n1080p',
      title: 'Film.2024.FRENCH.1080p.WEB.AC3.mkv\n👤 10 💾 3.5 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/hash1080/film1080.mkv'
    },
    {
      name: '[TB+] Torrentio\n4k',
      title: 'Film.2024.FRENCH.2160p.WEB.AAC.mp4\n👤 8 💾 11.0 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/hash4k/film4k.mp4'
    }
  ];

  // Film : 720p ecarte, uniquement 1080p et 4K conserves, 1080p/4K selectionne par defaut
  const movieCurated = curateStreams(mixedStreams, 'torbox', { contentType: 'movie' });
  assert.ok(movieCurated.streams.every(s => s.tierKey === '1080p' || s.tierKey === '4k'));
  assert.equal(movieCurated.activeStream.tierKey, '1080p');

  // Serie : 720p reste propose dans les options de qualite
  const tvCurated = curateStreams(mixedStreams, 'torbox', { contentType: 'tv' });
  assert.ok(tvCurated.streams.some(s => s.tierKey === '720p'));
});

test('Debrid Stream Resolver: detection AAC5.1/DDP2.0/DVDRip et priorite audio AAC sans FFmpeg (Netlify)', () => {
  const aac51 = parseStreamDetails({
    name: '[TB+] Torrentio\n1080p',
    title: 'Film.2024.FRENCH.1080p.BluRay.x265.AAC5.1.mp4\n👤 5 💾 2.5 GB',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/h1/f.mp4'
  });
  assert.equal(aac51.isWebAudioSafe, true);
  assert.equal(aac51.hasUnsupportedAudio, false);

  const ddp20 = parseStreamDetails({
    name: '[TB+] Torrentio\n1080p',
    title: 'Show.S01E01.1080p.WEB-DL.DDP2.0.H.264.mkv\n👤 5 💾 1.5 GB',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/h2/f.mkv'
  });
  assert.equal(ddp20.hasUnsupportedAudio, true);

  const dvdrip = parseStreamDetails({
    name: '[TB+] Torbox Cloud',
    title: 'lagence.tous.risques.vf.Dvdrip.xvid-T911.avi\n👤 1 💾 0.7 GB',
    url: 'https://nexus-320.ceur.tb-cdn.st/dld/abc'
  });
  assert.equal(dvdrip.tierKey, '480p');

  // Sans remux FFmpeg (Netlify), la VF 4K AAC (avec son) doit battre la VF 1080p AC3 (muette)
  const netlifyChoice = curateStreams([
    {
      name: '[TB+] Torrentio\n1080p',
      title: 'Inception.2010.MULTi.VFF.1080p.HDLight.AC3.5.1.mkv\n👤 30 💾 3.5 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/h3/ac3.mkv'
    },
    {
      name: '[TB+] Torrentio\n4k',
      title: 'Inception.2010.MULTi.VFF.2160p.BluRay.HE.AAC.5.1.mkv\n👤 10 💾 12.0 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/h4/aac.mkv'
    }
  ], 'torbox', { enableAudioRemux: false, enableAviTranscode: false, contentType: 'movie' });
  assert.equal(netlifyChoice.activeStream.tierKey, '4k');
  assert.equal(netlifyChoice.activeStream.isWebAudioSafe, true);
});

test('Debrid Stream Resolver: VF prioritaire au lancement mais VO toujours conservee dans les choix', () => {
  const streams = [
    { name: '[TB+] Torrentio\n4k', title: 'Movie.2024.TRUEFRENCH.2160p.WEB.AAC.mp4\n👤 20 💾 10 GB', url: 'https://torrentio.strem.fun/resolve/torbox/tok/v1/f1.mp4' },
    { name: '[TB+] Torrentio\n1080p', title: 'Movie.2024.TRUEFRENCH.1080p.WEB.AAC.mp4\n👤 30 💾 3 GB', url: 'https://torrentio.strem.fun/resolve/torbox/tok/v2/f2.mp4' },
    { name: '[TB+] Torrentio\n720p', title: 'Movie.2024.TRUEFRENCH.720p.WEB.AAC.mp4\n👤 25 💾 1.2 GB', url: 'https://torrentio.strem.fun/resolve/torbox/tok/v3/f3.mp4' },
    { name: '[TB+] Torrentio\n480p', title: 'Movie.2024.TRUEFRENCH.480p.WEB.AAC.mp4\n👤 15 💾 0.7 GB', url: 'https://torrentio.strem.fun/resolve/torbox/tok/v4/f4.mp4' },
    { name: '[TB+] Torrentio\n1080p', title: 'Movie.2024.VOSTFR.1080p.WEB.AAC.mp4\n👤 12 💾 2.8 GB', url: 'https://torrentio.strem.fun/resolve/torbox/tok/v5/f5.mp4' },
    { name: '[TB+] Torrentio\n1080p', title: 'Movie.2024.1080p.BluRay.x264.YIFY.mp4\n👤 40 💾 2.1 GB', url: 'https://torrentio.strem.fun/resolve/torbox/tok/v6/f6.mp4' }
  ];

  const curated = curateStreams(streams, 'torbox', { contentType: 'tv', preferredLang: 'vf' });
  assert.equal(curated.activeStream.isFrench, true, 'La VF doit etre active par defaut');
  assert.ok(curated.streams.some(s => !s.isFrench), 'Une source VO doit toujours etre disponible dans les options');
});

test('Debrid Stream Resolver: regressions The.Aviator, VOSTFR avec drapeau FR, underscores et 720p en cache vs 1080p non cache', () => {
  // 1. "The.Aviator" ne doit JAMAIS etre classé isAvi=true
  const aviator = parseStreamDetails({
    name: '[TB+] Torrentio\n1080p',
    title: 'The.Aviator.2004.1080p.BluRay.AAC.mp4\n👤 20 💾 2.5 GB',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/h_av/The.Aviator.mp4'
  });
  assert.equal(aviator.isAvi, false, 'The.Aviator.mp4 ne doit pas declencher isAvi');

  // 2. Une release VOSTFR portant un drapeau 🇫🇷 ne doit PAS etre classee VF
  const vostfrFlag = parseStreamDetails({
    name: '[TB+] Torrentio\n1080p',
    title: 'Anime.Movie.2024.1080p.WEB.VOSTFR.AAC.mkv\n👤 15 💾 2.1 GB\n🇫🇷',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/h_vo/movie.mkv'
  });
  assert.equal(vostfrFlag.isFrench, false, 'VOSTFR avec drapeau FR ne doit pas etre classe VF');
  assert.equal(vostfrFlag.isVostfr, true, 'VOSTFR avec drapeau FR doit etre classe VOSTFR');

  // 3. Les noms avec underscores doivent detecter correctement 480p / DVDRip / XviD / AVI
  const underscoreAvi = parseStreamDetails({
    name: '[TB+] Torrentio',
    title: 'Chouchou_2003_FRENCH_DVDRip_XviD.avi\n👤 3 💾 700 MB',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/h_us/Chouchou.avi'
  });
  assert.equal(underscoreAvi.isFrench, true);
  assert.equal(underscoreAvi.tierKey, '480p');
  assert.equal(underscoreAvi.isAvi, true);

  // 4. Un film avec 720p EN CACHE et 1080p NON CACHE (download) doit garder le 720p en cache pour lecture instantanee
  const cached720VsUncached1080 = curateStreams([
    {
      name: '[TB download] Torrentio\n1080p',
      title: 'RareFilm.2005.FRENCH.1080p.WEB.AAC.mp4\n👤 10 💾 3.0 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/h1080/dl.mp4'
    },
    {
      name: '[TB+] Torrentio\n720p',
      title: 'RareFilm.2005.FRENCH.720p.WEB.AAC.mp4\n👤 5 💾 1.4 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/h720/cached.mp4'
    }
  ], 'torbox', { contentType: 'movie' });
  assert.equal(cached720VsUncached1080.activeStream.isCached, true, 'Le 720p en cache ne doit pas etre elimine par un 1080p non cache');
  assert.equal(cached720VsUncached1080.activeStream.tierKey, '720p');
});

test('Debrid Stream Resolver: Détection H.264/H.265 et priorisation H.264 pour compatibilité navigateur 100%', () => {
  const h264Stream = parseStreamDetails({
    name: '[TB+] Torrentio\n1080p',
    title: 'Gladiator.2000.FRENCH.1080p.BluRay.x264.AAC.mp4\n👤 25 💾 2.5 GB',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/h264/gladiator.mp4'
  });
  assert.equal(h264Stream.isH264, true);
  assert.equal(h264Stream.isH265, false);

  const h265Stream = parseStreamDetails({
    name: '[TB+] Torrentio\n1080p',
    title: 'Gladiator.2000.FRENCH.1080p.BluRay.x265.10bit.AAC.mp4\n👤 30 💾 1.8 GB',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/h265/gladiator.mp4'
  });
  assert.equal(h265Stream.isH264, false);
  assert.equal(h265Stream.isH265, true);

  // À résolution et langue égales, H.264 doit être prioritaire sur H.265 pour éviter les erreurs de décodage Chrome
  const curated = curateStreams([
    {
      name: '[TB+] Torrentio\n1080p',
      title: 'Gladiator.2000.FRENCH.1080p.BluRay.x265.10bit.AAC.mp4\n👤 30 💾 1.8 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/h265/gladiator.mp4'
    },
    {
      name: '[TB+] Torrentio\n1080p',
      title: 'Gladiator.2000.FRENCH.1080p.BluRay.x264.AAC.mp4\n👤 25 💾 2.5 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/h264/gladiator.mp4'
    }
  ], 'torbox');
  assert.equal(curated.activeStream.isH264, true);
  assert.equal(curated.activeStream.url, 'https://torrentio.strem.fun/resolve/torbox/tok/h264/gladiator.mp4');
});

test('Debrid Stream Resolver: Audio universel (AAC/MP3/Opus) prioritaire sur AC3 silencieux et support multi-audio AAC+AC3', () => {
  // 1. Un release MULTi contenant AC3 ET AAC ne doit PAS être marqué en audio non supporté
  const multiAudioStream = parseStreamDetails({
    name: '[TB+] Torrentio\n1080p',
    title: 'Inception.2010.MULTI.1080p.BluRay.x264.AC3.AAC.mkv\n👤 10 💾 2.8 GB',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/multi/inception.mkv'
  });
  assert.equal(multiAudioStream.isWebAudioSafe, true, 'Le flux avec AAC doit être considéré comme audio compatible web');
  assert.equal(multiAudioStream.hasUnsupportedAudio, false, 'Le flux contenant AAC ne doit pas être pénalisé comme AC3 pur');

  // 2. Sur Netlify (enableAudioRemux = false), un flux avec audio garanti doit être choisi en priorité
  const curated = curateStreams([
    {
      name: '[TB+] Torrentio\n1080p',
      title: 'Movie.2023.FRENCH.1080p.BluRay.x264.AC3-EVO.mkv\n👤 20 💾 2.4 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/ac3/movie.mkv'
    },
    {
      name: '[TB+] Torrentio\n1080p',
      title: 'Movie.2023.FRENCH.1080p.WEB.H264.AAC-VXT.mp4\n👤 15 💾 2.1 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/aac/movie.mp4'
    }
  ], 'torbox', { enableAudioRemux: false });
  assert.equal(curated.activeStream.url, 'https://torrentio.strem.fun/resolve/torbox/tok/aac/movie.mp4');
  assert.equal(curated.activeStream.hasUnsupportedAudio, false);
});

test('Debrid Stream Resolver: Élimination des CAM/TS et sélection des meilleurs torrents (VFF, BluRay/WEB-DL, AAC)', () => {
  // 1. Une release CAM ou TeleSync même avec 500 seeds doit être écartée au profit d'un WEB-DL propre
  const curated = curateStreams([
    {
      name: '[TB+] Torrentio\n1080p',
      title: 'Dune.Part.Two.2024.FRENCH.1080p.HDCAM.x264.AAC\n👤 500 💾 2.2 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/cam/dune.mp4'
    },
    {
      name: '[TB+] Torrentio\n1080p',
      title: 'Dune.Part.Two.2024.FRENCH.1080p.WEB-DL.H264.AAC-FW\n👤 30 💾 3.2 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/webdl/dune.mp4'
    }
  ], 'torbox');
  assert.equal(curated.activeStream.url, 'https://torrentio.strem.fun/resolve/torbox/tok/webdl/dune.mp4', 'Le WEB-DL propre doit battre le CAM');

  // 2. Entre une version standard et une version VFF (Vraie Version Française certifiée), la VFF l'emporte
  const curatedVff = curateStreams([
    {
      name: '[TB+] Torrentio\n1080p',
      title: 'Inception.2010.FRENCH.1080p.WEB.x264.AAC\n👤 20 💾 2.5 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/vf/inc.mp4'
    },
    {
      name: '[TB+] Torrentio\n1080p',
      title: 'Inception.2010.TRUEFRENCH.VFF.1080p.BluRay.x264.AAC-EXTREME\n👤 25 💾 3.1 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/vff/inc.mp4'
    }
  ], 'torbox');
  assert.equal(curatedVff.activeStream.url, 'https://torrentio.strem.fun/resolve/torbox/tok/vff/inc.mp4', 'La release VFF / TrueFrench BluRay doit être sélectionnée en priorité absolue');
});

test('Debrid Stream Resolver: Règle d\'or Netflix - lecture instantanée sans blocage (flux en cache prioritaire sur VF en téléchargement)', () => {
  // Cas critique réel (FROM S01E01) :
  // Le torrent VF 1080p n'est pas encore terminé sur TorBox (isDownloading=true)
  // Le torrent VO 1080p est déjà présent dans le cache (isCached=true)
  // Le resolver et le lecteur DOIVENT impérativement choisir la source en cache prête
  // pour que la lecture démarre en < 1 seconde au lieu de bloquer l'utilisateur sur un spinner !
  const streams = [
    {
      name: '[TB download] Torrentio\n1080p',
      title: 'FROM.S01E01.FRENCH.1080p.WEB.AAC\n👤 15 💾 2.3 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/dl/from_vf.mp4'
    },
    {
      name: '[TB+] Torrentio\n1080p',
      title: 'FROM.S01E01.1080p.WEB.x264-GLHF\n👤 40 💾 2.1 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/cached/from_vo.mp4'
    },
    {
      name: '[TB download] Torrentio\n4k',
      title: 'FROM.S01E01.2160p.WEB.x265\n👤 5 💾 8.0 GB',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/dl/from_4k.mp4'
    }
  ];

  const curated = curateStreams(streams, 'torbox', { contentType: 'tv', preferredLang: 'vf' });
  assert.equal(curated.activeStream.isCached, true, 'Le flux actif DOIT être celui en cache');
  assert.equal(curated.activeStream.isDownloading, false, 'Le flux actif ne doit PAS être en cours de téléchargement');
  assert.equal(curated.activeStream.url, 'https://torrentio.strem.fun/resolve/torbox/tok/cached/from_vo.mp4');
  assert.equal(curated.streams[0].isCached, true, 'Le premier choix dans les options du lecteur DOIT être le flux prêt');
});

test('Debrid Stream Resolver: Support flux TorBox CDN direct (parsing description et détection [TB+])', () => {
  const multiStreams = [
    {
      name: '[TB+] Torrentio\n1080p',
      description: 'Fall.Guy.2024.FRENCH.1080p.WEB.H264.AAC\n👤 25 💾 3.2 GB',
      url: 'https://tb-cdn.st/dld/encrypted_token_1/fall_guy.mp4'
    },
    {
      name: '[❌] torbox',
      description: 'torbox: Invalid API key.',
      url: 'https://torrentio.strem.fun/playback/invalid'
    }
  ];

  assert.equal(isTorrentioErrorStream(multiStreams[1]), true, 'L\'erreur [❌] doit être rejetée');
  assert.equal(isTorrentioErrorStream(multiStreams[0]), false, 'Le flux valide doit être accepté');

  const curated = curateStreams(multiStreams, 'torbox', { contentType: 'movie' });
  assert.equal(curated.streams.length, 1);
  assert.equal(curated.activeStream.isCached, true);
  assert.equal(curated.activeStream.isFrench, true);
  assert.equal(curated.activeStream.url, 'https://tb-cdn.st/dld/encrypted_token_1/fall_guy.mp4');
});

test('Debrid Stream Resolver: Audio garanti sans faux positifs (LD/HDTV AAC prioritaire sur WEB-DL FW muet)', () => {
  const fwRelease = parseStreamDetails({
    name: '[TB+] Torrentio\n1080p',
    title: '9-1-1.S03.MULTi.1080p.WEB.H264-FW\n9-1-1.S03E15.MULTi.1080p.WEB.H264-FW.mkv\n👤 7 💾 2.73 GB ⚙️ Torrent9\nMulti Audio / 🇫🇷',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/fw/f.mkv'
  });
  // FW est un WEB-DL scène sans mention AAC : ne doit PAS être marqué en Web Audio Safe (contient E-AC-3)
  assert.equal(fwRelease.isWebAudioSafe, false, 'FW sans AAC ne doit pas être faux positif web audio');
  assert.equal(fwRelease.hasUnsupportedAudio, true);

  const ldRelease = parseStreamDetails({
    name: '[TB+] Torrentio\nWEB-DL',
    title: '9-1-1 Saison 3 FRENCH HDTV\n9-1-1.S03E15.FRENCH.LD.AMZN.WEB-DL.x264-FRATERNiTY.mkv\n👤 3 💾 404.42 MB ⚙️ Torrent9\n🇫🇷',
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/ld/f.mkv'
  });
  // FRATERNiTY LD est un rip stéréo garanti
  assert.equal(ldRelease.isWebAudioSafe, true, 'LD stéréo doit être reconnu en Web Audio Safe');
  assert.equal(ldRelease.hasUnsupportedAudio, false);

  // Sur Netlify (enableAudioRemux = false), la version avec son universel (LD) doit être active par défaut
  const curated = curateStreams([
    {
      name: '[TB+] Torrentio\n1080p',
      title: '9-1-1.S03.MULTi.1080p.WEB.H264-FW\n9-1-1.S03E15.MULTi.1080p.WEB.H264-FW.mkv\n👤 7 💾 2.73 GB ⚙️ Torrent9\nMulti Audio / 🇫🇷',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/fw/f.mkv'
    },
    {
      name: '[TB+] Torrentio\nWEB-DL',
      title: '9-1-1 Saison 3 FRENCH HDTV\n9-1-1.S03E15.FRENCH.LD.AMZN.WEB-DL.x264-FRATERNiTY.mkv\n👤 3 💾 404.42 MB ⚙️ Torrent9\n🇫🇷',
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/ld/f.mkv'
    }
  ], 'torbox', { enableAudioRemux: false, contentType: 'tv' });

  assert.equal(curated.activeStream.url, 'https://torrentio.strem.fun/resolve/torbox/tok/ld/f.mkv', 'La version avec son garanti doit être active');
  assert.equal(curated.activeStream.isWebAudioSafe, true);
  // Les deux versions doivent être proposées pour que l'utilisateur puisse choisir Dolby s'il a le matériel
  assert.equal(curated.streams.length, 2, 'Les deux versions (Stéréo et Dolby) doivent être proposées');
});

test('Debrid Stream Resolver: Films français (isFrenchOriginal), réconciliation multi-titres (BAC Nord / The Stronghold) et pistes AAC originales', () => {
  // 1. Un film français encodé par YTS avec AAC doit être reconnu comme VF (son original français) et Web Audio Safe
  const ytsRelease = parseStreamDetails({
    name: '[TB+] Torrentio\n1080p',
    title: 'Kaamelott: First Installment 2021 1080p BluRay\n👤 9 💾 2.21 GB ⚙️ YTS',
    behaviorHints: { filename: 'Kaamelott.First.Installment.2021.1080p.BluRay.x264.AAC5.1-[YTS.MX].mp4' },
    url: 'https://torrentio.strem.fun/resolve/torbox/tok/kaamelott/yts.mp4'
  }, { isFrenchOriginal: true });

  assert.equal(ytsRelease.isFrench, true, 'Un film français conserve son audio français en VO');
  assert.equal(ytsRelease.isWebAudioSafe, true, 'YTS AAC doit être compatible web');
  assert.equal(ytsRelease.languageLabel, 'Français (Original)');

  // 2. Réconciliation multi-titres : une release sous titre international (The Stronghold) ne doit PAS être éliminée quand on cherche BAC Nord
  const rawStreams = [
    {
      name: '[TB+] Torrentio\n1080p',
      title: 'The.Stronghold.2020.FRENCH.1080p.BluRay.H264.AAC-VXT\n👤 15 💾 1.98 GB ⚙️ RARBG\n🇫🇷',
      behaviorHints: { filename: 'The.Stronghold.2020.FRENCH.1080p.BluRay.H264.AAC-VXT.mp4' },
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/bac/vxt.mp4'
    },
    {
      name: '[TB+] Torrentio\n1080p',
      title: 'Bac.Nord.2020.FRENCH.1080p.BluRay.DTS.x264-EXTREME\n👤 4 💾 6.55 GB ⚙️ Torrent9\n🇫🇷',
      behaviorHints: { filename: 'Bac.Nord.2020.FRENCH.1080p.BluRay.DTS.x264-EXTREME.mkv' },
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/bac/extreme.mkv'
    }
  ];

  const curated = curateStreams(rawStreams, 'torbox', {
    contentType: 'movie',
    cleanTitle: 'BAC Nord',
    titleVariants: ['BAC Nord', 'The Stronghold'],
    isFrenchOriginal: true,
    enableAudioRemux: false
  });

  assert.equal(curated.streams.length, 2, 'Les deux versions (titre français et titre international) doivent être conservées');
  assert.equal(curated.activeStream.url, 'https://torrentio.strem.fun/resolve/torbox/tok/bac/vxt.mp4', 'Le flux AAC universel doit être le flux actif par défaut');
  assert.equal(curated.activeStream.isWebAudioSafe, true);
});

test('Debrid Stream Resolver: Protection anti-japonais / multi international (rejet fausse VF sur TPB Multi)', () => {
  const multiStreams = [
    {
      name: '[TB+] Torrentio\n1080p',
      title: 'Pride.And.Prejudice.2005.BDRip.1080p.x264.Multi + Extras [MKV]\nPride.&.Prejudice.2005.BDRip.1080p.x264.[Multi].mkv\n👤 8 💾 5.94 GB ⚙️ ThePirateBay\nMulti Audio',
      behaviorHints: { filename: 'Pride.&.Prejudice.2005.BDRip.1080p.x264.[Multi].mkv' },
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/pap/tpb_multi.mkv'
    },
    {
      name: '[TB+] Torrentio\n1080p',
      title: 'Pride.and.Prejudice.2005.1080p.BrRip.x264.BOKUTOX.YIFY\n👤 66 💾 1.8 GB ⚙️ ThePirateBay',
      behaviorHints: { filename: 'Pride.and.Prejudice.2005.1080p.BrRip.x264.BOKUTOX.YIFY.mp4' },
      url: 'https://torrentio.strem.fun/resolve/torbox/tok/pap/yts.mp4'
    }
  ];

  const parsedTpb = parseStreamDetails(multiStreams[0], 'Pride and Prejudice');
  assert.equal(parsedTpb.isFrench, false, 'Un Multi de ThePirateBay sans marqueur VF explicite ne doit JAMAIS être classé en VF');
  assert.equal(parsedTpb.isVostfr, true, 'Le flux Multi international doit être classé en VOSTFR');

  const curated = curateStreams(multiStreams, 'torbox', {
    contentType: 'movie',
    preferredLang: 'vf',
    enableAudioRemux: false
  });

  assert.equal(curated.hasTrueVf, false, 'Aucune vraie VF ne doit être détectée s\'il n\'y a que des releases internationales');
  assert.equal(curated.activeStream.url, 'https://torrentio.strem.fun/resolve/torbox/tok/pap/yts.mp4', 'Le film doit se lancer en VOSTFR AAC propre au lieu du faux Multi');
  assert.equal(curated.activeStream.isWebAudioSafe, true);
});
