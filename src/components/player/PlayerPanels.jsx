import { useEffect, useRef, useState } from 'react';
import { getSeasonDetails } from '../../services/tmdb';
import { getSeasons, seasonLabel } from '../../utils/seasons';
import { getPosterUrl } from '../../utils/helpers';

export function formatClock(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
        : `${m}:${String(sec).padStart(2, '0')}`;
}

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];

export function SpeedIcon({ className = 'w-6 h-6' }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 21a9 9 0 1 1 9-9" />
            <path d="M12 12l4.5-3" />
            <path d="M21 12h-2M12 3v2M5.6 5.6 7 7M3 12h2" />
        </svg>
    );
}

export function CheckIcon({ className = 'w-4 h-4' }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
    );
}

export function CloseIcon({ className = 'w-6 h-6' }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
        </svg>
    );
}

/* ------------------------------------------------------------------ */
/* Barre de progression : glisser au doigt ou à la souris, saut au relâchement */
/* ------------------------------------------------------------------ */
export function Scrubber({ currentTime, duration, buffered, onSeek, onInteract, compact }) {
    const trackRef = useRef(null);
    const [dragPct, setDragPct] = useState(null);
    const [hoverPct, setHoverPct] = useState(null);

    const pctAt = (clientX) => {
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) return 0;
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };

    const played = dragPct ?? (duration > 0 ? currentTime / duration : 0);
    const bufferedPct = duration > 0 ? Math.min(1, buffered / duration) : 0;
    const previewPct = dragPct ?? hoverPct;
    const active = dragPct !== null;

    return (
        <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label="Progression"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration || 0)}
            aria-valuenow={Math.round(currentTime || 0)}
            aria-valuetext={formatClock(currentTime)}
            className={`group relative flex w-full cursor-pointer touch-none items-center ${compact ? 'h-8' : 'h-6'}`}
            onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                setDragPct(pctAt(e.clientX));
                onInteract?.();
            }}
            onPointerMove={(e) => {
                if (dragPct !== null) {
                    setDragPct(pctAt(e.clientX));
                    onInteract?.();
                } else if (e.pointerType === 'mouse') {
                    setHoverPct(pctAt(e.clientX));
                }
            }}
            onPointerUp={(e) => {
                e.stopPropagation();
                if (dragPct !== null) {
                    onSeek(pctAt(e.clientX) * (duration || 0));
                    setDragPct(null);
                }
            }}
            onPointerCancel={() => setDragPct(null)}
            onPointerLeave={() => setHoverPct(null)}
            onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    e.stopPropagation();
                    onSeek((currentTime || 0) + (e.key === 'ArrowLeft' ? -10 : 10));
                }
            }}
        >
            {previewPct !== null && duration > 0 && (
                <div
                    className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded bg-black/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-white"
                    style={{ left: `${previewPct * 100}%` }}
                >
                    {formatClock(previewPct * duration)}
                </div>
            )}
            <div className={`relative w-full overflow-hidden bg-white/30 transition-[height] duration-150 ${compact ? 'h-[3px]' : (active ? 'h-2' : 'h-1 group-hover:h-2')}`}>
                <div className="absolute inset-y-0 left-0 bg-white/45" style={{ width: `${bufferedPct * 100}%` }} />
                <div className="absolute inset-y-0 left-0 bg-[#e50914]" style={{ width: `${played * 100}%` }} />
            </div>
            <div
                className={`pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e50914] transition-transform duration-150 ${
                    compact
                        ? (active ? 'h-6 w-6' : 'h-[18px] w-[18px]')
                        : (active ? 'h-4 w-4 scale-100' : 'h-4 w-4 scale-0 group-hover:scale-100')
                }`}
                style={{ left: `${played * 100}%` }}
            />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Conteneur de panneau : plein écran sur téléphone, fenêtre ancrée sur PC */
/* ------------------------------------------------------------------ */
export function Panel({ compact, title, onClose, children, wide = false }) {
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    if (compact) {
        return (
            <div
                className="absolute inset-0 z-[60] flex flex-col bg-black/90 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white"
                onPointerUp={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-3">
                    <h2 className="text-base font-bold">{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Fermer" className="-mr-2 p-2 text-white">
                        <CloseIcon className="h-7 w-7" />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
            </div>
        );
    }

    return (
        <div
            className={`absolute bottom-[7.5rem] right-6 z-[60] flex max-h-[min(70vh,560px)] flex-col overflow-hidden rounded bg-[#262626] text-white shadow-2xl ${wide ? 'w-[min(92vw,520px)]' : 'w-[min(92vw,420px)]'}`}
            onPointerUp={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
        >
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
                <h2 className="text-lg font-bold">{title}</h2>
                <button type="button" onClick={onClose} aria-label="Fermer" className="-mr-2 rounded p-1.5 text-white/70 hover:text-white">
                    <CloseIcon className="h-5 w-5" />
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        </div>
    );
}

function OptionRow({ selected, onClick, children, hint }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            className={`flex w-full items-center gap-3 py-2.5 text-left text-[15px] transition-colors ${selected ? 'font-semibold text-white' : 'text-white/60 hover:text-white'}`}
        >
            <span className="flex w-5 flex-none justify-center">{selected && <CheckIcon />}</span>
            <span className="min-w-0 flex-1 truncate">{children}</span>
            {hint && <span className="flex-none text-xs text-white/40">{hint}</span>}
        </button>
    );
}

function streamLabel(st) {
    const tier = st.tierKey === '4k' ? '4K' : (st.tierKey === '1080p' ? '1080p' : (st.tierKey === '720p' ? '720p' : (st.quality || 'HD')));
    const lang = st.isFrench ? 'VF' : (st.isVostfr ? 'VOSTFR' : 'VO');
    return `${tier} · ${lang}`;
}

/* ------------------------------------------------------------------ */
/* Audio, sous-titres et source vidéo                                  */
/* ------------------------------------------------------------------ */
export function AudioSubsPanel({
    compact,
    onClose,
    hasTrueVf,
    currentAudioLang,
    onSelectAudio,
    subtitles,
    selectedSubtitleId,
    onSelectSubtitle,
    streams,
    activeStream,
    onSelectStream,
    subtitlesAlwaysOn,
    onToggleAlwaysOn
}) {
    const showSources = Array.isArray(streams) && streams.length > 1;
    return (
        <Panel compact={compact} title="Audio et sous-titres" onClose={onClose} wide>
            <div className={`grid gap-x-8 gap-y-6 ${compact ? (showSources ? 'grid-cols-3' : 'grid-cols-2') : 'grid-cols-2'}`}>
                <section>
                    <h3 className="mb-1 text-sm font-bold text-white">Audio</h3>
                    {hasTrueVf && (
                        <OptionRow selected={currentAudioLang === 'vf'} onClick={() => onSelectAudio('vf')}>Français</OptionRow>
                    )}
                    <OptionRow selected={currentAudioLang === 'vo' || !hasTrueVf} onClick={() => onSelectAudio('vo')}>Version originale</OptionRow>
                </section>

                <section>
                    <h3 className="mb-1 text-sm font-bold text-white">Sous-titres</h3>
                    <OptionRow selected={selectedSubtitleId === 'off'} onClick={() => onSelectSubtitle('off')}>Désactivés</OptionRow>
                    {subtitles.map(sub => (
                        <OptionRow key={sub.id} selected={selectedSubtitleId === sub.id} onClick={() => onSelectSubtitle(sub.id)}>
                            {sub.label}
                        </OptionRow>
                    ))}
                    <label className="mt-3 flex cursor-pointer items-center gap-3 border-t border-white/10 pt-3 text-sm text-white/60">
                        <input
                            type="checkbox"
                            checked={subtitlesAlwaysOn}
                            onChange={onToggleAlwaysOn}
                            className="h-4 w-4 accent-[#e50914]"
                        />
                        Activer par défaut
                    </label>
                </section>

                {showSources && (
                    <section className={compact ? '' : 'col-span-2 border-t border-white/10 pt-4'}>
                        <h3 className="mb-1 text-sm font-bold text-white">Source vidéo</h3>
                        {streams.map(st => (
                            <OptionRow
                                key={st.id || st.url}
                                selected={activeStream?.id != null ? activeStream.id === st.id : activeStream?.url === st.url}
                                onClick={() => onSelectStream(st)}
                                hint={st.isDownloading ? 'préparation' : st.size}
                            >
                                {streamLabel(st)}
                            </OptionRow>
                        ))}
                    </section>
                )}
            </div>
        </Panel>
    );
}

/* ------------------------------------------------------------------ */
/* Vitesse de lecture                                                  */
/* ------------------------------------------------------------------ */
export function SpeedPanel({ compact, onClose, rate, onSelect }) {
    return (
        <Panel compact={compact} title="Vitesse de lecture" onClose={onClose}>
            <div className={`flex h-full flex-col justify-center ${compact ? 'pb-10' : 'py-4'}`}>
                <div className="relative mx-2 flex items-center justify-between">
                    <div className="absolute inset-x-2 top-[11px] h-px bg-white/30" />
                    {SPEEDS.map(s => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => onSelect(s)}
                            aria-pressed={rate === s}
                            className="relative z-10 flex w-14 flex-col items-center gap-3"
                        >
                            <span className={`rounded-full transition-all ${rate === s ? 'h-6 w-6 border-[5px] border-white bg-transparent' : 'mt-[6px] h-3 w-3 bg-white/70'}`} />
                            <span className={`text-sm ${rate === s ? 'font-bold text-white' : 'text-white/60'}`}>
                                {s === 1 ? '1x (normale)' : `${s}x`}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </Panel>
    );
}

/* ------------------------------------------------------------------ */
/* Liste des épisodes                                                  */
/* ------------------------------------------------------------------ */
export function EpisodesPanel({ compact, onClose, show, season, episode, onSelect }) {
    const seasons = getSeasons(show);
    const [viewSeason, setViewSeason] = useState(season);
    const [episodes, setEpisodes] = useState([]);
    const [loading, setLoading] = useState(true);
    const currentRef = useRef(null);

    useEffect(() => {
        let live = true;
        if (!show?.id) return undefined;
        setLoading(true);
        getSeasonDetails(show.id, viewSeason)
            .then(data => { if (live) setEpisodes(data?.episodes || []); })
            .catch(() => { if (live) setEpisodes([]); })
            .finally(() => { if (live) setLoading(false); });
        return () => { live = false; };
    }, [show?.id, viewSeason]);

    useEffect(() => {
        if (!loading) currentRef.current?.scrollIntoView({ block: 'center' });
    }, [loading]);

    return (
        <Panel compact={compact} title={show?.name || 'Épisodes'} onClose={onClose} wide>
            {seasons.length > 1 && (
                <select
                    value={viewSeason}
                    onChange={(e) => setViewSeason(Number(e.target.value))}
                    className="mb-3 rounded border border-white/30 bg-black px-3 py-2 text-sm font-semibold text-white focus:border-white focus:outline-none"
                    aria-label="Saison"
                >
                    {seasons.map(s => (
                        <option key={s.season_number} value={s.season_number}>{seasonLabel(s)}</option>
                    ))}
                </select>
            )}

            {loading ? (
                <div className="flex h-32 items-center justify-center">
                    <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#e50914] border-t-transparent" />
                </div>
            ) : episodes.length === 0 ? (
                <p className="py-10 text-center text-sm text-white/50">Aucun épisode trouvé pour cette saison.</p>
            ) : (
                <ol className="divide-y divide-white/10">
                    {episodes.map(ep => {
                        const isCurrent = viewSeason === season && ep.episode_number === episode;
                        return (
                            <li key={ep.episode_number} ref={isCurrent ? currentRef : null}>
                                <button
                                    type="button"
                                    onClick={() => onSelect(viewSeason, ep.episode_number)}
                                    className={`flex w-full gap-3 py-3 text-left ${isCurrent ? '' : 'opacity-80 hover:opacity-100'}`}
                                >
                                    <div className="relative aspect-video w-32 flex-none overflow-hidden rounded-sm bg-white/10">
                                        {ep.still_path && (
                                            <img src={getPosterUrl(ep.still_path, 'w300')} alt="" loading="lazy" className="h-full w-full object-cover" />
                                        )}
                                        {isCurrent && <div className="absolute inset-x-0 bottom-0 h-1 bg-[#e50914]" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <p className={`truncate text-sm ${isCurrent ? 'font-bold text-white' : 'font-semibold text-white/90'}`}>
                                                {ep.episode_number}. {ep.name}
                                            </p>
                                            {ep.runtime ? <span className="flex-none text-xs text-white/50">{ep.runtime} min</span> : null}
                                        </div>
                                        {ep.overview && (
                                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/55">{ep.overview}</p>
                                        )}
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ol>
            )}
        </Panel>
    );
}
