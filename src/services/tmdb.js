import { TMDB_CONFIG, CONTENT_TYPES } from '../config/constants.js';
import { storage } from '../utils/helpers.js';

const API_KEY = TMDB_CONFIG.API_KEY;
const BASE_URL = TMDB_CONFIG.BASE_URL;

const requestCache = new Map();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_ENTRIES = 250;
const REQUEST_TIMEOUT_MS = 12000;

const getSessionCache = (key) => {
    try {
        const item = sessionStorage.getItem(`tmdb_${key}`);
        if (!item) return null;
        const parsed = JSON.parse(item);
        if (Date.now() - parsed.timestamp < CACHE_DURATION) {
            return parsed.data;
        }
        sessionStorage.removeItem(`tmdb_${key}`);
    } catch { /* ignore */ }
    return null;
};

const setSessionCache = (key, data) => {
    try {
        sessionStorage.setItem(`tmdb_${key}`, JSON.stringify({ data, timestamp: Date.now() }));
    } catch { /* ignore quota */ }
};

const pruneCache = () => {
    while (requestCache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = requestCache.keys().next().value;
        requestCache.delete(oldestKey);
    }
};

const combineSignals = (externalSignal, timeoutMs) => {
    const timeoutController = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
    }, timeoutMs);

    const onExternalAbort = () => timeoutController.abort();
    if (externalSignal) {
        if (externalSignal.aborted) {
            clearTimeout(timeoutId);
            timeoutController.abort();
        } else {
            externalSignal.addEventListener('abort', onExternalAbort, { once: true });
        }
    }

    return {
        signal: timeoutController.signal,
        didTimeout: () => timedOut,
        cleanup: () => {
            clearTimeout(timeoutId);
            if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
        }
    };
};

/**
 * Make API request to TMDB with caching
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @returns {Promise} API response
 */
const apiRequest = async (endpoint, params = {}, options = {}) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const err = new Error('OFFLINE');
        err.isOffline = true;
        throw err;
    }

    // Declared outside the try so the network-failure fallback below can cache too.
    let cacheKey = null;

    try {
        const base = BASE_URL.startsWith('http://') || BASE_URL.startsWith('https://')
            ? BASE_URL
            : (typeof window !== 'undefined' ? `${window.location.origin}${BASE_URL}` : `http://localhost:3000${BASE_URL}`);
        const url = new URL(base+endpoint);
        const aliases = {'/search/multi':'/api/search','/trending/movie/week':'/api/movies/trending'};
        const detail = endpoint.match(/^\/(movie|tv)\/(\d+)(\/season\/\d+)?$/);
        if (aliases[endpoint]) url.pathname = aliases[endpoint];
        if (detail) url.pathname = '/api/'+(detail[1]==='movie'?'movies':'series')+'/'+detail[2]+(detail[3]||'');
        if (API_KEY) {
            url.searchParams.append('api_key', API_KEY);
        }

        const userLanguage = storage.get('language', 'fr-FR');
        url.searchParams.append('language', userLanguage);

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.append(endpoint === '/search/multi' && key === 'query' ? 'q' : key, value);
            }
        });

        cacheKey = url.toString();

        if (options.signal?.aborted) {
            const abortErr = new Error('Aborted');
            abortErr.name = 'AbortError';
            throw abortErr;
        }

        // Return cached data if valid (memory or session cache)
        if (!options.skipCache) {
            if (requestCache.has(cacheKey)) {
                const { data, timestamp } = requestCache.get(cacheKey);
                if (Date.now() - timestamp < CACHE_DURATION) {
                    return data;
                }
                requestCache.delete(cacheKey); // Clear expired
            }
            const sessionData = getSessionCache(cacheKey);
            if (sessionData) {
                requestCache.set(cacheKey, { data: sessionData, timestamp: Date.now() });
                return sessionData;
            }
        }

        const { signal, cleanup, didTimeout } = combineSignals(options.signal, options.timeoutMs || REQUEST_TIMEOUT_MS);

        let response;
        let body;
        try {
            response = await fetch(url, { signal });
            // Include reading the response body in the request deadline.
            body = await response.text();
        } catch (error) {
            cleanup();
            if (didTimeout()) {
                const timeoutErr = new Error('TIMEOUT');
                timeoutErr.code = 'TIMEOUT';
                throw timeoutErr;
            }
            throw error;
        }
        cleanup();

        if (!response.ok) {
            // If proxy returned 500+ or 503 (e.g. Render asleep / cold starting), fallback directly to TMDB
            if (response.status >= 500) {
                try {
                    const fallbackUrl = new URL(`https://api.themoviedb.org/3${endpoint}`);
                    fallbackUrl.searchParams.append('api_key', 'a0819950449844817a0942ca79a4ccb0');
                    fallbackUrl.searchParams.append('language', userLanguage);
                    Object.entries(params).forEach(([key, value]) => {
                        if (value !== undefined && value !== null) {
                            fallbackUrl.searchParams.append(key, value);
                        }
                    });
                    const fbRes = await fetch(fallbackUrl);
                    if (fbRes.ok) {
                        const fbData = await fbRes.json();
                        if (!options.skipCache && !options.signal?.aborted) {
                            requestCache.set(cacheKey, { data: fbData, timestamp: Date.now() });
                            setSessionCache(cacheKey, fbData);
                            pruneCache();
                        }
                        return fbData;
                    }
                } catch {
                    // Fall through to error throw
                }
            }

            const status = response.status;
            let friendlyCode = `HTTP_${status}`;
            if (status === 401 || status === 403) friendlyCode = 'AUTH_ERROR';
            else if (status === 404) friendlyCode = 'NOT_FOUND';
            else if (status === 429) friendlyCode = 'RATE_LIMIT';
            else if (status >= 500) friendlyCode = 'SERVER_ERROR';

            const err = new Error(`TMDB API error: ${status} ${response.statusText}`);
            err.status = status;
            err.code = friendlyCode;
            throw err;
        }

        let data;
        try {
            data = JSON.parse(body);
        } catch (_e) {
            const parseErr = new Error('INVALID_JSON');
            parseErr.code = 'INVALID_JSON';
            throw parseErr;
        }

        if (!data || typeof data !== 'object') {
            const parseErr = new Error('INVALID_RESPONSE');
            parseErr.code = 'INVALID_RESPONSE';
            throw parseErr;
        }

        if (!options.skipCache && !options.signal?.aborted) {
            requestCache.set(cacheKey, { data, timestamp: Date.now() });
            setSessionCache(cacheKey, data);
            pruneCache();
        }

        return data;
    } catch (error) {
        if (error.code === 'TIMEOUT' || error.name === 'TypeError') {
            try {
                const fallbackUrl = new URL(`https://api.themoviedb.org/3${endpoint}`);
                fallbackUrl.searchParams.append('api_key', 'a0819950449844817a0942ca79a4ccb0');
                const userLanguage = storage.get('language', 'fr-FR');
                fallbackUrl.searchParams.append('language', userLanguage);
                Object.entries(params).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        fallbackUrl.searchParams.append(key, value);
                    }
                });
                const fbRes = await fetch(fallbackUrl);
                if (fbRes.ok) {
                    const fbData = await fbRes.json();
                    if (!options.skipCache && cacheKey) {
                        requestCache.set(cacheKey, { data: fbData, timestamp: Date.now() });
                        setSessionCache(cacheKey, fbData);
                        pruneCache();
                    }
                    return fbData;
                }
            } catch {
                // Ignore fallback error
            }
        }
        if (error.name === 'AbortError' || error.code === 'TIMEOUT' || error.code === 'INVALID_JSON') {
            throw error;
        }
        // Only log if it's NOT a 404 (which is often expected during type detection)
        if (!error.message?.includes('404')) {
            console.error('TMDB API request failed:', error.message || error);
        }
        throw error;
    }
};

/**
 * Get trending content
 * @param {string} mediaType - 'movie', 'tv', or 'all'
 * @param {string} timeWindow - 'day' or 'week'
 * @returns {Promise} Trending content
 */
export const getTrending = async (mediaType = 'all', timeWindow = 'week', page = 1) => {
    return apiRequest(`/trending/${mediaType}/${timeWindow}`, { page });
};


/**
 * Get popular movies
 * @param {number} page - Page number
 * @returns {Promise} Popular movies
 */
export const getPopularMovies = async (page = 1) => {
    return apiRequest('/movie/popular', { page });
};

/**
 * Get popular TV series
 * @param {number} page - Page number
 * @returns {Promise} Popular TV series
 */
export const getPopularSeries = async (page = 1) => {
    return apiRequest('/tv/popular', { page });
};

/**
 * Get top rated movies
 * @param {number} page - Page number
 * @returns {Promise} Top rated movies
 */
export const getTopRatedMovies = async (page = 1) => {
    return apiRequest('/movie/top_rated', { page });
};

/**
 * Get top rated TV series
 * @param {number} page - Page number
 * @returns {Promise} Top rated TV series
 */
export const getTopRatedSeries = async (page = 1) => {
    return apiRequest('/tv/top_rated', { page });
};

/**
 * Get now playing movies
 * @param {number} page - Page number
 * @returns {Promise} Now playing movies
 */
export const getNowPlayingMovies = async (page = 1) => {
    return apiRequest('/movie/now_playing', { page });
};

/**
 * Get upcoming movies (Time-Travel Safe)
 * Uses discover to fetch movies relative to the client's current date.
 * @param {number} page - Page number
 * @returns {Promise} Upcoming movies
 */
export const getUpcomingMovies = async (page = 1) => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Calculate 6 months from now to avoid showing movies from 2029
    const futureDate = new Date(now);
    futureDate.setMonth(now.getMonth() + 6);
    const sixMonthsLater = futureDate.toISOString().split('T')[0];

    return apiRequest('/discover/movie', {
        page,
        'primary_release_date.gte': today,
        'primary_release_date.lte': sixMonthsLater, // Limit to near future
        sort_by: 'popularity.desc', // Show "Known" movies first
        include_adult: false,
        include_video: false
    });
};

/**
 * Get airing today TV series
 * @param {number} page - Page number
 * @returns {Promise} Airing today TV series
 */
export const getAiringTodaySeries = async (page = 1) => {
    return apiRequest('/tv/airing_today', { page });
};

/**
 * Get on the air TV series
 * @param {number} page - Page number
 * @returns {Promise} On the air TV series
 */
export const getOnTheAirSeries = async (page = 1) => {
    return apiRequest('/tv/on_the_air', { page });
};

/**
 * Get movie details
 * @param {number} movieId - Movie ID
 * @returns {Promise} Movie details
 */
export const getMovieDetails = async (movieId) => {
    return apiRequest(`/movie/${movieId}`, {
        append_to_response: 'videos,credits,similar,recommendations,external_ids'
    });
};

const normalizeLupinSeries = (data) => {
    if (!data) return data;
    const s1 = data.seasons?.find(s => s.season_number === 1) || {};
    const s2 = data.seasons?.find(s => s.season_number === 2) || {};
    const s3 = data.seasons?.find(s => s.season_number === 3) || {};
    return {
        ...data,
        number_of_seasons: 4,
        seasons: [
            {
                id: 1572431,
                season_number: 1,
                name: 'Partie 1',
                episode_count: 5,
                air_date: '2021-01-08',
                overview: s1.overview || "Il y a 25 ans, la vie du jeune Assane Diop est bouleversée lorsque son père meurt après avoir été accusé d'un crime qu'il n'a pas commis. Aujourd’hui, Assane va s'inspirer de son héros, Arsène Lupin - Gentleman Cambrioleur, pour le venger…",
                poster_path: s1.poster_path || '/m0h30upC0XgXMQFJaNrT5P2X1t0.jpg'
            },
            {
                id: 1572432,
                season_number: 2,
                name: 'Partie 2',
                episode_count: 5,
                air_date: '2021-06-11',
                overview: "Assane est pris au piège par Pellegrini. Pour sauver son fils Raoul kidnappé, le gentleman cambrioleur doit concevoir un nouveau plan audacieux.",
                poster_path: s1.poster_path || '/m0h30upC0XgXMQFJaNrT5P2X1t0.jpg'
            },
            {
                id: s2.id || 310008,
                season_number: 3,
                name: 'Partie 3',
                episode_count: 7,
                air_date: s2.air_date || '2023-10-05',
                overview: s2.overview || "En cavale, Assane tente de protéger Claire et Raoul, qui sont suivis de près par la police et les médias. Mais il se heurte à de vieux ennemis, prêts à tout pour l'arrêter.",
                poster_path: s2.poster_path || '/6HQQRIBmQNO98d5gmGPd7M3QxeC.jpg'
            },
            {
                id: s3.id || 456251,
                season_number: 4,
                name: 'Partie 4',
                episode_count: s3.episode_count || 8,
                air_date: s3.air_date || '2026-10-23',
                overview: s3.overview || "Assane est toujours en prison. Pour lui Lupin c'est fini, il veut purger sa peine et tenir la promesse faite à son fils : partir rencontrer leur famille au Sénégal. Mais ses plans sont bouleversés par une mystérieuse annonce signée Lupin: celle de vols simultanés dans plusieurs musées !",
                poster_path: s3.poster_path || '/augcHFx5YPhiqfk49k7ou7KDIpq.jpg'
            }
        ]
    };
};

/**
 * Get TV series details
 * @param {number} seriesId - Series ID
 * @returns {Promise} Series details
 */
export const getSeriesDetails = async (seriesId) => {
    const data = await apiRequest(`/tv/${seriesId}`, {
        append_to_response: 'videos,credits,similar,recommendations,external_ids'
    });
    if (Number(seriesId) === 96677 && data) {
        return normalizeLupinSeries(data);
    }
    return data;
};

/**
 * Get the official title artwork (transparent logo) for a movie or series.
 * Prefers the profile language, then English, then any wide logo.
 * @param {'movie'|'tv'} type
 * @param {number} id
 * @returns {Promise<string|null>} Logo URL or null when none exists
 */
export const getTitleLogo = async (type, id, options = {}) => {
    const lang = String(storage.get('language', 'fr-FR')).slice(0, 2);
    try {
        const data = await apiRequest(`/${type === 'tv' ? 'tv' : 'movie'}/${id}/images`, {
            include_image_language: [...new Set([lang, 'en', 'null'])].join(',')
        }, options);
        const logos = (data?.logos || []).filter(l => l.file_path && !l.file_path.endsWith('.svg') && l.aspect_ratio >= 1.2);
        if (!logos.length) return null;
        const rank = (l) => (l.iso_639_1 === lang ? 0 : l.iso_639_1 === 'en' ? 1 : 2);
        logos.sort((a, b) => rank(a) - rank(b) || (b.vote_average || 0) - (a.vote_average || 0));
        return `${TMDB_CONFIG.IMAGE_BASE_URL}/w500${logos[0].file_path}`;
    } catch {
        return null;
    }
};

/**
 * Unified details getter with automatic movie/tv fallback
 * @param {number} id - Content ID
 * @param {string} [type='movie'] - Preferred type ('movie' or 'tv')
 * @returns {Promise} Content details
 */
export const getContentDetails = async (id, type = 'movie') => {
    const isTv = type === 'tv' || Number(id) === 220102;
    try {
        return isTv ? await getSeriesDetails(id) : await getMovieDetails(id);
    } catch (firstErr) {
        if (firstErr?.status === 404 || firstErr?.code === 'NOT_FOUND') {
            return isTv ? await getMovieDetails(id) : await getSeriesDetails(id);
        }
        throw firstErr;
    }
};

/**
 * Get movie recommendations from TMDB based on a movie ID
 * @param {number} movieId - Movie ID
 * @param {number} page - Page number
 * @returns {Promise} Recommendations list
 */
export const getMovieRecommendations = async (movieId, page = 1) => {
    return apiRequest(`/movie/${movieId}/recommendations`, { page });
};

/**
 * Get TV series recommendations from TMDB based on a series ID
 * @param {number} seriesId - Series ID
 * @param {number} page - Page number
 * @returns {Promise} Recommendations list
 */
export const getSeriesRecommendations = async (seriesId, page = 1) => {
    return apiRequest(`/tv/${seriesId}/recommendations`, { page });
};

/**
 * Get season details
 * @param {number} seriesId - Series ID
 * @param {number} seasonNumber - Season number
 * @returns {Promise} Season details
 */
export const getSeasonDetails = async (seriesId, seasonNumber) => {
    if (Number(seriesId) === 96677) {
        const sNum = Number(seasonNumber);
        if (sNum === 1) {
            const raw = await apiRequest(`/tv/${seriesId}/season/1`);
            return {
                ...raw,
                name: 'Partie 1',
                season_number: 1,
                episodes: (raw?.episodes || []).slice(0, 5).map(ep => ({
                    ...ep,
                    season_number: 1,
                    episode_number: ep.episode_number
                }))
            };
        }
        if (sNum === 2) {
            const raw = await apiRequest(`/tv/${seriesId}/season/1`);
            return {
                ...raw,
                name: 'Partie 2',
                season_number: 2,
                episodes: (raw?.episodes || []).slice(5, 10).map((ep, idx) => ({
                    ...ep,
                    season_number: 2,
                    episode_number: idx + 1,
                    original_episode_number: ep.episode_number
                }))
            };
        }
        if (sNum === 3) {
            const raw = await apiRequest(`/tv/${seriesId}/season/2`);
            return {
                ...raw,
                name: 'Partie 3',
                season_number: 3,
                episodes: (raw?.episodes || []).map(ep => ({
                    ...ep,
                    season_number: 3,
                    episode_number: ep.episode_number
                }))
            };
        }
        if (sNum === 4) {
            const raw = await apiRequest(`/tv/${seriesId}/season/3`);
            return {
                ...raw,
                name: 'Partie 4',
                season_number: 4,
                episodes: (raw?.episodes || []).map(ep => ({
                    ...ep,
                    season_number: 4,
                    episode_number: ep.episode_number
                }))
            };
        }
    }
    return apiRequest(`/tv/${seriesId}/season/${seasonNumber}`);
};

/**
 * Get videos (trailers, teasers, etc.)
 * @param {string} mediaType - 'movie' or 'tv'
 * @param {number} id - Content ID
 * @returns {Promise} Videos list
 */
export const getVideos = async (mediaType, id) => {
    return apiRequest(`/${mediaType}/${id}/videos`);
};

/**
 * Search multi (movies, TV, people)
 * @param {string} query - Search query
 * @param {number} page - Page number
 * @param {Object} options - Request options (signal, skipCache, etc.)
 * @returns {Promise} Search results
 */
export const searchMulti = async (query, page = 1, options = {}) => {
    return apiRequest('/search/multi', { query, page, include_adult: false }, options);
};

/**
 * Search movies
 * @param {string} query - Search query
 * @param {number} page - Page number
 * @param {Object} options - Request options
 * @returns {Promise} Search results
 */
export const searchMovies = async (query, page = 1, options = {}) => {
    return apiRequest('/search/movie', { query, page, include_adult: false }, options);
};

/**
 * Search TV series
 * @param {string} query - Search query
 * @param {number} page - Page number
 * @param {Object} options - Request options
 * @returns {Promise} Search results
 */
export const searchSeries = async (query, page = 1, options = {}) => {
    return apiRequest('/search/tv', { query, page, include_adult: false }, options);
};

/**
 * Search people (actors, directors, crew)
 * @param {string} query - Search query
 * @param {number} page - Page number
 * @param {Object} options - Request options
 * @returns {Promise} Search results
 */
export const searchPeople = async (query, page = 1, options = {}) => {
    return apiRequest('/search/person', { query, page, include_adult: false }, options);
};


/**
 * Discover movies with filters
 * @param {Object} filters - Filter parameters
 * @returns {Promise} Discovered movies
 */
export const discoverMovies = async (filters = {}) => {
    return apiRequest('/discover/movie', filters);
};

/**
 * Discover TV series with filters
 * @param {Object} filters - Filter parameters
 * @returns {Promise} Discovered TV series
 */
export const discoverSeries = async (filters = {}) => {
    return apiRequest('/discover/tv', filters);
};

/**
 * Get Kids Movies
 * Filters: Animation (16), Family (10751)
 * Excludes: Horror (27), Crime (80), Thriller (53), War (10752)
 */
export const getKidsMovies = async (page = 1) => {
    return apiRequest('/discover/movie', {
        page,
        with_genres: '16,10751',
        without_genres: '27,80,53,10752',
        certification_country: 'FR',
        'certification.lte': 'U',
        sort_by: 'popularity.desc'
    });
};

/**
 * Get Kids Series
 * Filters: Kids (10762), Animation (16), Family (10751)
 */
export const getKidsSeries = async (page = 1) => {
    return apiRequest('/discover/tv', {
        page,
        with_genres: '10762,16,10751',
        without_genres: '18,80,27',
        certification_country: 'FR',
        'certification.lte': 'U',
        sort_by: 'popularity.desc'
    });
};

/**
 * Get movie genres
 * @returns {Promise} Movie genres
 */
export const getMovieGenres = async () => {
    return apiRequest('/genre/movie/list');
};

/**
 * Get TV genres
 * @returns {Promise} TV genres
 */
export const getTVGenres = async () => {
    return apiRequest('/genre/tv/list');
};

/**
 * Get content by genre
 * @param {string} contentType - 'movie' or 'tv'
 * @param {number} genreId - Genre ID
 * @param {number} page - Page number
 * @returns {Promise} Content by genre
 */
export const getContentByGenre = async (contentType, genreId, page = 1) => {
    const endpoint = contentType === CONTENT_TYPES.MOVIE ? '/discover/movie' : '/discover/tv';
    return apiRequest(endpoint, { with_genres: genreId, page });
};

/**
 * Get person details
 * @param {number} personId - Person ID
 * @returns {Promise} Person details
 */
export const getPersonDetails = async (personId) => {
    return apiRequest(`/person/${personId}`, {
        append_to_response: 'combined_credits,movie_credits,tv_credits,images,external_ids'
    });
};

/**
 * Get upcoming TV series
 * @param {number} page - Page number
 * @returns {Promise} Upcoming TV series
 */
export const getUpcomingSeries = async (page = 1) => {
    const today = new Date().toISOString().split('T')[0];
    return apiRequest('/discover/tv', {
        page,
        'first_air_date.gte': today,
        sort_by: 'popularity.desc', // Show popular upcoming items
        include_null_first_air_dates: false,
        timezone: 'Europe/Paris'
    });
};

/**
 * Get returning TV series (existing shows with new episodes)
 * @param {number} page - Page number
 * @returns {Promise} Returning TV series
 */
export const getReturningSeries = async (page = 1) => {
    const today = new Date().toISOString().split('T')[0];
    return apiRequest('/discover/tv', {
        page,
        'air_date.gte': today, // Any episode airing from today
        'first_air_date.lte': today, // Started in the past (Returning)
        sort_by: 'popularity.desc',
        include_null_first_air_dates: false,
        timezone: 'Europe/Paris'
    });
};

/**
 * Get latest RELEASED movies (Strictly released <= Today)
 * @param {number} page - Page number
 * @returns {Promise} Latest released movies
 */
export const getLatestReleasedMovies = async (page = 1) => {
    const today = new Date().toISOString().split('T')[0];
    return apiRequest('/discover/movie', {
        page,
        'primary_release_date.lte': today, // Must be released
        'primary_release_date.gte': '2024-01-01', // Reasonable window to ensure "freshness" but not too old
        sort_by: 'primary_release_date.desc', // Newest first
        include_adult: false,
        include_video: false,
        'vote_count.gte': 50 // Filter out extremely obscure/junk entries
    });
};

/**
 * Get latest RELEASED series (Strictly aired <= Today)
 * @param {number} page - Page number
 * @returns {Promise} Latest released series
 */
export const getLatestReleasedSeries = async (page = 1) => {
    const today = new Date().toISOString().split('T')[0];
    return apiRequest('/discover/tv', {
        page,
        'first_air_date.lte': today,
        'first_air_date.gte': '2024-01-01',
        sort_by: 'first_air_date.desc',
        include_null_first_air_dates: false,
        'vote_count.gte': 5 // Lower threshold for TV as new episodes might have fewer votes initially
    });
};

/**
 * Get Upcoming French Movies
 * @param {number} page
 */
export const getUpcomingFrenchMovies = async (page = 1) => {
    const today = new Date().toISOString().split('T')[0];
    return apiRequest('/discover/movie', {
        page,
        'primary_release_date.gte': today,
        with_original_language: 'fr',
        region: 'FR',
        sort_by: 'popularity.desc',
        include_adult: false
    });
};

// --- SEASONAL THEMED ENDPOINTS (Note: These endpoints are currently unused in the main routing/pages, preserved for future seasonal promotions) ---

/**
 * Get Halloween Movies (Horror + Thriller + selected keywords like vampires, zombies, ghosts)
 */
export const getHalloweenMovies = async (page = 1) => {
    return apiRequest('/discover/movie', {
        page,
        with_genres: '27', // Horror
        sort_by: 'popularity.desc',
        'vote_count.gte': 100
    });
};

/**
 * Get Christmas Movies (Family/Comedy with Christmas keyword 3288 or 207317)
 */
export const getChristmasMovies = async (page = 1) => {
    return apiRequest('/discover/movie', {
        page,
        with_keywords: '207317|3288', // Christmas
        sort_by: 'popularity.desc',
    });
};

/**
 * Get Valentine's Movies (Romance)
 */
export const getValentineMovies = async (page = 1) => {
    return apiRequest('/discover/movie', {
        page,
        with_genres: '10749', // Romance
        sort_by: 'popularity.desc',
        'vote_count.gte': 500
    });
};

export default {
    getTrending,
    getPopularMovies,
    getPopularSeries,
    getTopRatedMovies,
    getTopRatedSeries,
    getNowPlayingMovies,
    getUpcomingMovies,
    getAiringTodaySeries,
    getOnTheAirSeries,
    getMovieDetails,
    getSeriesDetails,
    getTitleLogo,
    getContentDetails,
    getSeasonDetails,
    searchMulti,
    searchMovies,
    searchSeries,
    searchPeople,
    discoverMovies,
    discoverSeries,
    getMovieGenres,
    getTVGenres,
    getContentByGenre,
    getPersonDetails,
    getVideos,
    getKidsMovies,
    getKidsSeries,
    getUpcomingSeries,
    getReturningSeries,
    getLatestReleasedMovies,
    getLatestReleasedSeries,
    getUpcomingFrenchMovies,
    getHalloweenMovies,
    getChristmasMovies,
    getValentineMovies,
    getMovieRecommendations,
    getSeriesRecommendations,
};

