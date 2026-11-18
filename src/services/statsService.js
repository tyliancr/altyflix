import { auth, db, isFirebaseConfigured } from '../config/firebase';
import { doc, setDoc, increment, getDocs, collection, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import tmdb from './tmdb';

// Collection references
const STATS_MOVIES = 'stats_movies';
const STATS_SERIES = 'stats_series';

export const recordView = async (contentId, type) => {
    if (!contentId || !type || !isFirebaseConfigured || !auth?.currentUser) return;

    const collectionName = type === 'movie' ? STATS_MOVIES : STATS_SERIES;
    const statsRef = doc(db, collectionName, String(contentId));

    try {
        await setDoc(statsRef, {
            count: increment(1),
            lastWatched: serverTimestamp()
        }, { merge: true });
    } catch (error) {
        console.warn("Failed to record view stats:", error);
    }
};

export const getTopWatched = async (type = 'movie') => {
    if (!isFirebaseConfigured) return [];
    const collectionName = type === 'movie' ? STATS_MOVIES : STATS_SERIES;
    const q = query(collection(db, collectionName), orderBy('count', 'desc'), limit(10));

    try {
        const querySnapshot = await getDocs(q);
        const topIds = [];
        querySnapshot.forEach((doc) => {
            topIds.push(doc.id);
        });

        if (topIds.length === 0) return [];

        // Fetch full details from TMDB for these IDs
        const promises = topIds.map(async (id) => {
            const isTv = (type === 'tv' || Number(id) === 220102);
            try {
                return isTv ? await tmdb.getSeriesDetails(id) : await tmdb.getMovieDetails(id);
            } catch {
                try {
                    return isTv ? await tmdb.getMovieDetails(id) : await tmdb.getSeriesDetails(id);
                } catch {
                    return null;
                }
            }
        });
        const results = await Promise.all(promises);
        return results.filter(item => item); // Filter out any failed fetches

    } catch (error) {
        console.error("Error fetching top watched stats:", error);
        return [];
    }
};

const statsService = {
    recordView,
    getTopWatched
};

export default statsService;

