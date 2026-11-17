import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
    const navigate = useNavigate();
    const { watchHistory, addToHistory } = useProfile();

    const isTv = id?.startsWith('tv-') || searchParams.has('s');
    const tmdbId = id ? id.replace(/^(movie|tv)-/, '') : '';
    const initialSeason = Math.max(1, parseInt(searchParams.get('s'), 10) || 1);
    const initialEpisode = Math.max(1, parseInt(searchParams.get('e'), 10) || 1);

    const [content, setContent] = useState(() => ({
        id: tmdbId,
        contentId: tmdbId,
        title: 'Lecture',
        type: isTv ? 'tv' : 'movie',
        media_type: isTv ? 'tv' : 'movie'
    }));

    useEffect(() => {
        if (!tmdbId) return;
        let active = true;
        const fetcher = isTv ? getSeriesDetails(tmdbId) : getMovieDetails(tmdbId);
        fetcher
            .then(data => {
                if (active && data) {
                    setContent({
                        ...data,
                        id: tmdbId,
                        contentId: tmdbId,
                        type: isTv ? 'tv' : 'movie',
                        media_type: isTv ? 'tv' : 'movie'
                    });
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
        <div className="fixed inset-0 z-50 bg-black">
            <NetflixPlayer
                key={`${tmdbId}-${initialSeason}-${initialEpisode}`}
                content={content}
                type={isTv ? 'tv' : 'movie'}
                initialSeason={initialSeason}
                initialEpisode={initialEpisode}
                preferredLang="VOSTFR"
                onClose={goBack}
                watchHistory={watchHistory}
                remember={addToHistory}
            />
        </div>
    );
}
