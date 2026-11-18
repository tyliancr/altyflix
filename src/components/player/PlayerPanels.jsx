import { useEffect, useRef, useState } from 'react';
import { getSeasonDetails } from '../../services/tmdb';
import { getSeasons, seasonLabel } from '../../utils/seasons';
import { getPosterUrl } from '../../utils/helpers';
import { formatClock, SPEEDS } from './playerUtils';

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
                    className="liquid-glass-pill pointer-events-none absolute bottom-full mb-2.5 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold tabular-nums text-white"
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
                aria-label={typeof title === 'string' ? title : 'Panneau lecteur'}
                className="liquid-glass-sheet player-fade-in absolute inset-0 z-[60] flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white"
                onPointerUp={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-4 border-b border-white/[0.09] px-5 py-4">
                    {typeof title === 'string' ? <h2 className="text-xl font-bold tracking-tight">{title}</h2> : title}
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Fermer"
                        className="liquid-glass-pill grid h-10 w-10 flex-none place-items-center rounded-full text-white/85 active:scale-95"
                    >
                        <CloseIcon className="h-5 w-5" />
                    </button>
                </div>
                <div className="player-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            </div>
        );
    }

    return (
        <div
            ref={ref}
            data-player-panel=""
            role="dialog"
            aria-label={typeof title === 'string' ? title : 'Panneau lecteur'}
            className={`liquid-glass-panel player-pop-in absolute bottom-[6.5rem] right-6 z-[60] flex max-h-[min(70vh,540px)] flex-col overflow-hidden rounded-2xl text-white ${wide ? 'w-[min(90vw,470px)]' : 'w-[min(90vw,360px)]'}`}
            onPointerUp={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
        >
            <div className="relative z-10 flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-3.5">
                {typeof title === 'string' ? <h2 className="text-[16px] font-bold tracking-tight text-white">{title}</h2> : title}
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Fermer"
                    className="grid h-8 w-8 flex-none place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                >
                    <CloseIcon className="h-4 w-4" />
                </button>
            </div>
            <div className="player-scroll relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-3.5">{children}</div>
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
    return <h3 className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">{children}</h3>;
}

function OptionRow({ selected, onClick, children, badge }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] leading-tight transition-colors duration-150 cursor-pointer ${
                selected ? 'bg-white/[0.12] font-semibold text-white' : 'text-white/65 hover:bg-white/[0.07] hover:text-white'
            }`}
        >
            <span className="flex w-4 flex-none justify-center text-white">{selected && <CheckIcon className="h-3.5 w-3.5" />}</span>
            <span className="min-w-0 flex-1 truncate">{children}</span>
            {badge && (
                <span className="flex-none rounded bg-white/[0.10] px-1.5 py-px text-[10px] font-semibold leading-4 text-white/65">{badge}</span>
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
            className="mt-2 flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] text-white/70 transition-colors hover:bg-white/[0.07] hover:text-white cursor-pointer"
        >
            <span>{children}</span>
            <span className={`relative h-5 w-9 flex-none rounded-full transition-colors duration-200 ${checked ? 'bg-[#e50914]' : 'bg-white/20'}`}>
                <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-4' : ''}`} />
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
    const tier = st.tierKey === '4k' ? '4K Ultra HD' : (st.tierKey === '1080p' ? '1080p FHD' : (st.tierKey === '720p' ? '720p HD' : (st.quality || 'HD')));
    const lang = st.isFrench ? 'Français' : (st.isVostfr ? 'VOSTFR' : 'Version originale');
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
    const hasVo = Array.isArray(streams) && streams.some(s =>
        !s.isFrench || /\bmulti\b|multi\s*audio/i.test(`${s.filename || ''} ${s.rawTitle || ''}`)
    );
    return (
        <Panel compact={compact} title="Audio et sous-titres" onClose={onClose} wide>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <section className="space-y-1">
                    <SectionTitle>Audio</SectionTitle>
                    {hasTrueVf && (
                        <OptionRow selected={currentAudioLang === 'vf'} onClick={() => onSelectAudio('vf')}>Français</OptionRow>
                    )}
                    {(hasVo || !hasTrueVf) && (
                        <OptionRow selected={currentAudioLang === 'vo' || !hasTrueVf} onClick={() => onSelectAudio('vo')}>Version originale</OptionRow>
                    )}
                </section>

                <section className="space-y-1">
                    <SectionTitle>Sous-titres</SectionTitle>
                    <OptionRow selected={selectedSubtitleId === 'off'} onClick={() => onSelectSubtitle('off')}>Désactivés</OptionRow>
                    {subtitles.map(sub => {
                        const { name, badge } = splitSubtitleLabel(sub.label);
                        const versionBadge = sub.hint || badge;
                        return (
                            <OptionRow key={sub.id} selected={selectedSubtitleId === sub.id} onClick={() => onSelectSubtitle(sub.id)} badge={versionBadge}>
                                {name}
                            </OptionRow>
                        );
                    })}
                    <Switch checked={subtitlesAlwaysOn} onToggle={onToggleAlwaysOn}>Toujours activer</Switch>
                </section>
            </div>

            {showSources && (
                <section className="mt-4 border-t border-white/[0.08] pt-3.5">
                    <SectionTitle>Qualité vidéo</SectionTitle>
                    <div className="mt-2 flex flex-wrap gap-1.5 px-1">
                        {streams.map(st => {
                            const selected = activeStream?.id != null ? activeStream.id === st.id : activeStream?.url === st.url;
                            return (
                                <button
                                    key={st.id || st.url}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => onSelectStream(st)}
                                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer ${
                                        selected
                                            ? 'bg-white text-black shadow-sm'
                                            : 'bg-white/[0.08] text-white/75 hover:bg-white/[0.15] hover:text-white'
                                    }`}
                                >
                                    {streamLabel(st)}
                                    {st.isDownloading
                                        ? <span className="ml-1.5 font-normal opacity-60">préparation</span>
                                        : st.size && <span className="ml-1.5 font-normal opacity-55">{formatSize(st.size)}</span>}
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
            <div className={`flex h-full flex-col justify-center ${compact ? 'pb-10' : 'py-4'}`}>
                <div className="relative mx-2 flex items-center justify-between">
                    <div className="absolute inset-x-6 top-[11px] h-[2px] rounded-full bg-white/15" />
                    {SPEEDS.map(s => {
                        const isSelected = rate === s;
                        return (
                            <button
                                key={s}
                                type="button"
                                onClick={() => onSelect(s)}
                                aria-pressed={isSelected}
                                className="group relative z-10 flex w-14 flex-col items-center gap-2.5 rounded-lg py-1 cursor-pointer"
                            >
                                <span
                                    className={`rounded-full transition-all duration-200 ${
                                        isSelected
                                            ? 'h-5 w-5 bg-white ring-4 ring-white/20 shadow-[0_0_12px_rgba(255,255,255,0.45)]'
                                            : 'mt-[5px] h-2.5 w-2.5 bg-white/45 group-hover:scale-125 group-hover:bg-white/85'
                                    }`}
                                />
                                <span className={`text-xs transition-colors ${isSelected ? 'font-bold text-white' : 'text-white/55 group-hover:text-white/90'}`}>
                                    {s === 1 ? 'Normale' : `${s}x`}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </Panel>
    );
}

/* ------------------------------------------------------------------ */
/* Épisodes (verre fumé fin et compact)                                */
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
            {show?.name && (
                <p className="truncate text-[11px] font-medium text-white/45">
                    {show.name}
                </p>
            )}
            {seasons.length > 1 ? (
                <button
                    type="button"
                    onClick={() => setPickingSeason(v => !v)}
                    aria-expanded={pickingSeason}
                    className="-ml-1.5 mt-0.5 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-[16px] font-bold tracking-tight text-white transition-colors hover:bg-white/10 cursor-pointer"
                >
                    <span>{currentSeasonLabel}</span>
                    <ChevronIcon className={`h-4 w-4 text-white/70 transition-transform duration-200 ${pickingSeason ? 'rotate-180' : ''}`} />
                </button>
            ) : (
                <h2 className="mt-0.5 text-[16px] font-bold tracking-tight text-white">{currentSeasonLabel}</h2>
            )}
        </div>
    );

    return (
        <Panel compact={compact} title={header} onClose={onClose} wide>
            {pickingSeason ? (
                <div className="space-y-0.5">
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
                <div className="flex h-36 items-center justify-center">
                    <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#e50914] border-t-transparent" />
                </div>
            ) : episodes.length === 0 ? (
                <p className="py-10 text-center text-sm text-white/50">Aucun épisode pour cette saison.</p>
            ) : (
                <ol className="space-y-1.5">
                    {episodes.map(ep => {
                        const isCurrent = viewSeason === season && ep.episode_number === episode;
                        return (
                            <li key={ep.episode_number} ref={isCurrent ? currentRef : null}>
                                <button
                                    type="button"
                                    aria-current={isCurrent ? 'true' : undefined}
                                    onClick={() => onSelect(viewSeason, ep.episode_number)}
                                    className={`group flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors duration-150 cursor-pointer ${
                                        isCurrent ? 'liquid-glass-card-active' : 'liquid-glass-card-idle'
                                    }`}
                                >
                                    {/* Miniature 16:9 compacte */}
                                    <div className="relative aspect-video w-28 flex-none overflow-hidden rounded-lg bg-white/[0.06] ring-1 ring-inset ring-white/10">
                                        {ep.still_path ? (
                                            <img
                                                src={getPosterUrl(ep.still_path, 'w300')}
                                                alt=""
                                                loading="lazy"
                                                decoding="async"
                                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                            />
                                        ) : (
                                            <div className="grid h-full w-full place-items-center text-xs font-semibold text-white/30">
                                                É{ep.episode_number}
                                            </div>
                                        )}

                                        <span
                                            className={`absolute inset-0 grid place-items-center bg-black/30 transition-opacity duration-150 ${
                                                isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                            }`}
                                        >
                                            <span className="grid h-7 w-7 place-items-center rounded-full bg-black/55 backdrop-blur-md ring-1 ring-white/30">
                                                <svg className="ml-0.5 h-3 w-3 fill-white" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path d="M8 5v14l11-7z" />
                                                </svg>
                                            </span>
                                        </span>

                                        <span className="absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-px text-[10px] font-bold tabular-nums text-white/90">
                                            É{ep.episode_number}
                                        </span>

                                        {isCurrent && (
                                            <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
                                                <span
                                                    className="block h-full bg-[#e50914]"
                                                    style={{ width: `${Math.round(Math.max(0.04, Math.min(1, progress)) * 100)}%` }}
                                                />
                                            </span>
                                        )}
                                    </div>

                                    {/* Titre, durée et synopsis concis */}
                                    <div className="min-w-0 flex-1 pr-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className={`truncate text-[13.5px] font-semibold leading-snug ${isCurrent ? 'text-white' : 'text-white/85 group-hover:text-white'}`}>
                                                {ep.name || `Épisode ${ep.episode_number}`}
                                            </span>
                                            {ep.runtime ? (
                                                <span className="flex-none text-[11px] tabular-nums text-white/45">
                                                    {ep.runtime} min
                                                </span>
                                            ) : null}
                                        </div>

                                        {isCurrent && (
                                            <div className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-white/75">
                                                <span className="h-1.5 w-1.5 rounded-full bg-[#e50914]" />
                                                <span>En cours</span>
                                            </div>
                                        )}

                                        {ep.overview && (
                                            <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-white/50">
                                                {ep.overview}
                                            </p>
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
