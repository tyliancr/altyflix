// App constants and configuration

const viteEnv = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};

// TMDB API Configuration
export const TMDB_CONFIG = {
    API_KEY: '',
    BASE_URL: '/api/tmdb',
    IMAGE_BASE_URL: viteEnv.VITE_TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p',
    IMAGE_SIZES: {
        poster: {
            small: 'w185',
            medium: 'w342',
            large: 'w500',
            original: 'original',
        },
        backdrop: {
            small: 'w300',
            medium: 'w780',
            large: 'w1280',
            original: 'original',
        },
        profile: {
            small: 'w45',
            medium: 'w185',
            large: 'h632',
            original: 'original',
        },
    },
};

// Default profile avatars (using exact local Netflix style PNG icons)
export const DEFAULT_AVATARS = [
    '/avatars/users-1.png', // Red Netflix Face
    '/avatars/users-2.png', // Blue Netflix Face
    '/avatars/users-3.png', // Yellow Netflix Face
    '/avatars/users-4.png', // Green Netflix Face
];

// Genre mappings (TMDB genre IDs)
export const GENRES = {
    ACTION: 28,
    ADVENTURE: 12,
    ANIMATION: 16,
    COMEDY: 35,
    CRIME: 80,
    DOCUMENTARY: 99,
    DRAMA: 18,
    FAMILY: 10751,
    FANTASY: 14,
    HISTORY: 36,
    HORROR: 27,
    MUSIC: 10402,
    MYSTERY: 9648,
    ROMANCE: 10749,
    SCIENCE_FICTION: 878,
    TV_MOVIE: 10770,
    THRILLER: 53,
    WAR: 10752,
    WESTERN: 37,
};

// TV Genres
export const TV_GENRES = {
    ACTION_ADVENTURE: 10759,
    ANIMATION: 16,
    COMEDY: 35,
    CRIME: 80,
    DOCUMENTARY: 99,
    DRAMA: 18,
    FAMILY: 10751,
    KIDS: 10762,
    MYSTERY: 9648,
    NEWS: 10763,
    REALITY: 10764,
    SCI_FI_FANTASY: 10765,
    SOAP: 10766,
    TALK: 10767,
    WAR_POLITICS: 10768,
    WESTERN: 37,
};

// Genre ID to Name Mapping
export const GENRE_NAMES = {
    28: 'Action',
    12: 'Aventure',
    16: 'Animation',
    35: 'Comédie',
    80: 'Crime',
    99: 'Documentaire',
    18: 'Drame',
    10751: 'Famille',
    14: 'Fantastique',
    36: 'Histoire',
    27: 'Horreur',
    10402: 'Musique',
    9648: 'Mystère',
    10749: 'Romance',
    878: 'Science-Fiction',
    10770: 'Téléfilm',
    53: 'Thriller',
    10752: 'Guerre',
    37: 'Western',
    10759: 'Action & Aventure',
    10762: 'Enfants',
    10763: 'Actualités',
    10764: 'Téléréalité',
    10765: 'Science-Fiction & Fantastique',
    10766: 'Feuilleton',
    10767: 'Talk-show',
    10768: 'Guerre & Politique',
};

// Video source types
export const VIDEO_SOURCE_TYPES = {
    HTML5: 'html5',
    IFRAME: 'iframe',
    HLS: 'hls',
    YOUTUBE: 'youtube',
};

// Content types
export const CONTENT_TYPES = {
    MOVIE: 'movie',
    SERIES: 'tv',
};

// Hero banner rotation interval (milliseconds)
export const HERO_ROTATION_INTERVAL = 8000;

// Progress save interval (milliseconds)
export const PROGRESS_SAVE_INTERVAL = 10000;

// Search debounce delay (milliseconds)
export const SEARCH_DEBOUNCE_DELAY = 300;

// Carousel settings
export const CAROUSEL_SETTINGS = {
    itemsPerPage: {
        mobile: 2,
        tablet: 3,
        desktop: 5,
        wide: 6,
    },
    gap: 8,
};

// App metadata
export const APP_CONFIG = {
    name: viteEnv.VITE_APP_NAME || 'ALTYFLIX',
    url: viteEnv.VITE_APP_URL || 'http://localhost:5173',
    description: 'Premium streaming platform for movies and series',
};

// External video source providers (for future scraping integration)
export const VIDEO_PROVIDERS = {
    MOVIX: 'movix',
    FLEMMIX: 'flemmix',
    ALLOCINE: 'allocine',
    CUSTOM: 'custom',
};
