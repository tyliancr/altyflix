import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    query,
    where,
    limit,
    serverTimestamp
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../config/firebase';

const getLocalReviews = (contentId) => {
    try {
        const item = localStorage.getItem(`altyflix_reviews_${contentId}`);
        return item ? JSON.parse(item) : [];
    } catch {
        return [];
    }
};

const setLocalReviews = (contentId, list) => {
    try {
        localStorage.setItem(`altyflix_reviews_${contentId}`, JSON.stringify(list));
    } catch {
        /* ignore */
    }
};

/**
 * Adds or updates a review for a specific content.
 * @param {string|number} contentId 
 * @param {object} profile - the current user's profile
 * @param {string} userId - the current user's UID
 * @param {number} rating - 1 to 5
 * @param {string} text - review text
 */
const toEpochMs = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val?.toDate === 'function') return val.toDate().getTime();
    if (typeof val?.seconds === 'number') return val.seconds * 1000;
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? 0 : parsed;
};

export const addOrUpdateReview = async (contentId, profile, userId, rating, text) => {
    try {
        if (!auth.currentUser || auth.currentUser.uid !== userId || !profile || profile.userId !== userId) {
            return { success: false, error: 'Avis non autorisé.' };
        }
        if (!Number.isInteger(rating) || rating < 1 || rating > 5 || typeof text !== 'string' || text.length > 5000) {
            return { success: false, error: 'Note ou commentaire invalide.' };
        }
        const reviewId = `${contentId}_${profile.id}`;
        const newReview = {
            id: reviewId,
            contentId: String(contentId),
            userId,
            profileId: profile.id,
            authorName: String(profile.name || 'Utilisateur').slice(0, 100),
            authorAvatar: String(profile.avatar || '').slice(0, 2000),
            rating,
            text,
            updatedAt: Date.now()
        };

        if (isFirebaseConfigured) {
            const reviewRef = doc(db, 'reviews', reviewId);
            const dataToSave = {
                ...newReview,
                updatedAt: serverTimestamp()
            };
            await setDoc(reviewRef, dataToSave, { merge: true });
        }
        const current = getLocalReviews(contentId);
        setLocalReviews(contentId, [newReview, ...current.filter(r => r.profileId !== profile.id)]);
        return { success: true };
    } catch (error) {
        console.error('Error saving review:', error);
        return { success: false, error: error?.message || 'Erreur lors de la publication de l\'avis.' };
    }
};

/**
 * Retrieves all reviews for a specific content.
 * @param {string|number} contentId 
 */
export const getReviewsByContent = async (contentId) => {
    if (isFirebaseConfigured) {
        try {
            const q = query(
                collection(db, 'reviews'),
                where('contentId', '==', String(contentId)),
                limit(100)
            );
            const snapshot = await getDocs(q);
            const reviews = snapshot.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    ...data,
                    updatedAt: toEpochMs(data.updatedAt)
                };
            });

            const sorted = reviews.sort((a, b) => toEpochMs(b.updatedAt) - toEpochMs(a.updatedAt));
            setLocalReviews(contentId, sorted);
            return sorted;
        } catch (error) {
            console.warn('Firestore getReviewsByContent failed, falling back to local:', error);
        }
    }
    return getLocalReviews(contentId).sort((a, b) => toEpochMs(b.updatedAt) - toEpochMs(a.updatedAt));
};

/**
 * Retrieves a specific user's review for a content.
 * @param {string|number} contentId 
 * @param {string} profileId 
 */
export const getUserReview = async (contentId, profileId) => {
    if (isFirebaseConfigured) {
        try {
            const reviewId = `${contentId}_${profileId}`;
            const docSnap = await getDoc(doc(db, 'reviews', reviewId));
            if (docSnap.exists()) {
                const data = docSnap.data();
                return { id: docSnap.id, ...data, updatedAt: toEpochMs(data.updatedAt) };
            }
        } catch (error) {
            console.warn('Firestore getUserReview failed, checking local:', error);
        }
    }
    const local = getLocalReviews(contentId);
    return local.find(r => r.profileId === profileId) || null;
};

/**
 * Deletes a review.
 * @param {string|number} contentId 
 * @param {string} profileId 
 */
export const deleteReview = async (contentId, profileId) => {
    try {
        if (isFirebaseConfigured) {
            const reviewId = `${contentId}_${profileId}`;
            await deleteDoc(doc(db, 'reviews', reviewId));
        }
        const local = getLocalReviews(contentId);
        setLocalReviews(contentId, local.filter(r => r.profileId !== profileId));
        return { success: true };
    } catch (error) {
        console.error('Error deleting review:', error);
        return { success: false, error: error?.message || 'Erreur lors de la suppression.' };
    }
};
