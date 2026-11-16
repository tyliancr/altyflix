import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useHlsPlayer from '../../../hooks/useHlsPlayer';
import usePlaybackProgress from '../../../hooks/usePlaybackProgress';
import { useFullscreen, useIdleControls, usePlayerShortcuts, useSubtitleCues, useThumbnails } from '../../../hooks/usePlayerUi';
import { savePreferences } from '../../../services/videoApi';
import {
    NetflixBackIcon, NetflixExitFullscreenIcon, NetflixForward10Icon, NetflixFullscreenIcon, NetflixPauseIcon, NetflixPlayIcon,
    NetflixRewind10Icon, NetflixSubtitlesIcon, NetflixVolumeHighIcon, NetflixVolumeLowIcon, NetflixVolumeMuteIcon,
} from '../NetflixIcons';
import { NextEpisodeIcon, QualityIcon } from './PlayerParts';
import { AudioSubtitlesMenu, QualityMenu } from './PlayerMenus';
import { ErrorOverlay, LoadingOverlay, NextEpisodeCard, ResumePrompt, SeekFlash, SkipButton, SubtitleOverlay } from './PlayerOverlays';
import ProgressBar from './ProgressBar';
import { controlButton, formatTime } from './playerUtils';

const VOLUME_KEY = 'altyflix_player_volume';
const DOUBLE_TAP_MS = 300;

function storedVolume() {
    try {
        const value = JSON.parse(localStorage.getItem(VOLUME_KEY));
        return { volume: Math.min(1, Math.max(0, Number(value?.volume ?? 1))), muted: Boolean(value?.muted) };
    } catch {
        return { volume: 1, muted: false };
    }
}

/**
 * Lecteur vidéo ALTYFLIX (HLS adaptatif, multi-audio, sous-titres).
 *
 * @param playback           réponse de GET /api/titles/:id/playback
 * @param profileId          profil courant (reprise et préférences par profil)
 * @param skipResumePrompt   reprise directe, sans demander (enchaînement d'épisodes)
 * @param onBack             bouton retour
 * @param onNext(next)       passer à l'épisode suivant
 * @param onRefreshPlayback  redemander une URL signée (lien expiré)
 * @param onEnded            fin d'un film ou du dernier épisode
 */
export default function HlsPlayer({ playback, profileId, skipResumePrompt = false, onBack, onNext, onRefreshPlayback, onEnded }) {
    const containerRef = useRef(null);
    const videoRef = useRef(null);
    const tapRef = useRef({ time: 0, side: null, timer: null });

    const contentKey = `${playback.titleId}:${playback.season ?? ''}:${playback.episode ?? ''}`;

    // Préférences de langue : initialisées par l'API, puis conservées d'un épisode à l'autre.
    const [prefs, setPrefs] = useState(playback.preferences);

    // Position de départ : indéfinie tant que l'utilisateur n'a pas répondu à « Reprendre ? ».
    const [start, setStart] = useState({ key: null, position: 0 });
    useEffect(() => {
        const resume = playback.resume?.position || 0;
        if (resume && !skipResumePrompt) setStart({ key: null, position: resume });
        else setStart({ key: contentKey, position: resume });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- uniquement quand le contenu change
    }, [contentKey]);
    const started = start.key === contentKey;
    const askResume = !started && Boolean(playback.resume) && !skipResumePrompt;

    const [playing, setPlaying] = useState(false);
    const [waiting, setWaiting] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(playback.duration || 0);
    const [bufferedEnd, setBufferedEnd] = useState(0);
    const [{ volume, muted }, setVolumeState] = useState(storedVolume);
    const [openMenu, setOpenMenu] = useState(null); // 'audio' | 'quality' | null
    const [flash, setFlash] = useState(null);
    const [nextDismissed, setNextDismissed] = useState(false);

    usePlaybackProgress({ videoRef, playback, profileId, enabled: started });
    const player = useHlsPlayer({
        videoRef,
        src: started ? playback.hlsUrl : null,
        startPosition: start.position,
        preferences: prefs,
        onExpired: onRefreshPlayback,
    });
    const fullscreen = useFullscreen(containerRef, videoRef);
    const idle = useIdleControls({ delay: 3000, locked: !playing || openMenu !== null });
    const controlsVisible = idle.visible || !playing || openMenu !== null;
    const subtitleLines = useSubtitleCues(videoRef, `${contentKey}:${player.subtitleTrack}:${player.ready}`);
    const getThumbnail = useThumbnails(playback.thumbnailsUrl);

    // Nouveau contenu : on remet l'état d'affichage à zéro.
    useEffect(() => {
        setCurrentTime(0);
        setBufferedEnd(0);
        setDuration(playback.duration || 0);
        setNextDismissed(false);
        setWaiting(true);
        setOpenMenu(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contentKey]);

    // Événements de l'élément vidéo.
    useEffect(() => {
        const video = videoRef.current;
        const { volume: initialVolume, muted: initialMuted } = storedVolume();
        video.volume = initialVolume;
        video.muted = initialMuted;
        const handlers = {
            play: () => setPlaying(true),
            pause: () => setPlaying(false),
            timeupdate: () => setCurrentTime(video.currentTime),
            durationchange: () => { if (Number.isFinite(video.duration)) setDuration(video.duration); },
            progress: () => {
                const ranges = video.buffered;
                for (let i = 0; i < ranges.length; i++) {
                    if (ranges.start(i) <= video.currentTime + 0.5 && ranges.end(i) >= video.currentTime) setBufferedEnd(ranges.end(i));
                }
            },
            waiting: () => setWaiting(true),
            playing: () => setWaiting(false),
            canplay: () => setWaiting(false),
            seeked: () => setCurrentTime(video.currentTime),
            volumechange: () => {
                const next = { volume: video.volume, muted: video.muted };
                setVolumeState(next);
                try { localStorage.setItem(VOLUME_KEY, JSON.stringify(next)); } catch { /* stockage indisponible */ }
            },
        };
        Object.entries(handlers).forEach(([name, handler]) => video.addEventListener(name, handler));
        return () => Object.entries(handlers).forEach(([name, handler]) => video.removeEventListener(name, handler));
    }, []);

    // Lecture automatique dès que la source est prête. Si le navigateur la refuse, le bouton lecture reste affiché.
    useEffect(() => {
        if (player.ready) videoRef.current?.play().catch(() => setPlaying(false));
    }, [player.ready, playback.hlsUrl]);

    // iPhone : en plein écran natif, c'est le système qui dessine les sous-titres.
    useEffect(() => {
        const video = videoRef.current;
        if (player.engine !== 'native' || !video?.textTracks) return;
        const native = fullscreen.active && !document.fullscreenElement && !document.webkitFullscreenElement;
        Array.from(video.textTracks).forEach(track => {
            if (track.mode !== 'disabled') track.mode = native ? 'showing' : 'hidden';
        });
    }, [fullscreen.active, player.engine]);

    // ------------------------------------------------------------------ actions
    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (video.paused) video.play().catch(() => {});
        else video.pause();
    }, []);

    const seekTo = useCallback(time => {
        const video = videoRef.current;
        const max = Number.isFinite(video.duration) ? video.duration : time;
        video.currentTime = Math.min(Math.max(0, time), max);
        setCurrentTime(video.currentTime);
    }, []);

    const seekBy = useCallback(delta => {
        seekTo(videoRef.current.currentTime + delta);
        setFlash({ side: delta < 0 ? 'left' : 'right', id: Date.now() });
        idle.show();
    }, [seekTo, idle]);

    useEffect(() => {
        if (!flash) return undefined;
        const timer = setTimeout(() => setFlash(null), 500);
        return () => clearTimeout(timer);
    }, [flash]);

    const changeVolume = useCallback(delta => {
        const video = videoRef.current;
        video.volume = Math.min(1, Math.max(0, Math.round((video.volume + delta) * 20) / 20));
        if (video.volume > 0) video.muted = false;
        idle.show();
    }, [idle]);

    const toggleMute = useCallback(() => {
        const video = videoRef.current;
        video.muted = !video.muted;
        if (!video.muted && video.volume === 0) video.volume = 0.5;
    }, []);

    const updatePrefs = useCallback(change => {
        setPrefs(previous => ({ ...previous, ...change }));
        // Mémorisé côté serveur : l'épisode suivant et les autres appareils s'ouvriront dans la même langue.
        savePreferences(change, profileId).catch(() => {});
    }, [profileId]);

    const selectAudio = index => {
        player.setAudioTrack(index);
        const lang = player.audioTracks.find(track => track.index === index)?.lang;
        if (lang) updatePrefs({ audioLang: lang });
    };
    const selectSubtitle = index => {
        player.setSubtitleTrack(index);
        const track = player.subtitleTracks.find(item => item.index === index);
        updatePrefs(track ? { subtitleLang: track.lang, subtitleForced: track.forced } : { subtitleLang: null, subtitleForced: false });
    };

    const goNext = useCallback(() => {
        if (playback.next) onNext?.(playback.next);
    }, [playback.next, onNext]);

    // Fin de la vidéo : épisode suivant, sinon retour.
    useEffect(() => {
        const video = videoRef.current;
        const onVideoEnded = () => (playback.next ? goNext() : onEnded?.());
        video.addEventListener('ended', onVideoEnded);
        return () => video.removeEventListener('ended', onVideoEnded);
    }, [playback.next, goNext, onEnded]);

    // ------------------------------------------------------------------ intro / récap / épisode suivant
    const skip = useMemo(() => {
        const { recap, intro } = playback.markers || {};
        if (recap && currentTime >= recap.start && currentTime < recap.end - 1) return { label: 'Passer le récapitulatif', to: recap.end };
        if (intro && currentTime >= intro.start && currentTime < intro.end - 1) return { label: 'Passer l\'intro', to: intro.end };
        return null;
    }, [playback.markers, currentTime]);

    const creditsStart = playback.markers?.credits?.start ?? (duration ? duration - 10 : Infinity);
    const showNext = Boolean(playback.next) && started && !nextDismissed && duration > 0 && currentTime >= creditsStart;

    // ------------------------------------------------------------------ clavier
    const closeMenu = () => setOpenMenu(null);
    usePlayerShortcuts({
        ' ': togglePlay,
        k: togglePlay,
        ArrowLeft: () => seekBy(-10),
        ArrowRight: () => seekBy(10),
        j: () => seekBy(-10),
        l: () => seekBy(10),
        ArrowUp: () => changeVolume(0.05),
        ArrowDown: () => changeVolume(-0.05),
        f: fullscreen.toggle,
        m: toggleMute,
        s: () => { if (skip) seekTo(skip.to); },
        n: () => { if (playback.next) goNext(); },
        Escape: () => { if (openMenu) closeMenu(); },
    }, started && !player.error);

    // ------------------------------------------------------------------ souris / tactile sur l'image
    const onSurfacePointerUp = event => {
        tapRef.current.pointerType = event.pointerType;
        if (openMenu) return closeMenu();
        if (event.pointerType === 'mouse') {
            if (event.button === 0) togglePlay();
            return undefined;
        }
        // Tactile : simple tap = afficher / masquer les contrôles ; double tap à gauche / droite = ±10 s.
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientX - rect.left) / rect.width;
        const side = ratio < 0.35 ? 'left' : ratio > 0.65 ? 'right' : 'center';
        const tap = tapRef.current;
        const now = Date.now();
        clearTimeout(tap.timer);
        if (side !== 'center' && tap.side === side && now - tap.time < DOUBLE_TAP_MS) {
            tap.time = now; // un troisième tap rapide enchaîne un nouveau saut
            seekBy(side === 'left' ? -10 : 10);
            return undefined;
        }
        tap.time = now;
        tap.side = side;
        const wasVisible = controlsVisible;
        tap.timer = setTimeout(() => (wasVisible && playing ? idle.hide() : idle.show()), side === 'center' ? 0 : DOUBLE_TAP_MS);
        return undefined;
    };
    useEffect(() => () => clearTimeout(tapRef.current.timer), []);

    const subtitleLabel = playback.type === 'series' && playback.season !== null
        ? `S${playback.season} : É${playback.episode}${playback.episodeTitle ? ` – ${playback.episodeTitle}` : ''}`
        : null;
    const VolumeIcon = muted || volume === 0 ? NetflixVolumeMuteIcon : volume < 0.5 ? NetflixVolumeLowIcon : NetflixVolumeHighIcon;
    const loading = started && !player.error && (waiting || !player.ready || player.reconnecting);
    const barClass = `absolute inset-x-0 z-40 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`;

    return (
        <div
            ref={containerRef}
            className={`fixed inset-0 z-50 bg-black overflow-hidden select-none font-sans ${controlsVisible ? '' : 'cursor-none'}`}
            onMouseMove={idle.show}
            onKeyDown={idle.show}
            onFocus={idle.show}
        >
            <video
                ref={videoRef}
                className="w-full h-full object-contain bg-black"
                playsInline
                preload="auto"
                aria-label={`${playback.title}${subtitleLabel ? `, ${subtitleLabel}` : ''}`}
            />

            {/* Surface de clic / tap au-dessus de l'image */}
            <div className="absolute inset-0 z-10" onPointerUp={onSurfacePointerUp} onDoubleClick={() => { if (tapRef.current.pointerType === 'mouse') fullscreen.toggle(); }} />

            <SubtitleOverlay lines={subtitleLines} size={prefs.subtitleSize} raised={controlsVisible} />
            {flash && <SeekFlash key={flash.id} side={flash.side} />}
            {loading && <LoadingOverlay label={player.reconnecting ? 'Connexion perdue. Reconnexion…' : null} />}

            {/* Grand bouton lecture quand la vidéo est en pause */}
            {started && player.ready && !playing && !waiting && !player.error && (
                <button
                    type="button"
                    onClick={togglePlay}
                    aria-label="Lecture"
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-20 h-20 rounded-full bg-black/50 border border-white/30 text-white flex items-center justify-center outline-none hover:bg-black/70 transition-colors focus-visible:ring-2 focus-visible:ring-white"
                >
                    <NetflixPlayIcon className="w-10 h-10 ml-1" />
                </button>
            )}

            {skip && !showNext && <SkipButton label={skip.label} raised={controlsVisible} onSkip={() => seekTo(skip.to)} />}
            {showNext && (
                <NextEpisodeCard
                    key={contentKey}
                    next={playback.next}
                    paused={!playing}
                    raised={controlsVisible}
                    onPlayNow={goNext}
                    onDismiss={() => setNextDismissed(true)}
                />
            )}

            {/* Barre du haut */}
            <div className={`${barClass} top-0 flex items-center gap-4 md:gap-6 px-4 md:px-10 pt-[max(1rem,env(safe-area-inset-top))] pb-10 bg-gradient-to-b from-black/80 to-transparent`}>
                <button type="button" onClick={onBack} className={controlButton} aria-label="Retour">
                    <NetflixBackIcon className="w-8 h-8 drop-shadow" />
                </button>
                <div className="flex flex-wrap items-baseline gap-x-3 text-white min-w-0">
                    <span className="font-bold text-lg md:text-xl tracking-tight drop-shadow truncate">{playback.title}</span>
                    {subtitleLabel && <span className="text-gray-300 text-base md:text-lg font-normal drop-shadow truncate">{subtitleLabel}</span>}
                </div>
            </div>

            {/* Barre du bas */}
            <div className={`${barClass} bottom-0 px-4 md:px-10 pt-12 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/90 via-black/50 to-transparent`}>
                <div className="flex items-center gap-4">
                    <ProgressBar currentTime={currentTime} duration={duration} bufferedEnd={bufferedEnd} getThumbnail={getThumbnail} onSeek={seekTo} onSeekBy={seekBy} />
                    <div className="text-sm font-medium text-white/90 whitespace-nowrap min-w-[55px] text-right drop-shadow" aria-hidden="true">
                        {formatTime(Math.max(0, duration - currentTime))}
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center space-x-4 md:space-x-6">
                        <button type="button" onClick={togglePlay} className={`${controlButton} flex items-center justify-center`} aria-label={playing ? 'Pause' : 'Lecture'}>
                            {playing ? <NetflixPauseIcon className="w-8 h-8 drop-shadow" /> : <NetflixPlayIcon className="w-8 h-8 ml-0.5 drop-shadow" />}
                        </button>
                        <button type="button" onClick={() => seekBy(-10)} className={controlButton} aria-label="Reculer de 10 secondes">
                            <NetflixRewind10Icon className="w-8 h-8 drop-shadow" />
                        </button>
                        <button type="button" onClick={() => seekBy(10)} className={controlButton} aria-label="Avancer de 10 secondes">
                            <NetflixForward10Icon className="w-8 h-8 drop-shadow" />
                        </button>
                        <div className="group/volume flex items-center space-x-2">
                            <button type="button" onClick={toggleMute} className={controlButton} aria-label={muted || volume === 0 ? 'Réactiver le son' : 'Couper le son'}>
                                <VolumeIcon className="w-7 h-7 drop-shadow" />
                            </button>
                            {/* Sur mobile le volume se règle avec les boutons de l'appareil. */}
                            <input
                                type="range" min="0" max="1" step="0.05"
                                value={muted ? 0 : volume}
                                onChange={event => { const video = videoRef.current; video.volume = Number(event.target.value); video.muted = video.volume === 0; }}
                                aria-label="Volume"
                                className="hidden md:block w-0 opacity-0 group-hover/volume:w-24 group-hover/volume:opacity-100 focus-visible:w-24 focus-visible:opacity-100 transition-all h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-[#e50914] outline-none focus-visible:ring-2 focus-visible:ring-white"
                            />
                        </div>
                    </div>

                    <div className="flex items-center space-x-4 md:space-x-6 text-white">
                        {playback.next && (
                            <button type="button" onClick={goNext} className={controlButton} aria-label="Épisode suivant" title="Épisode suivant (N)">
                                <NextEpisodeIcon className="w-7 h-7 drop-shadow" />
                            </button>
                        )}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setOpenMenu(openMenu === 'audio' ? null : 'audio')}
                                className={controlButton}
                                aria-label="Audio et sous-titres" aria-haspopup="menu" aria-expanded={openMenu === 'audio'}
                            >
                                <NetflixSubtitlesIcon className="w-7 h-7 drop-shadow" />
                            </button>
                            {openMenu === 'audio' && (
                                <AudioSubtitlesMenu
                                    audioTracks={player.audioTracks} audioTrack={player.audioTrack} onAudio={selectAudio}
                                    subtitleTracks={player.subtitleTracks} subtitleTrack={player.subtitleTrack} onSubtitle={selectSubtitle}
                                    subtitleSize={prefs.subtitleSize} onSubtitleSize={size => updatePrefs({ subtitleSize: size })}
                                />
                            )}
                        </div>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setOpenMenu(openMenu === 'quality' ? null : 'quality')}
                                className={controlButton}
                                aria-label="Qualité vidéo" aria-haspopup="menu" aria-expanded={openMenu === 'quality'}
                            >
                                <QualityIcon className="w-7 h-7 drop-shadow" />
                            </button>
                            {openMenu === 'quality' && (
                                <QualityMenu levels={player.levels} level={player.level} activeHeight={player.activeHeight} onLevel={index => { player.setLevel(index); closeMenu(); }} />
                            )}
                        </div>
                        <button type="button" onClick={fullscreen.toggle} className={controlButton} aria-label={fullscreen.active ? 'Quitter le plein écran' : 'Plein écran'}>
                            {fullscreen.active ? <NetflixExitFullscreenIcon className="w-7 h-7 drop-shadow" /> : <NetflixFullscreenIcon className="w-7 h-7 drop-shadow" />}
                        </button>
                    </div>
                </div>
            </div>

            {askResume && (
                <ResumePrompt
                    position={playback.resume.position}
                    onResume={() => setStart({ key: contentKey, position: playback.resume.position })}
                    onRestart={() => setStart({ key: contentKey, position: 0 })}
                />
            )}
            {player.error && <ErrorOverlay message={player.error} onRetry={player.retry} onBack={onBack} />}
        </div>
    );
}
