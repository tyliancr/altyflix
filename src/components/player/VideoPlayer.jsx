import { getContentType } from '../../utils/helpers';
import { useProfile } from '../../contexts/ProfileContext';
import NetflixPlayer from './NetflixPlayer';

export default function VideoPlayer({ content, onClose, initialSeason = 1, initialEpisode = 1 }) {
    const type = getContentType(content) === 'tv' ? 'tv' : 'movie';
    const { watchHistory, addToHistory } = useProfile();

    return (
        <NetflixPlayer
            key={`${content.id || content.contentId}-${initialSeason}-${initialEpisode}`}
            content={content}
            type={type}
            initialSeason={initialSeason}
            initialEpisode={initialEpisode}
            preferredLang="VOSTFR"
            onClose={onClose}
            watchHistory={watchHistory}
            remember={addToHistory}
        />
    );
}
