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
export const addOrUpdateReview = async (contentId, profile, userId, rating, text) => {
    if (!auth.currentUser || auth.currentUser.uid !== userId || profile.userId !== userId) throw new Error('Avis non autorisé.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || typeof text !== 'string' || text.length > 5000) throw new Error('Note ou commentaire invalide.');
    const reviewId = `${contentId}_${profile.id}`;
    const newReview = {
        id: reviewId,
        contentId: String(contentId),
        userId,
        profileId: profile.id,
        authorName: profile.name,
        authorAvatar: profile.avatar,
        rating,
        text,
        updatedAt: Date.now()
    };


    if (isFirebaseConfigured) {
        {
            const reviewRef = doc(db, 'reviews', reviewId);
            const dataToSave = {
                ...newReview,
                updatedAt: serverTimestamp()
            };
            await setDoc(reviewRef, dataToSave, { merge: true });
        }
    }
    const current = getLocalReviews(contentId);
    setLocalReviews(contentId, [newReview, ...current.filter(r => r.profileId !== profile.id)]);
    return { success: true };
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
            const reviews = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            }));

            {
                // Sort client-side
                const sorted = reviews.sort((a, b) => {
                    const dateA = a.updatedAt?.toDate ? a.updatedAt.toDate() : new Date(0);
                    const dateB = b.updatedAt?.toDate ? b.updatedAt.toDate() : new Date(0);
                    return dateB - dateA;
                });
                setLocalReviews(contentId, sorted);
                return sorted;
            }
        } catch (error) {
            console.warn('Firestore getReviewsByContent failed, falling back to local:', error);
        }
    }
    return getLocalReviews(contentId);
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
            if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
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
    if (isFirebaseConfigured) {
        {
            const reviewId = `${contentId}_${profileId}`;
            await deleteDoc(doc(db, 'reviews', reviewId));
        }
    }
    const local = getLocalReviews(contentId);
    setLocalReviews(contentId, local.filter(r => r.profileId !== profileId));
    return { success: true };
};
