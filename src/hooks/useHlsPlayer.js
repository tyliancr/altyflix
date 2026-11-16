import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

const MAX_RETRIES = 6;
const SUBTITLE_KINDS = ['subtitles', 'captions', 'forced'];

// iOS / iPadOS : le HLS natif est le plus fiable (et le seul à gérer AirPlay et le plein écran système).
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

const subtitleTextTracks = video => Array.from(video.textTracks || []).filter(track => SUBTITLE_KINDS.includes(track.kind));

function pickAudio(tracks, lang) {
    const index = tracks.findIndex(track => track.lang === lang || track.lang?.startsWith(`${lang}-`));
    return index === -1 ? null : index;
}

function pickSubtitle(tracks, lang, forced) {
    if (!lang) return -1;
    const exact = tracks.findIndex(track => track.lang === lang && Boolean(track.forced) === Boolean(forced));
    if (exact !== -1) return exact;
    // Pas de variante forcée / complète dans cette langue : mieux vaut rien qu'une piste inattendue.
    return forced ? -1 : tracks.findIndex(track => track.lang === lang && !track.forced);
}

/**
 * Lecture HLS : hls.js partout où MSE existe, HLS natif sur iOS.
 * Expose une interface unique pour les qualités, les pistes audio et les sous-titres,
 * et gère la reconnexion automatique.
 *
 * @param videoRef       ref de l'élément <video>
 * @param src            URL de la master playlist (null = rien à charger)
 * @param startPosition  position de départ en secondes
 * @param preferences    { audioLang, subtitleLang, subtitleForced } appliquées au chargement
 * @param onExpired      appelé quand l'URL signée est refusée (403) : le parent doit fournir un nouveau src
 */
export default function useHlsPlayer({ videoRef, src, startPosition = 0, preferences, onExpired }) {
    const hlsRef = useRef(null);
    const resumeRef = useRef(null);
    const optionsRef = useRef({ startPosition, preferences, onExpired });
    optionsRef.current = { startPosition, preferences, onExpired };

    const [state, setState] = useState({
        engine: null, ready: false, reconnecting: false, error: null,
        levels: [], level: -1, activeHeight: null,
        audioTracks: [], audioTrack: -1,
        subtitleTracks: [], subtitleTrack: -1,
    });
    const patch = useCallback(update => setState(previous => ({ ...previous, ...update })), []);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return undefined;

        const { preferences: prefs } = optionsRef.current;
        // Après une relance ou un renouvellement d'URL, on repart de là où la lecture s'est arrêtée.
        const start = resumeRef.current ?? optionsRef.current.startPosition;
        resumeRef.current = null;
        let disposed = false;
        let retries = 0;
        let retryTimer = null;
        let mediaRecoveries = 0;
        let expiredHandled = false;
        patch({ ready: false, reconnecting: false, error: null, levels: [], level: -1, activeHeight: null, audioTracks: [], audioTrack: -1, subtitleTracks: [], subtitleTrack: -1 });

        const failWith = message => {
            clearTimeout(retryTimer);
            patch({ reconnecting: false, error: message });
        };
        const handleExpired = () => {
            if (expiredHandled) return failWith('Le lien de lecture a expiré.');
            expiredHandled = true;
            resumeRef.current = video.currentTime;
            patch({ reconnecting: true });
            optionsRef.current.onExpired?.();
            return undefined;
        };

        // ---------------------------------------------------------------- hls.js
        if (Hls.isSupported() && !isIOS()) {
            const hls = new Hls({
                startPosition: start > 0 ? start : -1,
                capLevelToPlayerSize: true,
                maxBufferLength: 30,
                maxMaxBufferLength: 90,
                backBufferLength: 30,
                audioPreference: prefs?.audioLang ? { lang: prefs.audioLang } : undefined,
                subtitlePreference: prefs?.subtitleLang ? { lang: prefs.subtitleLang, forced: Boolean(prefs.subtitleForced) } : undefined,
            });
            hlsRef.current = hls;
            // Les sous-titres sont dessinés par SubtitleOverlay : les pistes restent en mode "hidden".
            hls.subtitleDisplay = false;
            let audioApplied = false;
            let subtitleApplied = false;

            const scheduleRetry = () => {
                if (retries >= MAX_RETRIES) return failWith('Connexion perdue. Vérifiez votre réseau puis réessayez.');
                retries += 1;
                patch({ reconnecting: true });
                clearTimeout(retryTimer);
                retryTimer = setTimeout(() => { if (!disposed) hls.startLoad(); }, Math.min(1000 * 2 ** (retries - 1), 15000));
                return undefined;
            };

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                patch({
                    engine: 'hls', ready: true,
                    levels: hls.levels.map((level, index) => ({ index, height: level.height, bitrate: level.bitrate })).sort((a, b) => b.height - a.height),
                });
            });
            hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => patch({ activeHeight: hls.levels[data.level]?.height ?? null }));
            hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
                const tracks = hls.audioTracks.map((track, index) => ({ index, lang: track.lang || '', name: track.name || track.lang || `Piste ${index + 1}` }));
                if (!audioApplied && tracks.length) {
                    audioApplied = true;
                    const wanted = pickAudio(tracks, optionsRef.current.preferences?.audioLang);
                    if (wanted !== null && wanted !== hls.audioTrack) hls.audioTrack = wanted;
                }
                patch({ audioTracks: tracks, audioTrack: hls.audioTrack });
            });
            hls.on(Hls.Events.AUDIO_TRACK_SWITCHING, (_event, data) => patch({ audioTrack: data.id }));
            hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
                const tracks = hls.subtitleTracks.map((track, index) => ({ index, lang: track.lang || '', name: track.name || track.lang || `Sous-titres ${index + 1}`, forced: Boolean(track.forced) }));
                if (!subtitleApplied) {
                    subtitleApplied = true;
                    const current = optionsRef.current.preferences;
                    hls.subtitleTrack = pickSubtitle(tracks, current?.subtitleLang, current?.subtitleForced);
                }
                patch({ subtitleTracks: tracks, subtitleTrack: hls.subtitleTrack });
            });
            hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_event, data) => patch({ subtitleTrack: data.id }));
            hls.on(Hls.Events.FRAG_LOADED, () => {
                if (retries) {
                    retries = 0;
                    patch({ reconnecting: false });
                }
            });
            hls.on(Hls.Events.ERROR, (_event, data) => {
                if (!data.fatal) return;
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    if (data.response?.code === 403) handleExpired();
                    else if (data.response?.code === 404) failWith('Cette vidéo est introuvable.');
                    else scheduleRetry();
                } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 3) {
                    mediaRecoveries += 1;
                    hls.recoverMediaError();
                } else {
                    failWith('Lecture impossible sur cet appareil.');
                }
            });

            const onOnline = () => {
                retries = 0;
                clearTimeout(retryTimer);
                hls.startLoad();
            };
            window.addEventListener('online', onOnline);
            hls.loadSource(src);
            hls.attachMedia(video);

            return () => {
                disposed = true;
                clearTimeout(retryTimer);
                window.removeEventListener('online', onOnline);
                hls.destroy();
                hlsRef.current = null;
            };
        }

        // ---------------------------------------------------------------- HLS natif (iOS)
        if (!video.canPlayType('application/vnd.apple.mpegurl')) {
            failWith('Ce navigateur ne sait pas lire ce format vidéo.');
            return undefined;
        }

        let applied = false;
        const readTracks = () => {
            const audio = Array.from(video.audioTracks || []).map((track, index) => ({ index, lang: track.language || '', name: track.label || track.language || `Piste ${index + 1}`, enabled: track.enabled }));
            const subtitles = subtitleTextTracks(video).map((track, index) => ({ index, lang: track.language || '', name: track.label || track.language || `Sous-titres ${index + 1}`, forced: track.kind === 'forced', mode: track.mode }));
            if (!applied && video.readyState >= 1) {
                applied = true;
                const wantedAudio = pickAudio(audio, prefs?.audioLang);
                if (wantedAudio !== null) Array.from(video.audioTracks).forEach((track, index) => { track.enabled = index === wantedAudio; });
                const wantedSubtitle = pickSubtitle(subtitles, prefs?.subtitleLang, prefs?.subtitleForced);
                subtitleTextTracks(video).forEach((track, index) => { track.mode = index === wantedSubtitle ? 'hidden' : 'disabled'; });
            }
            patch({
                audioTracks: audio.map(({ index, lang, name }) => ({ index, lang, name })),
                audioTrack: Array.from(video.audioTracks || []).findIndex(track => track.enabled),
                subtitleTracks: subtitles.map(({ index, lang, name, forced }) => ({ index, lang, name, forced })),
                subtitleTrack: subtitleTextTracks(video).findIndex(track => track.mode !== 'disabled'),
            });
        };
        const onLoadedMetadata = () => {
            if (start > 0) video.currentTime = start;
            patch({ engine: 'native', ready: true, reconnecting: false });
            readTracks();
        };
        const onNativeError = () => {
            // Le HLS natif ne donne pas le code HTTP : on tente d'abord une nouvelle URL signée, puis on recharge.
            if (!expiredHandled && optionsRef.current.onExpired) return handleExpired();
            if (retries >= 3) return failWith('Lecture impossible. Vérifiez votre réseau puis réessayez.');
            retries += 1;
            patch({ reconnecting: true });
            const position = video.currentTime;
            retryTimer = setTimeout(() => {
                if (disposed) return;
                video.src = src;
                video.addEventListener('loadedmetadata', () => { video.currentTime = position; video.play().catch(() => {}); }, { once: true });
                video.load();
            }, 2000 * retries);
            return undefined;
        };
        const lists = [video.audioTracks, video.textTracks].filter(Boolean);
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('error', onNativeError);
        lists.forEach(trackList => { trackList.addEventListener('addtrack', readTracks); trackList.addEventListener('change', readTracks); });
        video.src = src;
        video.load();

        return () => {
            disposed = true;
            clearTimeout(retryTimer);
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('error', onNativeError);
            lists.forEach(trackList => { trackList.removeEventListener('addtrack', readTracks); trackList.removeEventListener('change', readTracks); });
            video.removeAttribute('src');
            video.load();
        };
    }, [videoRef, src, reloadKey, patch]);

    const setLevel = useCallback(index => {
        const hls = hlsRef.current;
        if (!hls) return;
        // nextLevel : la nouvelle qualité s'applique dès le prochain segment, sans vider ce qui est déjà chargé.
        if (index === -1) hls.currentLevel = -1;
        else hls.nextLevel = index;
        patch({ level: index });
    }, [patch]);

    const setAudioTrack = useCallback(index => {
        const video = videoRef.current;
        if (hlsRef.current) hlsRef.current.audioTrack = index;
        else if (video?.audioTracks) Array.from(video.audioTracks).forEach((track, i) => { track.enabled = i === index; });
        patch({ audioTrack: index });
    }, [videoRef, patch]);

    const setSubtitleTrack = useCallback(index => {
        const video = videoRef.current;
        if (hlsRef.current) hlsRef.current.subtitleTrack = index;
        else if (video) subtitleTextTracks(video).forEach((track, i) => { track.mode = i === index ? 'hidden' : 'disabled'; });
        patch({ subtitleTrack: index });
    }, [videoRef, patch]);

    /** Relance complète après une erreur fatale. */
    const retry = useCallback(() => {
        resumeRef.current = videoRef.current?.currentTime || null;
        setReloadKey(key => key + 1);
    }, [videoRef]);

    return { ...state, setLevel, setAudioTrack, setSubtitleTrack, retry };
}
