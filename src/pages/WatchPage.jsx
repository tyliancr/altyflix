import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import NetflixPlayer from '../components/player/NetflixPlayer';
import { useProfile } from '../contexts/ProfileContext';
import { getMovieDetails, getSeriesDetails } from '../services/tmdb';

/**
 * /watch/:id            film, ou série reprise là où le profil s'était arrêté
 * /watch/:id?s=1&e=2    épisode précis
 * Supporte les formats : "movie-1248832", "tv-1399", ou "1248832"
 */
export default function WatchPage() {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { currentProfile, watchHistory, addToHistory } = useProfile();
    const watchHistoryRef = useRef(watchHistory);
    watchHistoryRef.current = watchHistory;

    const isTv = id?.startsWith('tv-') || searchParams.has('s');
    const tmdbId = id ? id.replace(/^(movie|tv)-/, '') : '';
    const urlSeasonParam = searchParams.get('s');
    const urlEpisodeParam = searchParams.get('e');

    const stateContent = location.state?.content || location.state;
    const initialTitle = stateContent?.title || stateContent?.name || '';

    // Figer la saison/épisode initiaux par route afin qu'une mise à jour de watchHistory
    // (ex: passage à l'épisode suivant dans NetflixPlayer) ne démonte jamais le lecteur !
    const { initialSeason, initialEpisode } = useMemo(() => {
        const list = watchHistoryRef.current || [];
        const savedEntry = list.find(h => {
            if (String(h.contentId || h.id) !== String(tmdbId)) return false;
            const hType = h.media_type || h.type;
            return !hType || hType === (isTv ? 'tv' : 'movie');
        });
        const hasExplicitS = urlSeasonParam !== null;
        const hasExplicitE = urlEpisodeParam !== null;
        const resolvedSeason = Math.max(1, parseInt(urlSeasonParam, 10) || (!hasExplicitS && isTv && savedEntry?.season ? Number(savedEntry.season) : 1));
        const canReuseSavedEpisode = !hasExplicitS || Number(savedEntry?.season || 1) === resolvedSeason;
        return {
            initialSeason: resolvedSeason,
            initialEpisode: Math.max(1, parseInt(urlEpisodeParam, 10) || (!hasExplicitE && isTv && canReuseSavedEpisode && savedEntry?.episode ? Number(savedEntry.episode) : 1))
        };
    }, [tmdbId, isTv, urlSeasonParam, urlEpisodeParam]);

    const [content, setContent] = useState(() => ({
        id: tmdbId,
        contentId: tmdbId,
        title: initialTitle,
        type: isTv ? 'tv' : 'movie',
        media_type: isTv ? 'tv' : 'movie',
        ...(stateContent && typeof stateContent === 'object' ? stateContent : {})
    }));

    useEffect(() => {
        if (!tmdbId) return;
        let active = true;
        const fetcher = isTv ? getSeriesDetails(tmdbId) : getMovieDetails(tmdbId);
        fetcher
            .then(data => {
                if (active && data) {
                    setContent(prev => ({
                        ...(prev || {}),
                        ...data,
                        id: tmdbId,
                        contentId: tmdbId,
                        type: isTv ? 'tv' : 'movie',
                        media_type: isTv ? 'tv' : 'movie'
                    }));
                }
            })
            .catch(() => {});

        return () => {
            active = false;
        };
    }, [tmdbId, isTv]);

    const goBack = useCallback(() => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate('/', { replace: true });
        }
    }, [navigate]);

    if (!tmdbId) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-white">
                <div className="text-center">
                    <p className="mb-4 text-xl">Vidéo non trouvée</p>
                    <button
                        onClick={goBack}
                        className="rounded bg-[#E50914] px-6 py-2 font-medium hover:bg-[#b80710]"
                    >
                        Retour au catalogue
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[99999] bg-black">
            <NetflixPlayer
                key={`${isTv ? 'tv' : 'movie'}-${tmdbId}-${initialSeason}-${initialEpisode}`}
                content={content}
                type={isTv ? 'tv' : 'movie'}
                initialSeason={initialSeason}
                initialEpisode={initialEpisode}
                preferredLang={currentProfile?.preferredAudio || (currentProfile?.language === 'en' ? 'VOST' : 'VF')}
                onClose={goBack}
                watchHistory={watchHistory}
                remember={addToHistory}
            />
        </div>
    );
}
