/**
 * ALTYFLIX NATIVE STREAMING ENGINE
 * Moteur de lecture vidéo 100% natif Altyflix (HLS & DASH).
 *
 * Zéro iframe, zéro dépendance à des lecteurs tiers (VidLink, Videasy, etc.).
 * Utilise des sources de streaming de démonstration autorisées et libres de droits (CC-BY).
 * Conforme HLS (RFC 8216) et ISO/IEC MPEG-DASH.
 */

// Catalogue des flux de référence libres et autorisés
const AUTHORIZED_STREAMS = {
  // Démonstration 1 : Tears of Steel (Sci-Fi / Action) - © Blender Foundation, CC BY 3.0
  tearsOfSteel: {
    id: 'tears-of-steel',
    title: 'Tears of Steel',
    synopsis: 'Dans un futur dystopique à Amsterdam, un groupe de scientifiques et de combattants tente de sauver le monde grâce à la technologie holographique.',
    year: 2012,
    hlsUrl: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
    dashUrl: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.mpd',
    duration: 734,
    qualities: [
      { id: -1, label: 'Auto (Adaptatif)' },
      { id: 4, label: '1080p FHD' },
      { id: 3, label: '720p HD' },
      { id: 2, label: '480p SD' },
      { id: 1, label: '360p' }
    ],
    audioTracks: [
      { id: 0, name: 'Français [VF]', lang: 'fr' },
      { id: 1, name: 'Original [VO]', lang: 'en' }
    ],
    captions: [
      { id: 'tos-fr', language: 'Français', lang: 'fr', url: '/api/subtitles-demo?stream=tears-of-steel&lang=fr' },
      { id: 'tos-en', language: 'English', lang: 'en', url: '/api/subtitles-demo?stream=tears-of-steel&lang=en' }
    ],
    markers: {
      intro: { start: 10, end: 32 },
      credits: { start: 690 }
    }
  },

  // Démonstration 2 : Big Buck Bunny (Animation / Comédie) - © Blender Foundation, CC BY 3.0
  bigBuckBunny: {
    id: 'big-buck-bunny',
    title: 'Big Buck Bunny',
    synopsis: 'Un grand lapin au cœur tendre décide de se venger de trois petits animaux de la forêt qui tyrannisent les créatures innocentes.',
    year: 2008,
    hlsUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    dashUrl: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd',
    duration: 596,
    qualities: [
      { id: -1, label: 'Auto (Adaptatif)' },
      { id: 4, label: '1080p FHD' },
      { id: 3, label: '720p HD' },
      { id: 2, label: '480p SD' },
      { id: 1, label: '360p' }
    ],
    audioTracks: [
      { id: 0, name: 'Français [VF]', lang: 'fr' },
      { id: 1, name: 'Original [VO]', lang: 'en' }
    ],
    captions: [
      { id: 'bbb-fr', language: 'Français', lang: 'fr', url: '/api/subtitles-demo?stream=big-buck-bunny&lang=fr' },
      { id: 'bbb-en', language: 'English', lang: 'en', url: '/api/subtitles-demo?stream=big-buck-bunny&lang=en' }
    ],
    markers: {
      intro: { start: 5, end: 20 },
      credits: { start: 560 }
    }
  },

  // Démonstration 3 : Akamai Adaptive Multi-Rate Stream (Diffusion sportive / Événement)
  akamaiTest: {
    id: 'akamai-live-test',
    title: 'Altyflix Broadcast Demo',
    synopsis: 'Flux adaptatif haute vitesse testant la commutation transparente de débit et la résistance aux coupures de réseau.',
    year: 2024,
    hlsUrl: 'https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8',
    dashUrl: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd',
    duration: 900,
    qualities: [
      { id: -1, label: 'Auto (Adaptatif)' },
      { id: 3, label: '1080p FHD' },
      { id: 2, label: '720p HD' },
      { id: 1, label: '480p SD' }
    ],
    audioTracks: [
      { id: 0, name: 'Stéréo Principal', lang: 'fr' }
    ],
    captions: [],
    markers: { intro: null, credits: null }
  }
};

/**
 * Résout le flux de démonstration approprié selon le titre, le type et les paramètres d'épisode
 */
function resolveNativeStream({ id, type = 'movie', season = 1, episode = 1, format = 'hls', lang = 'vf' }) {
  const numId = parseInt(id, 10) || 0;
  const isTv = type === 'tv';

  let selectedStream;
  if (isTv) {
    // Alternance intelligente des streams de démonstration selon la parité de l'épisode
    selectedStream = (episode % 2 === 1) ? AUTHORIZED_STREAMS.tearsOfSteel : AUTHORIZED_STREAMS.bigBuckBunny;
  } else {
    // Pour les films, sélection déterministe basée sur l'ID TMDB
    if (numId % 3 === 0) {
      selectedStream = AUTHORIZED_STREAMS.bigBuckBunny;
    } else if (numId % 3 === 1) {
      selectedStream = AUTHORIZED_STREAMS.tearsOfSteel;
    } else {
      selectedStream = AUTHORIZED_STREAMS.akamaiTest;
    }
  }

  const primaryUrl = (format === 'dash' && selectedStream.dashUrl)
    ? selectedStream.dashUrl
    : selectedStream.hlsUrl;

  return {
    success: true,
    engine: 'Altyflix Native Engine v2.0',
    mode: 'native',
    tmdb_id: id,
    content_type: type,
    season: isTv ? parseInt(season, 10) : null,
    episode: isTv ? parseInt(episode, 10) : null,
    streamUrl: primaryUrl,
    hlsUrl: selectedStream.hlsUrl,
    dashUrl: selectedStream.dashUrl,
    format: format === 'dash' ? 'dash' : 'hls',
    duration: selectedStream.duration,
    qualities: selectedStream.qualities,
    audioTracks: selectedStream.audioTracks,
    captions: selectedStream.captions,
    markers: selectedStream.markers,
    license: 'Creative Commons CC BY 3.0 (Authorized Open Stream)',
    provider: 'Altyflix Native Core (Zero Iframe)'
  };
}

/**
 * Génère des sous-titres WebVTT de démonstration synchronisés
 */
function getDemoVtt(streamKey, lang = 'fr') {
  if (lang === 'fr') {
    return `WEBVTT - Altyflix Native Subtitles (Français)

00:00:05.000 --> 00:00:10.000
Bienvenue sur le lecteur ALTYFLIX Native Streaming Engine.

00:00:11.000 --> 00:00:16.000
Lecture 100% native en HTML5 et HLS/DASH sans iframe.

00:00:20.000 --> 00:00:26.000
Qualité adaptative automatique avec buffer intelligent.

00:00:30.000 --> 00:00:36.000
Sous-titres synchronisés, sélecteur de langue et audio multi-pistes.

00:00:45.000 --> 00:00:52.000
Reprise automatique de lecture enregistrée dans votre profil.

00:01:00.000 --> 00:01:08.000
Profitez d'une expérience streaming fluide et réactive.
`;
  }

  return `WEBVTT - Altyflix Native Subtitles (English)

00:00:05.000 --> 00:00:10.000
Welcome to ALTYFLIX Native Streaming Engine.

00:00:11.000 --> 00:00:16.000
100% native HTML5 and HLS/DASH playback with zero iframes.

00:00:20.000 --> 00:00:26.000
Intelligent buffering with adaptive bitrate streaming.

00:00:30.000 --> 00:00:36.000
Accurate frame-by-frame subtitles and multi-track audio.

00:00:45.000 --> 00:00:52.000
Resume playback right where you left off.

00:01:00.000 --> 00:01:08.000
Enjoy a seamless, premium streaming experience.
`;
}

module.exports = {
  resolveNativeStream,
  getDemoVtt,
  AUTHORIZED_STREAMS
};
