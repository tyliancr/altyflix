import { seasonLabel, getSeasons } from '../../utils/seasons';
import { useState, useEffect } from 'react';
import { getSeasonDetails } from '../../services/tmdb';
import { getPosterUrl } from '../../utils/helpers';
import { motion, AnimatePresence } from 'framer-motion';

const EpisodeDrawer = ({
    isOpen,
    onClose,
    tvShow,
    season,
    episode,
    onSeasonChange,
    onEpisodeChange
}) => {
    const [episodes, setEpisodes] = useState([]);
    const [loading, setLoading] = useState(false);

    // Fetch episodes when season changes
    useEffect(() => {
        let cancelled = false;
        const fetchEpisodes = async () => {
            if (!tvShow?.id || !isOpen) return;

            setLoading(true);
            try {
                const data = await getSeasonDetails(tvShow.id, season);
                if (!cancelled) setEpisodes(data.episodes || []);
            } catch (error) {
                console.error("Failed to fetch episodes:", error);
                if (!cancelled) setEpisodes([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchEpisodes();
        return () => { cancelled = true; };
    }, [tvShow, season, isOpen]);

    const seasonData = getSeasons(tvShow);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 bg-black/80 z-[60] backdrop-blur-md"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />

                    {/* Drawer */}
                    <motion.div
                        className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-black/60 backdrop-blur-3xl z-[70] shadow-2xl border-l border-white/10 flex flex-col font-sans"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    >
                        {/* Header - Sticky & Premium */}
                        <div className="sticky top-0 z-20 flex items-center justify-between px-8 py-6 border-b border-white/10 bg-black/40 backdrop-blur-xl">
                            <div>
                                <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">Épisodes</h2>
                                <p className="text-xs md:text-sm text-gray-400 mt-0.5 font-medium line-clamp-1">{tvShow?.name}</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-3 -mr-3 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all active:scale-90"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Season Selector */}
                        <div className="relative z-10 bg-black/20 backdrop-blur-md">
                            <div
                                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                                className="px-8 py-5 border-b border-white/10 overflow-x-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden flex items-center space-x-3"
                            >
                                {seasonData.map((s) => (
                                    <button
                                        key={s.season_number}
                                        onClick={() => onSeasonChange(s.season_number)}
                                        className={`flex-shrink-0 px-5 py-2.5 rounded-full text-xs md:text-sm font-bold transition-all duration-300 transform ${season === s.season_number
                                            ? 'bg-white text-black scale-105 shadow-lg shadow-white/20'
                                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white active:scale-95'
                                            }`}
                                    >
                                        {seasonLabel(s)}
                                    </button>
                                ))}
                            </div>
                            {/* Gradient fade for scroll hint */}
                            <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-black/60 to-transparent pointer-events-none" />
                        </div>

                        {/* Episode List */}
                        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 custom-scrollbar">
                            {loading ? (
                                <div className="flex items-center justify-center h-40">
                                    <div className="w-8 h-8 border-4 border-white/20 border-t-ALTYFLIX-primary rounded-full animate-spin"></div>
                                </div>
                            ) : episodes.length > 0 ? (
                                episodes.map((ep) => (
                                    <button
                                        key={ep.episode_number}
                                        onClick={() => onEpisodeChange(ep.episode_number)}
                                        className={`group relative w-full flex items-start text-left p-3 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] overflow-hidden ${episode === ep.episode_number
                                            ? 'bg-white/10 border border-white/20 shadow-lg shadow-black/50'
                                            : 'bg-black/40 border border-transparent hover:bg-white/5'
                                            }`}
                                    >
                                        {/* Background Glow for Active */}
                                        {episode === ep.episode_number && (
                                            <div className="absolute inset-0 bg-gradient-to-r from-ALTYFLIX-primary/20 to-transparent opacity-50 pointer-events-none" />
                                        )}

                                        {/* Image */}
                                        <div className="relative w-36 aspect-video rounded-xl overflow-hidden bg-black flex-shrink-0 mr-4 shadow-md group-hover:shadow-xl transition-shadow duration-300">
                                            {ep.still_path ? (
                                                <img
                                                    src={getPosterUrl(ep.still_path, 'w300')}
                                                    alt={ep.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-white/20">
                                                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                    </svg>
                                                </div>
                                            )}

                                            {/* Playing Indicator */}
                                            {episode === ep.episode_number && (
                                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[1px]">
                                                    <div className="flex space-x-1 items-end h-3">
                                                        <div className="w-1.5 bg-ALTYFLIX-primary animate-pulse h-full rounded-t-sm"></div>
                                                        <div className="w-1.5 bg-ALTYFLIX-primary animate-pulse delay-75 h-2 rounded-t-sm"></div>
                                                        <div className="w-1.5 bg-ALTYFLIX-primary animate-pulse delay-150 h-3 rounded-t-sm"></div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0 py-1.5 z-10">
                                            <div className="flex justify-between items-start mb-1.5">
                                                <h4 className={`text-sm md:text-base font-bold leading-tight line-clamp-2 pr-2 ${episode === ep.episode_number ? 'text-white drop-shadow-md' : 'text-gray-300 group-hover:text-white transition-colors duration-300'}`}>
                                                    {ep.episode_number}. {ep.name}
                                                </h4>
                                                <span className="text-[10px] md:text-xs text-gray-400 font-medium whitespace-nowrap bg-black/50 px-2 py-0.5 rounded-full border border-white/10">
                                                    {ep.runtime}m
                                                </span>
                                            </div>
                                            <p className={`text-xs line-clamp-3 leading-relaxed ${episode === ep.episode_number ? 'text-gray-300' : 'text-gray-500 group-hover:text-gray-400'}`}>
                                                {ep.overview || "Aucune description disponible pour cet épisode."}
                                            </p>
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="text-center py-20 text-gray-500">
                                    Aucun épisode disponible.
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default EpisodeDrawer;
