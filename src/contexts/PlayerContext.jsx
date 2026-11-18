/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback } from 'react';
import { useProfile } from './ProfileContext';
import {lazy,Suspense} from 'react';
const VideoPlayer=lazy(()=>import('../components/player/VideoPlayer'));

const PlayerContext = createContext();

export const usePlayer = () => {
    const context = useContext(PlayerContext);
    if (!context) {
        console.warn('usePlayer: PlayerProvider manquant, utilisation du fallback no-op.');
        return { play: () => { }, closePlayer: () => { } };
    }
    return context;
};

export const PlayerProvider = ({ children }) => {
    const { watchHistory } = useProfile();
    const [playerState, setPlayerState] = useState({
        isOpen: false,
        content: null,
        initialSeason: 1,
        initialEpisode: 1
    });

    const play = useCallback((content) => {
        if (!content) return;

        // Check history for resume point (match type + id to avoid movie/TV collisions)
        const targetId = content.id || content.contentId;
        const targetType = content.media_type || content.type || (content.first_air_date || content.number_of_seasons ? 'tv' : null);
        const historyItem = watchHistory.find(item => {
            if (String(item.contentId || item.id) !== String(targetId)) return false;
            if (!targetType) return true;
            const itemType = item.media_type || item.type;
            return !itemType || itemType === targetType;
        });

        let season = 1;
        let episode = 1;

        if (content.season || content.episode) {
            season = content.season || 1;
            episode = content.episode || 1;
        } else if (historyItem) {
            season = historyItem.season || 1;
            episode = historyItem.episode || 1;
        }

        setPlayerState({
            isOpen: true,
            content: content,
            initialSeason: season,
            initialEpisode: episode
        });
    }, [watchHistory]);

    const closePlayer = useCallback(() => {
        setPlayerState(prev => ({ ...prev, isOpen: false }));
    }, []);

    return (
        <PlayerContext.Provider value={{ play, closePlayer }}>
            {children}

            {playerState.isOpen && playerState.content && (
                <Suspense fallback={<div role="status" className="fixed inset-0 z-[99999] grid place-items-center bg-black"><span className="h-14 w-14 animate-spin rounded-full border-4 border-[#e50914] border-t-transparent" aria-label="Chargement du lecteur" /></div>}>
                <VideoPlayer
                    key={`${playerState.content?.id || playerState.content?.contentId || 'player'}-${playerState.initialSeason}-${playerState.initialEpisode}`}
                    content={playerState.content}
                    initialSeason={playerState.initialSeason}
                    initialEpisode={playerState.initialEpisode}
                    onClose={closePlayer}
                />
                </Suspense>
            )}
        </PlayerContext.Provider>
    );
};

export default PlayerContext;

