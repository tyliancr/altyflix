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
                    onInteract?.();
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
            <div className={`relative w-full overflow-hidden rounded-full bg-white/25 transition-[height] duration-150 ${compact ? 'h-[3px]' : (active ? 'h-[7px]' : 'h-[5px] group-hover:h-[7px] group-focus-visible:h-[7px]')}`}>
                <div className="absolute inset-y-0 left-0 bg-white/40" style={{ width: `${bufferedPct * 100}%` }} />
                <div className="absolute inset-y-0 left-0 bg-[#e50914]" style={{ width: `${played * 100}%` }} />
            </div>
            <div
                data-thumb=""
                className={`pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e50914] shadow-[0_1px_6px_rgba(0,0,0,0.5)] transition-transform duration-150 ${
                    compact
                        ? (active ? 'h-6 w-6' : 'h-[18px] w-[18px]')
                        : (active ? 'h-[18px] w-[18px] scale-100' : 'h-[18px] w-[18px] scale-0 group-hover:scale-100 group-focus-visible:scale-100')
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
    const ref = useRef(null);

    // À l'ouverture, le focus va sur l'option active : la télécommande fonctionne tout de suite
    useEffect(() => {
        const el = ref.current;
        const target = el?.querySelector('[aria-pressed="true"]') || el?.querySelector('button, select');
        target?.focus({ preventScroll: true });
    }, []);

    if (compact) {
        return (
            <div
                ref={ref}
                data-player-panel=""
                role="dialog"
                aria-label={title}
                className="player-fade-in absolute inset-0 z-[60] flex flex-col bg-[#0b0b0b]/95 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white"
                onPointerUp={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-4 px-6 py-3">
                    {typeof title === 'string' ? <h2 className="text-xl font-bold">{title}</h2> : title}
                    <button type="button" onClick={onClose} aria-label="Fermer" className="-mr-2 grid h-11 w-11 flex-none place-items-center rounded-full text-white">
                        <CloseIcon className="h-7 w-7" />
                    </button>
                </div>
                <div className="player-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-5">{children}</div>
            </div>
        );
    }

    return (
        <div
            ref={ref}
            data-player-panel=""
            role="dialog"
            aria-label={title}
            className={`player-pop-in absolute bottom-[7.75rem] right-8 z-[60] flex max-h-[min(74vh,640px)] flex-col overflow-hidden rounded-xl bg-[#181818]/[0.97] text-white shadow-[0_40px_100px_rgba(0,0,0,0.75)] ring-1 ring-white/[0.08] ${wide ? 'w-[min(92vw,620px)]' : 'w-[min(92vw,460px)]'}`}
            onPointerUp={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
        >
            <div className="flex items-center justify-between gap-4 px-8 pb-2 pt-7">
                {typeof title === 'string' ? <h2 className="text-2xl font-bold tracking-tight">{title}</h2> : title}
                <button type="button" onClick={onClose} aria-label="Fermer" className="-mr-3 grid h-10 w-10 flex-none place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white">
                    <CloseIcon className="h-6 w-6" />
                </button>
            </div>
            <div className="player-scroll min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-4">{children}</div>
        </div>
    );
}

function ChevronIcon({ className = 'w-5 h-5' }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
        </svg>
    );
}

function SectionTitle({ children }) {
    return <h3 className="mb-2 pl-3 text-xl font-bold tracking-tight text-white">{children}</h3>;
}

function OptionRow({ selected, onClick, children, badge }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            className={`flex w-full items-center gap-4 rounded-lg px-3 py-3 text-left text-[17px] leading-tight transition-colors duration-150 ${
                selected ? 'font-semibold text-white' : 'text-white/50 hover:bg-white/[0.06] hover:text-white'
            }`}
        >
            <span className="flex w-5 flex-none justify-center">{selected && <CheckIcon className="h-5 w-5" />}</span>
            <span className="min-w-0 truncate">{children}</span>
            {badge && (
                <span className="flex-none rounded border border-white/25 px-1.5 py-px text-[11px] font-semibold leading-4 text-white/55">{badge}</span>
            )}
        </button>
    );
}

function Switch({ checked, onToggle, children }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={onToggle}
            className="mt-3 flex w-full items-center justify-between gap-4 rounded-lg px-3 py-3 text-left text-[15px] text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
            <span>{children}</span>
            <span className={`relative h-6 w-11 flex-none rounded-full transition-colors duration-200 ${checked ? 'bg-[#e50914]' : 'bg-white/25'}`}>
                <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
            </span>
        </button>
    );
}

// « Français (Option 2) » → « Français » + pastille « 2 »
function splitSubtitleLabel(label = '') {
    const m = String(label).match(/^(.*?)\s*\((?:Option|Version)\s*(\d+)\)\s*$/i);
    return m ? { name: m[1], badge: m[2] } : { name: label, badge: null };
}

function streamLabel(st) {
    const tier = st.tierKey === '4k' ? '4K' : (st.tierKey === '1080p' ? '1080p' : (st.tierKey === '720p' ? '720p' : (st.quality || 'HD')));
    const lang = st.isFrench ? 'VF' : (st.isVostfr ? 'VOSTFR' : 'VO');
    return `${tier} · ${lang}`;
}

function formatSize(size) {
    return size ? String(size).replace(/\bGB\b/, 'Go').replace(/\bMB\b/, 'Mo') : '';
}

/* ------------------------------------------------------------------ */
/* Audio, sous-titres et qualité                                        */
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
            <div className="-mx-3 grid grid-cols-2 gap-x-6">
                <section>
                    <SectionTitle>Audio</SectionTitle>
                    {hasTrueVf && (
                        <OptionRow selected={currentAudioLang === 'vf'} onClick={() => onSelectAudio('vf')}>Français</OptionRow>
                    )}
                    <OptionRow selected={currentAudioLang === 'vo' || !hasTrueVf} onClick={() => onSelectAudio('vo')}>Version originale</OptionRow>
                </section>

                <section>
                    <SectionTitle>Sous-titres</SectionTitle>
                    <OptionRow selected={selectedSubtitleId === 'off'} onClick={() => onSelectSubtitle('off')}>Désactivés</OptionRow>
                    {subtitles.map(sub => {
                        const { name, badge } = splitSubtitleLabel(sub.label);
                        return (
                            <OptionRow key={sub.id} selected={selectedSubtitleId === sub.id} onClick={() => onSelectSubtitle(sub.id)} badge={badge}>
                                {name}
                            </OptionRow>
                        );
                    })}
                    <Switch checked={subtitlesAlwaysOn} onToggle={onToggleAlwaysOn}>Toujours activer</Switch>
                </section>
            </div>

            {showSources && (
                <section className="mt-6 border-t border-white/[0.08] pt-6">
                    <h3 className="mb-3 text-xl font-bold tracking-tight">Qualité</h3>
                    <div className="flex flex-wrap gap-2.5">
                        {streams.map(st => {
                            const selected = activeStream?.id != null ? activeStream.id === st.id : activeStream?.url === st.url;
                            return (
                                <button
                                    key={st.id || st.url}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => onSelectStream(st)}
                                    className={`rounded-full px-4 py-2 text-[15px] font-semibold transition-colors duration-150 ${
                                        selected
                                            ? 'bg-white text-black'
                                            : 'text-white/75 ring-1 ring-inset ring-white/20 hover:text-white hover:ring-white/60'
                                    }`}
                                >
                                    {streamLabel(st)}
                                    {st.isDownloading
                                        ? <span className="ml-2 font-normal opacity-60">préparation</span>
                                        : st.size && <span className="ml-2 font-normal opacity-60">{formatSize(st.size)}</span>}
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}
        </Panel>
    );
}

/* ------------------------------------------------------------------ */
/* Vitesse de lecture                                                  */
/* ------------------------------------------------------------------ */
export function SpeedPanel({ compact, onClose, rate, onSelect }) {
    return (
        <Panel compact={compact} title="Vitesse de lecture" onClose={onClose}>
            <div className={`flex h-full flex-col justify-center ${compact ? 'pb-10' : 'py-6'}`}>
                <div className="relative mx-2 flex items-center justify-between">
                    <div className="absolute inset-x-6 top-[11px] h-0.5 rounded-full bg-white/20" />
                    {SPEEDS.map(s => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => onSelect(s)}
                            aria-pressed={rate === s}
                            className="relative z-10 flex w-16 flex-col items-center gap-3 rounded-lg py-1"
                        >
                            <span className={`rounded-full transition-all duration-200 ${rate === s ? 'h-6 w-6 border-[5px] border-white bg-[#181818]' : 'mt-[6px] h-3 w-3 bg-white/60'}`} />
                            <span className={`text-[15px] ${rate === s ? 'font-bold text-white' : 'text-white/55'}`}>
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
/* Épisodes                                                            */
/* ------------------------------------------------------------------ */
export function EpisodesPanel({ compact, onClose, show, season, episode, progress = 0, onSelect }) {
    const seasons = getSeasons(show);
    const [viewSeason, setViewSeason] = useState(season);
    const [pickingSeason, setPickingSeason] = useState(false);
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

    // L'épisode en cours est centré et reçoit le focus (télécommande)
    useEffect(() => {
        if (loading || pickingSeason) return;
        const el = currentRef.current;
        if (!el) return;
        el.scrollIntoView({ block: 'center' });
        el.querySelector('button')?.focus({ preventScroll: true });
    }, [loading, pickingSeason]);

    const currentSeasonLabel = seasonLabel(seasons.find(s => s.season_number === viewSeason) || { season_number: viewSeason });

    const header = (
        <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white/50">{show?.name}</p>
            {seasons.length > 1 ? (
                <button
                    type="button"
                    onClick={() => setPickingSeason(v => !v)}
                    aria-expanded={pickingSeason}
                    className="-ml-2 mt-0.5 flex items-center gap-2 rounded-lg px-2 py-1 text-2xl font-bold tracking-tight transition-colors hover:bg-white/[0.06]"
                >
                    {currentSeasonLabel}
                    <ChevronIcon className={`h-5 w-5 transition-transform duration-200 ${pickingSeason ? 'rotate-180' : ''}`} />
                </button>
            ) : (
                <h2 className="mt-0.5 text-2xl font-bold tracking-tight">{currentSeasonLabel}</h2>
            )}
        </div>
    );

    return (
        <Panel compact={compact} title={header} onClose={onClose} wide>
            {pickingSeason ? (
                <div className="-mx-3">
                    {seasons.map(s => (
                        <OptionRow
                            key={s.season_number}
                            selected={s.season_number === viewSeason}
                            onClick={() => { setViewSeason(s.season_number); setPickingSeason(false); }}
                            badge={s.episode_count ? `${s.episode_count} ép.` : null}
                        >
                            {seasonLabel(s)}
                        </OptionRow>
                    ))}
                </div>
            ) : loading ? (
                <div className="flex h-40 items-center justify-center">
                    <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#e50914] border-t-transparent" />
                </div>
            ) : episodes.length === 0 ? (
                <p className="py-12 text-center text-[15px] text-white/50">Aucun épisode pour cette saison.</p>
            ) : (
                <ol className="-mx-3 space-y-1">
                    {episodes.map(ep => {
                        const isCurrent = viewSeason === season && ep.episode_number === episode;
                        return (
                            <li key={ep.episode_number} ref={isCurrent ? currentRef : null}>
                                <button
                                    type="button"
                                    aria-current={isCurrent ? 'true' : undefined}
                                    onClick={() => onSelect(viewSeason, ep.episode_number)}
                                    className={`group w-full rounded-lg px-3 py-3.5 text-left transition-colors duration-150 ${
                                        isCurrent ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'
                                    }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <span className={`w-6 flex-none text-center text-lg font-semibold tabular-nums ${isCurrent ? 'text-white' : 'text-white/40'}`}>
                                            {ep.episode_number}
                                        </span>
                                        <span className={`min-w-0 flex-1 truncate text-base font-semibold ${isCurrent ? 'text-white' : 'text-white/75 group-hover:text-white'}`}>
                                            {ep.name}
                                        </span>
                                        {ep.runtime ? <span className="flex-none text-sm text-white/40">{ep.runtime} min</span> : null}
                                    </div>

                                    {isCurrent && (
                                        <div className="mt-3 flex gap-4 pl-10">
                                            <div className="relative aspect-video w-44 flex-none overflow-hidden rounded-md bg-white/10">
                                                {ep.still_path && (
                                                    <img src={getPosterUrl(ep.still_path, 'w300')} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                                                )}
                                                <span className="absolute inset-0 grid place-items-center bg-black/25">
                                                    <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-white/90 bg-black/40">
                                                        <svg className="ml-0.5 h-4 w-4 fill-white" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                                                    </span>
                                                </span>
                                                <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
                                                    <span className="block h-full bg-[#e50914]" style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }} />
                                                </span>
                                            </div>
                                            {ep.overview && (
                                                <p className="line-clamp-3 text-sm leading-relaxed text-white/65">{ep.overview}</p>
                                            )}
                                        </div>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ol>
            )}
        </Panel>
    );
}
