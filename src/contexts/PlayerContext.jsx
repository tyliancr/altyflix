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

        // Check history for resume point
        const historyItem = watchHistory.find(item =>
            String(item.contentId) === String(content.id || content.contentId)
        );

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

