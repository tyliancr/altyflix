import { motion, AnimatePresence } from 'framer-motion';

export default function SearchInputBar({
    query,
    setQuery,
    inputRef,
    setInputFocused,
    debounceRef,
    setDebouncedQuery,
    setSelectedGenre,
    placeholderIndex,
    placeholderList,
    clearQuery,
    isSpeechSupported,
    isListening,
    toggleVoiceSearch,
    _t
}) {
    return (
        <div className="relative flex items-center gap-3">
            <div className="relative flex-1">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 pointer-events-none z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setTimeout(() => setInputFocused(false), 250)}
                    onChange={e => { setQuery(e.target.value.slice(0, 200)); setSelectedGenre(null); }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (debounceRef.current) clearTimeout(debounceRef.current);
                            setDebouncedQuery(query);
                        }
                    }}
                    maxLength={200}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-2xl pl-12 pr-12 py-4 text-white text-base placeholder-white/20 outline-none focus:border-[#E50914]/50 focus:ring-2 focus:ring-[#E50914]/20 focus:bg-white/[0.06] transition-all duration-300 shadow-inner"
                    style={{ WebkitAppearance: 'none' }}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    enterKeyHint="search"
                />
                {/* Animated placeholder */}
                {!query && (
                    <div className="absolute left-12 top-1/2 -translate-y-1/2 pointer-events-none overflow-hidden h-6">
                        <AnimatePresence mode="wait">
                            <motion.span
                                key={placeholderIndex}
                                initial={{ y: 15, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: -15, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="block text-white/30 text-base font-light"
                            >
                                {placeholderList[placeholderIndex] || 'Que veux-tu regarder ?'}
                            </motion.span>
                        </AnimatePresence>
                    </div>
                )}
                {/* Clear button */}
                {query && (
                    <button
                        type="button"
                        onClick={clearQuery}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        aria-label="Effacer la recherche"
                    >
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Voice Search Button */}
            {isSpeechSupported && (
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={toggleVoiceSearch}
                    className={`flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-300 ${
                        isListening
                            ? 'bg-[#E50914] border-[#E50914] text-white shadow-[0_0_20px_rgba(229,9,20,0.4)]'
                            : 'bg-white/[0.04] border-white/10 text-white/70 hover:text-white hover:border-white/20'
                    }`}
                    aria-label="Recherche vocale"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                </motion.button>
            )}
        </div>
    );
}
