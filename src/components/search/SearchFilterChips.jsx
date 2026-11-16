import { motion } from 'framer-motion';
import { GENRE_CHIPS, SEARCH_TYPES } from './SearchConstants';

export default function SearchFilterChips({
    isSearching,
    recentSearches,
    setQuery,
    setDebouncedQuery,
    clearAllRecentSearches,
    deleteRecentSearch,
    selectedGenre,
    setSelectedGenre,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    t
}) {
    return (
        <>
            {/* ── Search History & Default States ── */}
            {!isSearching && (
                <div className="px-4 md:px-[5%]">
                    {/* Recent Searches Panel */}
                    {recentSearches.length > 0 && (
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-white/40 font-black text-xs uppercase tracking-widest" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                    {t('search.recentSearches')}
                                </h2>
                                <button 
                                    type="button"
                                    onClick={clearAllRecentSearches}
                                    className="text-white/30 hover:text-[#E50914] font-black text-[10px] uppercase tracking-widest transition-colors"
                                >
                                    {t('search.clearAll')}
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {recentSearches.map((term, index) => (
                                    <motion.div
                                        key={index}
                                        onClick={() => { setQuery(term); setDebouncedQuery(term); }}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/20 px-4 py-2.5 rounded-full text-sm font-semibold text-white/80 hover:text-white cursor-pointer transition-all duration-300 shadow-md group/tag"
                                    >
                                        <span>{term}</span>
                                        <button 
                                            type="button"
                                            onClick={(e) => deleteRecentSearch(e, term)}
                                            className="w-4 h-4 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors scale-90 group-hover/tag:scale-100"
                                        >
                                            <svg className="w-2.5 h-2.5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Genre Chips */}
                    <div className="mb-8 overflow-x-auto no-scrollbar">
                        <div className="flex gap-2 pb-1" style={{ width: 'max-content' }}>
                            {GENRE_CHIPS.map(genre => {
                                const isActive = genre.id === null ? selectedGenre === null : selectedGenre === genre.id;
                                return (
                                    <motion.button
                                        key={genre.id ?? 'all'}
                                        onClick={() => setSelectedGenre(genre.id === null ? null : genre.id)}
                                        whileTap={{ scale: 0.95 }}
                                        className={`flex items-center px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all border duration-300 ${
                                            isActive
                                                ? 'bg-[#E50914] text-white border-[#E50914] shadow-[0_0_15px_rgba(229,9,20,0.4)]'
                                                : 'bg-white/[0.03] backdrop-blur-md text-white/70 border-white/10 hover:bg-white/[0.08] hover:text-white hover:border-white/25'
                                        }`}
                                    >
                                        <span>{genre.label}</span>
                                    </motion.button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Search Type Filter Tabs + Sort (when actively searching) ── */}
            {isSearching && (
                <div className="px-4 md:px-[5%] mb-8 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                        {SEARCH_TYPES.map(type => (
                            <motion.button
                                key={type.key}
                                onClick={() => setFilter(type.key)}
                                whileTap={{ scale: 0.95 }}
                                className={`flex-shrink-0 px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all border ${
                                    filter === type.key
                                        ? 'bg-white text-black border-white shadow-md'
                                        : 'bg-white/[0.04] text-white/70 border-white/10 hover:bg-white/10 hover:border-white/25 hover:text-white'
                                }`}
                            >
                                {t(`search.filters.${type.labelKey}`)}
                            </motion.button>
                        ))}
                    </div>

                    {/* Sort selector */}
                    <div className="flex items-center gap-2 text-xs font-bold text-white/50">
                        <span className="hidden sm:inline">Trier par :</span>
                        {[
                            { key: 'popularity', label: 'Pertinence' },
                            { key: 'date', label: 'Récents' },
                            { key: 'rating', label: 'Mieux notés' },
                        ].map(s => (
                            <button
                                key={s.key}
                                onClick={() => setSortBy(s.key)}
                                className={`px-3 py-1.5 rounded-xl border text-[11px] uppercase tracking-wider font-bold transition-all ${
                                    sortBy === s.key
                                        ? 'bg-white text-black border-white shadow-md'
                                        : 'bg-white/[0.03] text-white/60 border-white/10 hover:text-white hover:border-white/25'
                                }`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}
