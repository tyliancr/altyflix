// Shared Kids Mode content filter (TMDB genre IDs)
const KID_SAFE_GENRES = new Set([16, 10751, 10762]); // Animation, Family, Kids
const KID_BLOCKED_GENRES = new Set([27, 80, 53, 10752, 10768]); // Horror, Crime, Thriller, War, War & Politics

/**
 * Returns true if a TMDB movie/TV item is safe to display in Kids Mode.
 */
export function isKidSafe(item) {
    if (!item || item.adult) return false;
    const genreIds = Array.isArray(item.genre_ids)
        ? item.genre_ids
        : Array.isArray(item.genres)
            ? item.genres.map(g => (typeof g === 'object' ? g.id : g))
            : [];
    if (genreIds.some(id => KID_BLOCKED_GENRES.has(Number(id)))) return false;
    return genreIds.some(id => KID_SAFE_GENRES.has(Number(id)));
}
