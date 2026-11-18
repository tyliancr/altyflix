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
