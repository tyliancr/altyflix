/**
 * recommendationEngine.js
 *
 * Personalized recommendation engine driven by watch history.
 * Uses TMDB Recommendations API when available, falling back to TMDB Discover API
 * with genre/actor/director signals when history is empty or recommendations are not found.
 *
 * Signals:
 *   - Genre affinity   (40%) — top genres from watched content
 *   - Actor affinity   (35%) — top recurring cast members
 *   - Director affinity(25%) — top recurring directors
 */

import { 
    getMovieDetails, 
    getSeriesDetails, 
    getTrending,
    getPopularMovies,
    getPopularSeries,
    getMovieRecommendations,
    getSeriesRecommendations
} from './tmdb';
import { getContentType } from '../utils/helpers';

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/**
 * Increment a frequency map entry.
 * @param {Map<number, number>} map
 * @param {number} id
 * @param {number} weight
 */
const bump = (map, id, weight = 1) => {
    if (!id) return;
    map.set(id, (map.get(id) || 0) + weight);
};

/**
 * Sort a frequency map and return the top N keys.
 * @param {Map<number, number>} map
 * @param {number} n
 * @returns {number[]}
 */
const topN = (map, n) =>
    [...map.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, n)
        .map(([id]) => id);

/**
 * Fetch TMDB details for a single history/list item.
 * Silently returns null on failure.
 * @param {{ contentId: number, type: string }} item
 */
const fetchDetails = async (item) => {
    const id = item.contentId || item.id;
    if (!id) return null;
    const isTvHint = Boolean(
        item.type === 'tv' ||
        item.media_type === 'tv' ||
        (item.season !== undefined && item.season !== null) ||
        (item.episode !== undefined && item.episode !== null) ||
        item.first_air_date ||
        item.number_of_seasons ||
        Number(id) === 220102
    );
    const itemType = isTvHint ? 'tv' : getContentType(item, 'movie');
    try {
        if (itemType === 'tv') {
            try {
                return await getSeriesDetails(id);
            } catch {
                return await getMovieDetails(id);
            }
        } else {
            try {
                return await getMovieDetails(id);
            } catch {
                return await getSeriesDetails(id);
            }
        }
    } catch {
        return null;
    }
};

/**
 * Shuffle an array in-place.
 */
const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

/**
 * Shuffle items within buckets of similar scores to add variety
 * while keeping higher relevance items at the top.
 */
const shuffleScoredItems = (scoredItems) => {
    const buckets = {};
    scoredItems.forEach(item => {
        const bucketKey = Math.floor(item.score / 3);
        if (!buckets[bucketKey]) buckets[bucketKey] = [];
        buckets[bucketKey].push(item);
    });

    Object.keys(buckets).forEach(key => {
        shuffleArray(buckets[key]);
    });

    const sortedBucketKeys = Object.keys(buckets)
        .map(Number)
        .sort((a, b) => b - a);

    const result = [];
    sortedBucketKeys.forEach(key => {
        result.push(...buckets[key]);
    });
    return result;
};

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Build a taste profile from the last N watched items or myList items.
 *
 * @param {object[]} watchHistory — items from ProfileContext
 * @param {object[]} [myList=[]]
 * @param {number} [limit=10]
 * @returns {Promise<{
 *   topGenres: number[],
 *   topActors: number[],
 *   topDirectors: number[],
 *   seedTitle: string | null,
 *   seedType: string,
 *   seedId: number | null,
 * }>}
 */
export const buildTasteProfile = async (watchHistory, myList = [], limit = 10) => {
    const hasHistory = watchHistory && watchHistory.length > 0;
    let recentItems = hasHistory ? watchHistory.slice(0, limit) : [];

    // Fallback to myList for taste profiling if history is empty
    let profileItems = recentItems;
    if (!profileItems.length && myList && myList.length > 0) {
        profileItems = myList.slice(0, limit);
    }

    if (!profileItems.length) {
        return { hasHistory: false, topGenres: [], topActors: [], topDirectors: [], seedTitle: null, seedType: 'movie', seedId: null };
    }

    const genreMap    = new Map();
    const actorMap    = new Map();
    const directorMap = new Map();

    // Fetch details in parallel (TMDB cache absorbs repeated calls)
    const detailsList = await Promise.all(profileItems.map(fetchDetails));

    detailsList.forEach((details, idx) => {
        if (!details) return;

        // Recency weight — most recent item is worth 3x, older items taper to 1x
        const weight = Math.max(1, 3 - idx * 0.3);

        // Genres
        (details.genres || []).forEach(g => bump(genreMap, g.id, weight));

        // Cast (top 5 billed only)
        (details.credits?.cast || []).slice(0, 5).forEach(a => bump(actorMap, a.id, weight));

        // Director
        (details.credits?.crew || [])
            .filter(c => c.job === 'Director')
            .forEach(d => bump(directorMap, d.id, weight));
    });

    // Seed ONLY from watch history
    let seedTitle = null;
    let seedType  = 'movie';
    let seedId    = null;

    if (hasHistory) {
        const seedItem = watchHistory[0];
        const seedItemId = seedItem?.id || seedItem?.contentId || null;
        const isTvSeed = Boolean(
            seedItem?.type === 'tv' ||
            seedItem?.media_type === 'tv' ||
            (seedItem?.season !== undefined && seedItem?.season !== null) ||
            (seedItem?.episode !== undefined && seedItem?.episode !== null) ||
            seedItem?.first_air_date ||
            seedItem?.number_of_seasons ||
            Number(seedItemId) === 220102
        );
        seedTitle = seedItem?.title || seedItem?.name || null;
        seedType  = isTvSeed ? 'tv' : getContentType(seedItem, 'movie');
        seedId    = seedItemId;
    }

    return {
        hasHistory,
        topGenres:    topN(genreMap, 3),
        topActors:    topN(actorMap, 3),
        topDirectors: topN(directorMap, 2),
        seedTitle,
        seedType,
        seedId,
    };
};

/**
 * Score a single content item given a taste profile.
 * Returns 0-100.
 *
 * @param {object} item — TMDB item
 * @param {object} tasteProfile
 * @returns {number}
 */
export const scoreItem = (item, tasteProfile) => {
    const { topGenres = [], topActors = [], topDirectors = [] } = tasteProfile;

    // Base: TMDB rating (0-10 → scaled to 55-75 range so bonuses matter)
    let score = item.vote_average ? Math.round(item.vote_average * 6.5 + 10) : 60;

    const genres    = item.genre_ids || [];
    const castIds   = (item.cast_ids   || []);   // populated when we enrich results
    const dirIds    = (item.director_ids || []);  // populated when we enrich results

    // Genre bonuses (up to +25)
    if (topGenres[0] && genres.includes(topGenres[0])) score += 25;
    else if (topGenres[1] && genres.includes(topGenres[1])) score += 15;
    else if (topGenres[2] && genres.includes(topGenres[2])) score += 8;

    // Actor bonus (up to +15)
    if (topActors.some(a => castIds.includes(a))) score += 15;

    // Director bonus (up to +10)
    if (topDirectors.some(d => dirIds.includes(d))) score += 10;

    return Math.min(99, Math.max(50, score));
};

/**
 * Fetch personalized recommendations.
 *
 * @param {object} tasteProfile — from buildTasteProfile()
 * @param {Set<number>} excludeIds — IDs to exclude (watched, myList)
 * @param {number} [maxResults=24]
 * @returns {Promise<{ items: object[], matchScores: Map<number, number> }>}
 */
export const fetchRecommendations = async (tasteProfile, excludeIds = new Set(), maxResults = 24) => {
    const { hasHistory, topGenres, seedId, seedType } = tasteProfile;

    // If we have watch history, call the native TMDB Recommendations API first
    if (hasHistory && seedId) {
        try {
            const recommendationsData = seedType === 'tv'
                ? await getSeriesRecommendations(seedId)
                : await getMovieRecommendations(seedId);

            let allItems = (recommendationsData?.results || []).map(i => ({
                ...i,
                media_type: i.media_type || getContentType(i, seedType === 'tv' ? 'tv' : 'movie')
            }));

            if (allItems.length > 0) {
                // Deduplicate and filter out excluded
                const seen = new Set();
                const deduped = [];
                for (const item of allItems) {
                    if (seen.has(item.id) || excludeIds.has(item.id)) continue;
                    seen.add(item.id);
                    deduped.push(item);
                }

                // Enrich the candidates with details (genres, cast, directors) in parallel
                const candidates = deduped.slice(0, 30);
                const enrichedCandidates = await Promise.all(
                    candidates.map(async (item) => {
                        try {
                            const isTv = Boolean(
                                item.media_type === 'tv' ||
                                item.type === 'tv' ||
                                item.first_air_date ||
                                Number(item.id) === 220102
                            );
                            let details;
                            try {
                                details = isTv
                                    ? await getSeriesDetails(item.id)
                                    : await getMovieDetails(item.id);
                            } catch {
                                details = isTv
                                    ? await getMovieDetails(item.id)
                                    : await getSeriesDetails(item.id);
                            }
                            
                            if (details) {
                                return {
                                    ...item,
                                    genre_ids: details.genres?.map(g => g.id) || item.genre_ids || [],
                                    cast_ids: details.credits?.cast?.slice(0, 5).map(c => c.id) || [],
                                    director_ids: details.credits?.crew?.filter(c => c.job === 'Director').map(c => c.id) || []
                                };
                            }
                        } catch {
                            // Fallback
                        }
                        return { ...item, cast_ids: [], director_ids: [] };
                    })
                );

                const matchScores = new Map();
                const scored = enrichedCandidates.map(item => {
                    const s = scoreItem(item, tasteProfile);
                    matchScores.set(item.id, s);
                    return { item, score: s };
                });

                // Apply bucketing shuffle to add variety among similarly scored items
                const shuffledScored = shuffleScoredItems(scored);
                const items = shuffledScored.slice(0, maxResults).map(({ item }) => item);

                return { items, matchScores };
            }
        } catch (err) {
            console.warn('[recommendationEngine] Native TMDB recommendations failed, falling back to discover search:', err);
        }
    }

    // Fallback path: When history is empty (hasHistory is false), show trending/popular mix and cross with myList genres
    try {
        const [trending1, trending2, popularMovies, popularSeries] = await Promise.all([
            getTrending('all', 'week', 1),
            getTrending('all', 'week', 2),
            getPopularMovies(1),
            getPopularSeries(1)
        ]);

        const allItems = [
            ...(trending1?.results || []).map(i => ({ ...i, media_type: i.media_type || (i.title ? 'movie' : 'tv') })),
            ...(trending2?.results || []).map(i => ({ ...i, media_type: i.media_type || (i.title ? 'movie' : 'tv') })),
            ...(popularMovies?.results || []).map(i => ({ ...i, media_type: 'movie' })),
            ...(popularSeries?.results || []).map(i => ({ ...i, media_type: 'tv' }))
        ];

        // Deduplicate and filter out excluded
        const seen = new Set();
        const deduped = [];
        for (const item of allItems) {
            if (seen.has(item.id) || excludeIds.has(item.id)) continue;
            seen.add(item.id);
            deduped.push(item);
        }

        // Score fallback items based on popularity/rating, crossed with user's myList genres (topGenres)
        const matchScores = new Map();
        const scored = deduped.map(item => {
            const baseRating = item.vote_average || 7.0;
            // Base score in 70-85 range
            let score = Math.round(baseRating * 4.5 + 45);

            // Cross with myList genres if available (up to +15 bonus)
            const genres = item.genre_ids || [];
            if (topGenres && topGenres.length > 0) {
                if (genres.includes(topGenres[0])) score += 10;
                if (topGenres[1] && genres.includes(topGenres[1])) score += 5;
            }

            score = Math.min(98, Math.max(70, score));
            matchScores.set(item.id, score);
            return { item, score };
        });

        // Apply bucketing shuffle to add variety among similarly scored items
        const shuffledScored = shuffleScoredItems(scored);
        const items = shuffledScored.slice(0, maxResults).map(({ item }) => item);

        return { items, matchScores };
    } catch (err) {
        console.error('[recommendationEngine] Fallback failed:', err);
        return { items: [], matchScores: new Map() };
    }
};

const recommendationEngine = {
    buildTasteProfile,
    fetchRecommendations,
    scoreItem,
};

export default recommendationEngine;
