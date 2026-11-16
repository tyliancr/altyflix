import { useRef, useState } from 'react';
import { formatTime, spokenTime } from './playerUtils';

/**
 * Barre de progression : clic / glisser pour se déplacer, aperçu miniature au survol,
 * utilisable au clavier (flèches, Début, Fin).
 */
export default function ProgressBar({ currentTime, duration, bufferedEnd, getThumbnail, onSeek, onSeekBy }) {
    const trackRef = useRef(null);
    const [hover, setHover] = useState(null); // { ratio, x, width }
    const [dragging, setDragging] = useState(false);

    const locate = event => {
        const rect = trackRef.current.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        return { ratio, x: ratio * rect.width, width: rect.width };
    };

    const onPointerDown = event => {
        if (!duration) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        setHover(locate(event));
    };
    const onPointerMove = event => {
        if (duration) setHover(locate(event));
    };
    const onPointerUp = event => {
        if (!dragging) return;
        setDragging(false);
        onSeek(locate(event).ratio * duration);
        if (event.pointerType !== 'mouse') setHover(null);
    };
    const onKeyDown = event => {
        const actions = { ArrowLeft: () => onSeekBy(-10), ArrowRight: () => onSeekBy(10), Home: () => onSeek(0), End: () => onSeek(Math.max(0, duration - 5)) };
        if (!actions[event.key]) return;
        event.preventDefault();
        actions[event.key]();
    };

    const shownTime = dragging && hover ? hover.ratio * duration : currentTime;
    const percent = duration ? Math.min(100, (shownTime / duration) * 100) : 0;
    const bufferedPercent = duration ? Math.min(100, (bufferedEnd / duration) * 100) : 0;
    const previewTime = hover ? hover.ratio * duration : 0;
    const thumbnail = hover && getThumbnail ? getThumbnail(previewTime) : null;
    const previewWidth = thumbnail ? thumbnail.width : 64;
    const previewLeft = hover ? Math.min(Math.max(hover.x, previewWidth / 2), Math.max(previewWidth / 2, hover.width - previewWidth / 2)) : 0;

    return (
        <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label="Position dans la vidéo"
            aria-valuemin={0}
            aria-valuemax={Math.floor(duration || 0)}
            aria-valuenow={Math.floor(shownTime || 0)}
            aria-valuetext={`${spokenTime(shownTime)} sur ${spokenTime(duration)}`}
            className="relative flex-1 py-4 cursor-pointer group select-none touch-none outline-none rounded focus-visible:ring-2 focus-visible:ring-white"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { setDragging(false); setHover(null); }}
            onPointerLeave={() => { if (!dragging) setHover(null); }}
            onKeyDown={onKeyDown}
        >
            {hover && (
                <div className="absolute bottom-9 -translate-x-1/2 flex flex-col items-center pointer-events-none" style={{ left: previewLeft }}>
                    {thumbnail && (
                        <div
                            className="rounded border-2 border-white/80 shadow-2xl bg-black bg-no-repeat"
                            style={{ width: thumbnail.width, height: thumbnail.height, backgroundImage: `url("${thumbnail.url}")`, backgroundPosition: `-${thumbnail.x}px -${thumbnail.y}px` }}
                        />
                    )}
                    <span className="mt-1.5 text-xs font-semibold text-white/90 whitespace-nowrap drop-shadow">{formatTime(previewTime)}</span>
                </div>
            )}

            <div className={`relative w-full bg-white/20 rounded-full transition-all group-hover:h-[6px] ${dragging ? 'h-[6px]' : 'h-[4px]'}`}>
                <div className="absolute top-0 left-0 bottom-0 bg-white/35 rounded-full" style={{ width: `${bufferedPercent}%` }} />
                <div className="absolute top-0 left-0 bottom-0 bg-[#e50914] rounded-full" style={{ width: `${percent}%` }} />
                <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-[#e50914] rounded-full shadow-[0_0_10px_rgba(229,9,20,0.95)] transition-transform group-hover:scale-125"
                    style={{ left: `${percent}%` }}
                />
            </div>
        </div>
    );
}
