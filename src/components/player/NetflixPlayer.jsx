import { useState, useRef, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import EpisodeDrawer from '../common/EpisodeDrawer';
import { getSeasonDetails, getSeriesDetails } from '../../services/tmdb';
import { recordView } from '../../services/statsService';
import {
    NetflixBackIcon,
    NetflixEpisodesIcon,
    NetflixSubtitlesIcon,
    NetflixVolumeHighIcon,
    NetflixVolumeLowIcon,
    NetflixVolumeMuteIcon,
    NetflixPlayIcon,
    NetflixPauseIcon,
    NetflixRewind10Icon,
    NetflixForward10Icon,
    NetflixNextEpisodeIcon,
    NetflixHelpIcon,
    NetflixPipIcon,
    NetflixFullscreenIcon,
    NetflixExitFullscreenIcon
} from './NetflixIcons';

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    const h = Math.floor(m / 60);
    const min = m % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (h > 0) {
        return `${h}:${pad(min)}:${pad(sec)}`;
    }
    return `${pad(min)}:${pad(sec)}`;
}

function parseVttCues(vttText) {
    if (!vttText) return [];
    const cues = [];
    const blocks = vttText.replace(/\r\n|\r/g, '\n').split('\n\n');
    for (const block of blocks) {
        const lines = block.trim().split('\n');
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})/);
            if (m) {
                const toSec = (h, min, s, ms) => (h ? parseInt(h, 10) * 3600 : 0) + parseInt(min, 10) * 60 + parseInt(s, 10) + parseInt(ms, 10) / 1000;
                const start = toSec(m[1], m[2], m[3], m[4]);
                const end = toSec(m[5], m[6], m[7], m[8]);
                const text = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim();
                if (text && end > start) {
                    cues.push({ start, end, text });
                }
                break;
            }
        }
    }
    return cues;
}

export default function NetflixPlayer({
    content,
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
    const id = Number(content.id || content.contentId);

    // Navigation state
    const [season, setSeason] = useState(initialSeason);
    const [episode, setEpisode] = useState(initialEpisode);
    const [audioLang, setAudioLang] = useState('VOSTFR');
    const [tvDetails, setTvDetails] = useState(content);
    const [currentEpTitle, setCurrentEpTitle] = useState('');
    const [nextEpAvailable, setNextEpAvailable] = useState(false);

    // Player state
    const [streamState, setStreamState] = useState('loading'); // 'loading' | 'ready' | 'error'
    const [streamUrl, setStreamUrl] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [retryCount, setRetryCount] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [volume, setVolume] = useState(() => {
        const saved = localStorage.getItem('altyflix_vol');
        return saved !== null ? parseFloat(saved) : 1;
    });
    const [isMuted, setIsMuted] = useState(false);
    const [isPip, setIsPip] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);

    // UI overlays
    const [controlsVisible, setControlsVisible] = useState(true);
    const [showDrawer, setShowDrawer] = useState(false);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showAudioMenu, setShowAudioMenu] = useState(false);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);

    // Scrubber hover state
    const [hoverPercent, setHoverPercent] = useState(null);
    const [hoverTime, setHoverTime] = useState(0);

    // Subtitle tracks
    const [subtitles, setSubtitles] = useState([]);
    const [selectedSubIndex, setSelectedSubIndex] = useState(-1);
    const [parsedCues, setParsedCues] = useState([]);
    const [currentSubtitleText, setCurrentSubtitleText] = useState('');
    const parsedCuesRef = useRef([]);
    const selectedSubIndexRef = useRef(-1);
    const currentSubTextRef = useRef('');
    const hasAutoSelectedSubRef = useRef(false);
    const userDisabledSubsRef = useRef(false);

    // Audio tracks (HLS embedded multi-track audio)
    const [audioTracks, setAudioTracks] = useState([]);
    const [selectedAudioTrack, setSelectedAudioTrack] = useState(0);

    // References
    const containerRef = useRef(null);
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const hideTimeoutRef = useRef(null);
    const lastSaveRef = useRef(0);
    const hasRecordedView = useRef(false);
    const timelineRef = useRef(null);
    const isDraggingRef = useRef(false);

    const title = content.title || content.name || 'Lecture';

    // Fetch TV show details and episode title
    useEffect(() => {
        let live = true;
        if (isTv) {
            getSeriesDetails(id).then(d => { if (live) setTvDetails(d); }).catch(() => {});
            getSeasonDetails(id, season).then(data => {
                if (!live) return;
                const ep = data?.episodes?.find(e => e.episode_number === episode);
                if (ep && ep.name) setCurrentEpTitle(ep.name);
                const hasNext = data?.episodes?.some(e => e.episode_number > episode) ||
                    Boolean(tvDetails?.seasons?.some(s => s.season_number > season));
                setNextEpAvailable(hasNext);
            }).catch(() => {});
        }
        return () => { live = false; };
    }, [isTv, id, season, episode, tvDetails?.seasons]);

    // Stream resolver from /api/direct-stream — native player only, no fallback
    useEffect(() => {
        const ctrl = new AbortController();
        let live = true;
        setStreamState('loading');
        setErrorMessage('');

        const params = new URLSearchParams({
            id: String(id),
            type: isTv ? 'tv' : 'movie',
            season: String(season),
            episode: String(episode),
            lang: audioLang.toLowerCase()
        });

        fetch(`/api/direct-stream?${params.toString()}`, { signal: ctrl.signal, cache: 'no-store' })
            .then(res => res.json())
            .then(data => {
                if (!live) return;
                if (data.success && data.streamUrl) {
                    setStreamUrl(data.streamUrl);
                    if (Array.isArray(data.captions) && data.captions.length > 0) {
                        setSubtitles(prev => {
                            const existingUrls = new Set(prev.map(s => s.url));
                            const newTracks = data.captions
                                .filter(c => c.url && !existingUrls.has(c.url))
                                .map((c, idx) => ({
                                    id: `cap-${idx}`,
                                    label: c.language || 'Français',
                                    lang: (c.language || '').toLowerCase().includes('fran') ? 'fr' : 'en',
                                    url: `/api/subtitles-vtt?url=${encodeURIComponent(c.url)}`
                                }));
                            return [...prev, ...newTracks];
                        });
                    }
                    setStreamState('ready');
                } else {
                    setErrorMessage('Ce titre n\'est pas encore disponible en streaming. La source est temporairement inaccessible.');
                    setStreamState('error');
                }
            })
            .catch(err => {
                if (!live || err.name === 'AbortError') return;
                setErrorMessage('Impossible de charger le flux vidéo. Vérifiez votre connexion ou réessayez plus tard.');
                setStreamState('error');
            });

        return () => {
            live = false;
            ctrl.abort();
        };
    }, [id, isTv, season, episode, audioLang, retryCount]);

    // Fetch external French & English subtitles from API
    useEffect(() => {
        let live = true;
        const subParams = new URLSearchParams({
            id: String(id),
            type: isTv ? 'tv' : 'movie',
            season: String(season),
            episode: String(episode)
        });

        fetch(`/api/subtitles?${subParams.toString()}`)
            .then(res => res.json())
            .then(data => {
                if (!live) return;
                if (data.success && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
                    setSubtitles(prev => {
                        const existingUrls = new Set(prev.map(s => s.url));
                        const newTracks = data.subtitles
                            .filter(s => !existingUrls.has(s.url))
                            .map((s, idx) => ({
                                id: `ext-${idx}`,
                                label: s.label || (s.lang === 'fr' ? 'Français' : 'English'),
                                lang: s.lang || 'fr',
                                url: s.url
                            }));
                        return [...prev, ...newTracks];
                    });
                }
            })
            .catch(() => {});

        return () => { live = false; };
    }, [id, isTv, season, episode]);

    // Reset auto-selected flag when title or episode changes
    useEffect(() => {
        hasAutoSelectedSubRef.current = false;
    }, [id, season, episode]);

    // Auto-enable French subtitles on initial load so VO content has French subtitles by default (unless user explicitly disabled them)
    useEffect(() => {
        if (subtitles.length === 0) return;
        if (hasAutoSelectedSubRef.current || userDisabledSubsRef.current) return;

        const frIdx = subtitles.findIndex(s => s.lang === 'fr' || (s.label || '').toLowerCase().includes('fran'));
        hasAutoSelectedSubRef.current = true;
        if (frIdx !== -1) {
            setSelectedSubIndex(frIdx);
            selectedSubIndexRef.current = frIdx;
        } else if (subtitles.length > 0) {
            setSelectedSubIndex(0);
            selectedSubIndexRef.current = 0;
        }
    }, [subtitles]);

    // Fetch & parse WebVTT cues for custom Netflix overlay rendering
    useEffect(() => {
        selectedSubIndexRef.current = selectedSubIndex;
        if (selectedSubIndex < 0 || !subtitles[selectedSubIndex]?.url) {
            setParsedCues([]);
            parsedCuesRef.current = [];
            currentSubTextRef.current = '';
            setCurrentSubtitleText('');
            return;
        }
        let active = true;
        fetch(subtitles[selectedSubIndex].url)
            .then(res => res.text())
            .then(text => {
                if (!active) return;
                const cues = parseVttCues(text);
                setParsedCues(cues);
                parsedCuesRef.current = cues;
            })
            .catch(() => {
                if (active) {
                    setParsedCues([]);
                    parsedCuesRef.current = [];
                }
            });
        return () => { active = false; };
    }, [selectedSubIndex, subtitles]);

    // Update displayed subtitle text dynamically with sub-second accuracy
    useEffect(() => {
        if (selectedSubIndex < 0 || parsedCues.length === 0) {
            if (currentSubtitleText) {
                currentSubTextRef.current = '';
                setCurrentSubtitleText('');
            }
            return;
        }
        const activeCue = parsedCues.find(c => currentTime >= c.start && currentTime <= c.end);
        const text = activeCue ? activeCue.text : '';
        if (text !== currentSubtitleText) {
            currentSubTextRef.current = text;
            setCurrentSubtitleText(text);
        }
    }, [currentTime, parsedCues, selectedSubIndex, currentSubtitleText]);

    // Keep native text tracks hidden so only our Netflix overlay renders
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !video.textTracks) return;
        for (let i = 0; i < video.textTracks.length; i++) {
            video.textTracks[i].mode = 'hidden';
        }
        if (hlsRef.current) {
            hlsRef.current.subtitleTrack = -1;
        }
    }, [selectedSubIndex, subtitles]);

    // HLS video attachment
    useEffect(() => {
        if (streamState !== 'ready' || !streamUrl || !videoRef.current) return;
        const video = videoRef.current;
        let hls = null;

        // Resume position from current position or history
        const saved = watchHistory.find(h =>
            String(h.contentId || h.id) === String(id) &&
            (!isTv || (Number(h.season) === season && Number(h.episode) === episode))
        );
        const startPos = currentTime > 0
            ? currentTime
            : ((saved?.progress < 90 && saved?.lastWatchedPosition) ? Number(saved.lastWatchedPosition) : 0);

        const isHls = streamUrl.includes('.m3u8');
        if (isHls && Hls.isSupported()) {
            hls = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                capLevelToPlayerSize: false, // Forcer la résolution maximale sans bridage
                backBufferLength: 90,
                maxBufferLength: 60,
                maxMaxBufferLength: 120,
                startLevel: -1, // Auto-démarre puis lock le meilleur
                startPosition: startPos > 0 ? startPos : -1
            });
            hlsRef.current = hls;
            hls.loadSource(streamUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                // Verrouiller la meilleure qualité disponible (1080p / 4K)
                if (hls.levels && hls.levels.length > 0) {
                    const highestLevel = hls.levels.length - 1;
                    hls.currentLevel = highestLevel;
                }
                if (hls.audioTracks?.length) {
                    setAudioTracks(hls.audioTracks.map((t, idx) => ({
                        id: idx,
                        name: t.name || t.lang || `Piste ${idx + 1}`,
                        lang: t.lang || ''
                    })));
                    if (audioLang.toLowerCase().includes('vo') || preferredLang.toUpperCase().includes('VO')) {
                        const voIdx = hls.audioTracks.findIndex(t => !['fr', 'fra', 'fre'].includes((t.lang || '').toLowerCase()));
                        if (voIdx !== -1) {
                            hls.audioTrack = voIdx;
                            setSelectedAudioTrack(voIdx);
                        } else {
                            setSelectedAudioTrack(hls.audioTrack);
                        }
                    } else {
                        setSelectedAudioTrack(hls.audioTrack);
                    }
                }
                if (hls.subtitleTracks?.length) {
                    setSubtitles(hls.subtitleTracks.map((t, idx) => ({
                        id: idx,
                        label: t.name || t.lang || `Piste ${idx + 1}`
                    })));
                }
                setIsBuffering(false);
                video.play().catch(() => {
                    video.muted = true;
                    setIsMuted(true);
                    video.play().catch(() => {});
                });
            });

            hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
                if (hls.audioTracks?.length) {
                    setAudioTracks(hls.audioTracks.map((t, idx) => ({
                        id: idx,
                        name: t.name || t.lang || `Piste ${idx + 1}`,
                        lang: t.lang || ''
                    })));
                    setSelectedAudioTrack(hls.audioTrack);
                }
            });

            hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) => {
                setSelectedAudioTrack(data.id);
            });

            hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
                if (hls.subtitleTracks?.length) {
                    setSubtitles(hls.subtitleTracks.map((t, idx) => ({
                        id: idx,
                        label: t.name || t.lang || `Piste ${idx + 1}`
                    })));
                }
            });

            hls.on(Hls.Events.ERROR, (_, data) => {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            if (!hls._retryCount) hls._retryCount = 0;
                            hls._retryCount++;
                            if (hls._retryCount <= 3) {
                                setTimeout(() => hls.startLoad(), 1000 * hls._retryCount);
                            } else {
                                hls.destroy();
                                setStreamState('error');
                                setErrorMessage('Flux momentanément indisponible. Réessayez.');
                            }
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hls.recoverMediaError();
                            break;
                        default:
                            hls.destroy();
                            setStreamState('error');
                            setErrorMessage('Erreur de lecture du flux.');
                            break;
                    }
                }
            });
        } else {
            video.src = streamUrl;
            if (startPos > 0) video.currentTime = startPos;
            video.play().catch(() => {});
        }

        return () => {
            if (hls) {
                hls.destroy();
                hlsRef.current = null;
            }
        };
    }, [streamState, streamUrl]);

    // Handle HTML5 Video Events
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onPlay = () => {
            setIsPlaying(true);
            if (!hasRecordedView.current) {
                hasRecordedView.current = true;
                recordView(id, isTv ? 'tv' : 'movie');
            }
        };
        const onPause = () => setIsPlaying(false);
        const onWaiting = () => setIsBuffering(true);
        const onPlaying = () => setIsBuffering(false);
        const onTimeUpdate = () => {
            const ct = video.currentTime;
            setCurrentTime(ct);
            if (parsedCuesRef.current.length > 0 && selectedSubIndexRef.current >= 0) {
                const cue = parsedCuesRef.current.find(c => ct >= c.start && ct <= c.end);
                const newText = cue ? cue.text : '';
                if (newText !== currentSubTextRef.current) {
                    currentSubTextRef.current = newText;
                    setCurrentSubtitleText(newText);
                }
            }
            // Save progress every 10s
            if (remember && video.duration && Date.now() - lastSaveRef.current > 10000) {
                lastSaveRef.current = Date.now();
                const pct = Math.min(100, (video.currentTime / video.duration) * 100);
                remember(
                    { ...content, media_type: isTv ? 'tv' : 'movie' },
                    isTv ? season : null,
                    isTv ? episode : null,
                    pct,
                    video.currentTime
                );
            }
        };
        const onProgress = () => {
            if (video.buffered.length > 0) {
                const end = video.buffered.end(video.buffered.length - 1);
                setBuffered(end);
            }
        };
        const onLoadedMetadata = () => {
            setDuration(video.duration || 0);
            video.volume = volume;
            video.muted = isMuted;
        };
        const onEnded = () => {
            setIsPlaying(false);
            if (isTv && nextEpAvailable) {
                handleNextEpisode();
            }
        };
        const onEnterPip = () => setIsPip(true);
        const onLeavePip = () => setIsPip(false);

        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('waiting', onWaiting);
        video.addEventListener('playing', onPlaying);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('progress', onProgress);
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('ended', onEnded);
        video.addEventListener('enterpictureinpicture', onEnterPip);
        video.addEventListener('leavepictureinpicture', onLeavePip);

        return () => {
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('waiting', onWaiting);
            video.removeEventListener('playing', onPlaying);
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('progress', onProgress);
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('ended', onEnded);
            video.removeEventListener('enterpictureinpicture', onEnterPip);
            video.removeEventListener('leavepictureinpicture', onLeavePip);
        };
    }, [content, episode, id, isMuted, isTv, nextEpAvailable, remember, season, volume]);

    // Inactivity timer for fading controls & hiding cursor everywhere
    const resetControlsTimeout = useCallback(() => {
        setControlsVisible(true);
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        if (!showDrawer && !showShortcuts && !showAudioMenu) {
            hideTimeoutRef.current = setTimeout(() => {
                setControlsVisible(false);
                setShowVolumeSlider(false);
            }, 2500);
        }
    }, [showDrawer, showShortcuts, showAudioMenu]);

    // Force cursor: none on full document when controls hide during playback
    useEffect(() => {
        const shouldHideCursor = !controlsVisible && isPlaying;
        if (shouldHideCursor) {
            document.documentElement.style.cursor = 'none';
            document.body.style.cursor = 'none';
            if (containerRef.current) containerRef.current.style.cursor = 'none';
        } else {
            document.documentElement.style.cursor = '';
            document.body.style.cursor = '';
            if (containerRef.current) containerRef.current.style.cursor = '';
        }
        return () => {
            document.documentElement.style.cursor = '';
            document.body.style.cursor = '';
        };
    }, [controlsVisible, isPlaying]);

    useEffect(() => {
        const handleActivity = () => resetControlsTimeout();

        window.addEventListener('mousemove', handleActivity, { passive: true });
        window.addEventListener('mousedown', handleActivity, { passive: true });
        window.addEventListener('keydown', handleActivity, { passive: true });
        window.addEventListener('touchstart', handleActivity, { passive: true });

        return () => {
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('mousedown', handleActivity);
            window.removeEventListener('keydown', handleActivity);
            window.removeEventListener('touchstart', handleActivity);
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        };
    }, [resetControlsTimeout]);

    // Keyboard Shortcuts
    useEffect(() => {
        const onKeyDown = (e) => {
            if (['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return;
            resetControlsTimeout();

            switch (e.key) {
                case ' ':
                case 'k':
                case 'K':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'ArrowLeft':
                case 'j':
                case 'J':
                    e.preventDefault();
                    seekOffset(-10);
                    break;
                case 'ArrowRight':
                case 'l':
                case 'L':
                    e.preventDefault();
                    seekOffset(10);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    changeVolume(0.1);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    changeVolume(-0.1);
                    break;
                case 'm':
                case 'M':
                    e.preventDefault();
                    toggleMute();
                    break;
                case 'c':
                case 'C':
                    e.preventDefault();
                    toggleSubtitles();
                    break;
                case 'f':
                case 'F':
                    e.preventDefault();
                    toggleFullscreen();
                    break;
                case '?':
                    e.preventDefault();
                    setShowShortcuts(s => !s);
                    break;
                case 'Escape':
                    if (showDrawer) {
                        setShowDrawer(false);
                    } else if (showShortcuts) {
                        setShowShortcuts(false);
                    } else if (showAudioMenu) {
                        setShowAudioMenu(false);
                    } else if (!document.fullscreenElement) {
                        handleClose();
                    }
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    });

    // Control actions
    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            video.play().catch(() => {});
        } else {
            video.pause();
        }
    };

    const seekOffset = (seconds) => {
        const video = videoRef.current;
        if (!video || !duration) return;
        video.currentTime = Math.max(0, Math.min(duration, video.currentTime + seconds));
    };

    const changeVolume = (delta) => {
        const video = videoRef.current;
        if (!video) return;
        const newVol = Math.max(0, Math.min(1, volume + delta));
        setVolume(newVol);
        video.volume = newVol;
        if (newVol > 0 && isMuted) {
            setIsMuted(false);
            video.muted = false;
        }
        localStorage.setItem('altyflix_vol', String(newVol));
    };

    const handleVolumeSliderChange = (e) => {
        const newVol = parseFloat(e.target.value);
        setVolume(newVol);
        if (videoRef.current) {
            videoRef.current.volume = newVol;
            if (newVol > 0 && isMuted) {
                setIsMuted(false);
                videoRef.current.muted = false;
            }
        }
        localStorage.setItem('altyflix_vol', String(newVol));
    };

    const toggleMute = () => {
        const video = videoRef.current;
        if (!video) return;
        const nextMute = !isMuted;
        setIsMuted(nextMute);
        video.muted = nextMute;
    };

    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
        } else {
            document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
        }
    };

    const togglePip = async () => {
        const video = videoRef.current;
        if (!video) return;
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (document.pictureInPictureEnabled && !video.disablePictureInPicture) {
                await video.requestPictureInPicture();
            }
        } catch (e) {
            console.warn('PiP error:', e);
        }
    };

    const handleNextEpisode = async () => {
        if (!isTv) return;
        try {
            const list = await getSeasonDetails(id, season);
            const ep = list.episodes?.find(e => e.episode_number > episode);
            if (ep) {
                setEpisode(ep.episode_number);
                return;
            }
            const nextSeason = tvDetails.seasons?.filter(s => s.season_number > season).sort((a, b) => a.season_number - b.season_number)[0];
            if (nextSeason) {
                setSeason(nextSeason.season_number);
                setEpisode(1);
                return;
            }
        } catch (err) {
            console.error('Failed to change episode:', err);
        }
        if (onNext) onNext();
    };

    const handleClose = () => {
        const video = videoRef.current;
        if (video && remember && video.duration) {
            const pct = Math.min(100, (video.currentTime / video.duration) * 100);
            remember(
                { ...content, media_type: isTv ? 'tv' : 'movie' },
                isTv ? season : null,
                isTv ? episode : null,
                pct,
                video.currentTime
            );
        }
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
        if (onClose) onClose();
    };

    // Scrubber drag / click logic
    const handleTimelineMouseMove = (e) => {
        if (!timelineRef.current || !duration) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        setHoverPercent(pos * 100);
        setHoverTime(pos * duration);
    };

    const handleTimelineMouseLeave = () => {
        if (!isDraggingRef.current) {
            setHoverPercent(null);
        }
    };

    const handleTimelineSeek = (e) => {
        if (!timelineRef.current || !duration || !videoRef.current) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const newTime = pos * duration;
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
    };

    const handleAudioTrackSelect = (trackId) => {
        if (hlsRef.current && trackId !== undefined) {
            hlsRef.current.audioTrack = trackId;
            setSelectedAudioTrack(trackId);
        }
        setShowAudioMenu(false);
    };

    const handleVersionSwitch = (lang) => {
        if (lang === audioLang) return;
        setAudioLang(lang);
        setStreamState('loading');
        setShowAudioMenu(false);
    };

    const handleSubSelect = (numericIdx) => {
        const idx = Number(numericIdx);
        userDisabledSubsRef.current = (idx === -1);
        setSelectedSubIndex(idx);
        selectedSubIndexRef.current = idx;
        if (idx === -1) {
            currentSubTextRef.current = '';
            setCurrentSubtitleText('');
            setParsedCues([]);
            parsedCuesRef.current = [];
        }
        if (hlsRef.current) {
            hlsRef.current.subtitleTrack = -1;
        }
        const video = videoRef.current;
        if (video && video.textTracks) {
            for (let i = 0; i < video.textTracks.length; i++) {
                video.textTracks[i].mode = 'hidden';
            }
        }
        setShowAudioMenu(false);
    };

    const toggleSubtitles = () => {
        if (subtitles.length === 0) return;
        if (selectedSubIndex >= 0) {
            handleSubSelect(-1);
        } else {
            const frIdx = subtitles.findIndex(s => s.lang === 'fr' || (s.label || '').toLowerCase().includes('fran'));
            handleSubSelect(frIdx !== -1 ? frIdx : 0);
        }
    };

    const handleSpeedSelect = (spd) => {
        setPlaybackSpeed(spd);
        if (videoRef.current) {
            videoRef.current.playbackRate = spd;
        }
        setShowSpeedMenu(false);
    };

    const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
    const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;
    const remainingTime = duration > 0 ? Math.max(0, duration - currentTime) : 0;

    return (
        <div
            ref={containerRef}
            className={`fixed inset-0 z-[300] bg-black select-none overflow-hidden font-sans transition-all duration-300 ${
                !controlsVisible && isPlaying ? 'cursor-none [&_*]:cursor-none' : 'cursor-default'
            }`}
        >
            {/* Global style injection: Full screen cursor, zero white outline & Netflix Subtitles styling */}
            <style dangerouslySetInnerHTML={{ __html: `
                *, *::before, *::after {
                    -webkit-tap-highlight-color: transparent !important;
                    outline: none !important;
                }
                button:focus, button:active, button:focus-visible {
                    outline: none !important;
                    box-shadow: none !important;
                    border: none !important;
                }
                /* Official Netflix Subtitle Styling (matches user screenshot) */
                ::cue, video::cue {
                    background-color: transparent !important;
                    background: transparent !important;
                    color: #ffffff !important;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
                    font-size: 1.55rem !important;
                    font-weight: 600 !important;
                    text-shadow: 0 0 4px #000, 0 0 8px #000, 1px 1px 2px #000, -1px -1px 2px #000, 0 2px 5px rgba(0,0,0,0.9) !important;
                    line-height: 1.35 !important;
                }
                ${!controlsVisible && isPlaying ? `
                    *, *::before, *::after, video, iframe, html, body, :fullscreen, :-webkit-full-screen {
                        cursor: none !important;
                    }
                ` : ''}
            `}} />
            {/* Player Viewport (Native Video Player) */}
                <video
                    ref={videoRef}
                    className="w-full h-full object-contain bg-black cursor-pointer"
                    playsInline
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    onClick={togglePlay}
                    onDoubleClick={toggleFullscreen}
                />

            {/* Spinner Overlay - Pure Netflix Circular Loader */}
            {(streamState === 'loading' || (isBuffering && isPlaying && streamState === 'ready')) && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 z-20 transition-opacity duration-300">
                    <div className="relative w-16 h-16 flex items-center justify-center">
                        <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
                        <div className="absolute inset-0 border-4 border-[#e50914] rounded-full animate-spin border-t-transparent shadow-[0_0_25px_rgba(229,9,20,0.7)]" />
                    </div>
                </div>
            )}

            {/* Error Overlay */}
            {streamState === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-25 text-center p-6">
                    <div className="w-16 h-16 rounded-full bg-red-500/20 text-[#e50914] flex items-center justify-center text-3xl font-bold mb-4">
                        ✕
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Lecture impossible</h3>
                    <p className="text-gray-400 text-sm max-w-md mb-6">{errorMessage}</p>
                    <div className="flex gap-4">
                        <button
                            onClick={() => setRetryCount(c => c + 1)}
                            className="px-6 py-2.5 rounded bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition-all"
                        >
                            Réessayer
                        </button>
                        <button
                            onClick={handleClose}
                            className="px-6 py-2.5 rounded bg-[#e50914] hover:bg-[#b80710] text-white font-semibold text-sm transition-all"
                        >
                            Retour au catalogue
                        </button>
                    </div>
                </div>
            )}

            {/* Pop-Out Player (PiP) Overlay - Mode fenêtre flottante */}
            {isPip && (
                <div className="absolute inset-0 bg-black/85 z-30 flex flex-col items-center justify-center text-center px-6">
                    <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-6">
                        Lecture en fenêtre flottante
                    </h2>
                    <ul className="text-gray-300 text-sm md:text-base space-y-2 mb-4 text-left max-w-md mx-auto list-disc pl-5">
                        <li>Poursuivez vos activités : la vidéo reste au premier plan au-dessus de vos fenêtres.</li>
                        <li>Pour la redimensionner, étirez les coins de la fenêtre flottante.</li>
                        <li>Pour revenir, cliquez sur la croix du lecteur flottant ou sur le bouton ci-dessous.</li>
                    </ul>
                    <p className="text-xs md:text-sm text-gray-400 mb-8 italic">
                        Remarque : les sous-titres ne sont pas supportés dans le lecteur flottant natif.
                    </p>
                    <button
                        onClick={togglePip}
                        className="px-8 py-3 bg-white text-black font-bold text-base rounded-full hover:bg-gray-200 transition-all transform hover:scale-105 active:scale-95 shadow-xl"
                    >
                        Revenir ici
                    </button>
                </div>
            )}

            {/* Netflix Custom Subtitles Overlay — Positioned above controls (bottom-28 md:bottom-36) or bottom-12 md:bottom-16 when hidden / fullscreen */}
            {selectedSubIndex >= 0 && currentSubtitleText && (
                <div
                    className={`pointer-events-none absolute inset-x-0 flex justify-center z-45 transition-all duration-200 select-none px-6 ${
                        controlsVisible ? 'bottom-28 md:bottom-36' : 'bottom-12 md:bottom-16'
                    }`}
                >
                    <div
                        className="max-w-[85%] text-center px-4 py-1.5 font-bold text-white text-lg sm:text-xl md:text-2xl lg:text-[28px] leading-snug tracking-wide bg-black/40 backdrop-blur-[0.5px] rounded"
                        style={{
                            fontFamily: 'Netflix Sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
                            textShadow: '0 0 4px #000, 0 0 6px #000, 2px 2px 2px #000, -2px -2px 2px #000, 2px -2px 2px #000, -2px 2px 2px #000, 0 4px 8px rgba(0,0,0,0.95)',
                            whiteSpace: 'pre-line'
                        }}
                    >
                        {currentSubtitleText}
                    </div>
                </div>
            )}

            {/* Top Bar - Exact Netflix Desktop: Only Back Arrow on Top-Left */}
            <div
                className={`absolute top-0 inset-x-0 pt-6 pb-12 px-8 z-40 flex items-center justify-between transition-opacity duration-300 bg-gradient-to-b from-black/80 via-black/25 to-transparent pointer-events-none ${
                    controlsVisible ? 'opacity-100' : 'opacity-0'
                }`}
            >
                <button
                    onClick={handleClose}
                    className="pointer-events-auto text-white/80 hover:text-white transition-opacity duration-150 outline-none focus:outline-none p-1 cursor-pointer"
                    title="Retour"
                    aria-label="Retour"
                >
                    <NetflixBackIcon className="w-8 h-8 md:w-9 md:h-9 drop-shadow" />
                </button>
            </div>

            {/* Bottom Bar - Official Netflix PC Desktop 2-Row Layout */}
            <div
                className={`absolute inset-x-0 bottom-0 pb-7 pt-16 px-8 z-40 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300 flex flex-col space-y-3.5 ${
                    controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
            >
                {/* Row 1: Scrubber Timeline with Remaining Time on Far Right */}
                <div className="flex items-center space-x-4 w-full">
                    <div
                        ref={timelineRef}
                        className="relative flex-1 py-2 cursor-pointer group select-none flex items-center"
                        onMouseMove={handleTimelineMouseMove}
                        onMouseLeave={handleTimelineMouseLeave}
                        onClick={handleTimelineSeek}
                    >
                        {/* Hover Time Tooltip */}
                        {hoverPercent !== null && (
                            <div
                                className="absolute -top-8 -translate-x-1/2 px-2.5 py-1 rounded bg-[#141414] border border-white/20 text-xs font-bold text-white pointer-events-none drop-shadow-lg shadow-black/80"
                                style={{ left: `${hoverPercent}%` }}
                            >
                                {formatTime(hoverTime)}
                            </div>
                        )}

                        {/* Progress Bar Track */}
                        <div className="relative w-full h-[4px] group-hover:h-[6px] bg-white/25 rounded-full transition-all duration-150">
                            {/* Buffered Bar */}
                            <div
                                className="absolute top-0 left-0 bottom-0 bg-white/40 rounded-full"
                                style={{ width: `${bufferedPercent}%` }}
                            />
                            {/* Played Bar */}
                            <div
                                className="absolute top-0 left-0 bottom-0 bg-[#E50914] rounded-full"
                                style={{ width: `${currentPercent}%` }}
                            />
                            {/* Red Circle Scrubber Thumb */}
                            <div
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 group-hover:w-4 group-hover:h-4 bg-[#E50914] rounded-full shadow-[0_0_10px_rgba(229,9,20,0.95)] transition-all duration-150"
                                style={{ left: `${currentPercent}%` }}
                            />
                        </div>
                    </div>

                    {/* Remaining Time on Far Right (Exact Match to Netflix: "40:09") */}
                    <div className="text-xs md:text-sm font-semibold text-white/90 select-none whitespace-nowrap pl-2 drop-shadow">
                        {formatTime(Math.max(0, duration - currentTime))}
                    </div>
                </div>

                {/* Row 2: Controls Row (Left Controls & Right Controls) */}
                <div className="flex items-center justify-between">
                    {/* Left Controls: Play/Pause, Rewind 10, Forward 10, Volume Speaker + Slider, Show & Episode Title */}
                    <div className="flex items-center space-x-3 sm:space-x-4 md:space-x-5 text-white">
                        {/* Play / Pause Toggle Button */}
                        <button
                            onClick={togglePlay}
                            className="text-white hover:text-white/80 transition-transform active:scale-95 flex items-center justify-center outline-none focus:outline-none p-1 cursor-pointer"
                            title={isPlaying ? 'Pause (Espace)' : 'Lecture (Espace)'}
                            aria-label={isPlaying ? 'Pause' : 'Lecture'}
                        >
                            {isPlaying ? (
                                <NetflixPauseIcon className="w-8 h-8 md:w-9 md:h-9 drop-shadow" />
                            ) : (
                                <NetflixPlayIcon className="w-8 h-8 md:w-9 md:h-9 ml-0.5 drop-shadow" />
                            )}
                        </button>

                        {/* Rewind 10s */}
                        <button
                            onClick={() => seekOffset(-10)}
                            className="text-white hover:text-white/80 transition-transform active:scale-95 flex items-center justify-center outline-none focus:outline-none p-1 cursor-pointer"
                            title="Reculer de 10 secondes (Gauche)"
                            aria-label="Reculer de 10 secondes"
                        >
                            <NetflixRewind10Icon className="w-8 h-8 md:w-8.5 md:h-8.5 drop-shadow" />
                        </button>

                        {/* Forward 10s */}
                        <button
                            onClick={() => seekOffset(10)}
                            className="text-white hover:text-white/80 transition-transform active:scale-95 flex items-center justify-center outline-none focus:outline-none p-1 cursor-pointer"
                            title="Avancer de 10 secondes (Droite)"
                            aria-label="Avancer de 10 secondes"
                        >
                            <NetflixForward10Icon className="w-8 h-8 md:w-8.5 md:h-8.5 drop-shadow" />
                        </button>

                        {/* Volume Speaker & Hover Slider */}
                        <div
                            className="relative flex items-center space-x-2"
                            onMouseEnter={() => setShowVolumeSlider(true)}
                            onMouseLeave={() => setShowVolumeSlider(false)}
                        >
                            <button
                                onClick={toggleMute}
                                className="text-white hover:text-white/80 transition-transform active:scale-95 outline-none focus:outline-none p-1 cursor-pointer"
                                title={isMuted ? 'Activer le son (M)' : 'Couper le son (M)'}
                                aria-label="Volume"
                            >
                                {isMuted || volume === 0 ? (
                                    <NetflixVolumeMuteIcon className="w-7 h-7 md:w-8 md:h-8 drop-shadow" />
                                ) : volume < 0.5 ? (
                                    <NetflixVolumeLowIcon className="w-7 h-7 md:w-8 md:h-8 drop-shadow" />
                                ) : (
                                    <NetflixVolumeHighIcon className="w-7 h-7 md:w-8 md:h-8 drop-shadow" />
                                )}
                            </button>

                            <div
                                className={`overflow-hidden transition-all duration-200 flex items-center ${
                                    showVolumeSlider ? 'w-24 opacity-100 ml-1' : 'w-0 opacity-0 pointer-events-none'
                                }`}
                            >
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={isMuted ? 0 : volume}
                                    onChange={handleVolumeSliderChange}
                                    className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-[#E50914] outline-none"
                                />
                            </div>
                        </div>

                        {/* Title & Season / Episode Info (Matching Image 2: "The Office (U.S.) S9:E16 Moving On") */}
                        <div className="flex items-center space-x-2 pl-2 select-none text-white">
                            <span className="font-bold text-sm md:text-base tracking-tight drop-shadow truncate max-w-[180px] sm:max-w-[280px] md:max-w-[420px]">
                                {title}
                            </span>
                            {isTv && (
                                <span className="text-gray-300 text-xs md:text-sm font-normal drop-shadow truncate">
                                    S{season}:E{episode} {currentEpTitle ? `"${currentEpTitle}"` : ''}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Right Controls: Help (?), Next Ep, Episodes, Audio & Subtitles, Fullscreen (Exact order in Image 2) */}
                    <div className="flex items-center space-x-4 md:space-x-5 text-white">
                        {/* Help / Shortcuts (?) */}
                        <button
                            onClick={() => setShowShortcuts(true)}
                            className="text-white hover:text-white/80 transition-transform active:scale-90 outline-none focus:outline-none p-1 cursor-pointer"
                            title="Raccourcis clavier (?)"
                            aria-label="Aide"
                        >
                            <NetflixHelpIcon className="w-7 h-7 md:w-8 md:h-8 drop-shadow" />
                        </button>

                        {/* Next Episode Button */}
                        {isTv && nextEpAvailable && (
                            <button
                                onClick={handleNextEpisode}
                                className="text-white hover:text-white/80 transition-transform active:scale-90 outline-none focus:outline-none p-1 cursor-pointer"
                                title="Épisode suivant (N)"
                                aria-label="Épisode suivant"
                            >
                                <NetflixNextEpisodeIcon className="w-7 h-7 md:w-8 md:h-8 drop-shadow" />
                            </button>
                        )}

                        {/* Episodes Drawer Toggle */}
                        {isTv && (
                            <button
                                onClick={() => setShowDrawer(true)}
                                className="text-white hover:text-white/80 transition-transform active:scale-90 outline-none focus:outline-none p-1 cursor-pointer"
                                title="Liste des épisodes"
                                aria-label="Liste des épisodes"
                            >
                                <NetflixEpisodesIcon className="w-7 h-7 md:w-8 md:h-8 drop-shadow" />
                            </button>
                        )}

                        {/* Audio & Subtitles Dialog Toggle */}
                        <div className="relative">
                            <button
                                onClick={() => { setShowAudioMenu(m => !m); setShowSpeedMenu(false); }}
                                className={`transition-transform active:scale-90 outline-none focus:outline-none ${
                                    showAudioMenu ? 'text-[#E50914]' : 'text-white hover:text-white/80'
                                }`}
                                title="Audio et sous-titres"
                                aria-label="Audio et sous-titres"
                            >
                                <NetflixSubtitlesIcon className="w-7 h-7 drop-shadow" />
                            </button>

                            {/* Netflix Audio & Subtitles Popover - Opens Above Control Bar */}
                            {showAudioMenu && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40 bg-transparent cursor-default"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowAudioMenu(false);
                                        }}
                                    />
                                    <div className="absolute right-0 bottom-12 w-80 bg-[#141414]/98 border border-white/10 rounded-md shadow-2xl p-5 text-sm backdrop-blur-2xl z-50">
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Audio Column */}
                                        <div>
                                            <h4 className="font-bold text-gray-400 uppercase tracking-wider text-xs mb-3">Audio</h4>
                                            <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                                {audioTracks.length > 1 ? (
                                                    audioTracks.map((t) => (
                                                        <button
                                                            key={t.id}
                                                            onClick={() => handleAudioTrackSelect(t.id)}
                                                            className={`w-full text-left px-2 py-1.5 rounded font-medium text-xs flex items-center justify-between outline-none focus:outline-none transition-colors ${
                                                                selectedAudioTrack === t.id
                                                                    ? 'text-white font-bold bg-white/10'
                                                                    : 'hover:text-white text-gray-400'
                                                            }`}
                                                        >
                                                            <span className="truncate pr-1">
                                                                {t.name} {!['fr', 'fra', 'fre'].includes((t.lang || '').toLowerCase()) ? '[VO]' : '[VF]'}
                                                            </span>
                                                            {selectedAudioTrack === t.id && <span className="text-[#e50914] font-bold">✓</span>}
                                                        </button>
                                                    ))
                                                ) : (
                                                    <div className="w-full text-left px-2 py-1.5 rounded font-medium text-xs flex items-center justify-between text-white font-bold bg-white/10">
                                                        <span>Version originale [VO]</span>
                                                        <span className="text-[#e50914] font-bold">✓</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Subtitles Column */}
                                        <div>
                                            <h4 className="font-bold text-gray-400 uppercase tracking-wider text-xs mb-3">Sous-titres</h4>
                                            <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                                <button
                                                    onClick={() => handleSubSelect(-1)}
                                                    className={`w-full text-left px-2 py-1.5 rounded font-medium text-xs flex items-center justify-between outline-none focus:outline-none transition-colors ${
                                                        selectedSubIndex === -1
                                                            ? 'text-white font-bold bg-white/10'
                                                            : 'hover:text-white text-gray-400'
                                                    }`}
                                                >
                                                    <span>Désactivés</span>
                                                    {selectedSubIndex === -1 && <span className="text-[#e50914] font-bold">✓</span>}
                                                </button>
                                                {subtitles.map((sub, sIdx) => (
                                                    <button
                                                        key={sub.id || sIdx}
                                                        onClick={() => handleSubSelect(sIdx)}
                                                        className={`w-full text-left px-2 py-1.5 rounded font-medium text-xs flex items-center justify-between outline-none focus:outline-none transition-colors ${
                                                            selectedSubIndex === sIdx
                                                                ? 'text-white font-bold bg-white/10'
                                                                : 'hover:text-white text-gray-400'
                                                        }`}
                                                    >
                                                        <span className="truncate pr-1">{sub.label}</span>
                                                        {selectedSubIndex === sIdx && <span className="text-[#e50914] font-bold">✓</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                </>
                            )}
                        </div>

                        {/* Playback Speed Menu */}
                        <div className="relative">
                            <button
                                onClick={() => { setShowSpeedMenu(s => !s); setShowAudioMenu(false); }}
                                className={`px-2 py-1 rounded text-xs font-bold transition-all outline-none focus:outline-none ${
                                    playbackSpeed !== 1
                                        ? 'bg-[#E50914] text-white shadow'
                                        : 'text-white/90 hover:text-white hover:bg-white/10'
                                }`}
                                title="Vitesse de lecture"
                                aria-label="Vitesse de lecture"
                            >
                                {playbackSpeed}x
                            </button>

                            {showSpeedMenu && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40 bg-transparent cursor-default"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowSpeedMenu(false);
                                        }}
                                    />
                                    <div className="absolute right-0 bottom-12 w-32 bg-[#141414]/98 border border-white/10 rounded-md shadow-2xl p-2 text-sm backdrop-blur-2xl z-50 space-y-1">
                                        {[0.5, 0.75, 1, 1.25, 1.5].map((spd) => (
                                            <button
                                                key={spd}
                                                onClick={() => handleSpeedSelect(spd)}
                                                className={`w-full text-left px-3 py-1.5 rounded text-xs flex items-center justify-between outline-none transition-colors ${
                                                    playbackSpeed === spd
                                                        ? 'text-[#E50914] font-bold bg-white/10'
                                                        : 'text-gray-300 hover:text-white hover:bg-white/5'
                                                }`}
                                            >
                                                <span>{spd === 1 ? 'Normal' : `${spd}x`}</span>
                                                {playbackSpeed === spd && <span>✓</span>}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Picture-in-Picture */}
                        {typeof document !== 'undefined' && document.pictureInPictureEnabled && (
                            <button
                                onClick={togglePip}
                                className="text-white hover:text-white/80 transition-transform active:scale-90 outline-none focus:outline-none hidden sm:block"
                                title="Picture-in-Picture (P)"
                                aria-label="Picture-in-Picture"
                            >
                                <NetflixPipIcon className="w-6 h-6 drop-shadow" />
                            </button>
                        )}

                        {/* Fullscreen Toggle Button */}
                        <button
                            onClick={toggleFullscreen}
                            className="text-white hover:text-white/80 transition-transform active:scale-90 outline-none focus:outline-none"
                            title={isFullscreen ? 'Quitter le plein écran (F)' : 'Plein écran (F)'}
                            aria-label="Plein écran"
                        >
                            {isFullscreen ? (
                                <NetflixExitFullscreenIcon className="w-7 h-7 drop-shadow" />
                            ) : (
                                <NetflixFullscreenIcon className="w-7 h-7 drop-shadow" />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Keyboard Shortcuts Modal */}
            {showShortcuts && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setShowShortcuts(false)}
                >
                    <div
                        className="bg-[#181818] border border-white/10 rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-white">Raccourcis clavier</h3>
                            <button
                                onClick={() => setShowShortcuts(false)}
                                className="text-gray-400 hover:text-white text-xl"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between py-1 border-b border-white/5">
                                <span className="text-gray-300">Lecture / Pause</span>
                                <kbd className="px-2 py-0.5 bg-white/10 rounded text-white font-mono">Espace / K</kbd>
                            </div>
                            <div className="flex justify-between py-1 border-b border-white/5">
                                <span className="text-gray-300">Reculer de 10 secondes</span>
                                <kbd className="px-2 py-0.5 bg-white/10 rounded text-white font-mono">← / J</kbd>
                            </div>
                            <div className="flex justify-between py-1 border-b border-white/5">
                                <span className="text-gray-300">Avancer de 10 secondes</span>
                                <kbd className="px-2 py-0.5 bg-white/10 rounded text-white font-mono">→ / L</kbd>
                            </div>
                            <div className="flex justify-between py-1 border-b border-white/5">
                                <span className="text-gray-300">Volume</span>
                                <kbd className="px-2 py-0.5 bg-white/10 rounded text-white font-mono">↑ / ↓</kbd>
                            </div>
                            <div className="flex justify-between py-1 border-b border-white/5">
                                <span className="text-gray-300">Couper / Remettre le son</span>
                                <kbd className="px-2 py-0.5 bg-white/10 rounded text-white font-mono">M</kbd>
                            </div>
                            <div className="flex justify-between py-1 border-b border-white/5">
                                <span className="text-gray-300">Sous-titres (On / Off)</span>
                                <kbd className="px-2 py-0.5 bg-white/10 rounded text-white font-mono">C</kbd>
                            </div>
                            <div className="flex justify-between py-1 border-b border-white/5">
                                <span className="text-gray-300">Plein écran</span>
                                <kbd className="px-2 py-0.5 bg-white/10 rounded text-white font-mono">F</kbd>
                            </div>
                            <div className="flex justify-between py-1 border-b border-white/5">
                                <span className="text-gray-300">Quitter</span>
                                <kbd className="px-2 py-0.5 bg-white/10 rounded text-white font-mono">Échap</kbd>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Episode Drawer */}
            {isTv && (
                <EpisodeDrawer
                    isOpen={showDrawer}
                    onClose={() => setShowDrawer(false)}
                    tvShow={tvDetails}
                    season={season}
                    episode={episode}
                    onSeasonChange={(s) => {
                        setSeason(s);
                        setEpisode(1);
                    }}
                    onEpisodeChange={(ep) => {
                        setEpisode(ep);
                        setShowDrawer(false);
                    }}
                />
            )}
        </div>
    );
}
