/**
 * Official Ultra-HD Video Player Vector Icons (SVG)
 * 100% Pure Vector Paths — Matching the official Netflix Desktop Player
 */

// Retour / Back (Arrow Left)
export function NetflixBackIcon({ className = "w-8 h-8" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
    </svg>
  );
}

// Lecture / Play (Solid Rounded Triangle)
export function NetflixPlayIcon({ className = "w-8 h-8" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

// Pause (Two Thick Rounded Vertical Bars)
export function NetflixPauseIcon({ className = "w-8 h-8" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

// Recul 10s (Replay 10 - Official Pure Vector Path with '1' and '0')
export function NetflixRewind10Icon({ className = "w-8 h-8" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8zm-1.1 11h-.85v-3.26l-1.01.31v-.69l1.77-.63h.09V16zm4.28-1.76c0 .32-.06.6-.18.84-.12.24-.29.43-.51.57-.22.14-.49.21-.8.21-.31 0-.58-.07-.8-.21-.22-.14-.39-.33-.51-.57-.12-.24-.18-.52-.18-.84v-1.1c0-.32.06-.6.18-.84.12-.24.29-.43.51-.57.22-.14.49-.21.8-.21.31 0 .58.07.8.21.22.14.39.33.51.57.12.24.18.52.18.84v1.1zm-.85-1.18c0-.28-.05-.48-.14-.6-.09-.13-.23-.19-.4-.19-.17 0-.3.06-.4.19-.09.13-.14.32-.14.6v1.26c0 .28.05.48.14.6.09.13.23.19.4.19.17 0 .3-.06.4-.19.09-.13.14-.32.14-.6v-1.26z" />
    </svg>
  );
}

// Avance 10s (Forward 10 - Official Pure Vector Path with '1' and '0')
export function NetflixForward10Icon({ className = "w-8 h-8" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8zm-1.1 11h-.85v-3.26l-1.01.31v-.69l1.77-.63h.09V16zm4.28-1.76c0 .32-.06.6-.18.84-.12.24-.29.43-.51.57-.22.14-.49.21-.8.21-.31 0-.58-.07-.8-.21-.22-.14-.39-.33-.51-.57-.12-.24-.18-.52-.18-.84v-1.1c0-.32.06-.6.18-.84.12-.24.29-.43.51-.57.22-.14.49-.21.8-.21.31 0 .58.07.8.21.22.14.39.33.51.57.12.24.18.52.18.84v1.1zm-.85-1.18c0-.28-.05-.48-.14-.6-.09-.13-.23-.19-.4-.19-.17 0-.3.06-.4.19-.09.13-.14.32-.14.6v1.26c0 .28.05.48.14.6.09.13.23.19.4.19.17 0 .3-.06.4-.19.09-.13.14-.32.14-.6v-1.26z" />
    </svg>
  );
}

// Volume Haut (High)
export function NetflixVolumeHighIcon({ className = "w-7 h-7" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

// Volume Bas (Low)
export function NetflixVolumeLowIcon({ className = "w-7 h-7" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
    </svg>
  );
}

// Volume Muet (Mute)
export function NetflixVolumeMuteIcon({ className = "w-7 h-7" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  );
}

// Aide / Signalement (?) (Netflix Help Circle)
export function NetflixHelpIcon({ className = "w-7 h-7" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z" />
    </svg>
  );
}

// Episode Suivant (Next Episode - Solid Right Triangle + Vertical Bar)
export function NetflixNextEpisodeIcon({ className = "w-7 h-7" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
    </svg>
  );
}

// Tiroir Episodes (Episodes List - Official Two Overlapping Cards)
export function NetflixEpisodesIcon({ className = "w-7 h-7" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 5v14c0 1.1.89 2 2 2h14v-2H5V5H3zm16-4H7c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zm0 14H7V3h12v12z" />
    </svg>
  );
}

// Audio et Sous-titres (Official Netflix Closed Captions Speech Bubble)
export function NetflixSubtitlesIcon({ className = "w-7 h-7" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V6h14v12zM7 10h4v2H7zm0 4h8v2H7zm10 0h-2v-2h2zm0-4h-4V8h4z" />
    </svg>
  );
}

// Picture-in-Picture (PiP)
export function NetflixPipIcon({ className = "w-7 h-7" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z" />
    </svg>
  );
}

// Plein Ecran (Enter Fullscreen - Official Four Corner Brackets)
export function NetflixFullscreenIcon({ className = "w-7 h-7" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  );
}

// Quitter Plein Ecran (Exit Fullscreen)
export function NetflixExitFullscreenIcon({ className = "w-7 h-7" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
    </svg>
  );
}

// Qualité Vidéo (Resolution / HD Settings)
export function NetflixQualityIcon({ className = "w-7 h-7" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  );
}
