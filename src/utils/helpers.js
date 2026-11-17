// Utility helper functions
import { TMDB_CONFIG } from '../config/constants.js';

/**
 * Get TMDB image URL
 * @param {string} path - Image path from TMDB
 * @param {string} size - Image size (e.g., 'w500', 'original')
 * @returns {string} Full image URL
 */
export const getTMDBImageUrl = (path, size = 'original') => {
    if (!path) return '/placeholder-poster.jpg';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${TMDB_CONFIG.IMAGE_BASE_URL}/${size}${path}`;
};

/**
 * Get poster URL with fallback
 * @param {string} posterPath - TMDB poster path
 * @param {string} size - Image size
 * @returns {string} Poster URL
 */
export const getPosterUrl = (posterPath, size = 'w500') => {
    return getTMDBImageUrl(posterPath, size);
};

/**
 * Get backdrop URL with fallback
 * @param {string} backdropPath - TMDB backdrop path
 * @param {string} size - Image size
 * @returns {string} Backdrop URL
 */
export const getBackdropUrl = (backdropPath, size = 'w1280') => {
    return getTMDBImageUrl(backdropPath, size);
};

/**
 * Format runtime to hours and minutes
 * @param {number} minutes - Runtime in minutes
 * @returns {string} Formatted runtime (e.g., "2h 30m")
 */
export const formatRuntime = (minutes) => {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
};

/**
 * Format timestamp to readable time
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time (e.g., "1:23:45")
 */
export const formatTime = (seconds) => {
    if (!seconds || seconds < 0) return '0:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Format year from date string
 * @param {string} dateString - Date string (e.g., "2023-12-01")
 * @returns {string} Year
 */
export const getYear = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).getFullYear().toString();
};

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
};

/**
 * Truncate text to specified length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export const truncate = (text, maxLength = 150) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
};

/**
 * Sanitize return URL to prevent open redirect vulnerabilities.
 * Only allows relative paths starting with a single '/' and rejects protocols / schemes.
 * @param {string} url - Return URL candidate
 * @param {string} fallback - Fallback URL if invalid
 * @returns {string} Safe internal route
 */
export const sanitizeReturnUrl = (url, fallback = '/') => {
    if (!url || typeof url !== 'string') return fallback;
    const trimmed = url.trim();
    if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\') || Array.from(trimmed).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return fallback;
    try {
        const parsed = new URL(trimmed, 'https://altyflix.invalid');
        if (parsed.origin !== 'https://altyflix.invalid') return fallback;
    } catch { return fallback; }
    const lower = trimmed.toLowerCase();
    if (
        lower.includes('http:') ||
        lower.includes('https:') ||
        lower.includes('javascript:') ||
        lower.includes('data:') ||
        lower.includes('vbscript:')
    ) {
        return fallback;
    }
    return trimmed;
};

/**
 * Local storage helpers with error handling
 */
export const storage = {
    get: (key, defaultValue = null) => {
        if (typeof window === 'undefined' || typeof localStorage === 'undefined') return defaultValue;
        try {
            const item = localStorage.getItem(key);
            if (!item) return defaultValue;
            try {
                return JSON.parse(item);
            } catch {
                return item; // Fallback to raw string if it wasn't stringified properly
            }
        } catch (error) {
            console.error(`Error reading from localStorage: ${key}`, error);
            return defaultValue;
        }
    },

    set: (key, value) => {
        if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`Error writing to localStorage: ${key}`, error);
            return false;
        }
    },

    remove: (key) => {
        if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error(`Error removing from localStorage: ${key}`, error);
            return false;
        }
    },

    clear: () => {
        if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('Error clearing localStorage', error);
            return false;
        }
    },
};

/**
 * Determine content type (movie or tv) from TMDB data
 * @param {Object} item - TMDB item data
 * @param {string} defaultType - Default type if detection fails
 * @returns {string} 'movie' or 'tv'
 */
export const getContentType = (item, defaultType = 'movie') => {
    if (!item) return defaultType;

    if (item.media_type === 'movie' || item.type === 'movie') return 'movie';

    // 1. Structural TV indicators (absolute truth: movies never have seasons or episodes)
    if (
        (item.season !== undefined && item.season !== null) ||
        (item.episode !== undefined && item.episode !== null) ||
        (item.season_number !== undefined && item.season_number !== null) ||
        (item.episode_number !== undefined && item.episode_number !== null) ||
        item.number_of_seasons ||
        item.number_of_episodes ||
        item.seasons ||
        item.episodes ||
        item.first_air_date ||
        Number(item.contentId || item.id) === 220102 // Spider-Noir is a TV series
    ) {
        return 'tv';
    }

    // 2. Explicit media_type from TMDB (multi-search / trending)
    if (item.media_type) {
        if (item.media_type === 'tv' || item.media_type === 'series') return 'tv';
        if (item.media_type === 'movie') return 'movie';
        if (item.media_type === 'person') return 'person';
    }

    // 3. Explicit type field (normalized internally)
    if (item.type) {
        if (item.type === 'tv' || item.type === 'series') return 'tv';
        if (item.type === 'movie') return 'movie';
        if (item.type === 'person') return 'person';
    }

    // 4. Release date without TV hints indicates movie
    if (item.release_date) return 'movie';

    // 5. Person detection via profile_path
    if (item.profile_path && !item.poster_path && !item.backdrop_path) return 'person';

    // 6. name vs title fallback
    if (item.name && !item.title) return 'tv';
    if (item.title && !item.name) return 'movie';

    return defaultType;
};

