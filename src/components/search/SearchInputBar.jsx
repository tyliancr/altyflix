import { motion, AnimatePresence } from 'framer-motion';

export default function SearchInputBar({
    query,
    setQuery,
    inputRef,
    debounceRef,
    setDebouncedQuery,
    setSelectedGenre,
    placeholderIndex,
    placeholderList,
    clearQuery,
    isSpeechSupported,
    isListening,
    toggleVoiceSearch,
}) {
    return (
        <div className="flex max-w-4xl items-center gap-2.5">
            <div className="relative flex-1">
                <svg className="pointer-events-none absolute left-5 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-white/45" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    ref={inputRef}
                    type="search"
                    aria-label="Rechercher un titre, une personne ou un genre"
                    value={query}
                    onChange={e => { setQuery(e.target.value.slice(0, 200)); setSelectedGenre(null); }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (debounceRef.current) clearTimeout(debounceRef.current);
                            setDebouncedQuery(query);
                        }
                    }}
                    maxLength={200}
                    className="h-14 w-full rounded-2xl border border-white/12 bg-white/[0.06] pl-[3.25rem] pr-12 text-base text-white outline-none transition-colors duration-200 hover:border-white/25 focus:border-white/60 focus:bg-white/[0.09] sm:h-16 sm:text-lg [&::-webkit-search-cancel-button]:hidden"
                    style={{ WebkitAppearance: 'none' }}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    enterKeyHint="search"
                />
                {!query && (
                    <div className="pointer-events-none absolute left-[3.25rem] top-1/2 h-7 -translate-y-1/2 overflow-hidden" aria-hidden="true">
                        <AnimatePresence mode="wait">
                            <motion.span
                                key={placeholderIndex}
                                initial={{ y: 14, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: -14, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="block text-base leading-7 text-white/35 sm:text-lg"
                            >
                                {placeholderList[placeholderIndex] || 'Que veux-tu regarder ?'}
                            </motion.span>
                        </AnimatePresence>
                    </div>
                )}
                {query && (
                    <button
                        type="button"
                        onClick={clearQuery}
                        className="absolute right-4 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/25"
                        aria-label="Effacer la recherche"
                    >
                        <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.8} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {isSpeechSupported && (
                <button
                    type="button"
                    onClick={toggleVoiceSearch}
                    aria-label="Recherche vocale"
                    aria-pressed={isListening}
                    className={`grid h-14 w-14 flex-none place-items-center rounded-2xl border transition-colors duration-200 active:scale-95 sm:h-16 sm:w-16 ${
                        isListening
                            ? 'border-white bg-white text-black'
                            : 'border-white/12 bg-white/[0.06] text-white/70 hover:border-white/30 hover:text-white'
                    }`}
                >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                </button>
            )}
        </div>
    );
}
