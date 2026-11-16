import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../../contexts/ProfileContext';
import { getContentType } from '../../utils/helpers';
import { findHostedTitle } from '../../services/videoApi';
import NetflixPlayer from './NetflixPlayer';
import { LoadingOverlay } from './hls/PlayerOverlays';

export default function VideoPlayer({ content, onClose, initialSeason = 1, initialEpisode = 1 }) {
    const type = getContentType(content) === 'tv' ? 'tv' : 'movie';
    const { currentProfile, watchHistory, addToHistory } = useProfile();
    const preferredLang = 'VOSTFR';
    const navigate = useNavigate();
    const tmdbId = content.id || content.contentId;
    // null = vérification en cours ; false = pas de vidéo hébergée pour cette fiche.
    const [hosted, setHosted] = useState(false);

    // Si cette fiche TMDB a une vidéo hébergée par ALTYFLIX, on ouvre le lecteur HLS (/watch).
    useEffect(() => {
        let cancelled = false;
        findHostedTitle(type, tmdbId, { timeout: 1500 }).then(id => {
            if (cancelled || !id) return;
            const explicit = type === 'tv' && (content.season || content.episode);
            navigate(`/watch/${id}${explicit ? `?s=${initialSeason}&e=${initialEpisode}` : ''}`);
            onClose();
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [type, tmdbId]);

    return (
        <NetflixPlayer
            key={`${content.id || content.contentId}-${initialSeason}-${initialEpisode}`}
            content={content}
            type={type}
            initialSeason={initialSeason}
            initialEpisode={initialEpisode}
            preferredLang={preferredLang}
            onClose={onClose}
            watchHistory={watchHistory}
            remember={addToHistory}
        />
    );
}
