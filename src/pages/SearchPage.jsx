import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getTrending, getContentByGenre } from '../services/tmdb.js';
import { searchMedia } from '../services/searchService.js';
import { useProfile } from '../contexts/ProfileContext';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { getContentType } from '../utils/helpers';
import { useTranslation } from '../hooks/useTranslation';
import MovieCard from '../components/home/MovieCard';
import { GENRE_CHIPS } from '../components/search/SearchConstants';
import SearchInputBar from '../components/search/SearchInputBar';
import SearchFilterChips from '../components/search/SearchFilterChips';

const SearchPage = () => {
    const { currentProfile } = useProfile();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // Read URL search params initially
    const initialQuery = searchParams.get('q') || '';
    const initialFilter = searchParams.get('filter') || 'all';
    const initialSort = searchParams.get('sort') || 'popularity';
    const initialGenre = searchParams.get('genre') ? Number(searchParams.get('genre')) : null;

    const [query, setQuery] = useState(initialQuery);
    const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [filter, setFilter] = useState(initialFilter);
    const [sortBy, setSortBy] = useState(initialSort);
    const [selectedGenre, setSelectedGenre] = useState(initialGenre);
    const [genreResults, setGenreResults] = useState([]);
    const [trending, setTrending] = useState([]);
    const [placeholderIndex, setPlaceholderIndex] = useState(0);
    const [recentSearches, setRecentSearches] = useState([]);
    const [_inputFocused, setInputFocused] = useState(false);

    // Advanced search states: IDLE | LOADING | RESULTS | EMPTY | ERROR | OFFLINE
    const [searchState, setSearchState] = useState(initialQuery ? 'LOADING' : 'IDLE');
    const [errorMessage, setErrorMessage] = useState('');
    const [didYouMean, setDidYouMean] = useState(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const inputRef = useRef(null);
    const debounceRef = useRef(null);
    const abortControllerRef = useRef(null);
    const sentinelRef = useRef(null);
    const requestIdRef = useRef(0);
    const placeholders = t('search.placeholders');
    const placeholderList = Array.isArray(placeholders) ? placeholders : ['Que veux-tu regarder ?'];

    const [isListening, setIsListening] = useState(false);
    const [isSpeechSupported, setIsSpeechSupported] = useState(false);
    const recognitionRef = useRef(null);

    const userClearedRef = useRef(false);

    // Sync URL search parameters without wiping an incoming navbar / history query
    useEffect(() => {
        const currentQ = searchParams.get('q') || '';
        if (!debouncedQuery.trim() && currentQ && !userClearedRef.current) {
            return;
        }

        const params = new URLSearchParams();
        if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
        if (filter !== 'all') params.set('filter', filter);
        if (sortBy !== 'popularity') params.set('sort', sortBy);
        if (selectedGenre) params.set('genre', selectedGenre.toString());
        if (params.toString() !== searchParams.toString()) {
            setSearchParams(params, { replace: true });
        }
        userClearedRef.current = false;
    }, [debouncedQuery, filter, sortBy, selectedGenre, searchParams, setSearchParams]);

    // Hydrate state when the URL changes from outside (navbar, history, refresh)
    useEffect(() => {
        const urlQ = searchParams.get('q') || '';
        const urlFilter = searchParams.get('filter') || 'all';
        const urlSort = searchParams.get('sort') || 'popularity';
        const genreRaw = searchParams.get('genre');
        const urlGenre = genreRaw ? Number(genreRaw) : null;

        if (urlQ !== debouncedQuery) {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            setQuery(urlQ);
            setDebouncedQuery(urlQ);
        }
        if (urlFilter !== filter) setFilter(urlFilter);
        if (urlSort !== sortBy) setSortBy(urlSort);
        const nextGenre = Number.isNaN(urlGenre) ? null : urlGenre;
        if (nextGenre !== selectedGenre) setSelectedGenre(nextGenre);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    // Initialize Recent Searches from localStorage
    useEffect(() => {
        if (currentProfile) {
            const key = `recent_searches_${currentProfile.id}`;
            try {
                const history = JSON.parse(localStorage.getItem(key)) || [];
                setRecentSearches(history);
            } catch {
                setRecentSearches([]);
            }
        }
    }, [currentProfile]);

    const saveSearchQuery = useCallback((q) => {
        if (!q.trim() || !currentProfile) return;
        const key = `recent_searches_${currentProfile.id}`;
        try {
            setRecentSearches((prev) => {
                const updated = [q.trim(), ...prev.filter(item => item.toLowerCase() !== q.trim().toLowerCase())].slice(0, 5);
                localStorage.setItem(key, JSON.stringify(updated));
                return updated;
            });
        } catch (e) {
            console.error(e);
        }
    }, [currentProfile]);

    const deleteRecentSearch = useCallback((e, q) => {
        e.stopPropagation();
        if (!currentProfile) return;
        const key = `recent_searches_${currentProfile.id}`;
        try {
            const updated = recentSearches.filter(item => item !== q);
            localStorage.setItem(key, JSON.stringify(updated));
            setRecentSearches(updated);
        } catch (e) {
            console.error(e);
        }
    }, [currentProfile, recentSearches]);

    const clearAllRecentSearches = useCallback(() => {
        if (!currentProfile) return;
        const key = `recent_searches_${currentProfile.id}`;
        try {
            localStorage.removeItem(key);
            setRecentSearches([]);
        } catch (e) {
            console.error(e);
        }
    }, [currentProfile]);

    // Initialize Web Speech API for voice search
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            setIsSpeechSupported(true);
            const rec = new SpeechRecognition();
            rec.continuous = false;
            rec.interimResults = false;

            const langMap = {
                'fr': 'fr-FR',
                'en': 'en-US',
                'es': 'es-ES',
                'de': 'de-DE',
                'it': 'it-IT'
            };
            rec.lang = langMap[currentProfile?.language || 'fr'] || 'fr-FR';

            rec.onstart = () => {
                setIsListening(true);
            };

            rec.onresult = (event) => {
                const transcript = event.results[0]?.[0]?.transcript;
                if (transcript) {
                    setQuery(transcript);
                    setSelectedGenre(null);
                    saveSearchQuery(transcript);
                }
            };

            rec.onerror = (e) => {
                console.error('Speech recognition error:', e);
                setIsListening(false);
            };

            rec.onend = () => {
                setIsListening(false);
            };

            recognitionRef.current = rec;
            return () => {
                try { rec.abort(); } catch { /* noop */ }
                rec.onstart = null;
                rec.onresult = null;
                rec.onerror = null;
                rec.onend = null;
            };
        }
        return undefined;
    }, [currentProfile, saveSearchQuery]);

    const toggleVoiceSearch = () => {
        if (!recognitionRef.current) return;
        if (isListening) {
            recognitionRef.current.stop();
        } else {
            try {
                recognitionRef.current.start();
            } catch (e) {
                console.error(e);
            }
        }
    };

    // Cycle through placeholder texts
    useEffect(() => {
        const timer = setInterval(() => {
            setPlaceholderIndex(i => (i + 1) % placeholderList.length);
        }, 2500);
        return () => clearInterval(timer);
    }, [placeholderList.length]);

    // Load trending on mount
    useEffect(() => {
        (async () => {
            try {
                const data = await getTrending('all', 'week');
                setTrending(data.results?.slice(0, 12) || []);
            } catch (_) { /* no-op */ }
        })();
        // Auto-focus input
        setTimeout(() => inputRef.current?.focus(), 300);
    }, []);

    // Snappy debounce search (200ms)
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setDebouncedQuery(query);
        }, 200);
        return () => clearTimeout(debounceRef.current);
    }, [query]);

    // Search Execution with AbortController, race condition prevention, and caching
    const executeMediaSearch = useCallback(async (searchQuery, activeFilter, targetPage = 1, isAppend = false) => {
        const trimmed = searchQuery.trim().slice(0, 200);
        if (!trimmed) {
            setResults([]);
            setSearchState('IDLE');
            setLoading(false);
            setLoadingMore(false);
            setDidYouMean(null);
            return;
        }

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            setSearchState('OFFLINE');
            setLoading(false);
            setLoadingMore(false);
            return;
        }

        // Invalidate and cancel previous in-flight request (Section 9: Race Conditions)
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const requestId = ++requestIdRef.current;

        if (isAppend) {
            setLoadingMore(true);
        } else {
            setLoading(true);
            setSearchState('LOADING');
            setErrorMessage('');
        }

        try {
            const data = await searchMedia({
                query: trimmed,
                filter: activeFilter,
                page: targetPage,
                signal: controller.signal,
                isKid: currentProfile?.isKid || false
            });

            if (controller.signal.aborted || requestId !== requestIdRef.current) return;

            setTotalPages(data.totalPages || 1);
            setDidYouMean(data.didYouMean || null);

            if (isAppend) {
                setResults(prev => {
                    const existingKeys = new Set(prev.map(p => `${p.type || getContentType(p)}_${p.id}`));
                    const newItems = (data.results || []).filter(item => !existingKeys.has(`${item.type || getContentType(item)}_${item.id}`));
                    return [...prev, ...newItems];
                });
            } else {
                setResults(data.results || []);
                setPage(1);
                if (!data.results || data.results.length === 0) {
                    setSearchState('EMPTY');
                } else {
                    setSearchState('RESULTS');
                    saveSearchQuery(trimmed);
                }
            }
        } catch (err) {
            if (err.name === 'AbortError' || requestId !== requestIdRef.current) {
                return;
            }
            if (err.code === 'TIMEOUT') {
                setSearchState('ERROR');
                setErrorMessage('La recherche a pris trop de temps. Réessayez.');
            } else if (err.code === 'RATE_LIMIT') {
                setSearchState('ERROR');
                setErrorMessage('Trop de recherches en même temps. Patientez un instant puis réessayez.');
            } else if (err.message === 'OFFLINE' || err.isOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
                setSearchState('OFFLINE');
            } else {
                setSearchState('ERROR');
                setErrorMessage('Impossible de charger les résultats. Vérifiez votre connexion.');
            }
        } finally {
            // Always reset loading state for the most recent request.
            // If this request was aborted, the new one already called setLoading(true),
            // so this is safe — it just resets state that the new fetch will immediately re-set.
            // Without this, fast typing leaves loading=true indefinitely.
            if (requestId === requestIdRef.current) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [currentProfile?.isKid, saveSearchQuery]);

    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
            requestIdRef.current += 1;
        };
    }, []);

    // Trigger search when debouncedQuery or filter changes
    useEffect(() => {
        if (debouncedQuery.trim().length >= 1) {
            setPage(1);
            executeMediaSearch(debouncedQuery, filter, 1, false);
        } else {
            setResults([]);
            setSearchState('IDLE');
            setLoading(false);
            setLoadingMore(false);
            setDidYouMean(null);
        }
    }, [debouncedQuery, filter, executeMediaSearch]);

    // Safety valve: if loading stopped but searchState got stuck as LOADING, reset it
    useEffect(() => {
        if (!loading && searchState === 'LOADING') {
            setSearchState('IDLE');
        }
    }, [loading, searchState]);

    // Infinite scroll observer for next pages
    useEffect(() => {
        if (!sentinelRef.current || loading || loadingMore || page >= totalPages || debouncedQuery.trim().length < 1) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !loading && !loadingMore && page < totalPages) {
                    const nextPage = page + 1;
                    setPage(nextPage);
                    executeMediaSearch(debouncedQuery, filter, nextPage, true);
                }
            },
            { rootMargin: '300px' }
        );

        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [loading, loadingMore, page, totalPages, debouncedQuery, filter, executeMediaSearch]);

    // Load genre results when a genre chip is clicked
    useEffect(() => {
        if (!selectedGenre) { setGenreResults([]); return; }
        const controller = new AbortController();
        (async () => {
            setLoading(true);
            try {
                const genre = GENRE_CHIPS.find(g => g.id === selectedGenre);
                const mediaType = genre?.type === 'tv' ? 'tv' : 'movie';
                const data = await getContentByGenre(mediaType, selectedGenre);
                if (controller.signal.aborted) return;
                setGenreResults(data.results?.slice(0, 18) || []);
            } catch (_) {
                if (!controller.signal.aborted) setGenreResults([]);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        })();
        return () => controller.abort();
    }, [selectedGenre]);

    useEffect(() => {
        const goOnline = () => {
            if (debouncedQuery.trim().length >= 1) {
                executeMediaSearch(debouncedQuery, filter, 1, false);
            }
        };
        const goOffline = () => setSearchState((prev) => (debouncedQuery.trim().length >= 1 ? 'OFFLINE' : prev));
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, [debouncedQuery, filter, executeMediaSearch]);

    // Section 6: Clicking a person opens the person page!
    const handleItemClick = (item) => {
        const type = item.type || item.media_type || getContentType(item);
        if (type === 'person') {
            navigate(`/person/${item.id}`);
        } else {
            navigate(`/${type}/${item.id}`);
        }
    };

    // Sort results according to active sort option
    const sortedResults = useMemo(() => {
        const list = [...results];
        if (sortBy === 'rating') {
            return list.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
        }
        if (sortBy === 'date') {
            return list.sort((a, b) => {
                const dateA = new Date(a.release_date || a.first_air_date || 0).getTime();
                const dateB = new Date(b.release_date || b.first_air_date || 0).getTime();
                return dateB - dateA; // descending: newest first
            });
        }
        // default: relevance already computed by scoreItem in searchService!
        return list;
    }, [results, sortBy]);

    const moviesAndSeries = sortedResults.filter(item => (item.type || getContentType(item)) !== 'person');
    const people = sortedResults.filter(item => (item.type || getContentType(item)) === 'person');

    const isSearching = debouncedQuery.trim().length >= 1;
    const showGenreSection = !isSearching && selectedGenre && genreResults.length > 0;
    const showTrending = !isSearching && !selectedGenre;

    const clearQuery = () => {
        userClearedRef.current = true;
        setQuery('');
        setDebouncedQuery('');
        setResults([]);
        setSearchState('IDLE');
        setDidYouMean(null);
        inputRef.current?.focus();
    };

    return (
        <div className="min-h-screen bg-[#08080C] text-white pb-28 relative overflow-x-hidden">
            {/* Ambient Background Glows */}
            <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-gradient-to-br from-purple-500/5 via-red-500/5 to-transparent blur-[120px] rounded-full pointer-events-none z-0" />
            <div className="absolute top-[40%] left-[-100px] w-[400px] h-[400px] bg-[#E50914]/[0.02] blur-[100px] rounded-full pointer-events-none z-0" />

            <Helmet>
                <title>{t('search.title')} - ALTYFLIX</title>
                <meta name="robots" content="noindex" />
            </Helmet>

            <div className="max-w-[1920px] mx-auto pt-4 md:pt-24 pt-safe-top-search relative z-10">
                {/* ── Search Header ── */}
                <div className="px-4 md:px-[5%] mb-8">
                    {/* Title */}
                    <h1 className="hidden md:block text-4xl font-black text-white mb-6 uppercase tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
                        {t('search.title')}
                    </h1>

                    {/* Search Input Container */}
                    <SearchInputBar
                        query={query}
                        setQuery={setQuery}
                        inputRef={inputRef}
                        setInputFocused={setInputFocused}
                        debounceRef={debounceRef}
                        setDebouncedQuery={setDebouncedQuery}
                        setSelectedGenre={setSelectedGenre}
                        placeholderIndex={placeholderIndex}
                        placeholderList={placeholderList}
                        clearQuery={clearQuery}
                        isSpeechSupported={isSpeechSupported}
                        isListening={isListening}
                        toggleVoiceSearch={toggleVoiceSearch}
                        t={t}
                    />
                </div>

                <SearchFilterChips
                    isSearching={isSearching}
                    recentSearches={recentSearches}
                    setQuery={setQuery}
                    setDebouncedQuery={setDebouncedQuery}
                    clearAllRecentSearches={clearAllRecentSearches}
                    deleteRecentSearch={deleteRecentSearch}
                    selectedGenre={selectedGenre}
                    setSelectedGenre={setSelectedGenre}
                    filter={filter}
                    setFilter={setFilter}
                    sortBy={sortBy}
                    setSortBy={setSortBy}
                    t={t}
                />

                {/* ── Main Content Area ── */}
                <div className="px-4 md:px-[5%] relative z-10">
                    {/* Did you mean suggestion banner (Section 12 & 20) */}
                    {isSearching && didYouMean && (
                        <div className="mb-6 flex items-center gap-2 text-sm text-white/70 bg-white/[0.03] border border-white/10 px-4 py-2.5 rounded-2xl w-fit">
                            <span>Essayez avec l&apos;orthographe :</span>
                            <button
                                type="button"
                                onClick={() => {
                                    setQuery(didYouMean);
                                    setDebouncedQuery(didYouMean);
                                }}
                                className="font-bold text-[#E50914] hover:underline underline-offset-4 flex items-center gap-1"
                            >
                                <span>{didYouMean}</span>
                                <span className="text-xs">→</span>
                            </button>
                        </div>
                    )}

                    <AnimatePresence mode="wait">
                        {/* Offline State */}
                        {searchState === 'OFFLINE' && (
                            <motion.div
                                key="offline"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="text-center py-20 backdrop-blur-md bg-amber-500/10 border border-amber-500/30 rounded-3xl p-8 max-w-md mx-auto"
                            >
                                <span className="text-4xl mb-3 block">📡</span>
                                <h3 className="text-lg font-bold text-amber-200 mb-2">Vous êtes hors ligne</h3>
                                <p className="text-white/60 text-sm">Veuillez vérifier votre connexion internet pour effectuer des recherches.</p>
                            </motion.div>
                        )}

                        {/* Error State */}
                        {searchState === 'ERROR' && (
                            <motion.div
                                key="error"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="text-center py-20 backdrop-blur-md bg-red-500/10 border border-red-500/30 rounded-3xl p-8 max-w-md mx-auto"
                            >
                                <span className="text-4xl mb-3 block">⚠️</span>
                                <h3 className="text-lg font-bold text-red-200 mb-2">Erreur de chargement</h3>
                                <p className="text-white/60 text-sm mb-4">{errorMessage || 'Impossible de contacter les serveurs de recherche.'}</p>
                                <button
                                    type="button"
                                    onClick={() => executeMediaSearch(debouncedQuery, filter, 1)}
                                    className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider transition-all"
                                >
                                    Réessayer
                                </button>
                            </motion.div>
                        )}

                        {/* Loading spinner */}
                        {loading && (
                            <motion.div
                                key="loading"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex flex-col items-center justify-center py-24 gap-4"
                            >
                                <div className="w-10 h-10 rounded-full animate-spin border-t-[#E50914]" style={{ border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#E50914' }} />
                                <p className="text-xs font-bold uppercase tracking-widest text-white/40">Recherche en cours...</p>
                            </motion.div>
                        )}

                        {/* Search Results Display */}
                        {!loading && searchState === 'RESULTS' && (
                            <motion.div
                                key="results"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                            >
                                <p className="text-white/40 text-sm mb-6 font-light">
                                    {results.length} {results.length === 1 ? t('search.results') : t('search.resultsPlural')} {t('search.for')} <span className="text-white font-semibold">{`"${debouncedQuery}"`}</span>
                                </p>
                                
                                <div className="space-y-10">
                                    {/* Split: People/Actors Row when on 'all' tab */}
                                    {filter === 'all' && people.length > 0 && (
                                        <div className="backdrop-blur-md bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 shadow-xl relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-1.5 h-full bg-[#E50914]" />
                                            <h3 className="text-white/80 font-black text-xs uppercase tracking-widest mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                                {t('search.people')}
                                            </h3>
                                            <div className="flex gap-6 overflow-x-auto no-scrollbar pb-2">
                                                {people.map(person => {
                                                    const avatar = person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null;
                                                    return (
                                                        <motion.button
                                                            key={`person_${person.id}`}
                                                            onClick={() => handleItemClick(person)}
                                                            whileHover={{ scale: 1.05 }}
                                                            whileTap={{ scale: 0.95 }}
                                                            className="flex flex-col items-center flex-shrink-0 text-center w-24 group"
                                                        >
                                                            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/10 group-hover:border-[#E50914] transition-colors duration-300 bg-white/5 mb-2 shadow-md">
                                                                {avatar ? (
                                                                    <img src={avatar} alt={person.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-white/30 text-base font-black">
                                                                        {person.name.charAt(0)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span className="text-white text-xs font-semibold truncate w-full group-hover:text-[#E50914] transition-colors">{person.name}</span>
                                                        </motion.button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Movies and Series Grid */}
                                    {moviesAndSeries.length > 0 && (
                                        <div>
                                            {filter === 'all' && people.length > 0 && (
                                                <h3 className="text-white/40 font-black text-xs uppercase tracking-widest mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                                    {t('search.titles')}
                                                </h3>
                                            )}
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-4 gap-y-6">
                                                {moviesAndSeries.map((item) => (
                                                    <MovieCard
                                                        key={`${item.type || getContentType(item)}_${item.id}`}
                                                        content={item}
                                                        portrait={true}
                                                        contentType={item.type || getContentType(item)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Dedicated People-only Grid */}
                                    {filter === 'person' && people.length > 0 && (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-5">
                                            {people.map(person => {
                                                const avatar = person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null;
                                                return (
                                                    <motion.button
                                                        key={`person_${person.id}`}
                                                        onClick={() => handleItemClick(person)}
                                                        whileHover={{ scale: 1.04 }}
                                                        whileTap={{ scale: 0.96 }}
                                                        className="flex flex-col items-center text-center p-4 bg-white/[0.02] border border-white/[0.06] hover:border-white/20 rounded-2xl transition-all shadow-md group"
                                                    >
                                                        <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/10 group-hover:border-[#E50914] transition-colors duration-300 bg-white/5 mb-3 shadow-md">
                                                            {avatar ? (
                                                                <img src={avatar} alt={person.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-white/30 text-lg font-black bg-[#141414]">
                                                                    {person.name.charAt(0)}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <span className="text-white text-sm font-bold truncate w-full group-hover:text-[#E50914] transition-colors">{person.name}</span>
                                                        {person.known_for_department && <span className="text-[10px] text-white/40 mt-1">{person.known_for_department}</span>}
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Infinite Scroll sentinel */}
                                <div ref={sentinelRef} className="h-16 flex items-center justify-center mt-8">
                                    {loadingMore && (
                                        <div className="flex items-center gap-2 text-white/50 text-xs font-semibold">
                                            <div className="w-4 h-4 border-2 border-white/20 border-t-[#E50914] rounded-full animate-spin" />
                                            <span>Chargement de résultats supplémentaires...</span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {/* Section 20: Empty Results Display */}
                        {!loading && searchState === 'EMPTY' && (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                className="text-center py-20 backdrop-blur-md bg-white/[0.02] border border-dashed border-white/10 rounded-3xl p-8 max-w-lg mx-auto"
                            >
                                <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-white/30">
                                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <h2 className="text-xl font-bold text-white mb-2">{t('search.noResults')}</h2>
                                <p className="text-white/40 text-sm mb-4 leading-relaxed">
                                    {`Nous n'avons rien trouvé pour « `}
                                    <span className="text-white font-semibold">{debouncedQuery}</span>
                                    {` ».`}
                                </p>

                                {didYouMean && (
                                    <div className="mt-6 pt-6 border-t border-white/10 flex flex-col items-center gap-2">
                                        <span className="text-xs text-white/50 uppercase tracking-widest font-semibold">Tu voulais peut-être dire :</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setQuery(didYouMean);
                                                setDebouncedQuery(didYouMean);
                                            }}
                                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#E50914]/20 border border-[#E50914]/50 text-white font-bold text-sm hover:bg-[#E50914] transition-all duration-200 shadow-[0_0_20px_rgba(229,9,20,0.3)]"
                                        >
                                            <span>🔍</span>
                                            <span>{didYouMean}</span>
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* Genre Selection Results */}
                        {!loading && showGenreSection && (
                            <motion.div
                                key="genre"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                            >
                                <h2 className="text-white font-black text-xl mb-6 uppercase tracking-wider" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                    {GENRE_CHIPS.find(g => g.id === selectedGenre)?.label}
                                </h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-4 gap-y-6">
                                    {genreResults.map((item) => (
                                        <MovieCard
                                            key={`${getContentType(item)}_${item.id}`}
                                            content={item}
                                            portrait={true}
                                            contentType={getContentType(item)}
                                        />
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* Trending List (Default View) */}
                        {!loading && showTrending && (
                            <motion.div
                                key="trending"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                            >
                                <h2 className="text-white font-black text-xl mb-6 uppercase tracking-wider" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                    {t('search.trending')}
                                </h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-4 gap-y-6">
                                    {trending.map((item) => (
                                        <MovieCard
                                            key={`${getContentType(item)}_${item.id}`}
                                            content={item}
                                            portrait={true}
                                            contentType={getContentType(item)}
                                        />
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Premium Voice Search Full-Screen Modal Overlay */}
            <AnimatePresence>
                {isListening && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center text-center p-6"
                    >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#E50914]/10 blur-[120px] rounded-full pointer-events-none" />
                        
                        {/* Bouncing Audio soundwave bars */}
                        <div className="flex items-end justify-center gap-1.5 h-20 mb-8">
                            {[...Array(9)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    className="w-1.5 bg-[#E50914] rounded-full"
                                    animate={{
                                        height: [16, [32, 64, 48, 80][i % 4], 16],
                                    }}
                                    transition={{
                                        duration: 0.6 + (i * 0.05),
                                        repeat: Infinity,
                                        ease: "easeInOut",
                                    }}
                                    style={{ originY: 1 }}
                                />
                            ))}
                        </div>

                        {/* Microphone Icon glowing */}
                        <motion.div
                            animate={{ scale: [1, 1.08, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                            className="w-20 h-20 rounded-full bg-[#E50914] text-white flex items-center justify-center shadow-[0_0_50px_rgba(229,9,20,0.6)] mb-6 cursor-pointer"
                            onClick={toggleVoiceSearch}
                        >
                            <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                            </svg>
                        </motion.div>

                        <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-widest animate-pulse" style={{ fontFamily: 'Outfit, sans-serif' }}>
                            {t('search.voiceListening')}
                        </h3>
                        <p className="text-white/40 text-sm max-w-sm font-light">
                            {t('search.voiceHint')}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SearchPage;
