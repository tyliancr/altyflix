import { useState, useRef, useEffect, useCallback } from 'react';
import EpisodeDrawer from '../common/EpisodeDrawer';
import { getSeasonDetails, getSeriesDetails } from '../../services/tmdb';
import { recordView } from '../../services/statsService';
import { resolvePlaybackStreams, getGatewayConfig, saveGatewayConfig, fetchSubtitlesForContent, fetchSubtitleCues, DEFAULT_PROVIDER, DEFAULT_TOKEN } from '../../services/streamingGateway';
import { UnifiedStreamingEngine } from './engine/UnifiedStreamingEngine';
import { useProfile } from '../../contexts/ProfileContext';
import { SUBTITLE_SIZE_MAP, SUBTITLE_COLOR_MAP } from '../settings/SettingsConstants';
import {
    NetflixBackIcon,
    NetflixPlayIcon,
    NetflixPauseIcon,
    NetflixRewind10Icon,
    NetflixForward10Icon,
    NetflixVolumeHighIcon,
    NetflixVolumeLowIcon,
    NetflixVolumeMuteIcon,
    NetflixNextEpisodeIcon,
    NetflixEpisodesIcon,
    NetflixFullscreenIcon,
    NetflixExitFullscreenIcon,
    NetflixSubtitlesIcon
} from './NetflixIcons';

function formatRemainingTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const s = Math.floor(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
        return `-${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `-${mins}:${String(secs).padStart(2, '0')}`;
}

function formatCurrentTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const s = Math.floor(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
        return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function NetflixPlayer({
    content = {},
    type: initialType,
    initialSeason = 1,
    initialEpisode = 1,
    preferredLang = 'VF',
    onClose,
    onNext,
    watchHistory = [],
    remember
}) {
    const isTv = (initialType || content?.media_type || (content?.name ? 'tv' : 'movie')) === 'tv';
    const id = Number(content?.id || content?.contentId || 0);
    const title = content?.title || content?.name || 'Lecture';

    // Navigation state
    const [season, setSeason] = useState(initialSeason);
    const [episode, setEpisode] = useState(initialEpisode);
    const [tvDetails, setTvDetails] = useState(content);
    const [currentEpTitle, setCurrentEpTitle] = useState('');
    const [nextEpAvailable, setNextEpAvailable] = useState(false);

    // Stream state
    // 'resolving' | 'playing' | 'no_token' | 'error'
    const [streamState, setStreamState] = useState('resolving');
    const [errorMessage, setErrorMessage] = useState('');
    const [availableStreams, setAvailableStreams] = useState([]);
    const [activeStream, setActiveStream] = useState(null);

    // Quick Gateway Input States
    const [quickProvider, setQuickProvider] = useState('realdebrid');
    const [quickToken, setQuickToken] = useState('');
    const [quickTesting, setQuickTesting] = useState(false);

    // Playback state
    const [isPlaying, setIsPlaying] = useState(false);
    const [isBuffering, setIsBuffering] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Overlays & Menus
    const [controlsVisible, setControlsVisible] = useState(true);
    const [showDrawer, setShowDrawer] = useState(false);
    const [showQualityMenu, setShowQualityMenu] = useState(false);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);
    const { currentProfile, updateProfile } = useProfile?.() || {};
    const [subtitlesAlwaysOn, setSubtitlesAlwaysOn] = useState(() => {
        const local = typeof localStorage !== 'undefined' ? localStorage.getItem('altyflix_subtitles_always_on') : null;
        if (local !== null) return local === 'true';
        return currentProfile?.subtitlesAlwaysOn !== false;
    });
    const [subToast, setSubToast] = useState(null);
    const subToastTimeoutRef = useRef(null);

    const triggerSubToast = useCallback((msg) => {
        if (subToastTimeoutRef.current) clearTimeout(subToastTimeoutRef.current);
        setSubToast(msg);
        subToastTimeoutRef.current = setTimeout(() => {
            setSubToast(null);
        }, 2200);
    }, []);

    const [showAudioSubsMenu, setShowAudioSubsMenu] = useState(false);
    const [availableSubtitles, setAvailableSubtitles] = useState([]);
    const [selectedSubtitleId, setSelectedSubtitleId] = useState('off');
    const [currentAudioLang, setCurrentAudioLang] = useState('vf');
    const [centerAction, setCenterAction] = useState(null); // 'play' | 'pause' | null
    const [resumeToast, setResumeToast] = useState(null); // { time: 742, formatted: '12:22' }
    const [isAutoplayMuted, setIsAutoplayMuted] = useState(false);
    const [hasTrueVf, setHasTrueVf] = useState(false);
    const [rippleEffect, setRippleEffect] = useState(null); // { side: 'left' | 'right', delta: -10 | 10 }
    const [showShortcutsModal, setShowShortcutsModal] = useState(false);
    const [timeDisplayMode, setTimeDisplayMode] = useState('remaining'); // 'remaining' | 'elapsed'
    const lastTapRef = useRef({ time: 0, x: 0 });

    // Hover timeline state
    const [hoverTime, setHoverTime] = useState(null);
    const [hoverPos, setHoverPos] = useState(0);

    // References
    const containerRef = useRef(null);
    const videoRef = useRef(null);
    const engineRef = useRef(null);
    const hideTimeoutRef = useRef(null);
    const centerTimeoutRef = useRef(null);
    const lastSaveRef = useRef(0);
    const hasRecordedView = useRef(false);
    const rememberRef = useRef(remember);
    rememberRef.current = remember;
    const contentRef = useRef(content);
    contentRef.current = content;
    const titleRef = useRef(title);
    titleRef.current = title;
    const watchHistoryRef = useRef(watchHistory);
    watchHistoryRef.current = watchHistory;
    const loadedUrlRef = useRef(null);
    const resolvedKeyRef = useRef('');
    const resolvedImdbIdRef = useRef('');
    const currentTimeRef = useRef(currentTime);
    currentTimeRef.current = currentTime;
    const volumeRef = useRef(volume);
    volumeRef.current = volume;
    const activeSubRequestIdRef = useRef(0);
    const autoSubAppliedKeyRef = useRef('');
    const availableSubtitlesRef = useRef([]);
    availableSubtitlesRef.current = availableSubtitles;
    const cuesRef = useRef([]);
    const [currentSubtitleLines, setCurrentSubtitleLines] = useState([]);
    const selectedSubtitleIdRef = useRef(selectedSubtitleId);
    selectedSubtitleIdRef.current = selectedSubtitleId;
    const updateSubtitleLinesRef = useRef(() => {});

    // Synchronisation de la configuration de streaming au montage
    useEffect(() => {
        const config = getGatewayConfig();
        if (config.provider) setQuickProvider(config.provider);
        if (config.token) setQuickToken(config.token);
    }, []);

    // Récupération des détails de la série
    useEffect(() => {
        let live = true;
        if (isTv && id) {
            getSeriesDetails(id).then(d => { if (live) setTvDetails(d); }).catch(() => {});
            getSeasonDetails(id, season).then(data => {
                if (!live) return;
                const ep = data?.episodes?.find(e => e.episode_number === episode);
                if (ep && ep.name) setCurrentEpTitle(ep.name);
                const hasNext = data?.episodes?.some(e => e.episode_number > episode);
                setNextEpAvailable(hasNext);
            }).catch(() => {});
        }
        return () => { live = false; };
    }, [isTv, id, season, episode]);

    // Enregistrement de la vue
    useEffect(() => {
        if (!hasRecordedView.current && id) {
            hasRecordedView.current = true;
            recordView(id, isTv ? 'tv' : 'movie');
        }
    }, [id, isTv]);

    // Résolution automatique du flux streaming (uniquement sur changement de média/saison/épisode)
    const resolveStream = useCallback(async (force = false) => {
        if (!id) return;
        const streamKey = `${id}-${isTv ? 'tv' : 'movie'}-${season}-${episode}`;
        if (!force && resolvedKeyRef.current === streamKey) return;

        setStreamState('resolving');
        setErrorMessage('');

        const config = getGatewayConfig();
        const imdbId = contentRef.current?.external_ids?.imdb_id || contentRef.current?.imdb_id;

        try {
            const res = await resolvePlaybackStreams({
                id,
                imdbId,
                type: isTv ? 'tv' : 'movie',
                season,
                episode,
                title: titleRef.current
            });

            if (res.success && res.activeStream) {
                resolvedKeyRef.current = streamKey;
                if (res.imdbId) resolvedImdbIdRef.current = res.imdbId;
                setAvailableStreams(res.streams || []);
                // Priorité absolue à la VF avec son compatible navigateur au lancement
                const vfStream = res.streams?.find(s => s.isFrench && s.isWebAudioSafe) || res.streams?.find(s => s.isFrench);
                const selectedStream = (res.hasTrueVf && vfStream) ? vfStream : res.activeStream;
                setActiveStream(selectedStream);
                setHasTrueVf(Boolean(res.hasTrueVf));
                setCurrentAudioLang(res.hasTrueVf ? 'vf' : 'vo');
                setStreamState('playing');
            } else if (res.reason === 'NO_TOKEN' || !config.hasToken) {
                // Fallback transparent : injecter le token officiel et réessayer immédiatement sans bloquer l'utilisateur
                saveGatewayConfig({ provider: DEFAULT_PROVIDER, token: DEFAULT_TOKEN });
                const retry = await resolvePlaybackStreams({
                    id,
                    imdbId,
                    type: isTv ? 'tv' : 'movie',
                    season,
                    episode,
                    title: titleRef.current
                });
                if (retry.success && retry.activeStream) {
                    resolvedKeyRef.current = streamKey;
                    if (retry.imdbId) resolvedImdbIdRef.current = retry.imdbId;
                    setAvailableStreams(retry.streams || []);
                    const vfStream = retry.streams?.find(s => s.isFrench);
                    const selectedStream = (retry.hasTrueVf && vfStream) ? vfStream : retry.activeStream;
                    setActiveStream(selectedStream);
                    setHasTrueVf(Boolean(retry.hasTrueVf));
                    setCurrentAudioLang(retry.hasTrueVf ? 'vf' : 'vo');
                    setStreamState('playing');
                } else {
                    setErrorMessage(retry.message || 'Connexion au serveur de streaming en cours...');
                    setStreamState('error');
                }
            } else {
                setErrorMessage(res.message || 'Aucun flux direct disponible pour ce titre.');
                setStreamState('error');
            }
        } catch (err) {
            setErrorMessage(err.message || 'Erreur lors de la résolution du flux direct.');
            setStreamState('error');
        }
    }, [id, isTv, season, episode]);

    useEffect(() => {
        resolveStream();
    }, [resolveStream]);

    // Bascule automatique vers le flux suivant en cas d'erreur de décodage ou de format (ex: MKV/AC3)
    const handleStreamError = useCallback(() => {
        setAvailableStreams(prevStreams => {
            if (!prevStreams || prevStreams.length <= 1) {
                setErrorMessage('Ce format vidéo ne peut pas être lu directement par votre navigateur.');
                setStreamState('error');
                return prevStreams;
            }
            const currentIdx = prevStreams.findIndex(s => s.url === activeStream?.url);
            const nextIdx = currentIdx + 1;
            if (nextIdx < prevStreams.length) {
                const nextStream = prevStreams[nextIdx];
                console.log(`[Altyflix Player] Bascule automatique vers le flux suivant : ${nextStream.quality} (${nextStream.languageLabel})`);
                loadedUrlRef.current = null;
                setActiveStream(nextStream);
            } else {
                setErrorMessage('Tous les flux vidéo directs disponibles pour ce titre ont été essayés.');
                setStreamState('error');
            }
            return prevStreams;
        });
    }, [activeStream?.url]);

    // Sauvegarde immédiate de la progression exacte dans le compte utilisateur
    const saveCurrentProgress = useCallback(() => {
        const video = videoRef.current;
        if (!video || !rememberRef.current || !video.duration || video.duration <= 0) return;
        const progressPct = Math.min(100, Math.round((video.currentTime / video.duration) * 100));
        const c = contentRef.current || {};
        rememberRef.current(
            {
                id,
                contentId: id,
                title: titleRef.current,
                type: isTv ? 'tv' : 'movie',
                poster_path: c.poster_path || c.backdrop_path,
                backdrop_path: c.backdrop_path
            },
            isTv ? season : 1,
            isTv ? episode : 1,
            progressPct,
            Math.round(video.currentTime)
        );
        lastSaveRef.current = Date.now();
    }, [id, isTv, season, episode]);

    // Initialisation du moteur de streaming HTML5 sur <video>
    useEffect(() => {
        const streamUrl = activeStream?.url;
        if (streamState !== 'playing' || !streamUrl || !videoRef.current) return;
        if (loadedUrlRef.current === streamUrl) return;
        loadedUrlRef.current = streamUrl;

        const video = videoRef.current;
        const engine = new UnifiedStreamingEngine();
        engineRef.current = engine;

        // Reprise de lecture exacte depuis l'historique de visionnage ou position en cours
        let startPos = 0;
        if (currentTimeRef.current > 5) {
            startPos = Math.round(currentTimeRef.current);
        } else {
            const historyList = watchHistoryRef.current || [];
            const saved = historyList.find(h => String(h.contentId || h.id) === String(id));
            if (saved) {
                const isMatching = !isTv || (Number(saved.season || 1) === Number(season) && Number(saved.episode || 1) === Number(episode));
                if (isMatching && saved.progress < 90 && saved.lastWatchedPosition > 5) {
                    startPos = Number(saved.lastWatchedPosition);
                }
            }
        }

        engine.load({
            videoElement: video,
            url: streamUrl,
            startPosition: startPos,
            callbacks: {
                onBufferingChange: (buffering) => setIsBuffering(buffering),
                onAutoplayMuted: (muted) => {
                    setIsAutoplayMuted(muted);
                    setIsMuted(muted);
                },
                onError: (err) => {
                    console.warn('[Altyflix Player] Erreur signalée par le moteur :', err);
                    handleStreamError();
                }
            }
        });

        const onPlay = () => setIsPlaying(true);
        const onPause = () => {
            setIsPlaying(false);
            saveCurrentProgress();
        };

        const onTimeUpdate = () => {
            setCurrentTime(video.currentTime);
            setDuration(video.duration || 0);

            // Synchronisation permanente des sous-titres
            if (updateSubtitleLinesRef.current) {
                updateSubtitleLinesRef.current();
            }

            // Buffer
            if (video.buffered && video.buffered.length > 0) {
                setBuffered(video.buffered.end(video.buffered.length - 1));
            }

            // Sauvegarde automatique toutes les 5 secondes
            const now = Date.now();
            if (now - lastSaveRef.current > 5000) {
                saveCurrentProgress();
            }
        };

        const onLoadedMetadata = () => {
            setDuration(video.duration || 0);
            setIsBuffering(false);
            if (startPos > 5 && Number.isFinite(video.duration) && startPos < video.duration - 15) {
                video.currentTime = startPos;
                setResumeToast({
                    time: startPos,
                    formatted: formatCurrentTime(startPos)
                });
                setTimeout(() => setResumeToast(null), 7000);
            }
            // Tentative de lecture avec son natif
            video.muted = false;
            video.volume = volumeRef.current || 1;
            video.play().catch(() => {
                video.muted = true;
                setIsAutoplayMuted(true);
                setIsMuted(true);
                video.play().catch(() => {});
            });
        };

        const onVolumeChange = () => {
            setIsMuted(video.muted);
            setVolume(video.volume);
        };

        const onWaiting = () => setIsBuffering(true);
        const onPlaying = () => setIsBuffering(false);
        const onVideoError = () => {
            console.warn('[Altyflix Player] Erreur de lecture vidéo native :', video.error);
            handleStreamError();
        };

        const onBeforeUnload = () => {
            saveCurrentProgress();
        };
        window.addEventListener('beforeunload', onBeforeUnload);

        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('volumechange', onVolumeChange);
        video.addEventListener('waiting', onWaiting);
        video.addEventListener('playing', onPlaying);
        video.addEventListener('error', onVideoError);

        return () => {
            saveCurrentProgress();
            window.removeEventListener('beforeunload', onBeforeUnload);
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('volumechange', onVolumeChange);
            video.removeEventListener('waiting', onWaiting);
            video.removeEventListener('playing', onPlaying);
            video.removeEventListener('error', onVideoError);
            engine.destroy();
        };
    }, [activeStream?.url, streamState, id, isTv, season, episode, handleStreamError, saveCurrentProgress]);

    // Fermeture du lecteur avec sauvegarde immédiate de l'exacte seconde
    const handleClose = useCallback(() => {
        saveCurrentProgress();
        if (onClose) onClose();
    }, [onClose, saveCurrentProgress]);

    // Passage à l'épisode suivant
    const handleNextEpisode = useCallback(() => {
        if (onNext) {
            onNext();
            return;
        }
        setEpisode(ep => ep + 1);
    }, [onNext]);

    // Gestion du masquage automatique des contrôles ET du curseur souris (style Netflix)
    const handleMouseMove = useCallback(() => {
        setControlsVisible(true);
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = setTimeout(() => {
            const video = videoRef.current;
            if (video && !video.paused) {
                setControlsVisible(false);
            }
        }, 2500);
    }, []);

    // Son coupé par le navigateur au démarrage : le premier geste (clic, touche, toucher)
    // le réactive, sans afficher de bandeau.
    useEffect(() => {
        if (!isAutoplayMuted) return undefined;
        const unmute = () => {
            const video = videoRef.current;
            if (video) {
                video.muted = false;
                video.volume = volume || 1;
            }
            setIsAutoplayMuted(false);
            setIsMuted(false);
        };
        const events = ['pointerdown', 'keydown', 'touchstart'];
        events.forEach(type => window.addEventListener(type, unmute, { once: true, capture: true }));
        return () => events.forEach(type => window.removeEventListener(type, unmute, { capture: true }));
    }, [isAutoplayMuted, volume]);

    // Bascule Lecture / Pause
    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        // Réactivation immédiate du son au premier geste de l'utilisateur
        if (video.muted) {
            video.muted = false;
            video.volume = volume || 1;
            setIsAutoplayMuted(false);
            setIsMuted(false);
        }

        if (video.paused) {
            video.play().catch(() => {});
            setCenterAction('play');
            handleMouseMove();
        } else {
            video.pause();
            setCenterAction('pause');
            setControlsVisible(true);
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        }

        if (centerTimeoutRef.current) clearTimeout(centerTimeoutRef.current);
        centerTimeoutRef.current = setTimeout(() => setCenterAction(null), 600);
    }, [handleMouseMove, isAutoplayMuted, volume]);

    // Saut relatif de +/- 10 secondes (évite le blocage à 0 si duration n'est pas encore finie)
    const seekRelative = useCallback((deltaSec) => {
        const video = videoRef.current;
        if (!video) return;
        const curr = video.currentTime || 0;
        const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
        const target = Math.max(0, Math.min(dur, curr + deltaSec));
        video.currentTime = target;
        setCurrentTime(target);
    }, []);


    // Gestion du clic (Lecture/Pause) et du double-clic (-10s à gauche / +10s à droite style Netflix)
    const handleVideoClick = useCallback((e) => {
        setShowQualityMenu(false);
        setShowAudioSubsMenu(false);
        setShowSpeedMenu(false);

        const now = Date.now();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const isLeft = x < rect.width / 2;

        if (now - lastTapRef.current.time < 320) {
            // Double tap / double click
            if (isLeft) {
                seekRelative(-10);
                setRippleEffect({ side: 'left', delta: -10 });
            } else {
                seekRelative(10);
                setRippleEffect({ side: 'right', delta: 10 });
            }
            if (centerTimeoutRef.current) clearTimeout(centerTimeoutRef.current);
            centerTimeoutRef.current = setTimeout(() => setRippleEffect(null), 650);
            lastTapRef.current = { time: 0, x: 0 };
            return;
        }

        lastTapRef.current = { time: now, x };

        setTimeout(() => {
            if (Date.now() - lastTapRef.current.time >= 300 && lastTapRef.current.time !== 0) {
                togglePlay();
            }
        }, 310);
    }, [seekRelative, togglePlay]);

    // Déplacement direct sur la barre de progression
    const handleSeekChange = (e) => {
        const newTime = parseFloat(e.target.value);
        setCurrentTime(newTime);
        if (videoRef.current) {
            videoRef.current.currentTime = newTime;
        }
    };

    // Gestion du volume
    const handleVolumeChange = (newVol) => {
        const v = Math.max(0, Math.min(1, newVol));
        setVolume(v);
        setIsMuted(v === 0);
        if (videoRef.current) {
            videoRef.current.volume = v;
            videoRef.current.muted = v === 0;
        }
    };

    const toggleMute = useCallback(() => {
        if (isMuted) {
            setIsMuted(false);
            if (videoRef.current) {
                videoRef.current.muted = false;
                videoRef.current.volume = volume || 0.8;
            }
        } else {
            setIsMuted(true);
            if (videoRef.current) {
                videoRef.current.muted = true;
            }
        }
    }, [isMuted, volume]);

    // Bascule plein écran ultra-compatible (iOS Safari webkitEnterFullscreen, Android Fullscreen API, Desktop)
    const toggleFullscreen = useCallback((e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        const container = containerRef.current;
        const video = videoRef.current;
        if (!container && !video) return;

        // Fermer tous les menus pour une vue 100% propre
        setShowQualityMenu(false);
        setShowAudioSubsMenu(false);
        setShowSpeedMenu(false);

        const isCurrentlyFs = Boolean(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement ||
            video?.webkitDisplayingFullscreen
        );

        if (isCurrentlyFs) {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (video?.webkitExitFullscreen) {
                video.webkitExitFullscreen();
            }
            if (window.screen?.orientation?.unlock) {
                window.screen.orientation.unlock().catch(() => {});
            }
            setIsFullscreen(false);
        } else {
            // Sur mobile iOS, seul video.webkitEnterFullscreen() fonctionne
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            if (isIOS && video?.webkitEnterFullscreen) {
                video.webkitEnterFullscreen();
            } else if (container?.requestFullscreen) {
                container.requestFullscreen().catch(() => {
                    if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();
                });
            } else if (container?.webkitRequestFullscreen) {
                container.webkitRequestFullscreen();
            } else if (video?.webkitEnterFullscreen) {
                video.webkitEnterFullscreen();
            }

            // Bascule automatique en paysage sur mobile pour une vraie immersion Netflix
            if (window.screen?.orientation?.lock) {
                window.screen.orientation.lock('landscape').catch(() => {});
            }
            setIsFullscreen(true);
        }
    }, []);

    // Changement de vitesse de lecture
    const handleSpeedChange = (rate) => {
        setPlaybackRate(rate);
        if (videoRef.current) videoRef.current.playbackRate = rate;
        setShowSpeedMenu(false);
    };

    // Changement de flux (qualité)
    const handleSelectStream = (st) => {
        if (!st || st.url === activeStream?.url) return;
        loadedUrlRef.current = null;
        setActiveStream(st);
        if (st.isFrench) {
            setCurrentAudioLang('vf');
        } else if (hasTrueVf && !st.isFrench) {
            setCurrentAudioLang('vo');
        }
        setShowQualityMenu(false);
        setIsBuffering(true);
    };

    // Extraction et synchronisation des lignes de sous-titres actives (cues en mémoire JS, zéro doublon)
    const updateSubtitleLines = useCallback(() => {
        const video = videoRef.current;
        if (!video || selectedSubtitleIdRef.current === 'off') {
            setCurrentSubtitleLines(lines => (lines.length === 0 ? lines : []));
            return;
        }

        const t = video.currentTime;
        const cues = cuesRef.current;
        if (!cues || cues.length === 0) {
            setCurrentSubtitleLines(lines => (lines.length === 0 ? lines : []));
            return;
        }

        const matching = cues.filter(c => t >= c.start && t <= c.end);
        const lines = [];
        matching.forEach(c => {
            const parts = String(c.text || '').split('\n');
            parts.forEach(p => {
                const cleaned = p.replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim();
                if (cleaned && !lines.includes(cleaned)) {
                    lines.push(cleaned);
                }
            });
        });

        setCurrentSubtitleLines(prev => {
            if (prev.length === lines.length && prev.every((l, idx) => l === lines[idx])) {
                return prev;
            }
            return lines;
        });
    }, []);
    updateSubtitleLinesRef.current = updateSubtitleLines;

    // Sélection d'une piste de sous-titres (sécurisée en mémoire pour éliminer les bugs d'empilement)
    const handleSelectSubtitle = useCallback(async (subId, customList = null, showFeedback = false) => {
        const reqId = ++activeSubRequestIdRef.current;
        setSelectedSubtitleId(subId);
        selectedSubtitleIdRef.current = subId;
        const video = videoRef.current;
        if (!video) return;

        // Désactivation immédiate de toutes les pistes natives du navigateur
        for (let i = 0; i < video.textTracks.length; i++) {
            video.textTracks[i].mode = 'disabled';
        }
        const oldTracks = video.querySelectorAll('track');
        oldTracks.forEach(t => video.removeChild(t));

        if (subId === 'off') {
            cuesRef.current = [];
            setCurrentSubtitleLines([]);
            if (showFeedback) triggerSubToast('Sous-titres : Désactivés');
            return;
        }

        const list = customList || availableSubtitlesRef.current;
        const sub = list.find(s => s.id === subId);
        if (!sub) return;

        if (showFeedback) triggerSubToast(`Sous-titres : ${sub.label}`);

        try {
            const cues = await fetchSubtitleCues(sub.url, sub.encoding);
            if (reqId !== activeSubRequestIdRef.current || !videoRef.current) return;
            cuesRef.current = cues;
            if (updateSubtitleLinesRef.current) updateSubtitleLinesRef.current();
        } catch (err) {
            console.warn('[Altyflix Subtitles] Erreur chargement VTT :', err);
        }
    }, [triggerSubToast]);

    // Raccourci bascule rapide sous-titres (Touche C ou bouton direct)
    const toggleSubtitles = useCallback(() => {
        const subs = availableSubtitlesRef.current || [];
        if (selectedSubtitleIdRef.current !== 'off') {
            handleSelectSubtitle('off', null, true);
        } else if (subs.length > 0) {
            const frSub = subs.find(s => s.lang === 'fr' || (s.label && s.label.toLowerCase().includes('fr')));
            const target = frSub || subs[0];
            handleSelectSubtitle(target.id, subs, true);
        } else {
            triggerSubToast('Aucun sous-titre disponible');
        }
    }, [handleSelectSubtitle, triggerSubToast]);

    // Chargement automatique des sous-titres disponibles
    useEffect(() => {
        let active = true;
        const currentMediaKey = `${id}-${isTv ? 'tv' : 'movie'}-${season}-${episode}`;
        if (!id) return;

        const imdbId = contentRef.current?.external_ids?.imdb_id || contentRef.current?.imdb_id || resolvedImdbIdRef.current;

        fetchSubtitlesForContent({
            id,
            imdbId,
            type: isTv ? 'tv' : 'movie',
            season,
            episode
        }).then(subs => {
            if (!active || !Array.isArray(subs)) return;
            setAvailableSubtitles(subs);
            availableSubtitlesRef.current = subs;

            // Auto-sélection des sous-titres : activés par défaut selon la préférence utilisateur (VF comme VO)
            if (autoSubAppliedKeyRef.current !== currentMediaKey) {
                autoSubAppliedKeyRef.current = currentMediaKey;
                if (subtitlesAlwaysOn && subs.length > 0) {
                    const frSub = subs.find(s => s.lang === 'fr' || (s.label && s.label.toLowerCase().includes('fr')));
                    const targetSub = frSub || subs[0];
                    if (targetSub) {
                        handleSelectSubtitle(targetSub.id, subs, false);
                    }
                }
            }
        }).catch(() => {});

        return () => { active = false; };
    }, [id, isTv, season, episode, subtitlesAlwaysOn, handleSelectSubtitle]);

    // Sélection de la langue audio (VF vs VO)
    const handleSelectAudioLang = (lang) => {
        setCurrentAudioLang(lang);
        if (!availableStreams || availableStreams.length <= 1) return;

        if (lang === 'vf') {
            const vfStream = availableStreams.find(s => s.isFrench && s.isWebAudioSafe) || availableStreams.find(s => s.isFrench);
            if (vfStream && vfStream.url !== activeStream?.url) {
                loadedUrlRef.current = null;
                setActiveStream(vfStream);
            }
        } else {
            const voStream = availableStreams.find(s => !s.isFrench) || availableStreams[0];
            if (voStream && voStream.url !== activeStream?.url) {
                loadedUrlRef.current = null;
                setActiveStream(voStream);
            }
        }
    };

    // Raccourcis clavier complets Netflix
    useEffect(() => {
        const onKeyDown = (e) => {
            // Ignorer si l'utilisateur écrit dans un input
            if (['input', 'textarea', 'select'].includes(e.target.tagName.toLowerCase())) return;

            switch (e.key.toLowerCase()) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'arrowleft':
                case 'j':
                    e.preventDefault();
                    seekRelative(-10);
                    break;
                case 'arrowright':
                case 'l':
                    e.preventDefault();
                    seekRelative(10);
                    break;
                case 'arrowup':
                    e.preventDefault();
                    handleVolumeChange(volume + 0.1);
                    break;
                case 'arrowdown':
                    e.preventDefault();
                    handleVolumeChange(volume - 0.1);
                    break;
                case 'm':
                    e.preventDefault();
                    toggleMute();
                    break;
                case 'f':
                    e.preventDefault();
                    toggleFullscreen();
                    break;
                case 'escape':
                    e.preventDefault();
                    if (document.fullscreenElement) {
                        document.exitFullscreen().catch(() => {});
                        setIsFullscreen(false);
                    } else {
                        handleClose();
                    }
                    break;
                case 'c':
                case 's':
                    e.preventDefault();
                    toggleSubtitles();
                    break;
                case 'n':
                    if (isTv && nextEpAvailable) {
                        e.preventDefault();
                        handleNextEpisode();
                    }
                    break;
                case '?':
                    e.preventDefault();
                    setShowShortcutsModal(v => !v);
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [togglePlay, seekRelative, volume, toggleFullscreen, toggleMute, handleClose, isTv, nextEpAvailable, handleNextEpisode, toggleSubtitles]);

    // Synchronisation permanente de l'état plein écran (Desktop, iOS Safari et Android)
    useEffect(() => {
        const handleFsChange = () => {
            const isFs = Boolean(
                document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullScreenElement ||
                document.msFullscreenElement ||
                videoRef.current?.webkitDisplayingFullscreen
            );
            setIsFullscreen(isFs);
        };

        document.addEventListener('fullscreenchange', handleFsChange);
        document.addEventListener('webkitfullscreenchange', handleFsChange);
        const video = videoRef.current;
        if (video) {
            video.addEventListener('webkitbeginfullscreen', () => setIsFullscreen(true));
            video.addEventListener('webkitendfullscreen', () => setIsFullscreen(false));
        }

        return () => {
            document.removeEventListener('fullscreenchange', handleFsChange);
            document.removeEventListener('webkitfullscreenchange', handleFsChange);
            if (video) {
                video.removeEventListener('webkitbeginfullscreen', () => setIsFullscreen(true));
                video.removeEventListener('webkitendfullscreen', () => setIsFullscreen(false));
            }
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className={`fixed inset-0 z-[99999] bg-black flex flex-col items-center justify-center select-none overflow-hidden ${
                controlsVisible ? 'cursor-default' : 'player-idle cursor-none'
            }`}
            style={{ cursor: controlsVisible ? 'default' : 'none' }}
            onMouseMove={handleMouseMove}
            onTouchStart={handleMouseMove}
            onMouseLeave={() => {
                const video = videoRef.current;
                if (video && !video.paused) setControlsVisible(false);
            }}
        >
            {/* VIEWPORT 1 : LECTEUR 100% NATIF ALTYFLIX (<video>) */}
            <div className={`relative w-full h-full bg-black flex items-center justify-center ${streamState === 'playing' ? 'block' : 'hidden'} ${controlsVisible ? '' : 'player-idle cursor-none'}`}>
                <video
                    ref={videoRef}
                    className="w-full h-full object-contain bg-black"
                    style={{ cursor: controlsVisible ? 'pointer' : 'none' }}
                    playsInline
                    onClick={handleVideoClick}
                    onDoubleClick={toggleFullscreen}
                />

                {/* SOUS-TITRES OFFICIELS NETFLIX : Toujours nets, au-dessus des contrôles */}
                {currentSubtitleLines.length > 0 && selectedSubtitleId !== 'off' && (
                    <div
                        className={`absolute inset-x-0 z-30 flex flex-col items-center gap-1.5 px-6 pointer-events-none transition-all duration-300 ${
                            controlsVisible ? 'bottom-28 sm:bottom-32 md:bottom-36' : 'bottom-10 sm:bottom-14'
                        }`}
                    >
                        {currentSubtitleLines.map((line, idx) => (
                            <span
                                key={`${idx}-${line}`}
                                className="max-w-[94%] sm:max-w-[82%] md:max-w-[72%] px-3.5 py-1.5 rounded-md bg-black/85 text-center font-bold leading-snug whitespace-pre-line shadow-2xl backdrop-blur-sm transition-all"
                                style={{
                                    fontFamily: 'Netflix Sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                    fontSize: SUBTITLE_SIZE_MAP[currentProfile?.subtitlesSize]?.fontSize || '1.5rem',
                                    color: SUBTITLE_COLOR_MAP[currentProfile?.subtitlesColor] || '#FFFFFF',
                                    textShadow: '0 0 4px #000, 0 1px 3px rgba(0,0,0,0.9), 1px 1px 2px #000, -1px -1px 2px #000',
                                    letterSpacing: '0.015em'
                                }}
                            >
                                {line}
                            </span>
                        ))}
                    </div>
                )}

                {/* Effet visuel Ripple -10s / +10s au double clic gauche/droite */}
                {rippleEffect && (
                    <div
                        className={`absolute inset-y-0 ${
                            rippleEffect.side === 'left' ? 'left-0 w-1/3' : 'right-0 w-1/3'
                        } flex items-center justify-center pointer-events-none z-30`}
                    >
                        <div className="flex flex-col items-center justify-center w-24 h-24 rounded-full bg-black/75 border border-white/20 backdrop-blur-md shadow-2xl scale-110 animate-out fade-out zoom-out duration-500">
                            {rippleEffect.delta < 0 ? (
                                <NetflixRewind10Icon className="w-10 h-10 text-white" />
                            ) : (
                                <NetflixForward10Icon className="w-10 h-10 text-white" />
                            )}
                            <span className="text-xs font-bold text-white mt-1">
                                {rippleEffect.delta < 0 ? '-10s' : '+10s'}
                            </span>
                        </div>
                    </div>
                )}

                {/* Centre de l'écran : Indicateur animé Lecture / Pause */}
                {centerAction && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-30">
                        <div className="w-20 h-20 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white scale-125 transition-transform animate-out fade-out duration-500 shadow-2xl">
                            {centerAction === 'play' ? (
                                <NetflixPlayIcon className="w-10 h-10 fill-current translate-x-0.5" />
                            ) : (
                                <NetflixPauseIcon className="w-10 h-10 fill-current" />
                            )}
                        </div>
                    </div>
                )}


                {/* Carte fin d'épisode : Épisode suivant (visible dans les 45 dernières secondes) */}
                {isTv && duration > 60 && (duration - currentTime) <= 45 && nextEpAvailable && (
                    <div className="absolute bottom-24 right-8 z-40 animate-in fade-in slide-in-from-bottom-3 duration-300 pointer-events-auto p-4 rounded-2xl bg-[#14141c]/95 border border-white/20 backdrop-blur-2xl shadow-2xl flex items-center gap-4 max-w-sm">
                        <div className="flex-1 space-y-1">
                            <div className="text-[10px] font-extrabold text-white/50 uppercase tracking-wider">Épisode suivant</div>
                            <div className="text-xs sm:text-sm font-bold text-white truncate">
                                Saison {season} · Épisode {episode + 1}
                            </div>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleNextEpisode();
                            }}
                            className="px-4 py-2 bg-white text-black hover:bg-gray-100 font-extrabold text-xs rounded-lg transition-all cursor-pointer shadow flex items-center gap-1.5"
                        >
                            <NetflixPlayIcon className="w-3.5 h-3.5 fill-black" />
                            <span>Lancer</span>
                        </button>
                    </div>
                )}

                {/* Notification de Reprise de lecture (Style officiel Netflix) */}
                {resumeToast && (
                    <div className="absolute top-20 left-6 sm:left-10 z-50 flex items-center gap-3 bg-black/90 border border-white/20 backdrop-blur-xl px-4 py-2.5 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#e50914] animate-pulse" />
                        <span className="text-xs sm:text-sm text-white font-medium">
                            Reprise à <strong className="text-white font-mono">{resumeToast.formatted}</strong>
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                if (videoRef.current) {
                                    videoRef.current.currentTime = 0;
                                }
                                setResumeToast(null);
                            }}
                            className="ml-2 text-xs font-semibold px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                        >
                            Recommencer au début
                        </button>
                        <button
                            type="button"
                            onClick={() => setResumeToast(null)}
                            className="text-white/40 hover:text-white text-xs ml-1 cursor-pointer"
                        >
                            ✕
                        </button>
                    </div>
                )}

                {/* Notification Toast Sous-titres (Bascule touche C / changement rapide) */}
                {subToast && (
                    <div className="absolute top-20 right-6 sm:right-10 z-50 flex items-center gap-2.5 bg-black/90 border border-white/20 backdrop-blur-xl px-4 py-2 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-none">
                        <NetflixSubtitlesIcon className="w-4 h-4 text-[#e50914]" />
                        <span className="text-xs sm:text-sm text-white font-medium">
                            {subToast}
                        </span>
                    </div>
                )}

                {/* Spinner Netflix en cas de chargement / buffering */}
                {isBuffering && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 z-20">
                        <div className="w-16 h-16 border-4 border-[#e50914] border-t-transparent rounded-full animate-spin shadow-2xl" />
                    </div>
                )}
            </div>

            {/* VIEWPORT 2 : CHARGEMENT DU FLUX */}
            {streamState === 'resolving' && (
                <div className="flex flex-col items-center justify-center space-y-4 text-white z-20">
                    <div className="w-16 h-16 border-4 border-[#e50914] border-t-transparent rounded-full animate-spin" />
                    <p className="text-base font-semibold tracking-wide">Connexion au flux direct 4K/1080p...</p>
                    <p className="text-xs text-white/50">{title} {isTv ? `· S${season} E${episode}` : ''}</p>
                </div>
            )}

            {/* VIEWPORT 3 : PAS DE CLÉ CONFIGURÉE (Activation Rapide ou Secours) */}
            {streamState === 'no_token' && (
                <div className="relative z-30 max-w-lg mx-6 p-7 sm:p-8 rounded-3xl bg-[#111118]/95 border border-white/15 backdrop-blur-2xl text-center space-y-5 shadow-[0_20px_80px_rgba(0,0,0,0.9)]">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-[#e50914]/20 border border-[#e50914]/40 flex items-center justify-center text-[#e50914]">
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                    </div>

                    <div className="space-y-1.5">
                        <h3 className="text-xl font-bold text-white tracking-wide">Lecteur 100% Natif Altyflix</h3>
                        <p className="text-xs sm:text-sm text-white/70 leading-relaxed">
                            Pour lancer ce film en <strong>4K / 1080p Blu-Ray</strong> directement dans votre lecteur Altyflix (zéro pub, zéro iframe, barre rouge), connectez votre clé <strong>Torbox</strong> ou <strong>Real-Debrid</strong>.
                        </p>
                    </div>

                    {/* Saisie rapide de la clé directement dans le lecteur */}
                    <div className="space-y-3 pt-1 text-left">
                        <div className="flex gap-2">
                            <select
                                value={quickProvider}
                                onChange={(e) => setQuickProvider(e.target.value)}
                                className="bg-[#181822] border border-white/15 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#e50914] cursor-pointer"
                            >
                                <option value="torbox">Torbox (Recommandé amis / multi-IP)</option>
                                <option value="realdebrid">Real-Debrid</option>
                                <option value="alldebrid">AllDebrid</option>
                                <option value="debridlink">Debrid-Link</option>
                            </select>

                            <input
                                type="password"
                                value={quickToken}
                                onChange={(e) => setQuickToken(e.target.value)}
                                placeholder="Collez votre clé API..."
                                className="flex-1 bg-[#181822] border border-white/15 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#e50914] font-mono"
                            />
                        </div>

                        <button
                            type="button"
                            disabled={quickTesting || !quickToken.trim()}
                            onClick={() => {
                                setQuickTesting(true);
                                saveGatewayConfig({ provider: quickProvider, token: quickToken.trim() });
                                resolveStream(true);
                            }}
                            className="w-full py-2.5 rounded-xl bg-[#e50914] hover:bg-[#b80710] disabled:opacity-40 text-white font-semibold text-xs tracking-wide transition-all shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <span>Activer et Lancer la 4K</span>
                        </button>
                    </div>

                    {/* Option secours gratuite sans clé */}
                    <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="text-xs text-white/50 hover:text-white transition-colors cursor-pointer py-1"
                        >
                            Retour au catalogue
                        </button>
                    </div>
                </div>
            )}

            {/* VIEWPORT 4 : ERREUR DE FLUX */}
            {streamState === 'error' && (
                <div className="relative z-30 max-w-md mx-6 p-8 rounded-3xl bg-[#111118]/95 border border-white/15 backdrop-blur-2xl text-center space-y-5">
                    <div className="text-4xl">⚠️</div>
                    <div className="space-y-1">
                        <h3 className="text-lg font-bold text-white">Flux momentanément inaccessible</h3>
                        <p className="text-xs text-white/60">{errorMessage}</p>
                    </div>
                    <div className="flex gap-3 justify-center">
                        <button
                            onClick={() => resolveStream(true)}
                            className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-all cursor-pointer"
                        >
                            Réessayer
                        </button>
                        <button
                            onClick={handleClose}
                            className="px-5 py-2.5 rounded-xl bg-[#e50914] hover:bg-[#b80710] text-white text-sm font-semibold transition-all cursor-pointer"
                        >
                            Retour au catalogue
                        </button>
                    </div>
                </div>
            )}

            {/* TOP BAR : RETOUR CATALOGUE, TITRE, ÉPISODES (Adapté PWA Mobile & Desktop) */}
            <div
                className={`absolute top-0 inset-x-0 pt-[max(1rem,env(safe-area-inset-top))] pb-12 px-4 sm:px-6 md:px-8 z-40 flex items-center justify-between transition-opacity duration-300 bg-gradient-to-b from-black/95 via-black/50 to-transparent pointer-events-none ${
                    controlsVisible ? 'opacity-100' : 'opacity-0'
                }`}
            >
                <div className="flex items-center space-x-2 sm:space-x-3 pointer-events-auto min-w-0">
                    <button
                        onClick={handleClose}
                        className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 active:scale-90 transition-transform cursor-pointer flex items-center justify-center flex-shrink-0"
                        title="Retour au catalogue"
                        aria-label="Retour au catalogue"
                    >
                        <NetflixBackIcon className="w-6 h-6 sm:w-7 sm:h-7 drop-shadow" />
                    </button>
                    <div className="flex flex-col select-none text-white min-w-0 max-w-[200px] xs:max-w-[260px] sm:max-w-md md:max-w-lg">
                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap min-w-0">
                            <span className="font-black text-sm sm:text-base md:text-lg tracking-wide drop-shadow truncate">
                                {title}
                            </span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="border border-white/40 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold text-white/90">
                                    {isTv ? 'SÉRIE' : 'FILM'}
                                </span>
                                <span className="border border-white/40 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold text-white/90">
                                    {activeStream?.quality?.includes('4K') ? '4K UHD' : 'HD'}
                                </span>
                            </div>
                        </div>
                        {isTv && (
                            <span className="text-gray-300 text-[11px] sm:text-xs font-medium drop-shadow truncate pt-0.5">
                                Saison {season} · Épisode {episode} {currentEpTitle ? `"${currentEpTitle}"` : ''}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center space-x-2 pointer-events-auto flex-shrink-0">
                    {/* Bouton raccourcis clavier (?) style Netflix */}
                    <button
                        onClick={() => setShowShortcutsModal(true)}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 text-white/80 hover:text-white text-xs font-bold transition-all flex items-center justify-center border border-white/15 cursor-pointer shadow"
                        title="Raccourcis clavier (?)"
                        aria-label="Raccourcis clavier"
                    >
                        ?
                    </button>
                </div>
            </div>

            {/* BOTTOM BAR : CONTRÔLES OFFICIELS NETFLIX (Barre rouge, scrub, audio, etc. 100% alignés) */}
            {streamState === 'playing' && (
                <div
                    className={`absolute bottom-0 inset-x-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-16 px-4 sm:px-6 md:px-8 z-40 flex flex-col space-y-2 sm:space-y-3 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300 pointer-events-auto ${
                        controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                >
                    {/* 1. Scrubber Timeline Netflix (#e50914) avec zone tactile confortable */}
                    <div className="relative group w-full py-3 cursor-pointer flex items-center touch-none">
                        {/* Tooltip position sur hover / drag */}
                        {hoverTime !== null && (
                            <div
                                className="absolute -top-8 -translate-x-1/2 px-2.5 py-1 rounded-md bg-black/90 text-white text-[11px] font-bold border border-white/20 pointer-events-none shadow-xl"
                                style={{ left: `${hoverPos}%` }}
                            >
                                {formatCurrentTime(hoverTime)}
                            </div>
                        )}

                        <div className="relative w-full h-1 sm:h-1.5 group-hover:h-2.5 bg-white/20 rounded-full overflow-hidden transition-all duration-150">
                            {/* Buffer bar */}
                            <div
                                className="absolute top-0 bottom-0 left-0 bg-white/40 rounded-full"
                                style={{ width: `${duration > 0 ? (buffered / duration) * 100 : 0}%` }}
                            />
                            {/* Played bar (Netflix Red #e50914) */}
                            <div
                                className="absolute top-0 bottom-0 left-0 bg-[#e50914] rounded-full"
                                style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                            />
                        </div>

                        {/* Tête de lecture (Thumb rouge Netflix) */}
                        <div
                            className="absolute w-3.5 h-3.5 sm:w-4 sm:h-4 bg-[#e50914] rounded-full shadow-md -translate-x-1/2 scale-100 sm:scale-0 sm:group-hover:scale-100 transition-transform duration-150"
                            style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                        />

                        {/* Input range transparent */}
                        <input
                            type="range"
                            min={0}
                            max={duration || 100}
                            step={0.1}
                            value={currentTime}
                            onChange={handleSeekChange}
                            onMouseMove={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                setHoverTime(pct * (duration || 0));
                                setHoverPos(pct * 100);
                            }}
                            onMouseLeave={() => setHoverTime(null)}
                            onTouchMove={(e) => {
                                const touch = e.touches[0];
                                const rect = e.currentTarget.getBoundingClientRect();
                                if (rect.width > 0) {
                                    const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
                                    setHoverTime(pct * (duration || 0));
                                    setHoverPos(pct * 100);
                                }
                            }}
                            onTouchEnd={() => setHoverTime(null)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            aria-label="Progression de la lecture"
                        />
                    </div>

                    {/* 2. Boutons de contrôle (Play, Volume, Titre, Qualité, Plein écran) */}
                    <div className="flex items-center justify-between text-white w-full">
                        {/* Partie Gauche : Lecture, Recul 10s, Avance 10s, Volume (desktop), Temps */}
                        <div className="flex items-center gap-1 sm:gap-3">
                            <button
                                onClick={togglePlay}
                                className="p-2 sm:p-2.5 rounded-full hover:bg-white/10 active:scale-90 transition-transform cursor-pointer"
                                title={isPlaying ? 'Pause' : 'Lecture'}
                                aria-label={isPlaying ? 'Pause' : 'Lecture'}
                            >
                                {isPlaying ? (
                                    <NetflixPauseIcon className="w-6 h-6 sm:w-8 sm:h-8" />
                                ) : (
                                    <NetflixPlayIcon className="w-6 h-6 sm:w-8 sm:h-8" />
                                )}
                            </button>

                            <button
                                onClick={() => seekRelative(-10)}
                                className="p-2 sm:p-2.5 rounded-full hover:bg-white/10 active:scale-90 transition-transform cursor-pointer"
                                title="Reculer de 10 secondes"
                                aria-label="Reculer de 10 secondes"
                            >
                                <NetflixRewind10Icon className="w-5 h-5 sm:w-7 sm:h-7" />
                            </button>

                            <button
                                onClick={() => seekRelative(10)}
                                className="p-2 sm:p-2.5 rounded-full hover:bg-white/10 active:scale-90 transition-transform cursor-pointer"
                                title="Avancer de 10 secondes"
                                aria-label="Avancer de 10 secondes"
                            >
                                <NetflixForward10Icon className="w-5 h-5 sm:w-7 sm:h-7" />
                            </button>

                            {/* Volume : visible sur tablette/desktop, masqué sur téléphone (boutons physiques du mobile) */}
                            <div className="hidden sm:flex items-center group/vol space-x-2">
                                <button
                                    onClick={toggleMute}
                                    className="p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                                    title={isMuted ? 'Activer le son' : 'Couper le son'}
                                    aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
                                >
                                    {isMuted || volume === 0 ? (
                                        <NetflixVolumeMuteIcon className="w-6 h-6" />
                                    ) : volume > 0.5 ? (
                                        <NetflixVolumeHighIcon className="w-6 h-6" />
                                    ) : (
                                        <NetflixVolumeLowIcon className="w-6 h-6" />
                                    )}
                                </button>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={isMuted ? 0 : volume}
                                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                                    className="w-0 group-hover/vol:w-16 sm:group-hover/vol:w-20 transition-all duration-200 accent-[#e50914] h-1 bg-white/20 rounded-full cursor-pointer overflow-hidden"
                                    aria-label="Volume"
                                />
                            </div>

                            {/* Temps restant / écoulé officiel Netflix */}
                            <button
                                onClick={() => setTimeDisplayMode(m => m === 'remaining' ? 'elapsed' : 'remaining')}
                                className="text-[11px] sm:text-xs md:text-sm font-semibold text-white/80 hover:text-white select-none pl-1 font-mono cursor-pointer transition-colors whitespace-nowrap"
                                title="Cliquer pour basculer temps restant / temps écoulé"
                            >
                                {timeDisplayMode === 'remaining'
                                    ? formatRemainingTime((duration || 0) - currentTime)
                                    : `${formatCurrentTime(currentTime)} / ${formatCurrentTime(duration || 0)}`}
                            </button>
                        </div>

                        {/* Partie Droite : Épisode suivant, Épisodes, Audio/Sous-titres, Vitesse, Qualité, Plein écran */}
                        <div className="flex items-center gap-1 sm:gap-2 relative">
                            {/* Bouton Épisode suivant officiel Netflix (Séries uniquement) */}
                            {isTv && nextEpAvailable && (
                                <button
                                    onClick={handleNextEpisode}
                                    className="p-2 rounded-full hover:bg-white/10 active:scale-90 transition-transform cursor-pointer"
                                    title="Épisode suivant (N)"
                                    aria-label="Épisode suivant"
                                >
                                    <NetflixNextEpisodeIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                                </button>
                            )}

                            {/* Bouton Liste des épisodes officiel Netflix (Séries uniquement) */}
                            {isTv && (
                                <button
                                    onClick={() => setShowDrawer(true)}
                                    className="p-2 rounded-full hover:bg-white/10 active:scale-90 transition-transform cursor-pointer"
                                    title="Épisodes"
                                    aria-label="Liste des épisodes"
                                >
                                    <NetflixEpisodesIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                                </button>
                            )}

                            {/* Sélecteur Audio et Sous-titres (Style officiel Netflix) */}
                            <div className="relative">
                                <button
                                    onClick={() => {
                                        setShowAudioSubsMenu(!showAudioSubsMenu);
                                        setShowQualityMenu(false);
                                        setShowSpeedMenu(false);
                                    }}
                                    className={`p-2 rounded-full hover:bg-white/10 active:scale-90 transition-all cursor-pointer ${
                                        selectedSubtitleId !== 'off' || showAudioSubsMenu
                                            ? 'text-[#e50914]'
                                            : 'text-white'
                                    }`}
                                    title="Audio et Sous-titres"
                                    aria-label="Audio et sous-titres"
                                >
                                    <NetflixSubtitlesIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                                </button>

                                {showAudioSubsMenu && (
                                    <div className="absolute bottom-full right-0 mb-3 w-72 sm:w-80 max-w-[calc(100vw-24px)] rounded-2xl bg-[#14141c]/95 border border-white/15 backdrop-blur-2xl p-4 shadow-2xl z-50">
                                        <div className="flex items-center justify-between pb-2 mb-3 border-b border-white/10">
                                            <span className="text-xs font-bold text-white uppercase tracking-wider">Audio et Sous-titres</span>
                                            <button
                                                onClick={() => setShowAudioSubsMenu(false)}
                                                className="text-white/50 hover:text-white text-xs cursor-pointer p-1"
                                                aria-label="Fermer"
                                            >
                                                ✕
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 text-xs">
                                            {/* Colonne 1 : Audio */}
                                            <div className="space-y-1.5">
                                                <div className="text-[11px] font-bold text-white/50 uppercase pb-1">Audio</div>
                                                {hasTrueVf ? (
                                                    <button
                                                        onClick={() => handleSelectAudioLang('vf')}
                                                        className={`w-full text-left px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center justify-between cursor-pointer ${
                                                            currentAudioLang === 'vf' ? 'bg-[#e50914] text-white' : 'text-white/80 hover:bg-white/10'
                                                        }`}
                                                    >
                                                        <span>Français [VF]</span>
                                                        {currentAudioLang === 'vf' && <span className="text-[10px]">✓</span>}
                                                    </button>
                                                ) : (
                                                    <div
                                                        className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/40 flex items-center justify-between select-none"
                                                        title="Aucun doublage audio français officiel disponible pour ce fichier"
                                                    >
                                                        <span className="text-[11px]">Français (Non dispo)</span>
                                                        <span className="text-[9px] bg-white/10 px-1 py-0.5 rounded text-white/60">VOSTFR</span>
                                                    </div>
                                                )}

                                                <button
                                                    onClick={() => handleSelectAudioLang('vo')}
                                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center justify-between cursor-pointer ${
                                                        currentAudioLang === 'vo' ? 'bg-[#e50914] text-white' : 'text-white/80 hover:bg-white/10'
                                                    }`}
                                                >
                                                    <span>Version Originale</span>
                                                    {currentAudioLang === 'vo' && <span className="text-[10px]">✓</span>}
                                                </button>
                                            </div>

                                            {/* Colonne 2 : Sous-titres */}
                                            <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                                <div className="text-[11px] font-bold text-white/50 uppercase pb-1 flex items-center justify-between">
                                                    <span>Sous-titres</span>
                                                    <span className="text-[9px] font-mono text-white/40 font-normal">Touche C</span>
                                                </div>
                                                <button
                                                    onClick={() => handleSelectSubtitle('off', null, true)}
                                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center justify-between cursor-pointer ${
                                                        selectedSubtitleId === 'off' ? 'bg-[#e50914] text-white' : 'text-white/80 hover:bg-white/10'
                                                    }`}
                                                >
                                                    <span>Désactivés</span>
                                                    {selectedSubtitleId === 'off' && <span className="text-[10px]">✓</span>}
                                                </button>

                                                {availableSubtitles.length > 0 ? (
                                                    availableSubtitles.map((sub) => (
                                                        <button
                                                            key={sub.id}
                                                            onClick={() => handleSelectSubtitle(sub.id, null, true)}
                                                            className={`w-full text-left px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center justify-between cursor-pointer ${
                                                                selectedSubtitleId === sub.id ? 'bg-[#e50914] text-white' : 'text-white/80 hover:bg-white/10'
                                                            }`}
                                                        >
                                                            <span className="truncate pr-1">{sub.label}</span>
                                                            {selectedSubtitleId === sub.id && <span className="text-[10px]">✓</span>}
                                                        </button>
                                                    ))
                                                ) : (
                                                    <span className="block text-[11px] text-white/40 italic px-2 py-1">Sous-titres intégrés au flux</span>
                                                )}

                                                <div className="pt-2 mt-2 border-t border-white/10 flex items-center justify-between">
                                                    <span className="text-[10px] text-white/70">Activer par défaut</span>
                                                    <button
                                                        type="button"
                                                        title="Activer ou désactiver les sous-titres automatiques au début de chaque vidéo"
                                                        onClick={() => {
                                                            const next = !subtitlesAlwaysOn;
                                                            setSubtitlesAlwaysOn(next);
                                                            localStorage.setItem('altyflix_subtitles_always_on', next ? 'true' : 'false');
                                                            if (currentProfile?.id && updateProfile) {
                                                                updateProfile(currentProfile.id, { subtitlesAlwaysOn: next });
                                                            }
                                                            triggerSubToast(next ? 'Sous-titres par défaut : Activés' : 'Sous-titres par défaut : Désactivés');
                                                        }}
                                                        className={`w-7 h-4 rounded-full transition-colors relative cursor-pointer p-0.5 ${
                                                            subtitlesAlwaysOn ? 'bg-[#e50914]' : 'bg-white/20'
                                                        }`}
                                                    >
                                                        <div className={`w-3 h-3 rounded-full bg-white transition-transform ${
                                                            subtitlesAlwaysOn ? 'translate-x-3' : 'translate-x-0'
                                                        }`} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Vitesse de lecture */}
                            <div className="relative">
                                <button
                                    onClick={() => {
                                        setShowSpeedMenu(!showSpeedMenu);
                                        setShowAudioSubsMenu(false);
                                        setShowQualityMenu(false);
                                    }}
                                    className="px-2 py-1.5 rounded-md hover:bg-white/10 text-xs font-bold transition-colors cursor-pointer"
                                    title="Vitesse de lecture"
                                    aria-label="Vitesse de lecture"
                                >
                                    {playbackRate}x
                                </button>

                                {showSpeedMenu && (
                                    <div className="absolute bottom-full right-0 mb-3 w-28 rounded-2xl bg-[#14141c]/95 border border-white/15 backdrop-blur-xl p-2 shadow-2xl space-y-1 z-50">
                                        {[0.5, 0.75, 1, 1.25, 1.5].map((rate) => (
                                            <button
                                                key={rate}
                                                onClick={() => handleSpeedChange(rate)}
                                                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                                    playbackRate === rate ? 'bg-[#e50914] text-white' : 'text-white/80 hover:bg-white/10'
                                                }`}
                                            >
                                                {rate === 1 ? 'Normal (1x)' : `${rate}x`}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Sélecteur de qualité (4K, 1080p, etc.) */}
                            {availableStreams.length > 1 && (
                                <div className="relative">
                                    <button
                                        onClick={() => {
                                            setShowQualityMenu(!showQualityMenu);
                                            setShowAudioSubsMenu(false);
                                            setShowSpeedMenu(false);
                                        }}
                                        className={`px-2 sm:px-2.5 py-1 rounded text-[11px] sm:text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
                                            activeStream?.quality?.includes('4K')
                                                ? 'bg-[#e50914]/20 border-[#e50914] text-[#e50914]'
                                                : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                                        }`}
                                        title="Changer la qualité vidéo"
                                        aria-label="Qualité vidéo"
                                    >
                                        <span className="sm:hidden">
                                            {activeStream?.quality?.includes('4K') ? '4K' : (activeStream?.tierKey || 'HD')}
                                        </span>
                                        <span className="hidden sm:inline">
                                            {activeStream?.qualityLabel || activeStream?.quality || 'HD'}
                                        </span>
                                    </button>

                                    {showQualityMenu && (
                                        <div className="absolute bottom-full right-0 mb-3 w-64 max-w-[calc(100vw-24px)] max-h-64 overflow-y-auto rounded-2xl bg-[#14141c]/95 border border-white/15 backdrop-blur-xl p-2 shadow-2xl space-y-1 z-50">
                                            <div className="px-2 py-1 text-[11px] font-bold text-white/50 uppercase tracking-wider">Qualité & Source</div>
                                            {availableStreams.map((st) => (
                                                <button
                                                    key={st.id}
                                                    onClick={() => handleSelectStream(st)}
                                                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                                                        activeStream?.id === st.id ? 'bg-[#e50914] text-white shadow-md' : 'text-white/80 hover:bg-white/10'
                                                    }`}
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold">{st.qualityLabel || st.quality} {st.isFrench ? '🇫🇷' : ''}</span>
                                                        <span className="text-[10px] text-white/60">
                                                            {st.isWebAudioSafe ? '🔊 Son garanti (AAC)' : 'Audio standard'}
                                                        </span>
                                                    </div>
                                                    {st.size && <span className="text-[10px] opacity-75 font-mono ml-2">{st.size}</span>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Plein écran avec large zone tactile mobile */}
                            <button
                                onClick={(e) => toggleFullscreen(e)}
                                className="min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] p-2 flex items-center justify-center rounded-full hover:bg-white/10 active:scale-90 transition-transform cursor-pointer touch-manipulation"
                                title={isFullscreen ? 'Quitter le plein écran (F)' : 'Plein écran (F)'}
                                aria-label="Plein écran"
                            >
                                {isFullscreen ? (
                                    <NetflixExitFullscreenIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                                ) : (
                                    <NetflixFullscreenIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* DRAWER ÉPISODES POUR SÉRIES TV */}
            {isTv && (
                <EpisodeDrawer
                    isOpen={showDrawer}
                    onClose={() => setShowDrawer(false)}
                    tvShow={tvDetails}
                    season={season}
                    episode={episode}
                    onSelectEpisode={(newSeason, newEpisode) => {
                        setSeason(newSeason);
                        setEpisode(newEpisode);
                        setShowDrawer(false);
                    }}
                />
            )}

            {/* MODAL RACCOURCIS CLAVIER OFFICIEL STYLE NETFLIX (?) */}
            {showShortcutsModal && (
                <div
                    className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
                    onClick={() => setShowShortcutsModal(false)}
                >
                    <div
                        className="w-full max-w-md bg-[#14141f] border border-white/20 rounded-3xl p-6 sm:p-7 shadow-[0_20px_80px_rgba(0,0,0,0.9)] space-y-5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-[#e50914] text-white flex items-center justify-center font-bold text-xs shadow">
                                    ?
                                </div>
                                <h3 className="text-base font-bold text-white tracking-wide">Raccourcis Clavier Altyflix</h3>
                            </div>
                            <button
                                onClick={() => setShowShortcutsModal(false)}
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                                <span className="text-white/80">Lecture / Pause</span>
                                <div className="flex gap-1">
                                    <kbd className="px-2 py-0.5 rounded bg-white/10 text-white font-mono font-semibold">Espace</kbd>
                                    <kbd className="px-2 py-0.5 rounded bg-white/10 text-white font-mono font-semibold">K</kbd>
                                </div>
                            </div>
                            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                                <span className="text-white/80">Reculer de 10 secondes</span>
                                <div className="flex gap-1">
                                    <kbd className="px-2 py-0.5 rounded bg-white/10 text-white font-mono font-semibold">←</kbd>
                                    <kbd className="px-2 py-0.5 rounded bg-white/10 text-white font-mono font-semibold">J</kbd>
                                </div>
                            </div>
                            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                                <span className="text-white/80">Avancer de 10 secondes</span>
                                <div className="flex gap-1">
                                    <kbd className="px-2 py-0.5 rounded bg-white/10 text-white font-mono font-semibold">→</kbd>
                                    <kbd className="px-2 py-0.5 rounded bg-white/10 text-white font-mono font-semibold">L</kbd>
                                </div>
                            </div>
                            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                                <span className="text-white/80">Volume +/-</span>
                                <div className="flex gap-1">
                                    <kbd className="px-2 py-0.5 rounded bg-white/10 text-white font-mono font-semibold">↑</kbd>
                                    <kbd className="px-2 py-0.5 rounded bg-white/10 text-white font-mono font-semibold">↓</kbd>
                                </div>
                            </div>
                            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                                <span className="text-white/80">Couper / Réactiver le son</span>
                                <kbd className="px-2 py-0.5 rounded bg-white/10 text-white font-mono font-semibold">M</kbd>
                            </div>
                            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                                <span className="text-white/80">Plein écran</span>
                                <kbd className="px-2 py-0.5 rounded bg-white/10 text-white font-mono font-semibold">F</kbd>
                            </div>
                            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                                <span className="text-white/80">Sous-titres (Activer / Désactiver)</span>
                                <kbd className="px-2 py-0.5 rounded bg-white/10 text-white font-mono font-semibold">C</kbd>
                            </div>
                            {isTv && (
                                <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                                    <span className="text-white/80">Épisode suivant</span>
                                    <kbd className="px-2 py-0.5 rounded bg-white/10 text-white font-mono font-semibold">N</kbd>
                                </div>
                            )}
                            <div className="flex items-center justify-between py-1.5">
                                <span className="text-white/80">Quitter le lecteur / Plein écran</span>
                                <kbd className="px-2 py-0.5 rounded bg-white/10 text-white font-mono font-semibold">Échap</kbd>
                            </div>
                        </div>

                        <div className="pt-2 text-center">
                            <button
                                onClick={() => setShowShortcutsModal(false)}
                                className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-colors cursor-pointer"
                            >
                                Fermer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
