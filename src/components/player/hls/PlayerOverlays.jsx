import { useEffect, useRef, useState } from 'react';
import { NetflixPlayIcon } from '../NetflixIcons';
import { formatTime } from './playerUtils';

const SUBTITLE_SIZES = {
    s: 'text-sm md:text-lg',
    m: 'text-base md:text-2xl',
    l: 'text-xl md:text-3xl',
    xl: 'text-2xl md:text-4xl',
};

const primaryButton = 'px-6 py-2.5 rounded bg-[#e50914] hover:bg-[#b80710] text-white font-semibold text-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black';
const secondaryButton = 'px-6 py-2.5 rounded bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-white';
const lightButton = 'px-6 py-2.5 rounded bg-white hover:bg-gray-200 text-black font-bold text-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#e50914] focus-visible:ring-offset-2 focus-visible:ring-offset-black';

/** Sous-titres dessinés par le lecteur : fond semi-transparent, taille réglable. */
export function SubtitleOverlay({ lines, size = 'm', raised }) {
    if (!lines.length) return null;
    return (
        <div className={`absolute inset-x-0 z-[15] flex flex-col items-center gap-1 px-6 pointer-events-none transition-all duration-300 ${raised ? 'bottom-32 md:bottom-36' : 'bottom-[8%]'}`}>
            {lines.map((line, index) => (
                <span
                    key={`${index}-${line}`}
                    className={`max-w-[90%] md:max-w-[70%] px-3 py-1 rounded bg-black/70 text-white text-center font-medium leading-snug whitespace-pre-line ${SUBTITLE_SIZES[size] || SUBTITLE_SIZES.m}`}
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
                >
                    {line}
                </span>
            ))}
        </div>
    );
}

export function LoadingOverlay({ label }) {
    return (
        <div role="status" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/50 z-20 transition-opacity duration-300">
            <div className="relative w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
                <div className="absolute inset-0 border-4 border-[#e50914] rounded-full animate-spin border-t-transparent shadow-[0_0_25px_rgba(229,9,20,0.7)]" />
            </div>
            {label ? <p className="text-sm text-gray-300 font-medium">{label}</p> : <span className="sr-only">Chargement</span>}
        </div>
    );
}

export function ErrorOverlay({ message, onRetry, onBack }) {
    return (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-[60] text-center p-6">
            <div className="w-16 h-16 rounded-full bg-red-500/20 text-[#e50914] flex items-center justify-center text-3xl font-bold mb-4" aria-hidden="true">!</div>
            <h3 className="text-xl font-bold text-white mb-2">Lecture impossible</h3>
            <p className="text-gray-400 text-sm max-w-md mb-6">{message}</p>
            <div className="flex gap-4">
                {onBack && <button type="button" onClick={onBack} className={secondaryButton}>Retour</button>}
                {onRetry && <button type="button" onClick={onRetry} className={primaryButton} autoFocus>Réessayer</button>}
            </div>
        </div>
    );
}

/** « Reprendre à 23:14 ? » */
export function ResumePrompt({ position, onResume, onRestart }) {
    return (
        <div role="dialog" aria-modal="true" aria-labelledby="player-resume-title" className="absolute inset-0 bg-black/85 z-[60] flex flex-col items-center justify-center text-center px-6">
            <h2 id="player-resume-title" className="text-2xl md:text-3xl font-extrabold text-white mb-6">Reprendre à {formatTime(position)} ?</h2>
            <div className="flex flex-wrap justify-center gap-4">
                <button type="button" onClick={onResume} className={primaryButton} autoFocus>Reprendre</button>
                <button type="button" onClick={onRestart} className={secondaryButton}>Depuis le début</button>
            </div>
        </div>
    );
}

/** Bouton « Passer l'intro » / « Passer le récapitulatif ». */
export function SkipButton({ label, onSkip, raised }) {
    return (
        <button
            type="button"
            onClick={onSkip}
            className={`absolute right-4 md:right-10 z-30 px-6 py-2.5 rounded bg-black/60 border border-white/50 hover:bg-white hover:text-black text-white font-semibold text-sm md:text-base transition-all outline-none focus-visible:ring-2 focus-visible:ring-white ${raised ? 'bottom-36 md:bottom-40' : 'bottom-16 md:bottom-20'}`}
        >
            {label}
        </button>
    );
}

/** Carte « Épisode suivant » avec compte à rebours ; il se met en pause avec la vidéo. */
export function NextEpisodeCard({ next, seconds = 10, paused, raised, onPlayNow, onDismiss }) {
    const [remaining, setRemaining] = useState(seconds);
    const fired = useRef(false);

    useEffect(() => {
        if (paused) return undefined;
        const timer = setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000);
        return () => clearInterval(timer);
    }, [paused]);

    useEffect(() => {
        if (remaining === 0 && !fired.current) {
            fired.current = true;
            onPlayNow();
        }
    }, [remaining, onPlayNow]);

    return (
        <div
            role="region"
            aria-label="Épisode suivant"
            className={`absolute right-4 md:right-10 z-30 w-[min(22rem,calc(100vw-2rem))] bg-[#181818] border border-white/10 rounded-md shadow-2xl p-4 transition-all ${raised ? 'bottom-36 md:bottom-40' : 'bottom-16 md:bottom-20'}`}
        >
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1" aria-live="polite">
                Épisode suivant dans {remaining} s
            </p>
            <p className="text-white font-bold truncate mb-3">
                S{next.season} : É{next.episode}{next.title ? ` – ${next.title}` : ''}
            </p>
            <div className="flex gap-3">
                <button type="button" onClick={onPlayNow} className={`${lightButton} flex items-center gap-2`}>
                    <NetflixPlayIcon className="w-4 h-4" />
                    Lire
                </button>
                <button type="button" onClick={onDismiss} className={secondaryButton}>Voir le générique</button>
            </div>
        </div>
    );
}

/** Retour visuel du double-tap / des touches ±10 s. */
export function SeekFlash({ side }) {
    return (
        <div
            aria-hidden="true"
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 z-20 w-24 h-24 rounded-full bg-white/15 flex items-center justify-center text-white font-bold text-lg animate-pulse ${side === 'left' ? 'left-[12%]' : 'right-[12%]'}`}
        >
            {side === 'left' ? '−10 s' : '+10 s'}
        </div>
    );
}
