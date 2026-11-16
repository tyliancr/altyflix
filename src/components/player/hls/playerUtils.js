// Utilitaires et classes partagés par les composants du lecteur HLS.

export function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** « 1 h 23 min 4 s » : version lisible par les lecteurs d'écran. */
export function spokenTime(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return [h && `${h} h`, (h || m) && `${m} min`, `${total % 60} s`].filter(Boolean).join(' ');
}

// Style commun des boutons du lecteur, repris du lecteur existant, avec un focus clavier visible.
export const controlButton = 'text-white/85 hover:text-white transition-opacity duration-150 outline-none rounded focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/60';

export const menuPanel = 'bg-[#141414]/95 border border-white/10 rounded-md shadow-2xl text-sm backdrop-blur-2xl';
