import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getTrending, getKidsMovies, getContentByGenre } from '../services/tmdb.js';
import { searchMedia } from '../services/searchService.js';
import { useProfile } from '../contexts/ProfileContext';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { getContentType, departmentLabel } from '../utils/helpers';
import { useTranslation } from '../hooks/useTranslation';
import PosterCard from '../components/ui/PosterCard';
import { PosterGrid, GridSkeleton, SectionTitle, EmptyState, Button } from '../components/ui/Primitives';
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

    // Load trending on mount (filtré Enfant si profil Enfant actif)
    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const data = currentProfile?.isKid
                    ? await getKidsMovies(1)
                    : await getTrending('all', 'week');
                if (active) setTrending(data.results?.slice(0, 12) || []);
            } catch (_) { /* no-op */ }
        })();
        // Auto-focus input
        const focusTimer = setTimeout(() => inputRef.current?.focus(), 300);
        return () => { active = false; clearTimeout(focusTimer); };
    }, [currentProfile?.isKid]);

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
                const incoming = data.results || [];
                if (incoming.length === 0) {
                    setTotalPages(targetPage);
                } else {
                    setResults(prev => {
                        const existingKeys = new Set(prev.map(p => `${p.type || getContentType(p)}_${p.id}`));
                        const newItems = incoming.filter(item => !existingKeys.has(`${item.type || getContentType(item)}_${item.id}`));
                        if (newItems.length === 0) {
                            queueMicrotask(() => setTotalPages(targetPage));
                            return prev;
                        }
                        return [...prev, ...newItems];
                    });
                }
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

    // Load genre results when a genre chip is clicked (enforcing Kids Mode when active)
    useEffect(() => {
        if (!selectedGenre) { setGenreResults([]); return; }
        const isKid = Boolean(currentProfile?.isKid);
        const genre = GENRE_CHIPS.find(g => g.id === selectedGenre);
        if (isKid && !genre?.kidSafe) {
            setSelectedGenre(null);
            setGenreResults([]);
            return;
        }
        const controller = new AbortController();
        (async () => {
            setLoading(true);
            try {
                const mediaType = genre?.type === 'tv' ? 'tv' : 'movie';
                const data = await getContentByGenre(mediaType, selectedGenre);
                if (controller.signal.aborted) return;
                const raw = data.results || [];
                const filtered = isKid
                    ? raw.filter(item => !item.adult && !(item.genre_ids || []).some(gid => [27, 80, 53, 10752].includes(gid)))
                    : raw;
                setGenreResults(filtered.slice(0, 18));
            } catch (_) {
                if (!controller.signal.aborted) setGenreResults([]);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        })();
        return () => controller.abort();
    }, [selectedGenre, currentProfile?.isKid]);

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

    const typeOf = (item) => item.type || getContentType(item);

    const personTile = (person, large = false) => {
        const avatar = person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null;
        return (
            <button
                key={`person_${person.id}`}
                type="button"
                onClick={() => handleItemClick(person)}
                className={`group flex flex-none flex-col items-center text-center ${large ? 'w-full' : 'w-24'}`}
            >
                <span className={`mb-2.5 block overflow-hidden rounded-full bg-[#101016] ring-1 ring-white/10 transition-all duration-300 group-hover:ring-2 group-hover:ring-white ${large ? 'h-24 w-24 sm:h-28 sm:w-28' : 'h-20 w-20'}`}>
                    {avatar ? (
                        <img src={avatar} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                        <span className="grid h-full w-full place-items-center font-display text-xl font-bold text-white/30">{(person.name || '?').charAt(0)}</span>
                    )}
                </span>
                <span className="w-full truncate text-[13px] font-semibold text-white/85 transition-colors group-hover:text-white">{person.name}</span>
                {large && person.known_for_department && <span className="text-xs text-white/40">{departmentLabel(person.known_for_department)}</span>}
            </button>
        );
    };

    return (
        <div className="min-h-screen bg-[#060608] pb-12 text-white">
            <Helmet>
                <title>{t('search.title')} - ALTYFLIX</title>
                <meta name="robots" content="noindex" />
            </Helmet>

            <div className="pt-safe-top-search pt-4 md:pt-32">
                <div className="mb-7 px-4 md:px-[5%]">
                    <h1 className="mb-6 hidden font-display text-4xl font-bold tracking-tight text-white sm:text-5xl md:block">
                        {t('search.title')}
                    </h1>
                    <SearchInputBar
                        query={query}
                        setQuery={setQuery}
                        inputRef={inputRef}
                        debounceRef={debounceRef}
                        setDebouncedQuery={setDebouncedQuery}
                        setSelectedGenre={setSelectedGenre}
                        placeholderIndex={placeholderIndex}
                        placeholderList={placeholderList}
                        clearQuery={clearQuery}
                        isSpeechSupported={isSpeechSupported}
                        isListening={isListening}
                        toggleVoiceSearch={toggleVoiceSearch}
                    />
                </div>

                <SearchFilterChips
                    isSearching={isSearching}
                    isKid={Boolean(currentProfile?.isKid)}
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

                <div className="px-4 md:px-[5%]">
                    {isSearching && didYouMean && searchState === 'RESULTS' && (
                        <p className="mb-6 text-sm text-white/55">
                            Essayez aussi{' '}
                            <button
                                type="button"
                                onClick={() => { setQuery(didYouMean); setDebouncedQuery(didYouMean); }}
                                className="font-semibold text-white underline underline-offset-4 hover:text-[#ff5a63]"
                            >
                                {didYouMean}
                            </button>
                        </p>
                    )}

                    <AnimatePresence mode="wait">
                        {searchState === 'OFFLINE' && (
                            <motion.div key="offline" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="py-10">
                                <EmptyState
                                    title="Vous êtes hors ligne"
                                    icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M8.5 16.5a5 5 0 017 0M5 13a10 10 0 014-2.5m6 0A10 10 0 0119 13M2 9.5a15 15 0 014.5-3m5-1.4A15 15 0 0122 9.5M12 20h.01" /></svg>}
                                >
                                    Vérifiez votre connexion internet pour lancer une recherche.
                                </EmptyState>
                            </motion.div>
                        )}

                        {searchState === 'ERROR' && (
                            <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="py-10">
                                <EmptyState
                                    tone="error"
                                    title="La recherche a échoué"
                                    icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.3 3.9L2.6 17.3A2 2 0 004.3 20h15.4a2 2 0 001.7-2.7L13.7 3.9a2 2 0 00-3.4 0z" /></svg>}
                                    action={<Button onClick={() => executeMediaSearch(debouncedQuery, filter, 1)}>Réessayer</Button>}
                                >
                                    {errorMessage || 'Impossible de contacter le service de recherche.'}
                                </EmptyState>
                            </motion.div>
                        )}

                        {loading && (
                            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">
                                <span className="sr-only">Recherche en cours…</span>
                                <GridSkeleton count={14} />
                            </motion.div>
                        )}

                        {!loading && searchState === 'RESULTS' && (
                            <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                <p className="mb-6 text-sm text-white/45">
                                    {results.length} {results.length === 1 ? t('search.results') : t('search.resultsPlural')} {t('search.for')}{' '}
                                    <span className="font-semibold text-white">«&nbsp;{debouncedQuery}&nbsp;»</span>
                                </p>

                                <div className="space-y-12">
                                    {filter === 'all' && people.length > 0 && (
                                        <section>
                                            <SectionTitle>{t('search.people')}</SectionTitle>
                                            <div className="no-scrollbar -mx-4 flex gap-5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
                                                {people.map(person => personTile(person))}
                                            </div>
                                        </section>
                                    )}

                                    {moviesAndSeries.length > 0 && (
                                        <section>
                                            {filter === 'all' && people.length > 0 && <SectionTitle>{t('search.titles')}</SectionTitle>}
                                            <PosterGrid>
                                                {moviesAndSeries.map(item => (
                                                    <PosterCard key={`${typeOf(item)}_${item.id}`} item={item} type={typeOf(item)} showType />
                                                ))}
                                            </PosterGrid>
                                        </section>
                                    )}

                                    {filter === 'person' && people.length > 0 && (
                                        <div className="grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
                                            {people.map(person => personTile(person, true))}
                                        </div>
                                    )}
                                </div>

                                <div ref={sentinelRef} className="mt-7 min-h-16">
                                    {loadingMore && <GridSkeleton count={7} />}
                                </div>
                            </motion.div>
                        )}

                        {!loading && searchState === 'EMPTY' && (
                            <motion.div key="empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="py-10">
                                <EmptyState
                                    title={t('search.noResults')}
                                    icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
                                    action={didYouMean && (
                                        <Button variant="glass" onClick={() => { setQuery(didYouMean); setDebouncedQuery(didYouMean); }}>
                                            Rechercher « {didYouMean} »
                                        </Button>
                                    )}
                                >
                                    Rien ne correspond à « <span className="font-semibold text-white">{debouncedQuery}</span> ». Vérifiez l’orthographe ou essayez un autre titre.
                                </EmptyState>
                            </motion.div>
                        )}

                        {!loading && showGenreSection && (
                            <motion.section key="genre" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                <SectionTitle>{GENRE_CHIPS.find(g => g.id === selectedGenre)?.label}</SectionTitle>
                                <PosterGrid>
                                    {genreResults.map(item => (
                                        <PosterCard key={`${getContentType(item)}_${item.id}`} item={item} type={getContentType(item)} />
                                    ))}
                                </PosterGrid>
                            </motion.section>
                        )}

                        {!loading && showTrending && trending.length > 0 && (
                            <motion.section key="trending" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                <SectionTitle>{t('search.trending')}</SectionTitle>
                                <PosterGrid>
                                    {trending.map(item => (
                                        <PosterCard key={`${getContentType(item)}_${item.id}`} item={item} type={getContentType(item)} showType />
                                    ))}
                                </PosterGrid>
                            </motion.section>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Voice search overlay */}
            <AnimatePresence>
                {isListening && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        role="dialog"
                        aria-modal="true"
                        aria-label={t('search.voiceListening')}
                        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#060608]/90 p-6 text-center backdrop-blur-xl"
                    >
                        <div className="mb-10 flex h-16 items-center justify-center gap-1.5" aria-hidden="true">
                            {[...Array(9)].map((_, i) => (
                                <motion.span
                                    key={i}
                                    className="w-1.5 rounded-full bg-white"
                                    animate={{ height: [10, [28, 56, 40, 64][i % 4], 10] }}
                                    transition={{ duration: 0.6 + (i * 0.05), repeat: Infinity, ease: 'easeInOut' }}
                                />
                            ))}
                        </div>
                        <h2 className="font-display text-2xl font-bold text-white">{t('search.voiceListening')}</h2>
                        <p className="mt-2 max-w-sm text-sm text-white/50">{t('search.voiceHint')}</p>
                        <div className="mt-8"><Button variant="glass" onClick={toggleVoiceSearch}>Arrêter</Button></div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SearchPage;
