import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import HlsPlayer from '../components/player/hls/HlsPlayer';
import { ErrorOverlay, LoadingOverlay } from '../components/player/hls/PlayerOverlays';
import { useProfile } from '../contexts/ProfileContext';
import { getPlayback } from '../services/videoApi';

/**
 * /watch/:id            film, ou série reprise là où le profil s'était arrêté
 * /watch/:id?s=1&e=2    épisode précis
 */
export default function WatchPage() {
    const { id } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { currentProfile } = useProfile();
    const profileId = currentProfile?.id || 'default';

    const season = searchParams.get('s');
    const episode = searchParams.get('e');
    const [playback, setPlayback] = useState(null);
    const [error, setError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    // Vrai après un passage à l'épisode suivant : on enchaîne sans redemander « Reprendre ? ».
    const chained = useRef(false);

    useEffect(() => {
        const controller = new AbortController();
        setError(null);
        const target = season !== null && episode !== null ? { season: Number(season), episode: Number(episode), profileId } : { profileId };
        getPlayback(id, target, { signal: controller.signal })
            .then(setPlayback)
            .catch(failure => { if (failure.name !== 'AbortError') setError(failure.message); });
        return () => controller.abort();
    }, [id, season, episode, profileId, attempt]);

    const goBack = useCallback(() => {
        if (window.history.length > 1) navigate(-1);
        else navigate('/', { replace: true });
    }, [navigate]);

    const goNext = useCallback(next => {
        chained.current = true;
        // Le lecteur reste monté pendant le chargement : le plein écran n'est pas interrompu.
        setSearchParams({ s: String(next.season), e: String(next.episode) }, { replace: true });
    }, [setSearchParams]);

    const refreshPlayback = useCallback(() => {
        if (!playback) return;
        getPlayback(id, { season: playback.season, episode: playback.episode, profileId })
            .then(fresh => setPlayback(previous => (previous ? { ...previous, hlsUrl: fresh.hlsUrl, thumbnailsUrl: fresh.thumbnailsUrl, expiresAt: fresh.expiresAt } : fresh)))
            .catch(failure => setError(failure.message));
    }, [id, playback, profileId]);

    if (error) {
        return (
            <div className="fixed inset-0 z-50 bg-black">
                <ErrorOverlay message={error} onBack={goBack} onRetry={() => setAttempt(value => value + 1)} />
            </div>
        );
    }
    if (!playback) {
        return (
            <div className="fixed inset-0 z-50 bg-black">
                <LoadingOverlay />
            </div>
        );
    }
    return (
        <HlsPlayer
            playback={playback}
            profileId={profileId}
            skipResumePrompt={chained.current}
            onBack={goBack}
            onNext={goNext}
            onRefreshPlayback={refreshPlayback}
            onEnded={goBack}
        />
    );
}
