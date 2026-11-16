import { useEffect, useRef } from 'react';
import { saveProgress } from '../services/videoApi';

const INTERVAL_MS = 10_000;

/**
 * Sauvegarde la position de lecture : toutes les 10 s pendant la lecture, à la pause,
 * quand l'onglet passe en arrière-plan ou se ferme, et au changement d'épisode.
 */
export default function usePlaybackProgress({ videoRef, playback, profileId, enabled }) {
    const lastSaved = useRef(-1);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !playback || !enabled) return undefined;
        lastSaved.current = -1;
        const { titleId, season, episode } = playback;

        // Position et durée mémorisées : au démontage, la vidéo est parfois déjà détachée de sa source.
        let position = 0;
        let duration = playback.duration;
        const onTimeUpdate = () => {
            position = video.currentTime;
            if (Number.isFinite(video.duration) && video.duration > 0) duration = video.duration;
        };
        video.addEventListener('timeupdate', onTimeUpdate);

        const save = (keepalive = false) => {
            if (!duration || position < 1 || Math.abs(position - lastSaved.current) < 1) return;
            lastSaved.current = position;
            // Une sauvegarde manquée n'est pas grave : la suivante arrive dans 10 s.
            saveProgress(titleId, { position, duration, season, episode }, { profileId, keepalive }).catch(() => {});
        };

        const timer = setInterval(() => { if (!video.paused) save(); }, INTERVAL_MS);
        const onPause = () => save();
        const onHide = () => { if (document.visibilityState === 'hidden') save(true); };
        const onPageHide = () => save(true);
        video.addEventListener('pause', onPause);
        video.addEventListener('ended', onPause);
        document.addEventListener('visibilitychange', onHide);
        window.addEventListener('pagehide', onPageHide);
        return () => {
            save(true);
            clearInterval(timer);
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('ended', onPause);
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('pagehide', onPageHide);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- on ne relance que si le contenu lu change
    }, [videoRef, playback?.titleId, playback?.season, playback?.episode, profileId, enabled]);
}
