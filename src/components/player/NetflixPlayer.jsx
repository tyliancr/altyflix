import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { getMovieDetails, getSeasonDetails, getSeriesDetails } from '../../services/tmdb';
import { recordView } from '../../services/statsService';
import { resolvePlaybackStreams, pollStreamStatus, fetchSubtitlesForContent, fetchSubtitleCues } from '../../services/streamingGateway';
import { Scrubber, AudioSubsPanel, SpeedPanel, EpisodesPanel, SpeedIcon } from './PlayerPanels';
import { formatClock, canBrowserDecodeAc3 } from './playerUtils';
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
    const subsPrefKey = currentProfile?.id ? `altyflix_subtitles_default_on_${currentProfile.id}` : 'altyflix_subtitles_default_on';
    const [subtitlesAlwaysOn, setSubtitlesAlwaysOn] = useState(() => {
        try {
            const local = typeof localStorage !== 'undefined' ? localStorage.getItem(subsPrefKey) : null;
            if (local !== null) return local === 'true';
        } catch { /* ignore */ }
        return currentProfile?.subtitlesDefaultOn === true;
    });
    const subtitlesAlwaysOnRef = useRef(subtitlesAlwaysOn);
    subtitlesAlwaysOnRef.current = subtitlesAlwaysOn;

    const [availableSubtitles, setAvailableSubtitles] = useState([]);
    const [selectedSubtitleId, setSelectedSubtitleId] = useState('off');
    const [currentAudioLang, setCurrentAudioLang] = useState('vf');
    const [centerAction, setCenterAction] = useState(null); // 'play' | 'pause' | null
    const autoplayMutedRef = useRef(false);
    const isAc3Supported = useMemo(() => canBrowserDecodeAc3(), []);
    // Pistes Dolby AC3/E-AC3/DTS que l'appareil ne sait pas décoder : on bascule tout seul
    // (une seule fois par épisode) sur une source au son compatible, sans aucun message.
    const audioFallbackDoneRef = useRef('');
    const [hasTrueVf, setHasTrueVf] = useState(false);
    const userPickedStreamRef = useRef(false);
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
    const [resolvedDurationSec, setResolvedDurationSec] = useState(0);
    const resolvedKeyRef = useRef('');
    const resolveReqIdRef = useRef(0);
    const resolveAbortRef = useRef(null);
    const mountedRef = useRef(true);
    const failedStreamIdsRef = useRef(new Set());
    const availableStreamsRef = useRef(availableStreams);
    availableStreamsRef.current = availableStreams;
    const activeStreamRef = useRef(activeStream);
    activeStreamRef.current = activeStream;
    const isMutedRef = useRef(isMuted);
    isMutedRef.current = isMuted;
    const userMutedRef = useRef(false);
    const playbackRateRef = useRef(playbackRate);
    playbackRateRef.current = playbackRate;
    const resolvedImdbIdRef = useRef('');
    const pollingAbortControllerRef = useRef(null);
    const transcodeOffsetRef = useRef(0);
    const currentTimeRef = useRef(currentTime);
    currentTimeRef.current = currentTime;
    const volumeRef = useRef(volume);
    volumeRef.current = volume;
    const activeSubRequestIdRef = useRef(0);
    const subAbortRef = useRef(null);
    const autoSubAppliedKeyRef = useRef('');
    const availableSubtitlesRef = useRef([]);
    availableSubtitlesRef.current = availableSubtitles;
    const handleSelectSubtitleRef = useRef(null);
    const cuesRef = useRef([]);
    const [currentSubtitleLines, setCurrentSubtitleLines] = useState([]);
    const userPickedSubRef = useRef(false);
    const selectedSubtitleIdRef = useRef(selectedSubtitleId);
    selectedSubtitleIdRef.current = selectedSubtitleId;
    const updateSubtitleLinesRef = useRef(() => {});

    // Récupération des détails (série / épisode / film) incluant la durée réelle TMDB pour la barre de lecture
    const nextEpTargetRef = useRef(null);
    const skipNextCleanupSaveRef = useRef(false);
    const seekingTranscodeRef = useRef(false);

    useEffect(() => {
        let live = true;
        setResolvedDurationSec(0);
        nextEpTargetRef.current = null;
        if (isTv && id) {
            let loadedSeries = null;
            let loadedSeason = null;
            const updateNextTarget = () => {
                if (!live) return;
                const eps = Array.isArray(loadedSeason?.episodes) ? [...loadedSeason.episodes].sort((a, b) => a.episode_number - b.episode_number) : [];
                const nextInSeason = eps.find(e => e.episode_number > episode);
                if (nextInSeason) {
                    nextEpTargetRef.current = { season, episode: nextInSeason.episode_number };
                    setNextEpAvailable(true);
                    return;
                }
                const seasonsList = Array.isArray(loadedSeries?.seasons) ? [...loadedSeries.seasons].filter(s => s.season_number > 0).sort((a, b) => a.season_number - b.season_number) : [];
                const nextSeason = seasonsList.find(s => s.season_number > season && (s.episode_count ?? 1) > 0);
                if (nextSeason) {
                    nextEpTargetRef.current = { season: nextSeason.season_number, episode: 1 };
                    setNextEpAvailable(true);
                } else {
                    nextEpTargetRef.current = null;
                    setNextEpAvailable(false);
                }
            };
            getSeriesDetails(id).then(d => {
                if (!live) return;
                loadedSeries = d;
                setTvDetails(d);
                const fallbackEpDur = Number(d?.episode_run_time?.[0]) * 60 || 0;
                if (fallbackEpDur > 60) {
                    setResolvedDurationSec(prev => (prev > 60 ? prev : fallbackEpDur));
                }
                updateNextTarget();
            }).catch(() => {});
            getSeasonDetails(id, season).then(data => {
                if (!live) return;
                loadedSeason = data;
                const ep = data?.episodes?.find(e => e.episode_number === episode);
                setCurrentEpTitle(ep?.name || '');
                setCurrentEpOverview(ep?.overview || '');
                const epDur = Number(ep?.runtime) * 60 || 0;
                if (epDur > 60) setResolvedDurationSec(epDur);
                updateNextTarget();
            }).catch(() => {});
        } else if (!isTv && id) {
            const initialMovieDur = Number(contentRef.current?.runtime) * 60 || 0;
            if (initialMovieDur > 60) {
                setResolvedDurationSec(initialMovieDur);
            } else {
                getMovieDetails(id).then(d => {
                    if (!live) return;
                    const dur = Number(d?.runtime) * 60 || 0;
                    if (dur > 60) setResolvedDurationSec(dur);
                }).catch(() => {});
            }
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

    // Nettoyage de toute surveillance / polling / résolution actif au démontage du composant
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (pollingAbortControllerRef.current) {
                pollingAbortControllerRef.current.abort();
            }
            if (resolveAbortRef.current) {
                resolveAbortRef.current.abort();
            }
        };
    }, []);

    // Démarre la surveillance en continu d'un flux en cours de débridage
    const startStreamPolling = useCallback((targetUrl) => {
        if (!targetUrl || !mountedRef.current) return;
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
                if (mountedRef.current && !controller.signal.aborted) {
                    setDownloadProgress(prog);
                }
            }
        }).then(result => {
            if (!mountedRef.current || result.aborted || controller.signal.aborted) return;
            if (result.ready && result.playbackUrl) {
                console.log('[Altyflix Player] Débridage terminé avec succès');
                loadedUrlRef.current = null;
                const directUrl = result.directUrl || (typeof result.playbackUrl === 'string' && /^https?:\/\//i.test(result.playbackUrl) ? result.playbackUrl : null);
                setActiveStream(prev => ({
                    ...(prev || {}),
                    url: result.playbackUrl,
                    directUrl: directUrl || prev?.directUrl,
                    isAvi: Boolean(prev?.isAvi || result.isAvi),
                    isTranscoded: Boolean(prev?.isTranscoded || result.isTranscoded),
                    isDownloading: false,
                    isCached: true
                }));
                // Mettre à jour la liste des flux en mémoire pour que les sélections suivantes soient instantanées
                setAvailableStreams(prevList => (prevList || []).map(s => {
                    const match = (activeStreamRef.current?.id && s.id === activeStreamRef.current.id) || s.url === targetUrl || s.originalUrl === targetUrl;
                    if (!match) return s;
                    return {
                        ...s,
                        url: result.playbackUrl,
                        directUrl: directUrl || s.directUrl,
                        isCached: true,
                        isDownloading: false,
                        verifiedReady: true
                    };
                }));
                setStreamState('playing');
            } else if (result.error || result.timeout) {
                console.warn('[Altyflix Player] Source indisponible ou timeout atteint, tentative automatique de la source suivante...');
                const list = availableStreamsRef.current || [];
                const current = activeStreamRef.current;
                if (current) {
                    failedStreamIdsRef.current.add(current.id || current.url);
                }
                const hasNext = list.some(s => !failedStreamIdsRef.current.has(s.id || s.url));
                if (hasNext) {
                    handleStreamErrorRef.current?.();
                } else {
                    setErrorMessage('Ce titre met plus de temps que prévu à charger. Veuillez réessayer dans un instant.');
                    setStreamState('error');
                }
            }
        }).catch(err => {
            if (!mountedRef.current || controller.signal.aborted) return;
            console.error('[Altyflix Player] Erreur de polling :', err);
            const list = availableStreamsRef.current || [];
            const current = activeStreamRef.current;
            if (current) {
                failedStreamIdsRef.current.add(current.id || current.url);
            }
            const hasNext = list.some(s => !failedStreamIdsRef.current.has(s.id || s.url));
            if (hasNext) {
                handleStreamErrorRef.current?.();
            } else {
                setErrorMessage('Un problème est survenu lors du chargement de la vidéo. Veuillez réessayer.');
                setStreamState('error');
            }
        });
    }, []);

    // Résolution automatique du flux streaming (protégée contre les courses d'épisodes et le démontage)
    const resolveStream = useCallback(async (force = false) => {
        if (!id) return;
        const streamKey = `${id}-${isTv ? 'tv' : 'movie'}-${season}-${episode}`;
        if (!force && resolvedKeyRef.current === streamKey) return;

        if (pollingAbortControllerRef.current) {
            pollingAbortControllerRef.current.abort();
        }
        if (resolveAbortRef.current) {
            resolveAbortRef.current.abort();
        }
        const abortCtrl = new AbortController();
        resolveAbortRef.current = abortCtrl;
        const reqId = ++resolveReqIdRef.current;
        failedStreamIdsRef.current.clear();

        setStreamState('resolving');
        setErrorMessage('');

        const imdbId = contentRef.current?.external_ids?.imdb_id || contentRef.current?.imdb_id;
        const cleanTitle = titleRef.current && titleRef.current !== 'Lecture' ? titleRef.current : '';

        try {
            const res = await resolvePlaybackStreams({
                id,
                imdbId,
                type: isTv ? 'tv' : 'movie',
                season,
                episode,
                title: cleanTitle,
                signal: abortCtrl.signal
            });

            if (!mountedRef.current || reqId !== resolveReqIdRef.current || res?.aborted) return;

            if (res.success && res.activeStream) {
                resolvedKeyRef.current = streamKey;
                if (res.imdbId) resolvedImdbIdRef.current = res.imdbId;
                const rawStreams = res.streams || [];
                // Éliminer toute source morte ou corrompue pour ne présenter que des options fonctionnelles
                const streams = rawStreams.filter(s => !s.isDead);
                setAvailableStreams(streams);

                // 1. Identifier tous les flux réellement prêts (en cache et non en téléchargement)
                const readyStreams = streams.filter(s => (s.isCached || s.verifiedReady) && !s.isDownloading);

                let selectedStream = res.activeStream;

                // 2. RÈGLE D'OR NETFLIX : Si le flux actif est en cours de téléchargement alors qu'un flux prêt existe,
                // bascule IMMÉDIATE sur le flux prêt pour garantir un démarrage de lecture instantané (< 1s) !
                if (selectedStream.isDownloading || !selectedStream.isCached) {
                    if (readyStreams.length > 0) {
                        const bestReady = readyStreams.find(s => s.isFrench && s.tierKey === '1080p')
                                       || readyStreams.find(s => s.isFrench)
                                       || readyStreams.find(s => s.tierKey === '1080p')
                                       || readyStreams.find(s => s.tierKey === '4k')
                                       || readyStreams[0];
                        if (bestReady) {
                            console.log('[Altyflix Player] Flux par défaut en téléchargement -> Bascule instantanée sur le flux prêt :', bestReady.qualityLabel);
                            selectedStream = bestReady;
                        }
                    }
                }

                // 3. Son garanti sur Chrome/Edge : Ne basculer QUE sur un flux PRÊT (jamais sur un flux en téléchargement !)
                if (!isAc3Supported && (selectedStream.hasUnsupportedAudio || !selectedStream.isWebAudioSafe)) {
                    const safeReady = readyStreams.find(s => (s.isWebAudioSafe || !s.hasUnsupportedAudio) && Boolean(s.isFrench) === Boolean(selectedStream.isFrench))
                                   || readyStreams.find(s => (s.isWebAudioSafe || !s.hasUnsupportedAudio));
                    if (safeReady) {
                        console.log('[Altyflix Player] Optimisation audio Chrome : flux avec son garanti sélectionné :', safeReady.qualityLabel || safeReady.quality);
                        selectedStream = safeReady;
                    }
                }

                // 3 bis. Compatibilité Conteneur : Un conteneur .avi non transcodé ne peut pas être décodé par les navigateurs modernes HTML5
                if (selectedStream.isAvi && !selectedStream.isTranscoded) {
                    const playableReady = readyStreams.find(s => (!s.isAvi || s.isTranscoded) && !s.isDownloading);
                    if (playableReady) {
                        console.log('[Altyflix Player] Flux par défaut .avi non transcodé -> Bascule automatique sur flux compatible HTML5 :', playableReady.qualityLabel || playableReady.quality);
                        selectedStream = playableReady;
                    } else {
                        const anyPlayable = streams.find(s => (!s.isAvi || s.isTranscoded) && (s.isCached || s.verifiedReady) && !s.isDownloading);
                        if (anyPlayable) {
                            selectedStream = anyPlayable;
                        } else {
                            // Seul le format .avi est disponible : on conserve le flux pour permettre l'ouverture dans VLC ou le téléchargement
                            setErrorMessage("Ce titre utilise un format vidéo ancien (.avi) qui n'est pas pris en charge nativement par votre navigateur Web.");
                            setActiveStream(selectedStream);
                            setStreamState('error');
                            return;
                        }
                    }
                }

                setActiveStream(selectedStream);
                setHasTrueVf(Boolean(res.hasTrueVf));
                setCurrentAudioLang(selectedStream.isFrench ? 'vf' : 'vo');

                // 4. Si le flux actif retenu est en VO (ex: la VF est encore en cours de téléchargement),
                // activer AUTOMATIQUEMENT les sous-titres français pour une expérience Netflix immédiate !
                if (!selectedStream.isFrench) {
                    const subs = availableSubtitlesRef.current || [];
                    const frSub = subs.find(s => s.lang === 'fr' && !s.forced) || subs.find(s => s.lang === 'fr');
                    if (frSub && (!selectedSubtitleIdRef.current || selectedSubtitleIdRef.current === 'off')) {
                        handleSelectSubtitleRef.current?.(frSub.id, subs);
                    }
                }

                if (selectedStream.isDownloading && !selectedStream.isCached) {
                    console.log('[Altyflix Player] Aucun flux en cache disponible, passage à l\'état downloading...');
                    setStreamState('downloading');
                    startStreamPolling(selectedStream.originalUrl || selectedStream.url);
                } else {
                    console.log('[Altyflix Player] Flux prêt immédiatement (en cache), lancement direct !');
                    setStreamState('playing');
                }
            } else {
                setErrorMessage(res.message || 'Ce titre n\'est pas disponible pour le moment. Veuillez sélectionner un autre titre.');
                setStreamState('error');
            }
        } catch (err) {
            if (!mountedRef.current || reqId !== resolveReqIdRef.current || err?.name === 'AbortError') return;
            setErrorMessage('Impossible de lancer la lecture pour le moment. Veuillez réessayer plus tard.');
            setStreamState('error');
        }
    }, [id, isTv, season, episode, isAc3Supported, startStreamPolling]);

    useEffect(() => {
        resolveStream();
    }, [resolveStream]);

    // Bascule automatique propre vers le flux suivant (hors updater React, avec suivi des flux déjà échoués)
    const handleStreamError = useCallback(() => {
        const list = availableStreamsRef.current || [];
        const current = activeStreamRef.current;
        if (current) {
            failedStreamIdsRef.current.add(current.id || current.url);
        }
        const isSafeToPlay = (s) => (!s.isAvi || s.isTranscoded) && !s.isDead;
        // RÈGLE D'OR : On ne bascule QUE sur un autre flux RÉELLEMENT EN CACHE ET FONCTIONNEL.
        // On ne bascule JAMAIS sur un torrent en téléchargement pour éviter de bloquer l'utilisateur dans un spinner infini !
        const nextStream = list.find(s => !failedStreamIdsRef.current.has(s.id || s.url) && (s.isCached || s.verifiedReady) && !s.isDownloading && isSafeToPlay(s));
        if (!nextStream) {
            setErrorMessage('La lecture de cette vidéo a rencontré un problème. Veuillez réessayer plus tard.');
            setStreamState('error');
            return;
        }
        console.log(`[Altyflix Player] Bascule automatique vers le flux suivant : ${nextStream.quality} (${nextStream.languageLabel})`);
        loadedUrlRef.current = null;
        transcodeOffsetRef.current = 0;
        setActiveStream(nextStream);
        setCurrentAudioLang(nextStream.isFrench ? 'vf' : 'vo');
        if (!nextStream.isFrench) {
            const subs = availableSubtitlesRef.current || [];
            const frSub = subs.find(s => s.lang === 'fr' && !s.forced) || subs.find(s => s.lang === 'fr');
            if (frSub && (!selectedSubtitleIdRef.current || selectedSubtitleIdRef.current === 'off')) {
                handleSelectSubtitleRef.current?.(frSub.id, subs);
            }
        }
        if (nextStream.isDownloading && !nextStream.isCached) {
            setStreamState('downloading');
            startStreamPolling(nextStream.originalUrl || nextStream.url);
        } else {
            setStreamState('playing');
            setIsBuffering(true);
        }
    }, [startStreamPolling]);

    // Durée réelle connue depuis TMDB (utilisée pour fiabiliser la timeline et le remux audio/AVI)
    const tmdbDuration = resolvedDurationSec ||
                         (contentRef.current?.runtime ? Number(contentRef.current.runtime) * 60 : 0) ||
                         (contentRef.current?.episode_run_time?.[0] ? Number(contentRef.current.episode_run_time[0]) * 60 : 0);
    const durationRef = useRef(duration);
    durationRef.current = duration;
    const tmdbDurationRef = useRef(tmdbDuration);
    tmdbDurationRef.current = tmdbDuration;
    const handleStreamErrorRef = useRef(handleStreamError);
    handleStreamErrorRef.current = handleStreamError;

    // Dès que la durée TMDB arrive, mettre à jour la timeline si le flux est remuxé ou n'a pas encore de durée fiable
    useEffect(() => {
        if (tmdbDuration > 60 && (duration <= 60 || activeStream?.isTranscoded || activeStream?.url?.includes('/api/video-stream'))) {
            setDuration(tmdbDuration);
        }
    }, [tmdbDuration, duration, activeStream?.isTranscoded, activeStream?.url]);

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
        skipNextCleanupSaveRef.current = false;
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
            const expectedType = isTv ? 'tv' : 'movie';
            const saved = historyList.find(h => {
                if (String(h.contentId || h.id) !== String(id)) return false;
                const hType = h.media_type || h.type;
                return !hType || hType === expectedType;
            });
            if (saved) {
                const isMatching = !isTv || (Number(saved.season || 1) === Number(season) && Number(saved.episode || 1) === Number(episode));
                if (isMatching && saved.progress < 90 && saved.lastWatchedPosition > 5) {
                    startPos = Number(saved.lastWatchedPosition);
                }
            }
        }

        const isTranscoded = Boolean(activeStream?.isTranscoded);
        if (isTranscoded && startPos > 5) {
            transcodeOffsetRef.current = startPos;
        } else {
            transcodeOffsetRef.current = 0;
        }

        const effectiveLoadUrl = (isTranscoded && startPos > 5)
            ? `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}t=${startPos}`
            : streamUrl;

        // Capture la fonction de sauvegarde liée à CET épisode pour que le cleanup ne corrompe jamais le suivant
        const saveForThisEpisode = saveCurrentProgress;
        let pendingResumeSeek = !isTranscoded && startPos > 5;

        engine.load({
            videoElement: video,
            url: effectiveLoadUrl,
            startPosition: isTranscoded ? 0 : startPos,
            callbacks: {
                onBufferingChange: (buffering) => setIsBuffering(buffering),
                onAutoplayMuted: (muted) => {
                    autoplayMutedRef.current = muted;
                    // Ne jamais forcer isMuted permanent : l'autoplay bloqué est un état temporaire du navigateur
                },
                onError: (err) => {
                    console.warn('[Altyflix Player] Erreur signalée par le moteur :', err);
                    handleStreamErrorRef.current?.();
                }
            }
        }).catch((err) => {
            console.warn('[Altyflix Player] Échec chargement moteur :', err);
            handleStreamErrorRef.current?.();
        });

        let hasInitialSaved = false;
        const onPlay = () => {
            setIsPlaying(true);
            // Ne pas écraser une position de reprise à 0s avant que le seek initial soit appliqué
            if (!hasInitialSaved && !pendingResumeSeek) {
                hasInitialSaved = true;
                saveForThisEpisode(true);
            }
        };
        const onPause = () => {
            setIsPlaying(false);
            // Ne pas effacer le spinner si la pause vient d'un seek transcodé en cours de chargement
            if (!seekingTranscodeRef.current) {
                setIsBuffering(false);
            }
            if (!pendingResumeSeek && !seekingTranscodeRef.current) saveForThisEpisode();
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
            if (!pendingResumeSeek && now - lastSaveRef.current > 5000) {
                saveForThisEpisode();
            }
        };

        // Watchdog anti-blocage (détecte les formats incompatibles .avi ou flux figés dès 9 secondes)
        let stallWatchdog = null;
        const resetWatchdog = () => {
            if (stallWatchdog) clearTimeout(stallWatchdog);
            stallWatchdog = null;
        };
        const armWatchdog = () => {
            resetWatchdog();
            stallWatchdog = setTimeout(() => {
                if (video && video.currentTime === 0 && !video.paused && (video.readyState < 2 || activeStream?.isAvi)) {
                    console.warn('[Altyflix Player] Watchdog anti-blocage déclenché : la vidéo ne démarre pas après 9s, tentative du flux suivant...');
                    handleStreamErrorRef.current?.();
                }
            }, 9000);
        };
        armWatchdog();

        const onLoadedMetadata = () => {
            let dur = video.duration;
            const knownTmdbDur = tmdbDurationRef.current || 0;
            if (!Number.isFinite(dur) || dur <= 60 || isTranscoded) {
                if (knownTmdbDur > 60) dur = knownTmdbDur;
            }
            if (dur > 0) setDuration(dur);
            setIsBuffering(false);

            if (pendingResumeSeek) {
                if (Number.isFinite(video.duration) && startPos < video.duration - 15) {
                    video.currentTime = startPos;
                }
                pendingResumeSeek = false;
            }
            // Conserver la vitesse de lecture et le volume (ne jamais démarrer muet sauf si l'utilisateur a expressément cliqué Mute)
            video.playbackRate = playbackRateRef.current || 1;
            const desiredMuted = Boolean(userMutedRef.current);
            const desiredVolume = volumeRef.current ?? 1;
            video.muted = desiredMuted;
            video.volume = desiredVolume;
            seekingTranscodeRef.current = false;
            resetWatchdog();
            video.play().catch((err) => {
                if (err?.name !== 'NotAllowedError') return;
                // Autoplay bloqué par la politique du navigateur : muter temporairement pour lancer l'image
                video.muted = true;
                autoplayMutedRef.current = true;
                video.play().catch(() => {});
            });
        };

        const onVolumeChange = () => {
            if (userMutedRef.current || !video.muted) {
                setIsMuted(video.muted);
                setVolume(video.volume);
            }
        };

        const onWaiting = () => {
            setIsBuffering(true);
            armWatchdog();
        };
        const onPlaying = () => {
            seekingTranscodeRef.current = false;
            resetWatchdog();
            setIsBuffering(false);
            if (!hasInitialSaved && !pendingResumeSeek) {
                hasInitialSaved = true;
                saveForThisEpisode(true);
            }
        };
        const onVideoError = () => {
            resetWatchdog();
            // Ignorer MEDIA_ERR_ABORTED (code 1, ex. changement rapide de seek transcodé)
            if (video.error?.code === 1) return;
            console.warn('[Altyflix Player] Erreur de lecture vidéo native :', video.error);
            handleStreamErrorRef.current?.();
        };

        const onBeforeUnload = () => {
            if (!pendingResumeSeek) saveForThisEpisode();
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
        const onSeeked = () => {
            pendingResumeSeek = false;
            updateSubtitleLinesRef.current?.();
        };
        video.addEventListener('seeked', onSeeked);

        return () => {
            resetWatchdog();
            if (!pendingResumeSeek && !skipNextCleanupSaveRef.current) saveForThisEpisode();
            skipNextCleanupSaveRef.current = false;
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
    }, [activeStream?.url, activeStream?.isTranscoded, activeStream?.isAvi, streamState, id, isTv, season, episode, saveCurrentProgress]);

    // Fermeture du lecteur avec sauvegarde immédiate de l'exacte seconde
    const handleClose = useCallback(() => {
        saveCurrentProgress();
        if (onClose) onClose();
    }, [onClose, saveCurrentProgress]);

    // Réinitialisation propre lors d'un changement d'épisode (sauvegarde l'ancien, purge flux & sous-titres)
    const resetEpisodeState = useCallback(() => {
        saveCurrentProgress();
        skipNextCleanupSaveRef.current = Boolean(loadedUrlRef.current);
        resolvedKeyRef.current = '';
        currentTimeRef.current = 0;
        transcodeOffsetRef.current = 0;
        loadedUrlRef.current = null;
        activeSubRequestIdRef.current++;
        if (subAbortRef.current) {
            try { subAbortRef.current.abort(); } catch { /* ignore */ }
            subAbortRef.current = null;
        }
        cuesRef.current = [];
        autoSubAppliedKeyRef.current = '';
        userPickedSubRef.current = false;
        userPickedStreamRef.current = false;
        selectedSubtitleIdRef.current = 'off';
        userMutedRef.current = false;
        setIsMuted(false);
        autoplayMutedRef.current = false;
        setCurrentTime(0);
        setDuration(0);
        setBuffered(0);
        setPanel(null);
        setActiveStream(null);
        setAvailableStreams([]);
        setAvailableSubtitles([]);
        setSelectedSubtitleId('off');
        setCurrentSubtitleLines([]);
        setStreamState('resolving');
    }, [saveCurrentProgress]);

    // Passage à l'épisode suivant (gère aussi les fins de saison → Saison+1 Épisode 1)
    const handleNextEpisode = useCallback(() => {
        if (onNext) {
            saveCurrentProgress();
            onNext();
            return;
        }
        const target = nextEpTargetRef.current;
        resetEpisodeState();
        if (target) {
            setSeason(target.season);
            setEpisode(target.episode);
        } else {
            setEpisode(ep => ep + 1);
        }
    }, [onNext, saveCurrentProgress, resetEpisodeState]);

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

    // Son coupé par le navigateur au démarrage : tout geste utilisateur (clic, touche, toucher) réactive le son
    useEffect(() => {
        const unmute = (e) => {
            if (e?.target?.closest?.('[data-mute-button]')) return;
            const video = videoRef.current;
            if (video && !userMutedRef.current && video.muted) {
                video.muted = false;
                video.volume = volumeRef.current || 1;
                autoplayMutedRef.current = false;
                setIsMuted(false);
            }
        };
        const events = ['pointerdown', 'keydown', 'touchstart'];
        events.forEach(type => window.addEventListener(type, unmute, { capture: true }));
        return () => events.forEach(type => window.removeEventListener(type, unmute, { capture: true }));
    }, []);

    // Bascule Lecture / Pause
    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        // Réactivation immédiate du son si la vidéo était coupée par l'autoplay
        if (video.muted && !userMutedRef.current) {
            video.muted = false;
            video.volume = volumeRef.current || 1;
            autoplayMutedRef.current = false;
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
    }, [handleMouseMove]);

    // Déplacement direct et précis dans la vidéo (compatible HTTP 206 et transcodage à la volée)
    const seekToTime = useCallback((targetSec) => {
        const video = videoRef.current;
        if (!video) return;

        const effDur = (duration > 0 ? duration : (tmdbDuration || Infinity));
        const target = Math.max(0, Math.min(effDur, targetSec));

        const isTranscoded = Boolean(activeStream?.isTranscoded);

        if (isTranscoded) {
            const seekSec = Math.floor(target);
            let seekUrl = activeStream?.url || '';
            try {
                const parsed = new URL(seekUrl, window.location.origin);
                parsed.searchParams.set('t', String(seekSec));
                seekUrl = parsed.origin === window.location.origin
                    ? `${parsed.pathname}${parsed.search}`
                    : parsed.toString();
            } catch {
                const base = seekUrl.replace(/([&?])t=\d+/, '');
                seekUrl = `${base}${base.includes('?') ? '&' : '?'}t=${seekSec}`;
            }

            seekingTranscodeRef.current = true;
            transcodeOffsetRef.current = seekSec;
            setCurrentTime(target);
            setIsBuffering(true);
            video.pause();
            video.src = seekUrl;
            video.load();
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
            if (e.button !== 0 || e.detail >= 2) return;
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
    const handleVolumeChange = useCallback((newVol) => {
        const v = Math.max(0, Math.min(1, newVol));
        setVolume(v);
        const shouldMute = v === 0;
        userMutedRef.current = shouldMute;
        setIsMuted(shouldMute);
        autoplayMutedRef.current = false;
        if (videoRef.current) {
            videoRef.current.volume = v;
            videoRef.current.muted = shouldMute;
        }
    }, []);

    const toggleMute = useCallback(() => {
        const video = videoRef.current;
        if (isMuted || (video && video.muted)) {
            userMutedRef.current = false;
            setIsMuted(false);
            autoplayMutedRef.current = false;
            if (video) {
                video.muted = false;
                video.volume = volume || 1;
            }
        } else {
            userMutedRef.current = true;
            setIsMuted(true);
            if (video) {
                video.muted = true;
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
                try { window.screen.orientation.unlock(); } catch { /* ignore */ }
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

    // Changement de flux (qualité) — fermeture propre du panneau, arrêt immédiat de l'ancien flux et zéro écran vert
    const handleSelectStream = (st) => {
        if (!st) return;
        userPickedStreamRef.current = true;
        setPanel(null);
        failedStreamIdsRef.current.delete(st.id || st.url);
        setErrorMessage('');
        if (st.id === activeStream?.id && st.url === activeStream?.url) {
            if (streamState === 'error' || streamState === 'resolving' || streamState === 'downloading') {
                if (st.isCached && !st.isDownloading) {
                    setStreamState('playing');
                    loadedUrlRef.current = null;
                    setIsBuffering(true);
                }
            }
            return;
        }
        if (pollingAbortControllerRef.current) {
            pollingAbortControllerRef.current.abort();
            pollingAbortControllerRef.current = null;
        }
        // Mettre simplement en pause (le cleanup du useEffect détache onVideoError avant engine.destroy())
        const video = videoRef.current;
        if (video) {
            try { video.pause(); } catch { /* ignore */ }
        }
        saveCurrentProgress();
        skipNextCleanupSaveRef.current = Boolean(loadedUrlRef.current);
        loadedUrlRef.current = null;
        transcodeOffsetRef.current = 0;
        if (Boolean(st.isFrench) !== Boolean(activeStream?.isFrench)) {
            userPickedSubRef.current = false;
        }

        const directPlaybackUrl = st.directUrl || (typeof st.url === 'string' && !st.url.includes('/resolve/') && (st.url.startsWith('http') || st.url.startsWith('/api/video-stream')) ? st.url : null);
        const effectiveStream = directPlaybackUrl ? { ...st, url: directPlaybackUrl } : st;

        setActiveStream(effectiveStream);
        setCurrentAudioLang(st.isFrench ? 'vf' : 'vo');

        if (!st.isFrench) {
            const subs = availableSubtitlesRef.current || [];
            const frSub = subs.find(s => s.lang === 'fr' && !s.forced) || subs.find(s => s.lang === 'fr');
            if (frSub && (!selectedSubtitleId || selectedSubtitleId === 'off')) {
                handleSelectSubtitle(frSub.id, subs);
            }
        }

        if (directPlaybackUrl && (st.isCached || st.verifiedReady) && !st.isDownloading) {
            setStreamState('playing');
            setIsBuffering(true);
        } else {
            // Le flux sélectionné doit être débridé/résolu vers son URL CDN directe
            setStreamState('downloading');
            startStreamPolling(st.originalUrl || st.url);
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
        const adSpamPattern = /osdb\.link|opensubtitles|subtitles\.org|tryray\.app|appuyez sur lecture|une seule app|plus de 200 langues|watch online movies|become vip|devenez membre vip|advertise your product|support us and|sous-titres\.eu|addic7ed|subscene/i;
        const lines = [];
        matching.forEach(c => {
            const rawText = String(c.text || '');
            if (adSpamPattern.test(rawText)) return;
            const parts = rawText.split('\n');
            parts.forEach(p => {
                const cleaned = p.replace(/\{[^}]+\}/g, '').trim();
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

    // Sélection d'une piste de sous-titres (sécurisée en mémoire + streaming progressif pour pistes MKV intégrées)
    const handleSelectSubtitle = useCallback(async (subId, customList = null) => {
        const reqId = ++activeSubRequestIdRef.current;
        if (subAbortRef.current) {
            try { subAbortRef.current.abort(); } catch { /* ignore */ }
        }
        const subController = new AbortController();
        subAbortRef.current = subController;

        setSelectedSubtitleId(subId);
        selectedSubtitleIdRef.current = subId;
        cuesRef.current = [];
        setCurrentSubtitleLines([]);
        const video = videoRef.current;
        if (!video) return;

        // Désactivation immédiate de toutes les pistes natives du navigateur
        for (let i = 0; i < video.textTracks.length; i++) {
            video.textTracks[i].mode = 'disabled';
        }
        const oldTracks = video.querySelectorAll('track');
        oldTracks.forEach(t => video.removeChild(t));

        if (subId === 'off') {
            return;
        }

        const list = customList || availableSubtitlesRef.current;
        const sub = list.find(s => s.id === subId);
        if (!sub) return;

        try {
            // Fichier vide ou injoignable : on essaie les autres pistes de la même langue
            const candidates = [sub, ...list.filter(s => s.id !== sub.id && s.lang === sub.lang && Boolean(s.forced) === Boolean(sub.forced))];
            let cues = [];
            let chosen = sub;
            for (const cand of candidates) {
                cues = await fetchSubtitleCues(cand.url, cand.encoding, cand.fallbackUrl, {
                    signal: subController.signal,
                    onPartialCues: (partial) => {
                        if (reqId !== activeSubRequestIdRef.current || !videoRef.current) return;
                        cuesRef.current = partial;
                        if (updateSubtitleLinesRef.current) updateSubtitleLinesRef.current();
                    }
                });
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
            if (!subController.signal.aborted) {
                console.warn('[Altyflix Subtitles] Erreur chargement VTT :', err);
            }
        }
    }, []);
    handleSelectSubtitleRef.current = handleSelectSubtitle;

    useEffect(() => () => {
        if (subAbortRef.current) {
            try { subAbortRef.current.abort(); } catch { /* ignore */ }
        }
    }, []);

    // Raccourci bascule rapide sous-titres (Touche C ou bouton direct)
    const toggleSubtitles = useCallback(() => {
        const subs = availableSubtitlesRef.current || [];
        if (selectedSubtitleIdRef.current === 'off' && subs.length === 0) return;
        userPickedSubRef.current = true;
        if (selectedSubtitleIdRef.current !== 'off') {
            handleSelectSubtitle('off');
        } else {
            const frSub = subs.find(s => s.lang === 'fr' && !s.forced) || subs.find(s => s.lang === 'fr' || (s.label && s.label.toLowerCase().includes('fr')));
            const target = frSub || subs[0];
            handleSelectSubtitle(target.id, subs);
        }
    }, [handleSelectSubtitle]);

    const toggleSubtitlesAlwaysOn = useCallback(() => {
        const next = !subtitlesAlwaysOnRef.current;
        setSubtitlesAlwaysOn(next);
        try { localStorage.setItem(subsPrefKey, next ? 'true' : 'false'); } catch { /* stockage indisponible */ }
        if (currentProfile?.id && updateProfile) {
            updateProfile(currentProfile.id, { subtitlesDefaultOn: next, subtitlesAlwaysOn: next });
        }
    }, [currentProfile?.id, updateProfile, subsPrefKey]);

    // Chargement automatique des sous-titres (MKV intégrés + OpenSubtitles) & Auto-VOSTFR façon Netflix
    const hasActiveStream = Boolean(activeStream);
    const activeStreamFilename = activeStream?.filename || '';
    const activeStreamRawUrl = activeStream?.directUrl || activeStream?.originalUrl || (typeof activeStream?.url === 'string' && /^https?:\/\//i.test(activeStream.url) ? activeStream.url : '');
    const activeStreamIsVo = Boolean(activeStream && !activeStream.isFrench);
    const streamMode = hasActiveStream ? (activeStreamIsVo ? 'vo' : 'vf') : 'pending';
    useEffect(() => {
        let active = true;
        const currentMediaKey = `${id}-${isTv ? 'tv' : 'movie'}-${season}-${episode}-${activeStreamFilename}-${activeStreamRawUrl}-${streamMode}`;
        if (!id) return;

        const imdbId = contentRef.current?.external_ids?.imdb_id || contentRef.current?.imdb_id || resolvedImdbIdRef.current;

        fetchSubtitlesForContent({
            id,
            imdbId,
            type: isTv ? 'tv' : 'movie',
            season,
            episode,
            filename: activeStreamFilename,
            streamUrl: activeStreamRawUrl
        }).then(subs => {
            if (!active || !Array.isArray(subs)) return;
            const prevSubs = availableSubtitlesRef.current || [];
            setAvailableSubtitles(subs);
            availableSubtitlesRef.current = subs;

            // Si la piste active n'existe plus dans la nouvelle liste (ex: changement de MKV), basculer proprement
            const currentSelectedId = selectedSubtitleIdRef.current;
            if (currentSelectedId !== 'off' && !subs.some(s => s.id === currentSelectedId)) {
                const prevSub = prevSubs.find(s => s.id === currentSelectedId);
                const replacement = prevSub
                    ? (subs.find(s => s.lang === prevSub.lang && Boolean(s.forced) === Boolean(prevSub.forced)) || subs.find(s => s.lang === prevSub.lang))
                    : null;
                if (replacement) handleSelectSubtitle(replacement.id, subs);
                else handleSelectSubtitle('off');
            }

            // Attendre que la source active soit résolue avant d'appliquer et verrouiller Auto-VOSTFR
            if (!hasActiveStream) return;

            // Auto-VOSTFR façon Netflix :
            // - En VO (ou si « Toujours activer » est coché) : activer automatiquement les sous-titres FR complets
            // - En VF : désactivés par défaut (sauf sous-titres FR forcés intégrés MKV s'il y en a)
            if (autoSubAppliedKeyRef.current !== currentMediaKey && !userPickedSubRef.current) {
                const wantAutoSubs = activeStreamIsVo || subtitlesAlwaysOnRef.current;
                if (wantAutoSubs) {
                    if (subs.length > 0) {
                        autoSubAppliedKeyRef.current = currentMediaKey;
                        const frSub = subs.find(s => s.lang === 'fr' && !s.forced) || subs.find(s => s.lang === 'fr') || subs[0];
                        if (frSub) handleSelectSubtitle(frSub.id, subs);
                    }
                } else {
                    autoSubAppliedKeyRef.current = currentMediaKey;
                    const forcedFr = subs.find(s => s.lang === 'fr' && s.forced && s.embedded);
                    if (forcedFr) handleSelectSubtitle(forcedFr.id, subs);
                    else if (selectedSubtitleIdRef.current !== 'off') handleSelectSubtitle('off');
                }
            }
        }).catch(() => {});

        return () => { active = false; };
    }, [id, isTv, season, episode, hasActiveStream, activeStreamFilename, activeStreamRawUrl, activeStreamIsVo, streamMode, handleSelectSubtitle]);

    // Sélection de la langue audio (VF vs VO) avec bascule Auto-VOSTFR immédiate (y compris piste audio MULTi via FFmpeg)
    const handleSelectAudioLang = (lang) => {
        const subs = availableSubtitlesRef.current || [];
        const isMultiStream = (s) => Boolean(s && /\bmulti\b|multi\s*audio/i.test(`${s.filename || ''} ${s.rawTitle || ''}`));
        const withRemuxLang = (s, targetLang) => {
            if (!s?.url || !s.url.includes('/api/video-stream')) return null;
            const nextUrl = /[?&]lang=(?:vf|vo)/i.test(s.url)
                ? s.url.replace(/([?&])lang=(?:vf|vo)/i, `$1lang=${targetLang}`)
                : `${s.url}&lang=${targetLang}`;
            return { ...s, url: nextUrl, isFrench: targetLang === 'vf' };
        };

        if (lang === 'vf') {
            setCurrentAudioLang('vf');
            userPickedSubRef.current = false;
            if (!subtitlesAlwaysOnRef.current) {
                const forcedFr = subs.find(s => s.lang === 'fr' && s.forced && s.embedded);
                handleSelectSubtitle(forcedFr ? forcedFr.id : 'off', subs);
            }
            const vfStream =
                (availableStreams || []).find(s => s.isFrench && (s.isCached || s.verifiedReady) && !s.isDownloading && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
                (availableStreams || []).find(s => s.isFrench && (s.isCached || s.verifiedReady) && !s.isDownloading && !s.hasUnsupportedAudio) ||
                (availableStreams || []).find(s => s.isFrench && (s.isCached || s.verifiedReady) && !s.isDownloading && s.tierKey === '1080p') ||
                (availableStreams || []).find(s => s.isFrench && (s.isCached || s.verifiedReady) && !s.isDownloading) ||
                (availableStreams || []).find(s => s.isFrench && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
                (availableStreams || []).find(s => s.isFrench && !s.hasUnsupportedAudio) ||
                (availableStreams || []).find(s => s.isFrench && s.tierKey === '1080p') ||
                (availableStreams || []).find(s => s.isFrench) ||
                (isMultiStream(activeStream) ? withRemuxLang(activeStream, 'vf') : null);
            if (vfStream && vfStream.url !== activeStream?.url) {
                handleSelectStream(vfStream);
            }
        } else {
            const voStream =
                (availableStreams || []).find(s => !s.isFrench && (s.isCached || s.verifiedReady) && !s.isDownloading && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
                (availableStreams || []).find(s => !s.isFrench && (s.isCached || s.verifiedReady) && !s.isDownloading && !s.hasUnsupportedAudio) ||
                (availableStreams || []).find(s => !s.isFrench && (s.isCached || s.verifiedReady) && !s.isDownloading && s.tierKey === '1080p') ||
                (availableStreams || []).find(s => !s.isFrench && (s.isCached || s.verifiedReady) && !s.isDownloading) ||
                (availableStreams || []).find(s => !s.isFrench && !s.hasUnsupportedAudio && s.tierKey === '1080p') ||
                (availableStreams || []).find(s => !s.isFrench && !s.hasUnsupportedAudio) ||
                (availableStreams || []).find(s => !s.isFrench && s.tierKey === '1080p') ||
                (availableStreams || []).find(s => !s.isFrench) ||
                (isMultiStream(activeStream) ? withRemuxLang(activeStream, 'vo') : null);
            if (hasTrueVf && !voStream) return;
            setCurrentAudioLang('vo');
            userPickedSubRef.current = false;
            const frSub = subs.find(s => s.lang === 'fr' && !s.forced) || subs.find(s => s.lang === 'fr');
            if (frSub) handleSelectSubtitle(frSub.id, subs);
            if (voStream && voStream.url !== activeStream?.url) {
                handleSelectStream(voStream);
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
                const inFs = Boolean(
                    document.fullscreenElement ||
                    document.webkitFullscreenElement ||
                    videoRef.current?.webkitDisplayingFullscreen
                );
                if (key === 'Escape' && inFs) {
                    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
                    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                    else if (videoRef.current?.webkitExitFullscreen) videoRef.current.webkitExitFullscreen();
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
                    userPickedSubRef.current = true;
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
    }, [togglePlay, seekRelative, volume, handleVolumeChange, toggleFullscreen, toggleMute, handleClose, isTv, nextEpAvailable, handleNextEpisode, toggleSubtitles, handleMouseMove, closePanel]);

    // Fin de l'épisode : enchaîne automatiquement sur le suivant (si autoplayNext activé)
    const autoplayNextEnabled = currentProfile?.autoplayNext !== false;
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return undefined;
        const onEnded = () => {
            if (isTv && nextEpAvailable && autoplayNextEnabled) handleNextEpisode();
            else setControlsVisible(true);
        };
        video.addEventListener('ended', onEnded);
        return () => video.removeEventListener('ended', onEnded);
    }, [isTv, nextEpAvailable, autoplayNextEnabled, handleNextEpisode]);

    // Changement d'épisode : sauvegarde l'ancien puis repart proprement de zéro
    const goToEpisode = useCallback((s, e) => {
        setPanel(null);
        if (s === season && e === episode) return;
        resetEpisodeState();
        setSeason(s);
        setEpisode(e);
    }, [season, episode, resetEpisodeState]);

    const handleSelectStreamRef = useRef(handleSelectStream);
    handleSelectStreamRef.current = handleSelectStream;

    // Détection en temps réel du décodage audio : si la vidéo tourne depuis 2 s mais qu'aucun octet audio n'est décodé (ex. Chrome sur AC3/DTS),
    // bascule automatique et transparente vers une source au son garanti (même langue en priorité, sinon VOSTFR).
    useEffect(() => {
        if (streamState !== 'playing') return undefined;
        const video = videoRef.current;
        if (!video) return undefined;

        const key = `${id}-${season}-${episode}-audiocheck`;
        if (audioFallbackDoneRef.current === key) return undefined;

        const checkAudio = () => {
            // Respect absolu du choix manuel de l'utilisateur (qualité 4K ou piste spécifique)
            if (userPickedStreamRef.current) return;
            if (!video || video.paused || video.muted || (video.currentTime || 0) < 4 || (video.readyState || 0) < 3) return;
            const isSilentDecode = typeof video.webkitAudioDecodedByteCount === 'number' && video.webkitAudioDecodedByteCount === 0;
            const isMozSilent = typeof video.mozHasAudio === 'boolean' && !video.mozHasAudio;
            if (isSilentDecode || isMozSilent) {
                audioFallbackDoneRef.current = key;
                const isSafeToPlay = (s) => (!s.isAvi || s.isTranscoded) && !s.isDead;
                const safe = (availableStreams || []).find(s => s.id !== activeStream?.id && (s.isWebAudioSafe || !s.hasUnsupportedAudio) && (s.isCached || s.verifiedReady) && !s.isDownloading && isSafeToPlay(s) && Boolean(s.isFrench) === Boolean(activeStream?.isFrench))
                    || (availableStreams || []).find(s => s.id !== activeStream?.id && (s.isWebAudioSafe || !s.hasUnsupportedAudio) && (s.isCached || s.verifiedReady) && !s.isDownloading && isSafeToPlay(s));
                if (safe) {
                    console.log('[Altyflix Player] Flux muet détecté sans décodage audio, bascule automatique vers un flux sonore :', safe.qualityLabel || safe.quality);
                    handleSelectStreamRef.current(safe);
                }
            }
        };

        const timer = setInterval(checkAudio, 1500);
        return () => clearInterval(timer);
    }, [streamState, activeStream, availableStreams, id, season, episode]);

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
                            <div className="liquid-glass-pill grid h-24 w-24 place-items-center rounded-full player-flash">
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
                                            <button type="button" data-mute-button="" onClick={toggleMute} aria-label={isMuted ? 'Activer le son' : 'Couper le son'} title="Son (M)" className={iconBtn}>
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
                                            <button type="button" onClick={() => openPanel('episodes')} aria-label="Épisodes" title="Épisodes" aria-expanded={panel === 'episodes'} className={`${iconBtn} ${panel === 'episodes' ? 'liquid-glass-pill !text-white' : ''}`}>
                                                <NetflixEpisodesIcon className="h-8 w-8" />
                                            </button>
                                        )}
                                        <button type="button" onClick={() => openPanel('audio')} aria-label="Audio et sous-titres" title="Audio et sous-titres (C)" aria-expanded={panel === 'audio'} className={`${iconBtn} ${panel === 'audio' ? 'liquid-glass-pill !text-white' : ''}`}>
                                            <NetflixSubtitlesIcon className="h-8 w-8" />
                                        </button>
                                        <button type="button" onClick={() => openPanel('speed')} aria-label="Vitesse de lecture" title="Vitesse de lecture" aria-expanded={panel === 'speed'} className={`${iconBtn} ${panel === 'speed' ? 'liquid-glass-pill !text-white' : ''}`}>
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
                            className={`absolute z-40 flex items-center gap-2.5 rounded-full bg-white/95 px-6 py-3 text-sm font-bold text-black shadow-[0_14px_38px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,1)] backdrop-blur-xl transition-all duration-200 hover:scale-[1.03] hover:bg-white active:scale-95 cursor-pointer ${
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
                            onSelectSubtitle={(subId) => {
                                userPickedSubRef.current = true;
                                handleSelectSubtitle(subId);
                            }}
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
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                        {Boolean(activeStream?.directUrl || (typeof activeStream?.url === 'string' && activeStream.url.startsWith('http') && !activeStream.url.includes('/videos/downloading'))) && (
                            <a
                                href={activeStream.directUrl || activeStream.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded bg-red-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-red-700 transition"
                            >
                                Lire dans VLC / Télécharger
                            </a>
                        )}
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
