import { searchMulti, searchMovies, searchSeries, searchPeople } from './tmdb.js';

/**
 * Normalizes text for accent-insensitive, case-insensitive comparison
 * @param {string} str
 * @returns {string}
 */
export const normalizeText = (str) => {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Pre-sanitizes query string specifically for TMDB's search endpoint.
 * Converts typographical quotes (curly apostrophes), em/en dashes, and removes noise.
 * @param {string} str
 * @returns {string}
 */
export const sanitizeForTMDB = (str) => {
    if (!str) return '';
    return str
        .replace(/[\u2018\u2019]/g, "'") // Right & left single curly quote -> straight apostrophe
        .replace(/[\u201C\u201D]/g, '"') // Curly double quotes
        .replace(/[\u2013\u2014]/g, '-') // En-dash, Em-dash
        .replace(/[!¡?¿]/g, ' ')         // Exclamation / question marks that break TMDB exact title lookups
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Removes punctuation (colons, hyphens, slashes) to handle subtitles gracefully.
 * Example: "Avatar: La Voie de l'eau" -> "Avatar La Voie de l'eau"
 */
export const stripPunctuation = (str) => {
    if (!str) return '';
    return sanitizeForTMDB(str)
        .replace(/[:;/\\_|-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Computes Levenshtein edit distance between two strings
 */
export const levenshtein = (a, b) => {
    const an = a ? a.length : 0;
    const bn = b ? b.length : 0;
    if (an === 0) return bn;
    if (bn === 0) return an;
    const matrix = Array.from({ length: bn + 1 }, (_, i) => [i]);
    for (let j = 0; j <= an; j++) matrix[0][j] = j;
    for (let i = 1; i <= bn; i++) {
        for (let j = 1; j <= an; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[bn][an];
};

// Fast-path known aliases, abbreviations, sequels, and common search shortcuts
export const KNOWN_ALIASES = {
    // Sagas & Shortcuts
    'batmn': 'Batman',
    'the bat': 'The Batman',
    'dark knight': 'The Dark Knight',
    'avatr': 'Avatar',
    'avatar 2': "Avatar : La Voie de l'eau",
    'avatar la voie de leau': "Avatar : La Voie de l'eau",
    'dune 2': 'Dune : Deuxième Partie',
    'top gun 2': 'Top Gun : Maverick',
    'gladiator 2': 'Gladiator II',
    'gladiateur': 'Gladiator',
    'gladiateur 2': 'Gladiator II',
    'interstelar': 'Interstellar',
    'interstellar film': 'Interstellar',
    'spiderman': 'Spider-Man',
    'spider man': 'Spider-Man',
    'spider-man no way home': 'Spider-Man: No Way Home',
    'fast and furious': 'Fast & Furious',
    'fast & furious': 'Fast & Furious',
    'fast and furious 10': 'Fast X',
    'intouch': 'Intouchables',
    'intouchable': 'Intouchables',
    'openheimer': 'Oppenheimer',
    'oppenheime': 'Oppenheimer',
    'oppenhiemer': 'Oppenheimer',
    'peaky': 'Peaky Blinders',
    'peaky blinder': 'Peaky Blinders',
    'got': 'Game of Thrones',
    'game of throne': 'Game of Thrones',
    'hotd': 'House of the Dragon',
    'seigneur des anneaux': 'Le Seigneur des Anneaux',
    'seigneur des anneaux 1': 'Le Seigneur des Anneaux : La Communauté de l\'anneau',
    'seigneur des anneaux 2': 'Le Seigneur des Anneaux : Les Deux Tours',
    'seigneur des anneaux 3': 'Le Seigneur des Anneaux : Le Retour du Roi',
    'lotr': 'The Lord of the Rings',
    'snk': "L'Attaque des Titans",
    'aot': 'Attack on Titan',
    'lattaque des titans': "L'Attaque des Titans",
    'l attaque des titans': "L'Attaque des Titans",
    'stranger': 'Stranger Things',
    'stranger thing': 'Stranger Things',
    'breaking': 'Breaking Bad',
    'breakin bad': 'Breaking Bad',
    'last of us': 'The Last of Us',
    'the last of us': 'The Last of Us',
    'casa de papel': 'La Casa de Papel',
    'la case de papel': 'La Casa de Papel',
    'la casa del papel': 'La Casa de Papel',
    'squid games': 'Squid Game',
    'squid game 2': 'Squid Game',
    'prison break': 'Prison Break',
    'vikings': 'Vikings',
    'viking': 'Vikings',
    'walking dead': 'The Walking Dead',
    'the walking dead': 'The Walking Dead',
    'harry poter': 'Harry Potter',
    'harry potter 1': "Harry Potter à l'école des sorciers",
    'star wars 7': 'Star Wars : Le Réveil de la Force',
    'star wars 8': 'Star Wars : Les Derniers Jedi',
    'star wars 9': "Star Wars : L'Ascension de Skywalker",
    'le parrain': 'Le Parrain',
    'godfather': 'The Godfather',
    'insepction': 'Inception',
    'incepshun': 'Inception',
    'avangers': 'Avengers',
    'avenger': 'Avengers',
    'avengers endgame': 'Avengers: Endgame',
    'avengers end game': 'Avengers: Endgame',
    'avengers infinity war': 'Avengers: Infinity War',
    'le loup de wall street': 'Le Loup de Wall Street',
    'wolf of wall street': 'The Wolf of Wall Street',
    'django': 'Django Unchained',
    'shutter island': 'Shutter Island',
    'fight club': 'Fight Club',
    'pulp fiction': 'Pulp Fiction',
    'forrest gump': 'Forrest Gump',
    'le fabuleux destin damelie poulain': "Le Fabuleux Destin d'Amélie Poulain",
    'amelie poulain': "Le Fabuleux Destin d'Amélie Poulain",
    'la haine': 'La Haine',
    'kaamelott': 'Kaamelott',
    'lupin': 'Lupin',
    'mercredi': 'Mercredi',
    'wednesday': 'Wednesday',
    'arcane': 'Arcane',
    'one piece': 'One Piece',
    'naruto': 'Naruto',
    'demon slayer': 'Demon Slayer: Kimetsu no Yaiba',
    'jujutsu kaisen': 'Jujutsu Kaisen',
    'the boys': 'The Boys',
    'chernobyl': 'Chernobyl',
    'witcher': 'The Witcher',
    'the witcher': 'The Witcher',

    // Celebrities / Directors
    'nolan': 'Christopher Nolan',
    'christopher nolan': 'Christopher Nolan',
    'dicaprio': 'Leonardo DiCaprio',
    'leonardo dicaprio': 'Leonardo DiCaprio',
    'tarantino': 'Quentin Tarantino',
    'quentin tarantino': 'Quentin Tarantino',
    'scorsese': 'Martin Scorsese',
    'martin scorsese': 'Martin Scorsese',
    'spielberg': 'Steven Spielberg',
    'steven spielberg': 'Steven Spielberg',
    'villeneuve': 'Denis Villeneuve',
    'denis villeneuve': 'Denis Villeneuve',
    'cameron': 'James Cameron',
    'james cameron': 'James Cameron',
    'fincher': 'David Fincher',
    'david fincher': 'David Fincher',
    'cillian murphy': 'Cillian Murphy',
    'murphy': 'Cillian Murphy',
    'brad pitt': 'Brad Pitt',
    'zendaya': 'Zendaya',
    'timothee chalamet': 'Timothée Chalamet',
    'chalamet': 'Timothée Chalamet',
    'margot robbie': 'Margot Robbie',
    'robbie': 'Margot Robbie',
    'ryan gosling': 'Ryan Gosling',
    'gosling': 'Ryan Gosling',
    'robert downey jr': 'Robert Downey Jr.',
    'tom hanks': 'Tom Hanks',
    'hanks': 'Tom Hanks'
};

// Popular curated dictionary for algorithmic typo-tolerance
export const POPULAR_DICTIONARY = [
    // Blockbusters & Classics
    'Batman', 'The Batman', 'The Dark Knight', 'Interstellar', 'Avatar',
    "Avatar : La Voie de l'eau", 'Spider-Man', 'Spider-Man: No Way Home',
    'Spider-Man: Across the Spider-Verse', 'Intouchables', 'Breaking Bad',
    'Stranger Things', 'The Last of Us', 'Oppenheimer', 'Inception', 'Tenet',
    'Gladiator', 'Gladiator II', 'Titanic', 'Dune', 'Dune : Deuxième Partie',
    'Top Gun : Maverick', 'Harry Potter', 'Game of Thrones', 'House of the Dragon',
    'Peaky Blinders', 'Star Wars', 'Avengers', 'Avengers: Endgame', 'Avengers: Infinity War',
    'Iron Man', 'The Matrix', 'Matrix', 'Le Parrain', 'The Godfather', 'Pulp Fiction',
    'Fight Club', 'Forrest Gump', "Le Fabuleux Destin d'Amélie Poulain",
    'La Haine', 'Kaamelott', 'Lupin', 'La Casa de Papel', 'Squid Game',
    'Prison Break', 'Vikings', 'The Walking Dead', 'The Boys', 'Chernobyl',
    'The Witcher', 'Mercredi', 'Wednesday', 'Arcane', 'Euphoria', 'Succession',
    'Better Call Saul', 'The Bear', 'Shōgun', 'Fallout', 'Dexter',
    'Sherlock', 'Black Mirror', 'True Detective', 'Fargo', 'Severance',
    'The Mandalorian', 'The Crown', 'Dark', 'Narcos', 'Mindhunter',
    'Fleabag', 'The Office', 'Friends', 'How I Met Your Mother', 'Modern Family',

    // Anime & Animation
    'One Piece', 'Naruto', 'Naruto Shippuden', 'Demon Slayer', 'Demon Slayer: Kimetsu no Yaiba',
    'Jujutsu Kaisen', "L'Attaque des Titans", 'Attack on Titan', 'Death Note',
    'Fullmetal Alchemist: Brotherhood', 'Hunter x Hunter', 'Dragon Ball Z', 'Dragon Ball Super',
    'Bleach', 'My Hero Academia', 'Solo Leveling', 'Chainsaw Man', 'Spy x Family',
    'Le Voyage de Chihiro', 'Princesse Mononoké', 'Le Château Ambulant', 'Your Name',
    'Suzume', 'Le Roi Lion', 'Coco', 'Ratatouille', 'Wall-E', 'Vice-Versa', 'Shrek',

    // Famous People
    'Tom Hanks', 'Leonardo DiCaprio', 'Christopher Nolan', 'Brad Pitt',
    'Cillian Murphy', 'Robert Downey Jr.', 'Margot Robbie', 'Ryan Gosling',
    'Zendaya', 'Timothée Chalamet', 'Martin Scorsese', 'Quentin Tarantino',
    'Denis Villeneuve', 'Steven Spielberg', 'James Cameron', 'David Fincher',
    'Christian Bale', 'Joaquin Phoenix', 'Al Pacino', 'Robert De Niro',
    'Denzel Washington', 'Morgan Freeman', 'Keanu Reeves', 'Matt Damon',
    'Johnny Depp', 'Hugh Jackman', 'Pedro Pascal', 'Tom Cruise',
    'Emma Stone', 'Scarlett Johansson', 'Florence Pugh', 'Anne Hathaway',
    'Natalie Portman', 'Meryl Streep', 'Cate Blanchett', 'Guillermo del Toro',
    'Ridley Scott', 'Hayao Miyazaki', 'Bong Joon-ho'
];

/**
 * Finds a fuzzy suggestion / typo correction for a given query
 * @param {string} rawQuery
 * @returns {string|null} Suggested term
 */
export const findFuzzyCorrection = (rawQuery) => {
    if (!rawQuery) return null;
    const qNorm = normalizeText(rawQuery);
    if (qNorm.length < 2) return null;

    // 1. Check direct alias
    if (KNOWN_ALIASES[qNorm]) {
        return KNOWN_ALIASES[qNorm];
    }

    // 2. Check dictionary via Levenshtein
    let best = null;
    let minDistance = 999;
    for (const candidate of POPULAR_DICTIONARY) {
        const cNorm = normalizeText(candidate);
        if (cNorm === qNorm) return null; // already exact
        const dist = levenshtein(qNorm, cNorm);
        const maxAllowed = qNorm.length <= 4 ? 1 : qNorm.length <= 8 ? 2 : 3;
        if (dist <= maxAllowed && dist < minDistance) {
            minDistance = dist;
            best = candidate;
        }
    }
    return best;
};

/**
 * Infers whether an item is a movie, tv show, or person
 */
export const inferMediaType = (item, preferredType = null) => {
    if (preferredType && preferredType !== 'all') return preferredType;
    if (!item) return 'movie';
    if (item.media_type === 'tv' || item.media_type === 'movie' || item.media_type === 'person') {
        return item.media_type;
    }
    if (item.known_for_department || Array.isArray(item.known_for) || (item.profile_path && !item.release_date && !item.first_air_date)) {
        return 'person';
    }
    if (item.first_air_date || item.number_of_seasons) return 'tv';
    if (item.release_date) return 'movie';
    if (item.name && !item.title) return 'tv';
    return 'movie';
};

export const normalizeResultItem = (item, preferredType = null) => {
    if (!item || item.id == null) return null;
    const type = inferMediaType(item, preferredType);
    const title = item.title || item.name || '';
    const originalTitle = item.original_title || item.original_name || title;

    return {
        // Pass-through raw properties for MovieCard compatibility FIRST
        ...item,
        // Guaranteed normalized fields
        id: item.id,
        type,
        media_type: type,
        title,
        name: type === 'person' ? (item.name || title) : title,
        originalTitle,
        original_title: originalTitle,
        original_name: originalTitle,
        poster_path: item.poster_path || null,
        backdrop_path: item.backdrop_path || item.poster_path || null,
        profile_path: item.profile_path || null,
        overview: item.overview || '',
        release_date: item.release_date || '',
        first_air_date: item.first_air_date || '',
        vote_average: typeof item.vote_average === 'number' ? item.vote_average : 0,
        vote_count: typeof item.vote_count === 'number' ? item.vote_count : 0,
        popularity: typeof item.popularity === 'number' ? item.popularity : 0,
        genre_ids: Array.isArray(item.genre_ids) ? item.genre_ids : [],
        known_for_department: item.known_for_department || null,
        known_for: Array.isArray(item.known_for) ? item.known_for.map((entry) => normalizeResultItem(entry)).filter(Boolean) : [],
    };
};

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Checks if a release date is recent (released within the last 12 months or upcoming)
 */
const isRecentContent = (dateStr) => {
    if (!dateStr) return false;
    const date = new Date(dateStr).getTime();
    if (Number.isNaN(date)) return false;
    const twelveMonthsAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
    return date >= twelveMonthsAgo;
};

/**
 * Scores and ranks an item based on relevance to query
 */
export const scoreItem = (item, rawQuery) => {
    const q = normalizeText(rawQuery);
    if (!q) return item.popularity || 0;

    const title = normalizeText(item.title || item.name || '');
    const orig = normalizeText(item.original_title || item.original_name || '');
    let score = 0;

    const wordBoundaryMatch = (text) => {
        try {
            return new RegExp(`\\b${escapeRegExp(q)}\\b`).test(text);
        } catch {
            return text.includes(q);
        }
    };

    const isExact = title === q || orig === q;
    const isPrefix = title.startsWith(q) || orig.startsWith(q);

    // 1. Exact match (French or Original)
    if (isExact) {
        score += 6000;
    }
    // 2. Starts with query
    else if (isPrefix) {
        score += 3500;
    }
    // 3. Word boundary match
    else if (wordBoundaryMatch(title) || wordBoundaryMatch(orig)) {
        score += 2200;
    }
    // 4. Substring match
    else if (title.includes(q) || orig.includes(q)) {
        score += 1200;
    }

    // Normalized comparison without spaces (e.g. spiderman vs spider man)
    const qNoSpace = q.replace(/\s+/g, '');
    const titleNoSpace = title.replace(/\s+/g, '');
    if (qNoSpace && titleNoSpace.includes(qNoSpace)) {
        score += 900;
    }

    // French title match extra boost
    if (title === q) {
        score += 1500;
    }

    // Penalty for obscure items:
    // ONLY penalize items if they are neither exact matches, nor prefixes, nor recently released, nor high popularity!
    const isPerson = item.type === 'person' || item.media_type === 'person' || !!item.profile_path;
    const voteCount = item.vote_count || 0;
    const isRecent = isRecentContent(item.release_date || item.first_air_date);
    const isPopular = (item.popularity || 0) > 15;

    if (!isPerson && !isExact && !isPrefix && !isRecent && !isPopular) {
        if (voteCount < 5) {
            score -= 3000;
        } else if (voteCount < 25) {
            score -= 1000;
        }
    }

    // Popularity and vote bonuses
    score += Math.min(item.popularity || 0, 1500);
    score += Math.min(voteCount / 4, 3000);
    score += (item.vote_average || 0) * 10;

    // Bonus for having visual asset
    if (item.poster_path || item.profile_path) {
        score += 100;
    }

    return score;
};

/**
 * In-memory and session-backed search cache (5 minutes TTL)
 */
const searchCache = new Map();
const SEARCH_CACHE_TTL = 5 * 60 * 1000;
const MAX_SEARCH_CACHE = 100;
const MAX_QUERY_LENGTH = 200;

export const clearSearchCache = () => {
    searchCache.clear();
};

const pruneSearchCache = () => {
    while (searchCache.size > MAX_SEARCH_CACHE) {
        const oldestKey = searchCache.keys().next().value;
        searchCache.delete(oldestKey);
    }
};

const throwIfAborted = (signal) => {
    if (signal?.aborted) {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
    }
};

/**
 * Primary search coordinator executing multi/movie/tv/person searches with caching,
 * ranking, deduplication, punctuation sanitization, artist works extraction, and fuzzy fallback.
 */
export const searchMedia = async ({
    query = '',
    filter = 'all',
    page = 1,
    signal = null,
    isKid = false
}) => {
    const raw = String(query || '').trim().slice(0, MAX_QUERY_LENGTH);
    if (!raw) {
        return { results: [], totalPages: 0, totalResults: 0, didYouMean: null };
    }

    throwIfAborted(signal);

    const sanitized = sanitizeForTMDB(raw);
    const cacheKey = `${normalizeText(sanitized)}:${filter}:${page}:${isKid ? 'kid' : 'all'}`;

    if (searchCache.has(cacheKey)) {
        const { data, timestamp } = searchCache.get(cacheKey);
        if (Date.now() - timestamp < SEARCH_CACHE_TTL) {
            return data;
        }
        searchCache.delete(cacheKey);
    }

    // Check for fuzzy correction
    const fuzzySuggestion = findFuzzyCorrection(sanitized);
    const preferredType = filter === 'all' ? null : filter;

    // Select endpoint
    const fetchWithFilter = async (searchQuery) => {
        throwIfAborted(signal);
        if (filter === 'movie') {
            return await searchMovies(searchQuery, page, { signal });
        } else if (filter === 'tv') {
            return await searchSeries(searchQuery, page, { signal });
        } else if (filter === 'person') {
            return await searchPeople(searchQuery, page, { signal });
        }
        return await searchMulti(searchQuery, page, { signal });
    };

    let data = await fetchWithFilter(sanitized);
    if (!data || typeof data !== 'object') {
        data = { results: [], total_pages: 0, total_results: 0 };
    }
    let rawResults = Array.isArray(data.results) ? data.results : [];
    let didYouMean = null;

    throwIfAborted(signal);

    // Fallback 1: If 0 results and query contains punctuation (e.g. "Avatar: La Voie de l'eau" or "Fast & Furious")
    if (rawResults.length === 0) {
        const stripped = stripPunctuation(sanitized);
        if (stripped && stripped.toLowerCase() !== sanitized.toLowerCase()) {
            try {
                const strippedData = await fetchWithFilter(stripped);
                if (strippedData?.results && strippedData.results.length > 0) {
                    rawResults = strippedData.results;
                    data = strippedData;
                }
            } catch (err) {
                if (err.name === 'AbortError') throw err;
            }
        }
    }

    throwIfAborted(signal);

    // Fallback 2: Check fuzzy suggestion from dictionary or aliases
    if ((rawResults.length === 0 || (rawResults.length <= 2 && (rawResults[0]?.vote_count || 0) < 50)) && fuzzySuggestion && normalizeText(fuzzySuggestion) !== normalizeText(sanitized)) {
        try {
            const fallbackData = await fetchWithFilter(fuzzySuggestion);
            if (fallbackData?.results && fallbackData.results.length > 0) {
                rawResults = fallbackData.results;
                data = fallbackData;
                didYouMean = fuzzySuggestion;
            }
        } catch (err) {
            if (err.name === 'AbortError') throw err;
        }
    } else if (fuzzySuggestion && normalizeText(fuzzySuggestion) !== normalizeText(sanitized)) {
        didYouMean = fuzzySuggestion;
    }

    throwIfAborted(signal);

    // Normalize all main items
    let normalized = rawResults.map((item) => normalizeResultItem(item, preferredType)).filter(Boolean);

    // Feature: Enrich results with "known_for" works of matched artists when on 'all' or 'movie' or 'tv'
    // If user searched for an actor/director (e.g. Christopher Nolan, Tarantino, DiCaprio),
    // extract their known masterpieces and insert them into the titles grid if not already present!
    if (filter !== 'person') {
        const personMatches = normalized.filter(item => item.type === 'person');
        const extraWorks = [];
        for (const person of personMatches) {
            if (Array.isArray(person.known_for)) {
                for (const work of person.known_for) {
                    const normWork = normalizeResultItem(work);
                    if (normWork && (filter === 'all' || normWork.type === filter)) {
                        // Mark work with a slight boost because it's by the searched artist
                        normWork._fromArtist = person.name;
                        extraWorks.push(normWork);
                    }
                }
            }
        }
        if (extraWorks.length > 0) {
            normalized = [...normalized, ...extraWorks];
        }
    }

    // Apply Kid safety filter if profile is kid
    if (isKid) {
        const kidGenres = [16, 10751, 10762];
        const adultGenres = [27, 80, 53, 10752];
        normalized = normalized.filter(item => {
            if (item.type === 'person') return false;
            if (item.adult) return false;
            const genres = item.genre_ids || [];
            const hasKidGenre = genres.some(id => kidGenres.includes(id));
            const hasAdultGenre = genres.some(id => adultGenres.includes(id));
            return hasKidGenre && !hasAdultGenre;
        });
    }

    // Filter by type if not 'all'
    if (filter !== 'all') {
        normalized = normalized.filter(item => item.type === filter);
    }

    // Rank by relevance
    const ranked = normalized.sort((a, b) => scoreItem(b, sanitized) - scoreItem(a, sanitized));

    // Deduplicate by ID and type
    const uniqueResults = [];
    const seen = new Set();
    for (const item of ranked) {
        const uniqueKey = `${item.type}_${item.id}`;
        if (!seen.has(uniqueKey)) {
            seen.add(uniqueKey);
            uniqueResults.push(item);
        }
    }

    const payload = {
        results: uniqueResults,
        totalPages: Number(data.total_pages) > 0 ? Number(data.total_pages) : 1,
        totalResults: Number(data.total_results) || uniqueResults.length,
        didYouMean
    };

    throwIfAborted(signal);
    searchCache.set(cacheKey, { data: payload, timestamp: Date.now() });
    pruneSearchCache();
    return payload;
};
