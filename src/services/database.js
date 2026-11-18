// Firebase Firestore & Local Storage Unified Database Service
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp
} from 'firebase/firestore';
import { db, auth, isFirebaseConfigured } from '../config/firebase';

const getLocalJSON = (key, fallback = null) => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : fallback;
    } catch {
        return fallback;
    }
};

const setLocalJSON = (key, data) => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch {
        /* ignore */
    }
};

/**
 * User operations
 */
export const createUser = async (userId, userData) => {
    const existing = await getUser(userId);
    const localUsers = getLocalJSON('altyflix_users_db', {});
    const createdAt = existing?.createdAt || Date.now();
    localUsers[userId] = { ...existing, ...userData, createdAt, lastLogin: Date.now() };
    setLocalJSON('altyflix_users_db', localUsers);
    if (isFirebaseConfigured) {
        try {
            await setDoc(doc(db, 'users', userId), {
                ...userData,
                ...(!existing ? { createdAt: serverTimestamp() } : {}),
                lastLogin: serverTimestamp(),
            }, { merge: true });
        } catch (error) { console.warn('User document sync failed:', error.code); }
    }
    return { success: true };
};

export const getUser = async (userId) => {
    if (isFirebaseConfigured) {
        try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) return userDoc.data();
        } catch (error) {
            console.warn('Firestore getUser failed, checking local:', error);
        }
    }
    const localUsers = getLocalJSON('altyflix_users_db', {});
    return localUsers[userId] || null;
};

export const updateUserLastLogin = async (userId) => {
    const localUsers = getLocalJSON('altyflix_users_db', {});
    if (localUsers[userId]) {
        localUsers[userId].lastLogin = Date.now();
        setLocalJSON('altyflix_users_db', localUsers);
    }
    if (isFirebaseConfigured) {
        try {
            await setDoc(doc(db, 'users', userId), {
                lastLogin: serverTimestamp(),
            }, { merge: true });
        } catch (error) {
            console.warn('Firestore updateUserLastLogin failed:', error);
        }
    }
};

export const updateUserEmail = async (userId, email) => {
    const localUsers = getLocalJSON('altyflix_users_db', {});
    if (localUsers[userId]) {
        localUsers[userId].email = email;
        setLocalJSON('altyflix_users_db', localUsers);
    }
    if (isFirebaseConfigured) {
        try {
            await updateDoc(doc(db, 'users', userId), {
                email,
            });
        } catch (error) {
            console.warn('Firestore updateUserEmail failed:', error);
        }
    }
    return { success: true };
};

/**
 * Profile operations
 */
const generateUuid = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createProfile = async (profileData) => {
    if (!auth.currentUser || profileData.userId !== auth.currentUser.uid) throw new Error('Profil non autorisé.');
    const profileId = `${profileData.userId}_${generateUuid()}`;
    const newProfile = { ...profileData, id: profileId, createdAt: Date.now() };
    if (isFirebaseConfigured) await setDoc(doc(db, 'profiles', profileId), { ...profileData, createdAt: serverTimestamp() });
    const key = `altyflix_profiles_${profileData.userId}`;
    setLocalJSON(key, [...getLocalJSON(key, []), newProfile]);
    return { success: true, profileId };
};

export const getProfilesByUser = async (userId) => {
    if (isFirebaseConfigured) {
        try {
            const q = query(
                collection(db, 'profiles'),
                where('userId', '==', userId)
            );
            const querySnapshot = await getDocs(q);
            const list = querySnapshot.docs.map(d => ({
                id: d.id,
                ...d.data(),
            }));
            setLocalJSON(`altyflix_profiles_${userId}`, list);
            return list;
        } catch (error) {
            console.warn('Firestore getProfilesByUser failed, loading local:', error);
        }
    }

    const localKey = `altyflix_profiles_${userId}`;
    const local = getLocalJSON(localKey);
    if (Array.isArray(local) && local.length > 0) {
        return local;
    }

    // No profiles yet — user will create their own
    return [];
};

export const getProfile = async (profileId) => {
    if (isFirebaseConfigured) {
        try {
            const profileDoc = await getDoc(doc(db, 'profiles', profileId));
            if (profileDoc.exists()) return { id: profileDoc.id, ...profileDoc.data() };
        } catch (error) {
            console.warn('Firestore getProfile failed, checking local:', error);
        }
    }

    // Check localStorage
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('altyflix_profiles_')) {
            const list = getLocalJSON(key, []);
            const found = list.find(p => p.id === profileId);
            if (found) return found;
        }
    }
    return null;
};

export const updateProfile = async (profileId, updates) => {
    const userId = auth.currentUser?.uid;
    if (!userId || ('userId' in updates && updates.userId !== userId)) throw new Error('Profil non autorisé.');
    if (isFirebaseConfigured) await updateDoc(doc(db, 'profiles', profileId), updates);
    const key = `altyflix_profiles_${userId}`;
    setLocalJSON(key, getLocalJSON(key, []).map(p => p.id === profileId ? { ...p, ...updates } : p));
    return { success: true };
};

export const deleteProfile = async (profileId) => {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('Connexion requise.');
    if (isFirebaseConfigured) {
        await deleteDoc(doc(db, 'profiles', profileId));
        // Clean up subdocuments belonging to this profile (best-effort)
        await Promise.allSettled([
            deleteDoc(doc(db, 'users', userId, 'profiles', profileId, 'favorites', 'list')),
            deleteDoc(doc(db, 'users', userId, 'profiles', profileId, 'history', 'main')),
        ]);
    }
    const key = `altyflix_profiles_${userId}`;
    setLocalJSON(key, getLocalJSON(key, []).filter(p => p.id !== profileId));
    return { success: true };
};

/**
 * Watch progress operations
 */
export const saveProgress = async (profileId, contentId, progressData) => {
    const key = `altyflix_progress_${profileId}`;
    const progressMap = getLocalJSON(key, {});
    progressMap[contentId] = {
        ...progressData,
        updatedAt: Date.now()
    };
    setLocalJSON(key, progressMap);

    if (isFirebaseConfigured) {
        try {
            const progressId = `${profileId}_${contentId}`;
            const userId = auth?.currentUser ? auth.currentUser.uid : null;
            await setDoc(doc(db, 'progress', progressId), {
                profileId,
                contentId,
                ...(userId ? { userId } : {}),
                ...progressData,
                updatedAt: serverTimestamp(),
            }, { merge: true });
        } catch (error) {
            console.warn('Firestore saveProgress failed:', error);
        }
    }
    return { success: true };
};

export const getProgress = async (profileId, contentId) => {
    if (isFirebaseConfigured) {
        try {
            const progressId = `${profileId}_${contentId}`;
            const progressDoc = await getDoc(doc(db, 'progress', progressId));
            if (progressDoc.exists()) return progressDoc.data();
        } catch (error) {
            console.warn('Firestore getProgress failed:', error);
        }
    }
    const key = `altyflix_progress_${profileId}`;
    const progressMap = getLocalJSON(key, {});
    return progressMap[contentId] || null;
};

export const getContinueWatching = async (profileId, limitCount = 20) => {
    if (isFirebaseConfigured) {
        try {
            const q = query(
                collection(db, 'progress'),
                where('profileId', '==', profileId),
                where('userId', '==', auth.currentUser?.uid || ''),
                where('completed', '==', false),
                orderBy('updatedAt', 'desc'),
                limit(limitCount)
            );
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(d => ({
                id: d.id,
                ...d.data(),
            }));
        } catch (error) {
            console.warn('Firestore getContinueWatching failed:', error);
        }
    }

    const key = `altyflix_progress_${profileId}`;
    const progressMap = getLocalJSON(key, {});
    const items = Object.values(progressMap)
        .filter(i => !i.completed)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, limitCount);
    return items;
};

export const deleteProgress = async (profileId, contentId) => {
    const key = `altyflix_progress_${profileId}`;
    const progressMap = getLocalJSON(key, {});
    delete progressMap[contentId];
    setLocalJSON(key, progressMap);

    if (isFirebaseConfigured) {
        try {
            const progressId = `${profileId}_${contentId}`;
            await deleteDoc(doc(db, 'progress', progressId));
        } catch (error) {
            console.warn('Firestore deleteProgress failed:', error);
        }
    }
    return { success: true };
};

export default {
    createUser,
    getUser,
    updateUserLastLogin,
    updateUserEmail,
    createProfile,
    getProfilesByUser,
    getProfile,
    updateProfile,
    deleteProfile,
    saveProgress,
    getProgress,
    getContinueWatching,
    deleteProgress,
};
