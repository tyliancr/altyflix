import { useState, useRef, useEffect, useCallback } from 'react';
import { getSeasonDetails, getSeriesDetails } from '../../services/tmdb';
import { recordView } from '../../services/statsService';
import { resolvePlaybackStreams, pollStreamStatus, getGatewayConfig, saveGatewayConfig, fetchSubtitlesForContent, fetchSubtitleCues, DEFAULT_PROVIDER, DEFAULT_TOKEN } from '../../services/streamingGateway';
import { Scrubber, AudioSubsPanel, SpeedPanel, EpisodesPanel, SpeedIcon, formatClock } from './PlayerPanels';
import { IN_TV_APP, moveFocusWithin } from '../../hooks/useTVNavigation';
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

// Téléphone / tablette tactile : interface Netflix mobile. Souris : interface Netflix PC.
const COMPACT_QUERY = '(max-width: 767px), (hover: none) and (pointer: coarse)';
function useCompactLayout() {
    const get = () => typeof window !== 'undefined' && window.matchMedia?.(COMPACT_QUERY).matches;
    const [compact, setCompact] = useState(get);
    useEffect(() => {
        const mq = window.matchMedia?.(COMPACT_QUERY);
        if (!mq) return undefined;
        const onChange = () => setCompact(mq.matches);
        mq.addEventListener?.('change', onChange);
        return () => mq.removeEventListener?.('change', onChange);
    }, []);
    return compact;
}

function getShortQualityBadge(stream) {
    if (!stream) return 'HD';
    let q = 'HD';
    if (stream.tierKey === '4k' || stream.quality?.includes('4K')) q = '4K';
    else if (stream.tierKey === '1080p' || stream.quality?.includes('1080p')) q = '1080p';
    else if (stream.tierKey === '720p' || stream.quality?.includes('720p')) q = '720p';

    const lang = stream.isFrench ? 'VF' : (stream.isVostfr ? 'VOSTFR' : 'VO');
    return `${q} · ${lang}`;
}

export default function NetflixPlayer({
    content = {},
    type: initialType,
    initialSeason = 1,
    initialEpisode = 1,
    preferredLang: _preferredLang = 'VF',
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
    const [currentEpOverview, setCurrentEpOverview] = useState('');
    // Écran « Vous regardez » affiché après quelques secondes de pause (comme Netflix)
    const [showPauseInfo, setShowPauseInfo] = useState(false);
    const [nextEpAvailable, setNextEpAvailable] = useState(false);

    // Stream state
    // 'resolving' | 'downloading' | 'ready' | 'playing' | 'no_token' | 'error'
    const [streamState, setStreamState] = useState('resolving');
    const [errorMessage, setErrorMessage] = useState('');
    const [availableStreams, setAvailableStreams] = useState([]);
    const [activeStream, setActiveStream] = useState(null);
    const [downloadProgress, setDownloadProgress] = useState({ attempt: 0, elapsedSec: 0 });

    const compact = useCompactLayout();

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
    const controlsVisibleRef = useRef(controlsVisible);
    controlsVisibleRef.current = controlsVisible;
    // Panneau ouvert : 'episodes' | 'audio' | 'speed' | null
    const [panel, setPanel] = useState(null);
    const panelRef = useRef(panel);
    panelRef.current = panel;
    const { currentProfile, updateProfile } = useProfile?.() || {};
    const [subtitlesAlwaysOn, setSubtitlesAlwaysOn] = useState(() => {
        const local = typeof localStorage !== 'undefined' ? localStorage.getItem('altyflix_subtitles_always_on') : null;
        if (local !== null) return local === 'true';
        return currentProfile?.subtitlesAlwaysOn !== false;
    });

    const [availableSubtitles, setAvailableSubtitles] = useState([]);
    const [selectedSubtitleId, setSelectedSubtitleId] = useState('off');
    const [currentAudioLang, setCurrentAudioLang] = useState('vf');
    const [centerAction, setCenterAction] = useState(null); // 'play' | 'pause' | null
    const [isAutoplayMuted, setIsAutoplayMuted] = useState(false);
    const [hasTrueVf, setHasTrueVf] = useState(false);
    const [rippleEffect, setRippleEffect] = useState(null); // { side: 'left' | 'right', delta: -10 | 10 }
    const lastTapRef = useRef({ time: 0, x: 0 });
    const tapTimerRef = useRef(null);
    const rippleTimerRef = useRef(null);

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
    const pollingAbortControllerRef = useRef(null);
    const transcodeOffsetRef = useRef(0);
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

    // Récupération des détails de la série
    useEffect(() => {
        let live = true;
        if (isTv && id) {
            getSeriesDetails(id).then(d => { if (live) setTvDetails(d); }).catch(() => {});
            getSeasonDetails(id, season).then(data => {
                if (!live) return;
                const ep = data?.episodes?.find(e => e.episode_number === episode);
                setCurrentEpTitle(ep?.name || '');
                setCurrentEpOverview(ep?.overview || '');
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

    // Nettoyage de toute surveillance / polling actif au démontage du composant
    useEffect(() => {
        return () => {
            if (pollingAbortControllerRef.current) {
                pollingAbortControllerRef.current.abort();
            }
        };
    }, []);

    // Démarre la surveillance en continu d'un flux en cours de débridage
    const startStreamPolling = useCallback((targetUrl) => {
        if (!targetUrl) return;
        if (pollingAbortControllerRef.current) {
            pollingAbortControllerRef.current.abort();
        }
        const controller = new AbortController();
        pollingAbortControllerRef.current = controller;
        setDownloadProgress({ attempt: 0, elapsedSec: 0 });

        console.log('[Altyflix Player] Démarrage du polling pour le débridage...');
        pollStreamStatus({
            streamUrl: targetUrl,
            signal: controller.signal,
            onProgress: (prog) => {
                setDownloadProgress(prog);
            }
        }).then(result => {
            if (result.aborted) return;
            if (result.ready && result.playbackUrl) {
                console.log('[Altyflix Player] ✅ Débridage terminé avec succès ! URL reçue :', result.playbackUrl);
                loadedUrlRef.current = null;
                setActiveStream(prev => ({
                    ...(prev || {}),
                    url: result.playbackUrl,
                    isDownloading: false,
                    isCached: true
                }));
                setStreamState('playing');
            } else if (result.timeout) {
                console.warn('[Altyflix Player] Timeout de débridage atteint.');
                setErrorMessage('Le téléchargement vers le cloud haute vitesse prend plus de temps que prévu. Essayez une autre source ou réessayez.');
                setStreamState('error');
            }
        }).catch(err => {
            if (controller.signal.aborted) return;
            console.error('[Altyflix Player] Erreur de polling :', err);
            setErrorMessage('Erreur lors de la vérification de la source : ' + err.message);
            setStreamState('error');
        });
    }, []);

    // Résolution automatique du flux streaming (uniquement sur changement de média/saison/épisode)
    const resolveStream = useCallback(async (force = false) => {
        if (!id) return;
        const streamKey = `${id}-${isTv ? 'tv' : 'movie'}-${season}-${episode}`;
        if (!force && resolvedKeyRef.current === streamKey) return;

        if (pollingAbortControllerRef.current) {
            pollingAbortControllerRef.current.abort();
        }

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
                // Utiliser directement activeStream (déjà optimisé VF 1080p en cache + pré-résolu côté serveur)
                const selectedStream = res.activeStream;
                setActiveStream(selectedStream);
                setHasTrueVf(Boolean(res.hasTrueVf));
                setCurrentAudioLang(selectedStream.isFrench ? 'vf' : 'vo');

                // Si le flux nécessite un débridage en cours, passer à l'état 'downloading' et surveiller
                if (res.status === 'downloading' || selectedStream.isDownloading) {
                    console.log('[Altyflix Player] Flux non encore en cache, passage à l\'état downloading...');
                    setStreamState('downloading');
                    startStreamPolling(selectedStream.originalUrl || selectedStream.url);
                } else {
                    console.log('[Altyflix Player] Flux prêt immédiatement (en cache), lancement direct !');
                    setStreamState('playing');
                }
            } else if (res.reason === 'NO_TOKEN' || !config.hasToken) {
                // Fallback transparent : injecter le provider par défaut et réessayer
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
                    const selectedStream = retry.activeStream;
                    setActiveStream(selectedStream);
                    setHasTrueVf(Boolean(retry.hasTrueVf));
                    setCurrentAudioLang(selectedStream.isFrench ? 'vf' : 'vo');

                    if (retry.status === 'downloading' || selectedStream.isDownloading) {
                        setStreamState('downloading');
                        startStreamPolling(selectedStream.originalUrl || selectedStream.url);
                    } else {
                        setStreamState('playing');
                    }
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
    }, [id, isTv, season, episode, startStreamPolling]);

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

    // Durée réelle connue depuis TMDB (utilisée pour fiabiliser la timeline et le transcodage)
    const tmdbDuration = (contentRef.current?.runtime ? Number(contentRef.current.runtime) * 60 : 0) ||
                         (contentRef.current?.episode_run_time?.[0] ? Number(contentRef.current.episode_run_time[0]) * 60 : 0);
    const durationRef = useRef(duration);
    durationRef.current = duration;
    const tmdbDurationRef = useRef(tmdbDuration);
    tmdbDurationRef.current = tmdbDuration;
    const handleStreamErrorRef = useRef(handleStreamError);
    handleStreamErrorRef.current = handleStreamError;

    // Sauvegarde immédiate de la progression exacte dans le compte utilisateur (stable via refs)
    // Garantit l'apparition systématique dans « Reprendre la lecture » dès le démarrage
    const saveCurrentProgress = useCallback((forceInitial = false) => {
        const video = videoRef.current;
        if (!rememberRef.current || !id) return;
        const currentOffset = transcodeOffsetRef.current || 0;
        const realCurrent = (video ? video.currentTime || 0 : 0) + currentOffset;
        if (!forceInitial && realCurrent < 1) return;

        const fallbackDur = isTv ? 2700 : 6000;
        const effDur = durationRef.current > 60
            ? durationRef.current
            : (tmdbDurationRef.current > 60 ? tmdbDurationRef.current : fallbackDur);

        const rawPct = Math.round((realCurrent / effDur) * 100);
        const progressPct = Math.max(1, Math.min(100, rawPct));
        const c = contentRef.current || {};
        rememberRef.current(
            {
                id,
                contentId: id,
                title: titleRef.current,
                type: isTv ? 'tv' : 'movie',
                poster_path: c.poster_path || c.backdrop_path || null,
                backdrop_path: c.backdrop_path || c.poster_path || null
            },
            isTv ? season : 1,
            isTv ? episode : 1,
            progressPct,
            Math.round(realCurrent)
        );
        lastSaveRef.current = Date.now();
    }, [id, isTv, season, episode]);
    const saveCurrentProgressRef = useRef(saveCurrentProgress);
    saveCurrentProgressRef.current = saveCurrentProgress;

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

        const isTranscoded = Boolean(activeStream?.isTranscoded || streamUrl.includes('/api/video-stream'));
        if (isTranscoded && startPos > 5) {
            transcodeOffsetRef.current = startPos;
        } else {
            transcodeOffsetRef.current = 0;
        }

        const effectiveLoadUrl = (isTranscoded && startPos > 5)
            ? `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}t=${startPos}`
            : streamUrl;

        engine.load({
            videoElement: video,
            url: effectiveLoadUrl,
            startPosition: isTranscoded ? 0 : startPos,
            callbacks: {
                onBufferingChange: (buffering) => setIsBuffering(buffering),
                onAutoplayMuted: (muted) => {
                    setIsAutoplayMuted(muted);
                    setIsMuted(muted);
                },
                onError: (err) => {
                    console.warn('[Altyflix Player] Erreur signalée par le moteur :', err);
                    handleStreamErrorRef.current?.();
                }
            }
        });

        let hasInitialSaved = false;
        const onPlay = () => {
            setIsPlaying(true);
            if (!hasInitialSaved) {
                hasInitialSaved = true;
                saveCurrentProgressRef.current?.(true);
            }
        };
        const onPause = () => {
            setIsPlaying(false);
            // En pause, plus rien ne charge : on retire l'indicateur (il pouvait rester bloqué)
            setIsBuffering(false);
            saveCurrentProgressRef.current?.();
        };

        const onTimeUpdate = () => {
            const currentOffset = transcodeOffsetRef.current || 0;
            const realCurrent = (video.currentTime || 0) + currentOffset;
            setCurrentTime(realCurrent);

            let dur = video.duration;
            const knownTmdbDur = tmdbDurationRef.current || 0;
            if (!Number.isFinite(dur) || dur <= 60 || isTranscoded || currentOffset > 0) {
                if (knownTmdbDur > 60) dur = knownTmdbDur;
            }
            if (dur > 0) setDuration(dur);

            // Synchronisation permanente des sous-titres
            if (updateSubtitleLinesRef.current) {
                updateSubtitleLinesRef.current();
            }

            // Buffer
            if (video.buffered && video.buffered.length > 0) {
                setBuffered(video.buffered.end(video.buffered.length - 1) + currentOffset);
            }

            // Sauvegarde automatique toutes les 5 secondes
            const now = Date.now();
            if (now - lastSaveRef.current > 5000) {
                saveCurrentProgressRef.current?.();
            }
        };

        const onLoadedMetadata = () => {
            let dur = video.duration;
            const knownTmdbDur = tmdbDurationRef.current || 0;
            if (!Number.isFinite(dur) || dur <= 60 || isTranscoded) {
                if (knownTmdbDur > 60) dur = knownTmdbDur;
            }
            if (dur > 0) setDuration(dur);
            setIsBuffering(false);

            if (startPos > 5 && !isTranscoded && Number.isFinite(video.duration) && startPos < video.duration - 15) {
                video.currentTime = startPos;
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
            handleStreamErrorRef.current?.();
        };

        const onBeforeUnload = () => {
            saveCurrentProgressRef.current?.();
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
        const onSeeked = () => updateSubtitleLinesRef.current?.();
        video.addEventListener('seeked', onSeeked);

        return () => {
            saveCurrentProgressRef.current?.();
            loadedUrlRef.current = null;
            window.removeEventListener('beforeunload', onBeforeUnload);
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('volumechange', onVolumeChange);
            video.removeEventListener('waiting', onWaiting);
            video.removeEventListener('playing', onPlaying);
            video.removeEventListener('error', onVideoError);
            video.removeEventListener('seeked', onSeeked);
            engine.destroy();
        };
    }, [activeStream?.url, activeStream?.isTranscoded, streamState, id, isTv, season, episode]);

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
        // Repartir de zéro : sinon l'épisode suivant reprendrait à la position de l'actuel
        currentTimeRef.current = 0;
        setCurrentTime(0);
        setDuration(0);
        setBuffered(0);
        setPanel(null);
        setEpisode(ep => ep + 1);
    }, [onNext]);

    // Affiche les contrôles puis les masque après quelques secondes de lecture (style Netflix).
    // Ils restent affichés tant qu'un panneau est ouvert ou que la vidéo est en pause.
    const lastInteractRef = useRef(0);
    const handleMouseMove = useCallback(() => {
        lastInteractRef.current = Date.now();
        setShowPauseInfo(false);
        setControlsVisible(true);
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = setTimeout(() => {
            const video = videoRef.current;
            if (video && !video.paused && !panelRef.current) {
                setControlsVisible(false);
            }
        }, 3000);
    }, []);

    // Au lancement (et à chaque reprise), les contrôles s'effacent seuls après quelques secondes
    useEffect(() => {
        if (isPlaying) handleMouseMove();
        else setControlsVisible(true);
    }, [isPlaying, handleMouseMove]);

    const openPanel = useCallback((name) => {
        setPanel(prev => (prev === name ? null : name));
        setControlsVisible(true);
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    }, []);

    const closePanel = useCallback(() => {
        setPanel(null);
        handleMouseMove();
    }, [handleMouseMove]);

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
    }, [handleMouseMove, volume]);

    // Déplacement direct et précis dans la vidéo (compatible HTTP 206 et transcodage à la volée)
    const seekToTime = useCallback((targetSec) => {
        const video = videoRef.current;
        if (!video) return;

        const effDur = (duration > 0 ? duration : (tmdbDuration || Infinity));
        const target = Math.max(0, Math.min(effDur, targetSec));

        const isTranscoded = Boolean(activeStream?.isTranscoded || activeStream?.url?.includes('/api/video-stream'));

        if (isTranscoded) {
            const base = (activeStream?.url || '').replace(/([&?])t=\d+/, '');
            const sep = base.includes('?') ? '&' : '?';
            const seekUrl = `${base}${sep}t=${Math.floor(target)}`;

            transcodeOffsetRef.current = Math.floor(target);
            setCurrentTime(target);
            video.src = seekUrl;
            video.currentTime = 0;
            video.play().catch(() => {});
        } else {
            video.currentTime = target;
            setCurrentTime(target);
        }
    }, [activeStream, duration, tmdbDuration]);

    // Saut relatif de +/- 10 secondes (compatible transcodage dynamique)
    const seekRelative = useCallback((deltaSec) => {
        const curr = currentTimeRef.current || 0;
        const effDur = (duration > 0 ? duration : (tmdbDuration || Infinity));
        const target = Math.max(0, Math.min(effDur, curr + deltaSec));
        seekToTime(target);
    }, [seekToTime, duration, tmdbDuration]);

    const showRipple = useCallback((side, delta) => {
        setRippleEffect({ side, delta, key: Date.now() });
        if (rippleTimerRef.current) clearTimeout(rippleTimerRef.current);
        rippleTimerRef.current = setTimeout(() => setRippleEffect(null), 650);
    }, []);

    // Gestes sur la vidéo :
    //  - souris : clic = lecture/pause, double-clic = plein écran
    //  - tactile : toucher = afficher/masquer les contrôles, double toucher à gauche/droite = -10 s / +10 s
    const handleSurfacePointerUp = useCallback((e) => {
        if (panelRef.current) {
            setPanel(null);
            return;
        }
        if (e.pointerType === 'mouse') {
            if (e.button !== 0) return;
            togglePlay();
            return;
        }

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const side = x < rect.width / 2 ? 'left' : 'right';
        const now = Date.now();
        const last = lastTapRef.current;

        if (now - last.time < 300 && last.side === side) {
            if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
            const delta = side === 'left' ? -10 : 10;
            seekRelative(delta);
            showRipple(side, delta);
            // Un troisième toucher rapide enchaîne un nouveau saut
            lastTapRef.current = { time: now, side };
            return;
        }

        lastTapRef.current = { time: now, side };
        if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
        tapTimerRef.current = setTimeout(() => {
            if (controlsVisibleRef.current) {
                if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
                setControlsVisible(false);
            } else {
                handleMouseMove();
            }
        }, 260);
    }, [togglePlay, seekRelative, showRipple, handleMouseMove]);

    useEffect(() => () => {
        [tapTimerRef, rippleTimerRef, hideTimeoutRef, centerTimeoutRef].forEach(r => r.current && clearTimeout(r.current));
    }, []);

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
    };

    // La vitesse choisie survit à un changement de source
    useEffect(() => {
        if (videoRef.current) videoRef.current.playbackRate = playbackRate;
    }, [playbackRate, activeStream?.url, streamState]);

    // Changement de flux (qualité)
    const handleSelectStream = (st) => {
        if (!st) return;
        if (st.id === activeStream?.id && st.url === activeStream?.url) {
            return;
        }
        if (pollingAbortControllerRef.current) {
            pollingAbortControllerRef.current.abort();
            pollingAbortControllerRef.current = null;
        }
        loadedUrlRef.current = null;
        transcodeOffsetRef.current = 0;
        setActiveStream(st);
        if (st.isFrench) {
            setCurrentAudioLang('vf');
        } else if (hasTrueVf && !st.isFrench) {
            setCurrentAudioLang('vo');
        }

        if (st.isDownloading) {
            setStreamState('downloading');
            startStreamPolling(st.originalUrl || st.url);
        } else {
            setStreamState('playing');
            setIsBuffering(true);
        }
    };

    // Extraction et synchronisation des lignes de sous-titres actives (cues en mémoire JS, zéro doublon)
    const updateSubtitleLines = useCallback(() => {
        const video = videoRef.current;
        if (!video || selectedSubtitleIdRef.current === 'off') {
            setCurrentSubtitleLines(lines => (lines.length === 0 ? lines : []));
            return;
        }

        const t = (video.currentTime || 0) + (transcodeOffsetRef.current || 0);
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
    const handleSelectSubtitle = useCallback(async (subId, customList = null) => {
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
            return;
        }

        const list = customList || availableSubtitlesRef.current;
        const sub = list.find(s => s.id === subId);
        if (!sub) return;

        try {
            // Fichier vide ou injoignable : on essaie les autres pistes de la même langue
            const candidates = [sub, ...list.filter(s => s.id !== sub.id && s.lang === sub.lang)];
            let cues = [];
            let chosen = sub;
            for (const cand of candidates) {
                cues = await fetchSubtitleCues(cand.url, cand.encoding);
                if (reqId !== activeSubRequestIdRef.current || !videoRef.current) return;
                if (cues.length > 0) { chosen = cand; break; }
            }
            if (chosen.id !== subId) {
                setSelectedSubtitleId(chosen.id);
                selectedSubtitleIdRef.current = chosen.id;
            }
            cuesRef.current = cues;
            if (updateSubtitleLinesRef.current) updateSubtitleLinesRef.current();
        } catch (err) {
            console.warn('[Altyflix Subtitles] Erreur chargement VTT :', err);
        }
    }, []);

    // Raccourci bascule rapide sous-titres (Touche C ou bouton direct)
    const toggleSubtitles = useCallback(() => {
        const subs = availableSubtitlesRef.current || [];
        if (selectedSubtitleIdRef.current !== 'off') {
            handleSelectSubtitle('off');
        } else if (subs.length > 0) {
            const frSub = subs.find(s => s.lang === 'fr' || (s.label && s.label.toLowerCase().includes('fr')));
            const target = frSub || subs[0];
            handleSelectSubtitle(target.id, subs);
        }
    }, [handleSelectSubtitle]);

    const toggleSubtitlesAlwaysOn = useCallback(() => {
        setSubtitlesAlwaysOn(prev => {
            const next = !prev;
            try { localStorage.setItem('altyflix_subtitles_always_on', next ? 'true' : 'false'); } catch { /* stockage indisponible */ }
            if (currentProfile?.id && updateProfile) {
                updateProfile(currentProfile.id, { subtitlesAlwaysOn: next });
            }
            return next;
        });
    }, [currentProfile?.id, updateProfile]);

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

    // Clavier et télécommande.
    // Télécommande (pensée pour être utilisable par un enfant) :
    //  - OK = lecture / pause, gauche / droite = -10 s / +10 s
    //  - haut / bas = afficher les boutons, puis les flèches passent d'un bouton à l'autre
    //  - Retour = fermer le panneau ouvert, sinon quitter le lecteur
    useEffect(() => {
        const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        const BACK = ['Escape', 'Backspace', 'GoBack', 'BrowserBack'];
        const onKeyDown = (e) => {
            const tag = e.target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea') return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const { key } = e;
            const root = containerRef.current;
            const active = document.activeElement;
            const panelEl = root?.querySelector('[data-player-panel]');
            const controlsEl = root?.querySelector('[data-player-controls]');

            // Touches multimédia des télécommandes
            if (key === 'MediaPlayPause' || key === 'MediaPlay' || key === 'MediaPause') { e.preventDefault(); togglePlay(); return; }
            if (key === 'MediaFastForward') { e.preventDefault(); seekRelative(10); handleMouseMove(); return; }
            if (key === 'MediaRewind') { e.preventDefault(); seekRelative(-10); handleMouseMove(); return; }

            // Panneau ouvert : les flèches circulent dans le panneau, Retour le ferme
            if (panelEl) {
                if (BACK.includes(key)) { e.preventDefault(); closePanel(); return; }
                if (ARROWS.includes(key) && tag !== 'select') { e.preventDefault(); moveFocusWithin(panelEl, key); }
                return;
            }
            if (tag === 'select') return;

            if (BACK.includes(key)) {
                e.preventDefault();
                if (key === 'Escape' && document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                    setIsFullscreen(false);
                } else {
                    handleClose();
                }
                return;
            }

            const focusInControls = controlsVisibleRef.current && controlsEl && active && controlsEl.contains(active);
            const onSlider = active?.getAttribute?.('role') === 'slider';
            handleMouseMove();

            if (focusInControls && !onSlider) {
                if (key === 'Enter' || key === ' ') return; // le bouton focalisé s'active tout seul
                if (ARROWS.includes(key)) { e.preventDefault(); moveFocusWithin(controlsEl, key); return; }
            }
            if (focusInControls && onSlider) {
                if (key === 'ArrowDown') { e.preventDefault(); moveFocusWithin(controlsEl, key); return; }
                if (key === 'ArrowUp') { e.preventDefault(); return; }
                if (key === 'Enter' || key === ' ') { e.preventDefault(); togglePlay(); return; }
            }

            // Boutons masqués : haut / bas les affichent et placent le focus sur Lecture
            if ((key === 'ArrowUp' || key === 'ArrowDown') && IN_TV_APP) {
                e.preventDefault();
                setControlsVisible(true);
                requestAnimationFrame(() => {
                    const target = root?.querySelector('[data-play-button]') || controlsEl?.querySelector('button');
                    target?.focus({ preventScroll: true });
                });
                return;
            }

            switch (key.toLowerCase()) {
                case ' ':
                case 'enter':
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
                default:
                    break;
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [togglePlay, seekRelative, volume, toggleFullscreen, toggleMute, handleClose, isTv, nextEpAvailable, handleNextEpisode, toggleSubtitles, handleMouseMove, closePanel]);

    // Fin de l'épisode : enchaîne automatiquement sur le suivant
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return undefined;
        const onEnded = () => {
            if (isTv && nextEpAvailable) handleNextEpisode();
            else setControlsVisible(true);
        };
        video.addEventListener('ended', onEnded);
        return () => video.removeEventListener('ended', onEnded);
    }, [isTv, nextEpAvailable, handleNextEpisode]);

    // Changement d'épisode : on repart de zéro
    const goToEpisode = useCallback((s, e) => {
        setPanel(null);
        if (s === season && e === episode) return;
        currentTimeRef.current = 0;
        setCurrentTime(0);
        setDuration(0);
        setBuffered(0);
        setSeason(s);
        setEpisode(e);
    }, [season, episode]);

    // Contrôles masqués : aucun bouton invisible ne garde le focus de la télécommande
    useEffect(() => {
        if (controlsVisible) return;
        const active = document.activeElement;
        if (active && containerRef.current?.querySelector('[data-player-controls]')?.contains(active)) active.blur();
    }, [controlsVisible]);

    // Pause prolongée (sans panneau ouvert ni chargement) : écran « Vous regardez »
    useEffect(() => {
        setShowPauseInfo(false);
        if (isPlaying || panel || streamState !== 'playing') return undefined;
        lastInteractRef.current = Date.now();
        const t = setInterval(() => {
            const video = videoRef.current;
            // Position réelle (le décalage de transcodage compte) et vidéo réellement en pause
            if (video?.paused && Date.now() - lastInteractRef.current > (IN_TV_APP ? 8000 : 5000) && (currentTimeRef.current || 0) > 1) {
                setShowPauseInfo(true);
                setControlsVisible(false);
            }
        }, 500);
        return () => clearInterval(t);
    }, [isPlaying, panel, isBuffering, streamState]);

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

        const onBegin = () => setIsFullscreen(true);
        const onEnd = () => setIsFullscreen(false);
        document.addEventListener('fullscreenchange', handleFsChange);
        document.addEventListener('webkitfullscreenchange', handleFsChange);
        const video = videoRef.current;
        video?.addEventListener('webkitbeginfullscreen', onBegin);
        video?.addEventListener('webkitendfullscreen', onEnd);

        return () => {
            document.removeEventListener('fullscreenchange', handleFsChange);
            document.removeEventListener('webkitfullscreenchange', handleFsChange);
            video?.removeEventListener('webkitbeginfullscreen', onBegin);
            video?.removeEventListener('webkitendfullscreen', onEnd);
        };
    }, []);

    // ------------------------------------------------------------------
    // Affichage
    // ------------------------------------------------------------------
    const remaining = Math.max(0, (duration || 0) - currentTime);
    const interactive = controlsVisible ? 'pointer-events-auto' : 'pointer-events-none';
    const isPlayingView = streamState === 'playing';
    const subtitlesOn = selectedSubtitleId !== 'off' && currentSubtitleLines.length > 0;
    const showNextUp = isPlayingView && isTv && nextEpAvailable && duration > 60 && remaining <= 40 && !panel;
    const episodeLabel = isTv
        ? `S${season}:É${episode}${currentEpTitle ? ` « ${currentEpTitle} »` : ''}`
        : title;

    const iconBtn = 'grid place-items-center rounded-full p-2.5 text-white transition-[transform,background-color,color] duration-150 hover:scale-110 active:scale-95';

    const VolumeIcon = isMuted || volume === 0
        ? NetflixVolumeMuteIcon
        : (volume > 0.5 ? NetflixVolumeHighIcon : NetflixVolumeLowIcon);

    return (
        <div
            ref={containerRef}
            data-player-root=""
            className={`fixed inset-0 z-[99999] select-none overflow-hidden bg-black text-white ${
                isPlayingView && !controlsVisible ? 'cursor-none' : ''
            }`}
            onPointerMove={(e) => { if (e.pointerType === 'mouse') handleMouseMove(); }}
            onMouseLeave={() => {
                const video = videoRef.current;
                if (video && !video.paused && !panelRef.current) setControlsVisible(false);
            }}
        >
            <video
                ref={videoRef}
                className={`absolute inset-0 h-full w-full bg-black object-contain ${isPlayingView ? '' : 'invisible'}`}
                playsInline
            />

            {isPlayingView && (
                <>
                    {/* Surface de gestes (clic, toucher, double toucher) */}
                    <div
                        className="absolute inset-0 z-10"
                        onPointerUp={handleSurfacePointerUp}
                        onDoubleClick={() => { if (!compact) toggleFullscreen(); }}
                    />

                    {/* Sous-titres */}
                    {subtitlesOn && (
                        <div
                            className={`pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center gap-1 px-6 transition-[bottom] duration-300 ${
                                controlsVisible ? (compact ? 'bottom-32' : 'bottom-36') : (compact ? 'bottom-8' : 'bottom-14')
                            }`}
                        >
                            {currentSubtitleLines.map((line, idx) => (
                                <span
                                    key={`${idx}-${line}`}
                                    className="max-w-[92%] whitespace-pre-line text-center font-semibold leading-snug md:max-w-[70%]"
                                    style={{
                                        fontSize: SUBTITLE_SIZE_MAP[currentProfile?.subtitlesSize]?.fontSize || (compact ? '1.15rem' : '1.6rem'),
                                        color: SUBTITLE_COLOR_MAP[currentProfile?.subtitlesColor] || '#FFFFFF',
                                        textShadow: '0 0 6px #000, 0 2px 3px #000, 1px 1px 2px #000, -1px -1px 2px #000'
                                    }}
                                >
                                    {line}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Double toucher : -10 s / +10 s */}
                    {rippleEffect && (
                        <div
                            key={rippleEffect.key}
                            className={`pointer-events-none absolute inset-y-0 z-20 flex w-2/5 items-center justify-center ${
                                rippleEffect.side === 'left' ? 'left-0 rounded-r-[50%]' : 'right-0 rounded-l-[50%]'
                            } bg-white/10`}
                        >
                            <div className="flex flex-col items-center gap-1">
                                {rippleEffect.delta < 0
                                    ? <NetflixRewind10Icon className="h-10 w-10" />
                                    : <NetflixForward10Icon className="h-10 w-10" />}
                                <span className="text-sm font-semibold">{rippleEffect.delta < 0 ? '-10 s' : '+10 s'}</span>
                            </div>
                        </div>
                    )}

                    {/* Clic souris : lecture / pause */}
                    {!compact && centerAction && (
                        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                            <div className="grid h-24 w-24 place-items-center rounded-full bg-black/50 player-flash">
                                {centerAction === 'play'
                                    ? <NetflixPlayIcon className="h-12 w-12 translate-x-0.5" />
                                    : <NetflixPauseIcon className="h-12 w-12" />}
                            </div>
                        </div>
                    )}

                    {/* Chargement en cours de lecture */}
                    {isBuffering && !(compact && controlsVisible) && (
                        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                            <span className="h-14 w-14 animate-spin rounded-full border-4 border-[#e50914] border-t-transparent" />
                        </div>
                    )}

                    {/* Pause prolongée : « Vous regardez » */}
                    {showPauseInfo && (
                        <div className="player-fade-in pointer-events-none absolute inset-0 z-[25] flex items-center bg-gradient-to-r from-black/90 via-black/55 to-transparent">
                            <div className="max-w-2xl px-8 md:px-16">
                                <p className="text-sm font-medium text-white/60 md:text-lg">Vous regardez</p>
                                <h2 className="mt-2 text-3xl font-bold leading-tight md:text-5xl">{title}</h2>
                                {isTv && (
                                    <p className="mt-4 text-lg font-semibold md:text-2xl">
                                        Saison {season} : Épisode {episode}{currentEpTitle ? ` « ${currentEpTitle} »` : ''}
                                    </p>
                                )}
                                {(isTv ? currentEpOverview : content?.overview) && (
                                    <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-white/70 md:text-lg">
                                        {isTv ? currentEpOverview : content.overview}
                                    </p>
                                )}
                            </div>
                            <p className="absolute bottom-[28%] right-10 text-sm font-medium uppercase tracking-[0.2em] text-white/50 md:right-16">En pause</p>
                        </div>
                    )}

                    {/* Interface */}
                    <div
                        data-player-controls=""
                        className={`pointer-events-none absolute inset-0 z-30 transition-opacity duration-300 ${
                            controlsVisible ? 'opacity-100' : 'opacity-0'
                        }`}
                    >
                        {compact ? (
                            <>
                                <div className="absolute inset-0 bg-black/45" />

                                {/* Haut : retour, épisode, plein écran */}
                                <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-3 pt-[max(10px,env(safe-area-inset-top))] sm:px-5">
                                    <button type="button" onClick={handleClose} aria-label="Retour" className={`${interactive} p-2`}>
                                        <NetflixBackIcon className="h-7 w-7" />
                                    </button>
                                    <p className="min-w-0 flex-1 truncate text-center text-[15px] font-medium">{episodeLabel}</p>
                                    <button
                                        type="button"
                                        onClick={toggleFullscreen}
                                        aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
                                        className={`${interactive} p-2`}
                                    >
                                        {isFullscreen
                                            ? <NetflixExitFullscreenIcon className="h-6 w-6" />
                                            : <NetflixFullscreenIcon className="h-6 w-6" />}
                                    </button>
                                </div>

                                {/* Centre : -10, lecture/pause, +10 */}
                                <div className="absolute inset-0 flex items-center justify-center gap-[14vw]">
                                    <button type="button" onClick={() => seekRelative(-10)} aria-label="Reculer de 10 secondes" className={`${interactive} p-2 active:scale-90`}>
                                        <NetflixRewind10Icon className="h-12 w-12" />
                                    </button>
                                    <div className="grid h-20 w-20 place-items-center">
                                        {isBuffering ? (
                                            <span className="h-14 w-14 animate-spin rounded-full border-4 border-[#e50914] border-t-transparent" />
                                        ) : (
                                            <button type="button" data-play-button="" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Lecture'} className={`${interactive} p-2 active:scale-90`}>
                                                {isPlaying
                                                    ? <NetflixPauseIcon className="h-16 w-16" />
                                                    : <NetflixPlayIcon className="h-16 w-16" />}
                                            </button>
                                        )}
                                    </div>
                                    <button type="button" onClick={() => seekRelative(10)} aria-label="Avancer de 10 secondes" className={`${interactive} p-2 active:scale-90`}>
                                        <NetflixForward10Icon className="h-12 w-12" />
                                    </button>
                                </div>

                                {/* Bas : progression + actions */}
                                <div className="absolute inset-x-0 bottom-0 px-5 pb-[max(8px,env(safe-area-inset-bottom))] sm:px-8">
                                    <div className={`flex items-center gap-4 ${interactive}`}>
                                        <Scrubber
                                            compact
                                            currentTime={currentTime}
                                            duration={duration}
                                            buffered={buffered}
                                            onSeek={seekToTime}
                                            onInteract={handleMouseMove}
                                        />
                                        <span className="flex-none text-sm font-semibold tabular-nums">{formatClock(remaining)}</span>
                                    </div>
                                    <div className={`flex items-center justify-center gap-6 pb-1 sm:gap-10 ${interactive}`}>
                                        <MobileAction icon={<SpeedIcon className="h-6 w-6" />} label={`Vitesse (${playbackRate}x)`} onClick={() => openPanel('speed')} />
                                        {isTv && (
                                            <MobileAction icon={<NetflixEpisodesIcon className="h-6 w-6" />} label="Épisodes" onClick={() => openPanel('episodes')} />
                                        )}
                                        <MobileAction icon={<NetflixSubtitlesIcon className="h-6 w-6" />} label="Audio et sous-titres" onClick={() => openPanel('audio')} />
                                        {isTv && nextEpAvailable && (
                                            <MobileAction icon={<NetflixNextEpisodeIcon className="h-6 w-6" />} label="Épisode suivant" onClick={handleNextEpisode} />
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" />
                                <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

                                <button
                                    type="button"
                                    onClick={handleClose}
                                    aria-label="Retour"
                                    title="Retour"
                                    className={`${interactive} ${iconBtn} absolute left-5 top-5`}
                                >
                                    <NetflixBackIcon className="h-9 w-9" />
                                </button>

                                <div className="absolute inset-x-0 bottom-0 px-6 pb-4 lg:px-10">
                                    <div className={`flex items-center gap-4 ${interactive}`}>
                                        <Scrubber
                                            currentTime={currentTime}
                                            duration={duration}
                                            buffered={buffered}
                                            onSeek={seekToTime}
                                            onInteract={handleMouseMove}
                                        />
                                        <span className="flex-none text-base font-medium tabular-nums">{formatClock(remaining)}</span>
                                    </div>

                                    <div className={`mt-1 flex items-center gap-3 lg:gap-5 ${interactive}`}>
                                        <button type="button" data-play-button="" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Lecture'} title={isPlaying ? 'Pause (Espace)' : 'Lecture (Espace)'} className={iconBtn}>
                                            {isPlaying ? <NetflixPauseIcon className="h-9 w-9" /> : <NetflixPlayIcon className="h-9 w-9" />}
                                        </button>
                                        <button type="button" onClick={() => seekRelative(-10)} aria-label="Reculer de 10 secondes" title="Reculer de 10 s (←)" className={iconBtn}>
                                            <NetflixRewind10Icon className="h-8 w-8" />
                                        </button>
                                        <button type="button" onClick={() => seekRelative(10)} aria-label="Avancer de 10 secondes" title="Avancer de 10 s (→)" className={iconBtn}>
                                            <NetflixForward10Icon className="h-8 w-8" />
                                        </button>
                                        <div className="group/vol flex items-center">
                                            <button type="button" onClick={toggleMute} aria-label={isMuted ? 'Activer le son' : 'Couper le son'} title="Son (M)" className={iconBtn}>
                                                <VolumeIcon className="h-8 w-8" />
                                            </button>
                                            <input
                                                type="range"
                                                min={0}
                                                max={1}
                                                step={0.05}
                                                value={isMuted ? 0 : volume}
                                                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                                                aria-label="Volume"
                                                className="h-1 w-0 cursor-pointer opacity-0 accent-[#e50914] transition-all duration-200 focus:w-24 focus:opacity-100 group-hover/vol:w-24 group-hover/vol:opacity-100"
                                            />
                                        </div>

                                        <p className="min-w-0 flex-1 truncate px-4 text-center text-lg">
                                            <span className="font-bold">{title}</span>
                                            {isTv && (
                                                <span className="ml-3 text-white/75">
                                                    É{episode}{currentEpTitle ? ` ${currentEpTitle}` : ''}
                                                </span>
                                            )}
                                        </p>

                                        {isTv && nextEpAvailable && (
                                            <button type="button" onClick={handleNextEpisode} aria-label="Épisode suivant" title="Épisode suivant (N)" className={iconBtn}>
                                                <NetflixNextEpisodeIcon className="h-8 w-8" />
                                            </button>
                                        )}
                                        {isTv && (
                                            <button type="button" onClick={() => openPanel('episodes')} aria-label="Épisodes" title="Épisodes" aria-expanded={panel === 'episodes'} className={iconBtn}>
                                                <NetflixEpisodesIcon className="h-8 w-8" />
                                            </button>
                                        )}
                                        <button type="button" onClick={() => openPanel('audio')} aria-label="Audio et sous-titres" title="Audio et sous-titres (C)" aria-expanded={panel === 'audio'} className={iconBtn}>
                                            <NetflixSubtitlesIcon className="h-8 w-8" />
                                        </button>
                                        <button type="button" onClick={() => openPanel('speed')} aria-label="Vitesse de lecture" title="Vitesse de lecture" aria-expanded={panel === 'speed'} className={iconBtn}>
                                            <SpeedIcon className="h-8 w-8" />
                                        </button>
                                        <button type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'} title="Plein écran (F)" className={iconBtn}>
                                            {isFullscreen ? <NetflixExitFullscreenIcon className="h-8 w-8" /> : <NetflixFullscreenIcon className="h-8 w-8" />}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Fin d'épisode */}
                    {showNextUp && (
                        <button
                            type="button"
                            onClick={handleNextEpisode}
                            className={`absolute z-40 flex items-center gap-2 rounded bg-white px-5 py-2.5 text-sm font-bold text-black shadow-lg hover:bg-white/85 ${
                                compact ? 'bottom-24 right-5' : 'bottom-32 right-10'
                            }`}
                        >
                            <NetflixPlayIcon className="h-4 w-4" />
                            Épisode suivant
                        </button>
                    )}

                    {/* Panneaux */}
                    {panel === 'audio' && (
                        <AudioSubsPanel
                            compact={compact}
                            onClose={closePanel}
                            hasTrueVf={hasTrueVf}
                            currentAudioLang={currentAudioLang}
                            onSelectAudio={handleSelectAudioLang}
                            subtitles={availableSubtitles}
                            selectedSubtitleId={selectedSubtitleId}
                            onSelectSubtitle={(subId) => handleSelectSubtitle(subId)}
                            streams={availableStreams}
                            activeStream={activeStream}
                            onSelectStream={handleSelectStream}
                            subtitlesAlwaysOn={subtitlesAlwaysOn}
                            onToggleAlwaysOn={toggleSubtitlesAlwaysOn}
                        />
                    )}
                    {panel === 'speed' && (
                        <SpeedPanel compact={compact} onClose={closePanel} rate={playbackRate} onSelect={handleSpeedChange} />
                    )}
                    {panel === 'episodes' && isTv && (
                        <EpisodesPanel
                            compact={compact}
                            onClose={closePanel}
                            show={tvDetails?.id ? tvDetails : { ...tvDetails, id }}
                            season={season}
                            episode={episode}
                            progress={duration > 0 ? currentTime / duration : 0}
                            onSelect={goToEpisode}
                        />
                    )}
                </>
            )}

            {/* Préparation de la lecture */}
            {(streamState === 'resolving' || streamState === 'downloading') && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black px-6 text-center">
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Retour"
                        className="absolute left-3 top-[max(10px,env(safe-area-inset-top))] p-2 text-white md:left-5 md:top-5"
                    >
                        <NetflixBackIcon className="h-8 w-8" />
                    </button>
                    <span className="h-14 w-14 animate-spin rounded-full border-4 border-[#e50914] border-t-transparent" />
                    <p className="mt-6 text-lg font-semibold">{title}</p>
                    {isTv && <p className="mt-1 text-sm text-white/60">Saison {season} · Épisode {episode}</p>}
                    {streamState === 'downloading' && downloadProgress.elapsedSec >= 12 && (
                        <p className="mt-3 text-sm text-white/50">Préparation de la vidéo, encore quelques instants…</p>
                    )}
                    {streamState === 'downloading' && downloadProgress.elapsedSec >= 8 && availableStreams.length > 1 && (
                        <div className="mt-6 flex max-w-md flex-wrap items-center justify-center gap-2">
                            <span className="w-full text-xs text-white/40">Ou choisissez une autre source :</span>
                            {availableStreams
                                .filter(st => st.id !== activeStream?.id)
                                .slice(0, 4)
                                .map(st => (
                                    <button
                                        key={st.id || st.url}
                                        type="button"
                                        onClick={() => handleSelectStream(st)}
                                        className="rounded border border-white/25 px-3 py-1.5 text-xs font-medium text-white/80 hover:border-white hover:text-white"
                                    >
                                        {getShortQualityBadge(st)}
                                    </button>
                                ))}
                        </div>
                    )}
                </div>
            )}

            {/* Erreur */}
            {streamState === 'error' && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black px-6 text-center">
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Retour"
                        className="absolute left-3 top-[max(10px,env(safe-area-inset-top))] p-2 text-white md:left-5 md:top-5"
                    >
                        <NetflixBackIcon className="h-8 w-8" />
                    </button>
                    <h2 className="text-xl font-bold md:text-2xl">Lecture impossible</h2>
                    <p className="mt-2 max-w-md text-sm text-white/60">{errorMessage || 'Ce titre ne peut pas être lu pour le moment.'}</p>
                    <div className="mt-6 flex gap-3">
                        <button
                            type="button"
                            onClick={() => resolveStream(true)}
                            className="rounded bg-white px-6 py-2.5 text-sm font-bold text-black hover:bg-white/85"
                        >
                            Réessayer
                        </button>
                        <button
                            type="button"
                            onClick={handleClose}
                            className="rounded bg-white/15 px-6 py-2.5 text-sm font-bold text-white hover:bg-white/25"
                        >
                            Retour
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function MobileAction({ icon, label, onClick }) {
    return (
        <button type="button" onClick={onClick} className="flex items-center gap-2 py-2 text-[13px] font-medium text-white active:opacity-60">
            {icon}
            <span className="hidden min-[420px]:inline">{label}</span>
        </button>
    );
}
