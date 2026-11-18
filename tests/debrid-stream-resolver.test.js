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
