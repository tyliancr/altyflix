/* eslint-disable react-refresh/only-export-components */
// Profile Context
import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import {
    createProfile as createProfileDB,
    getProfilesByUser,
    updateProfile as updateProfileDB,
    deleteProfile as deleteProfileDB,
} from '../services/database';
import { storage, getContentType } from '../utils/helpers';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';
import { DEFAULT_AVATARS } from '../config/constants';
import { applyThemeLayout } from '../utils/applyTheme';

const ProfileContext = createContext();

export const useProfile = () => {
    const context = useContext(ProfileContext);
    if (!context) {
        throw new Error('useProfile must be used within ProfileProvider');
    }
    return context;
};

export const ProfileProvider = ({ children }) => {
    const { currentUser, loading: authLoading } = useAuth();
    const { addToast } = useToast();
    const [profiles, setProfiles] = useState(() => {
        const cached = storage.get('altyflix_cached_profiles');
        return Array.isArray(cached) ? cached : [];
    });
    const [currentProfile, setCurrentProfile] = useState(() => {
        const cachedActive = storage.get('altyflix_cached_active_profile');
        if (cachedActive?.id) {
            applyThemeLayout(cachedActive.themeLayout || 'netflix');
            return cachedActive;
        }
        const lastId = storage.get('lastProfileId');
        const cached = storage.get('altyflix_cached_profiles');
        if (lastId && Array.isArray(cached)) {
            const found = cached.find(p => String(p.id) === String(lastId));
            if (found) {
                applyThemeLayout(found.themeLayout || 'netflix');
                return found;
            }
        }
        return null;
    });
    const [loading, setLoading] = useState(() => !currentProfile);

    const activeUser = useRef(null);
    activeUser.current = currentUser?.uid || null;
    const activeProfile = useRef(null);
    activeProfile.current = currentProfile?.id || null;
    const profilesCountRef = useRef(profiles.length);
    profilesCountRef.current = profiles.length;
    const previousUser = useRef(null);

    const matchesContent = (item, targetId, targetType = null) => {
        const itemId = item?.contentId || item?.id;
        if (String(itemId) !== String(targetId)) return false;
        if (!targetType) return true;
        const itemType = item?.media_type || item?.type;
        if (!itemType) return true;
        return itemType === targetType;
    };

    const sanitizeFavoriteItem = (content, targetId) => {
        const resolvedType = getContentType(content, 'movie');
        return {
            id: targetId,
            contentId: targetId,
            title: content.title || content.name || '',
            name: content.name || content.title || '',
            poster_path: content.poster_path || null,
            backdrop_path: content.backdrop_path || null,
            vote_average: typeof content.vote_average === 'number' ? content.vote_average : 0,
            release_date: content.release_date || null,
            first_air_date: content.first_air_date || null,
            genre_ids: Array.isArray(content.genre_ids)
                ? content.genre_ids
                : (Array.isArray(content.genres) ? content.genres.map(g => g.id).filter(Boolean) : []),
            overview: typeof content.overview === 'string' ? content.overview.slice(0, 400) : '',
            type: resolvedType,
            media_type: resolvedType,
        };
    };

    // Load profiles from database
    const loadProfiles = useCallback(async () => {
        if (!currentUser) return;
        try {
            // Only show blocking loader on cold start if nothing was cached
            if (profilesCountRef.current === 0) {
                setLoading(true);
            }
            const userProfiles = await getProfilesByUser(currentUser.uid);
            if (activeUser.current !== currentUser.uid) return;

            // Auto-migrate old avatars (Dicebear, TMDB, old nflxso, or generated SVGs) to the new local Netflix classic avatars
            const migratedProfiles = await Promise.all(userProfiles.map(async (profile) => {
                if (profile.avatar && (profile.avatar.includes('dicebear.com') || profile.avatar.includes('tmdb.org') || profile.avatar.includes('occ-0') || profile.avatar.startsWith('data:image'))) {
                    // Pick the Red classic avatar by default
                    const newAvatar = DEFAULT_AVATARS[0];
                    await updateProfileDB(profile.id, { avatar: newAvatar });
                    return { ...profile, avatar: newAvatar };
                }
                return profile;
            }));

            if (activeUser.current !== currentUser.uid) return;
            if (migratedProfiles.length === 0) {
                setProfiles([]);
                setCurrentProfile(null);
                storage.remove('lastProfileId');
                storage.remove('altyflix_cached_profiles');
                storage.remove('altyflix_cached_active_profile');
            } else {
                setProfiles(migratedProfiles);
                storage.set('altyflix_cached_profiles', migratedProfiles);

                // Preserve active profile across browser refreshes
                const savedProfileId = storage.get('lastProfileId');
                setCurrentProfile(previous => {
                    const targetId = previous?.id || savedProfileId;
                    if (targetId) {
                        const found = migratedProfiles.find(p => String(p.id) === String(targetId));
                        if (found) {
                            storage.set('lastProfileId', found.id);
                            storage.set('altyflix_cached_active_profile', found);
                            applyThemeLayout(found.themeLayout || 'netflix');
                            return found;
                        }
                    }
                    if (previous && migratedProfiles.some(p => String(p.id) === String(previous.id))) {
                        return previous;
                    }
                    if (migratedProfiles.length === 1) {
                        const single = migratedProfiles[0];
                        storage.set('lastProfileId', single.id);
                        storage.set('altyflix_cached_active_profile', single);
                        applyThemeLayout(single.themeLayout || 'netflix');
                        return single;
                    }
                    return null;
                });
            }
        } catch (error) {
            console.error('? Error loading profiles:', error);
        } finally {
            if (activeUser.current === currentUser?.uid) setLoading(false);
        }
    // NOTE: currentProfile is intentionally excluded from deps to avoid an
    // infinite loop: profile change -> loadProfiles recreated -> useEffect fires.
    }, [currentUser]);

    // Load profiles when user changes
    useEffect(() => {
        // While Firebase is still establishing auth state on page refresh, DO NOT wipe cached profiles or storage!
        if (authLoading) return;

        if (currentUser) {
            const cachedActive = storage.get('altyflix_cached_active_profile');
            const cachedBelongsToOtherUser = Boolean(cachedActive?.userId && cachedActive.userId !== currentUser.uid);
            const isDifferentUser = (previousUser.current && previousUser.current !== currentUser.uid) || cachedBelongsToOtherUser;
            if (isDifferentUser) {
                setCurrentProfile(null);
                setProfiles([]);
                setMyList([]);
                setWatchHistory([]);
                storage.remove('lastProfileId');
                storage.remove('altyflix_cached_profiles');
                storage.remove('altyflix_cached_active_profile');
            }
            previousUser.current = currentUser.uid;
            if (isDifferentUser || !activeProfile.current) {
                setLoading(true);
            } else {
                setLoading(false);
            }
            loadProfiles();
        } else {
            previousUser.current = null;
            setProfiles([]);
            setCurrentProfile(null);
            setMyList([]);
            setWatchHistory([]);
            storage.remove('altyflix_cached_profiles');
            storage.remove('altyflix_cached_active_profile');
            storage.remove('lastProfileId');
            setLoading(false);
        }
    }, [currentUser, authLoading, loadProfiles]);

    // Create new profile with Optimistic UI
    const createProfile = useCallback(async (profileData) => {
        if (!currentUser) return { success: false, error: 'No user authenticated' };
        try {
            const tempId = `temp_${Date.now()}`;
            const optimisticProfile = { id: tempId, userId: currentUser.uid, ...profileData };
            setProfiles(prev => [...prev, optimisticProfile]);

            const result = await createProfileDB({
                userId: currentUser.uid,
                ...profileData,
            });

            if (result.success) {
                const realProfile = { ...optimisticProfile, id: result.profileId };
                setProfiles(prev => {
                    const next = prev.map(p => p.id === tempId ? realProfile : p);
                    storage.set('altyflix_cached_profiles', next);
                    return next;
                });
                loadProfiles();
                return { success: true, profileId: result.profileId };
            } else {
                setProfiles(prev => prev.filter(p => p.id !== tempId));
                return result;
            }
        } catch (error) {
            await loadProfiles();
            console.error('Error creating profile:', error);
            return { success: false, error: error.message };
        }
    }, [currentUser, loadProfiles]);

    // Update profile with Optimistic UI
    const updateProfile = useCallback(async (profileId, updates) => {
        if (!currentUser || !profiles.some(p => p.id === profileId && p.userId === currentUser.uid) || ('userId' in updates && updates.userId !== currentUser.uid)) return { success: false, error: 'Profil non autorisé.' };
        try {
            // Optimistically update
            setProfiles(prev => {
                const next = prev.map(p => p.id === profileId ? { ...p, ...updates } : p);
                storage.set('altyflix_cached_profiles', next);
                return next;
            });
            if (currentProfile?.id === profileId) {
                setCurrentProfile(prev => {
                    const updated = { ...prev, ...updates };
                    storage.set('altyflix_cached_active_profile', updated);
                    return updated;
                });
                if (updates.language) {
                    const langMap = { 'fr': 'fr-FR', 'en': 'en-US', 'es': 'es-ES', 'de': 'de-DE', 'it': 'it-IT' };
                    storage.set('language', langMap[updates.language] || 'fr-FR');
                }
                if (updates.themeLayout) {
                    applyThemeLayout(updates.themeLayout);
                }
            }

            const result = await updateProfileDB(profileId, updates);
            if (!result.success) {
                // Revert on failure
                loadProfiles();
            }
            return result;
        } catch (error) {
            await loadProfiles();
            console.error('Error updating profile:', error);
            return { success: false, error: error.message };
        }
    }, [currentProfile, currentUser, profiles, loadProfiles]);

    // Delete profile
    const deleteProfile = useCallback(async (profileId) => {
        if (!currentUser || !profiles.some(p => p.id === profileId && (!p.userId || p.userId === currentUser.uid))) {
            return { success: false, error: 'Profil non autorisé.' };
        }
        try {
            // Optimistic UI update
            setProfiles(prev => {
                const next = prev.filter(p => p.id !== profileId);
                storage.set('altyflix_cached_profiles', next);
                return next;
            });

            // Clear current profile and cached active profile if it's the one being deleted
            if (currentProfile && currentProfile.id === profileId) {
                setCurrentProfile(null);
                setMyList([]);
                setWatchHistory([]);
                storage.remove('lastProfileId');
                storage.remove('altyflix_cached_active_profile');
            }

            // Clean per-profile local storage keys
            storage.remove(`altyflix_favorites_${profileId}`);
            storage.remove(`altyflix_history_${profileId}`);
            storage.remove(`altyflix_subtitles_always_on_${profileId}`);
            storage.remove(`altyflix_subtitles_default_on_${profileId}`);
            storage.remove(`recent_searches_${profileId}`);

            const result = await deleteProfileDB(profileId);
            if (!result.success) {
                // Revert on failure
                await loadProfiles();
            }
            return result;
        } catch (error) {
            await loadProfiles();
            console.error('Error deleting profile:', error);
            return { success: false, error: error.message };
        }
    }, [currentProfile, currentUser, profiles, loadProfiles]);

    const switchProfile = useCallback((profile) => {
        if (!currentUser || (profile.userId && profile.userId !== currentUser.uid)) return;
        setCurrentProfile(profile);
        storage.set('lastProfileId', profile.id);
        storage.set('altyflix_cached_active_profile', profile);

        // Immediately swap list/history to target profile's cache to prevent cross-profile write leaks
        const nextFavs = storage.get(`altyflix_favorites_${profile.id}`);
        setMyList(Array.isArray(nextFavs) ? nextFavs : []);
        const nextHist = storage.get(`altyflix_history_${profile.id}`);
        setWatchHistory(Array.isArray(nextHist) ? nextHist : []);
        
        applyThemeLayout(profile.themeLayout || 'netflix');

        const langMap = {
            'fr': 'fr-FR',
            'en': 'en-US',
            'es': 'es-ES',
            'de': 'de-DE',
            'it': 'it-IT'
        };
        const tmdbLang = langMap[profile.language || 'fr'] || 'fr-FR';
        storage.set('language', tmdbLang);
    }, [currentUser]);

    const [myList, setMyList] = useState(() => {
        const cached = currentProfile ? storage.get(`altyflix_favorites_${currentProfile.id}`) : null;
        return Array.isArray(cached) ? cached : [];
    });

    const loadMyList = useCallback(async () => {
        if (!currentProfile || !currentUser) return;
        const localKey = `altyflix_favorites_${currentProfile.id}`;
        if (isFirebaseConfigured) {
            try {
                const listRef = doc(db, 'users', currentUser.uid, 'profiles', currentProfile.id, 'favorites', 'list');
                const listSnap = await getDoc(listRef);
                if (activeUser.current !== currentUser.uid || activeProfile.current !== currentProfile.id) return;
                if (listSnap.exists()) {
                    const items = listSnap.data().items || [];
                    setMyList(items);
                    storage.set(localKey, items);
                    return;
                }
            } catch (error) {
                console.warn('Error loading my list from Firestore, falling back to local:', error);
            }
        }
        if (activeUser.current !== currentUser.uid || activeProfile.current !== currentProfile.id) return;
        const localItems = storage.get(localKey);
        setMyList(Array.isArray(localItems) ? localItems : []);
    }, [currentProfile, currentUser]);

    // Load list when profile changes
    useEffect(() => {
        if (currentProfile) {
            loadMyList();
        } else {
            setMyList([]);
        }
    }, [currentProfile, loadMyList]);

    // Add to My List
    const addToMyList = useCallback(async (content) => {
        if (!currentProfile || !currentUser || !content) return false;

        try {
            const localKey = `altyflix_favorites_${currentProfile.id}`;
            const targetId = content.id || content.contentId;
            const targetType = getContentType(content, 'movie');
            let currentList = myList || [];

            if (!currentList.some(item => matchesContent(item, targetId, targetType))) {
                const itemToSave = sanitizeFavoriteItem(content, targetId);
                const updatedList = [...currentList, itemToSave];
                setMyList(updatedList);
                storage.set(localKey, updatedList);
                addToast('Ajouté à Ma Liste', 'success');

                if (isFirebaseConfigured) {
                    try {
                        const listRef = doc(db, 'users', currentUser.uid, 'profiles', currentProfile.id, 'favorites', 'list');
                        await setDoc(listRef, { items: updatedList }, { merge: true });
                    } catch (fbErr) {
                        console.warn('Sync favorite to Firestore failed:', fbErr);
                    }
                }
            } else {
                addToast('Déjà dans votre liste', 'info');
            }
            return true;
        } catch (error) {
            console.error('Error adding to my list:', error);
            addToast('Erreur lors de l\'ajout', 'error');
            return false;
        }
    }, [currentProfile, currentUser, myList, addToast]);

    // Remove from My List
    const removeFromMyList = useCallback(async (contentId, contentType = null) => {
        if (!currentProfile || !currentUser) return false;

        try {
            const localKey = `altyflix_favorites_${currentProfile.id}`;
            const targetId = typeof contentId === 'object' ? (contentId.id || contentId.contentId) : contentId;
            const resolvedType = contentType || (typeof contentId === 'object' ? (contentId.media_type || contentId.type || null) : null);
            const updatedList = (myList || []).filter(item => !matchesContent(item, targetId, resolvedType));
            setMyList(updatedList);
            storage.set(localKey, updatedList);
            addToast('Retiré de Ma Liste', 'success');

            if (isFirebaseConfigured) {
                try {
                    const listRef = doc(db, 'users', currentUser.uid, 'profiles', currentProfile.id, 'favorites', 'list');
                    await setDoc(listRef, { items: updatedList }, { merge: true });
                } catch (fbErr) {
                    console.warn('Sync favorite removal failed:', fbErr);
                }
            }
            return true;
        } catch (error) {
            console.error('Error removing from my list:', error);
            addToast('Erreur lors de la suppression', 'error');
            return false;
        }
    }, [currentProfile, currentUser, myList, addToast]);

    // Check if in My List
    const isInMyList = useCallback((content) => {
        if (!content || !myList) return false;
        const targetId = content.id || content.contentId;
        const targetType = content.media_type || content.type || null;
        return myList.some(item => matchesContent(item, targetId, targetType));
    }, [myList]);

    const [watchHistory, setWatchHistory] = useState(() => {
        const cached = currentProfile ? storage.get(`altyflix_history_${currentProfile.id}`) : null;
        return Array.isArray(cached) ? cached : [];
    });
    const watchHistoryRef = useRef(watchHistory);
    watchHistoryRef.current = watchHistory;

    const loadWatchHistory = useCallback(async () => {
        if (!currentProfile || !currentUser) return;
        const localKey = `altyflix_history_${currentProfile.id}`;
        if (isFirebaseConfigured) {
            try {
                const historyRef = doc(db, 'users', currentUser.uid, 'profiles', currentProfile.id, 'history', 'main');
                const historySnap = await getDoc(historyRef);
                if (activeUser.current !== currentUser.uid || activeProfile.current !== currentProfile.id) return;
                if (historySnap.exists()) {
                    const items = historySnap.data().items || [];
                    const sanitizedItems = items.map(item => {
                        const isTv = item.type !== 'movie' && item.media_type !== 'movie' && Boolean(
                            item.type === 'tv' ||
                            item.media_type === 'tv' ||
                            (item.season !== undefined && item.season !== null) ||
                            (item.episode !== undefined && item.episode !== null) ||
                            item.first_air_date ||
                            item.number_of_seasons ||
                            Number(item.contentId || item.id) === 220102
                        );
                        const safeType = isTv ? 'tv' : (item.type || 'movie');
                        return {
                            ...item,
                            type: safeType,
                            media_type: safeType,
                        };
                    });
                    sanitizedItems.sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);
                    setWatchHistory(sanitizedItems);
                    storage.set(localKey, sanitizedItems);
                    return;
                }
            } catch (error) {
                console.warn('Error loading history from Firestore, falling back to local:', error);
            }
        }
        if (activeUser.current !== currentUser.uid || activeProfile.current !== currentProfile.id) return;
        const cached = storage.get(localKey);
        setWatchHistory(Array.isArray(cached) ? cached : []);
    }, [currentProfile, currentUser]);

    // Load history when profile changes
    useEffect(() => {
        if (currentProfile) {
            loadWatchHistory();
        } else {
            setWatchHistory([]);
        }
    }, [currentProfile, loadWatchHistory]);

    const addToHistory = useCallback(async (content, season = 1, episode = 1, progress = 0, currentTime = 0) => {
        if (!currentProfile || !currentUser) return;
        try {
            const historyRef = doc(db, 'users', currentUser.uid, 'profiles', currentProfile.id, 'history', 'main');
            const cachedHistory = storage.get(`altyflix_history_${currentProfile.id}`);
            const currentHistory = Array.isArray(cachedHistory)
                ? cachedHistory
                : (Array.isArray(watchHistoryRef.current) ? watchHistoryRef.current : []);

            // Remove existing entry for this content (keyed by type + id to avoid Movie/TV TMDB ID collisions)
            const targetId = content.id || content.contentId;
            const isTv = Boolean(
                content.media_type === 'tv' ||
                content.type === 'tv' ||
                content.first_air_date ||
                content.number_of_seasons ||
                content.seasons ||
                // Only use season/episode > 1 as TV signals — default params are season=1, episode=1
                // which is also valid for movies and would cause false TV classification.
                (season != null && season > 1) ||
                (episode != null && episode > 1) ||
                Number(targetId) === 220102 ||
                (content.name && !content.title)
            );
            const resolvedType = isTv ? 'tv' : getContentType(content, 'movie');
            const filteredHistory = currentHistory.filter(item => !matchesContent(item, targetId, resolvedType));

            // Logic: If progress >= 88%, we consider it "Finished".
            // We keep it in history with 100% progress so "Mark as Watched" persists.
            // We will filter it out in the Home UI "Continue Watching" row.
            if (progress >= 88) {
                progress = 100;
            }

            const newItem = {
                contentId: targetId,
                title: content.title || content.name || '',
                name: content.name || content.title || '',
                poster_path: content.poster_path || null,
                backdrop_path: content.backdrop_path || null,
                type: resolvedType,
                media_type: resolvedType,
                release_date: content.release_date || null,
                first_air_date: content.first_air_date || null,
                season: isTv ? season : null,
                episode: isTv ? episode : null,
                progress: progress, // Save progress
                lastWatchedPosition: currentTime, // Save exact time in seconds
                lastWatchedAt: Date.now()
            };

            const localKey = `altyflix_history_${currentProfile.id}`;
            const updatedHistory = [newItem, ...filteredHistory].slice(0, 50); // Keep last 50 items

            setWatchHistory(updatedHistory);
            storage.set(localKey, updatedHistory);

            if (isFirebaseConfigured) {
                try {
                    await setDoc(historyRef, { items: updatedHistory }, { merge: true });
                } catch (fbErr) {
                    console.warn('Sync history to Firestore failed:', fbErr);
                }
            }
        } catch (error) {
            console.error('Error adding to history:', error);
        }
    }, [currentProfile, currentUser]);

    const removeFromHistory = useCallback(async (contentId, contentType = null) => {
        if (!currentProfile || !currentUser) return;
        try {
            const localKey = `altyflix_history_${currentProfile.id}`;
            const historyRef = doc(db, 'users', currentUser.uid, 'profiles', currentProfile.id, 'history', 'main');

            const currentHistory = watchHistory || storage.get(localKey) || [];
            const updatedHistory = currentHistory.filter(item => !matchesContent(item, contentId, contentType));

            setWatchHistory(updatedHistory);
            storage.set(localKey, updatedHistory);
            addToast('Retiré de "Reprendre la lecture"', 'success');

            if (isFirebaseConfigured) {
                try {
                    await setDoc(historyRef, { items: updatedHistory }, { merge: true });
                } catch (fbErr) {
                    console.warn('Sync history removal to Firestore failed:', fbErr);
                }
            }
        } catch (error) {
            console.error('Error removing from history:', error);
            addToast('Erreur lors de la suppression', 'error');
        }
    }, [currentProfile, currentUser, watchHistory, addToast]);

    /**
     * Patch a history item without changing its order
     */
    const patchHistoryItem = useCallback(async (contentId, updates) => {
        if (!currentProfile || !currentUser) return;
        try {
            const localKey = `altyflix_history_${currentProfile.id}`;
            const historyRef = doc(db, 'users', currentUser.uid, 'profiles', currentProfile.id, 'history', 'main');

            const currentHistory = watchHistory || storage.get(localKey) || [];
            const updatedHistory = currentHistory.map(item => {
                if (String(item.contentId) === String(contentId)) {
                    return { ...item, ...updates };
                }
                return item;
            });

            setWatchHistory(updatedHistory);
            storage.set(localKey, updatedHistory);

            if (isFirebaseConfigured) {
                try {
                    await setDoc(historyRef, { items: updatedHistory }, { merge: true });
                } catch (fbErr) {
                    console.warn('Sync history patch to Firestore failed:', fbErr);
                }
            }
        } catch (error) {
            console.error('Error patching history:', error);
        }
    }, [currentProfile, currentUser, watchHistory]);

    const markAsWatched = useCallback(async (content, season = null, episode = null) => {
        const contentId = content.id || content.contentId;
        const targetType = getContentType(content, 'movie');
        const isWatched = watchHistory.some(h => matchesContent(h, contentId, targetType) && h.progress >= 90);
        if (isWatched) {
            // If already watched, we just remove it from history to "unmark" it
            await removeFromHistory(contentId, targetType);
        } else {
            // Mark as watched (100% progress)
            const s = season ?? content.season ?? (content.number_of_seasons ? 1 : null);
            const e = episode ?? content.episode ?? (content.number_of_seasons ? 1 : null);
            await addToHistory(content, s, e, 100, 0);
            addToast('Marqué comme vu', 'success');
        }
    }, [watchHistory, removeFromHistory, addToHistory, addToast]);

    const clearWatchHistory = useCallback(async () => {
        if (!currentProfile || !currentUser) return;
        try {
            const localKey = `altyflix_history_${currentProfile.id}`;
            const historyRef = doc(db, 'users', currentUser.uid, 'profiles', currentProfile.id, 'history', 'main');
            setWatchHistory([]);
            storage.set(localKey, []);
            addToast('Historique de visionnage vidé !', 'success');

            if (isFirebaseConfigured) {
                try {
                    await setDoc(historyRef, { items: [] }, { merge: true });
                } catch (fbErr) {
                    console.warn('Sync clear history to Firestore failed:', fbErr);
                }
            }
        } catch (error) {
            console.error('Error clearing watch history:', error);
            addToast('Erreur lors de la suppression de l\'historique', 'error');
        }
    }, [currentProfile, currentUser, addToast]);

    const value = useMemo(() => ({
        profiles,
        currentProfile,
        loading,
        createProfile,
        updateProfile,
        deleteProfile,
        switchProfile,
        loadProfiles,
        addToMyList,
        removeFromMyList,
        isInMyList,
        myList,
        addToHistory,
        removeFromHistory,
        markAsWatched,
        patchHistoryItem,
        clearWatchHistory,
        watchHistory
    }), [
        profiles,
        currentProfile,
        loading,
        createProfile,
        updateProfile,
        deleteProfile,
        switchProfile,
        loadProfiles,
        addToMyList,
        removeFromMyList,
        isInMyList,
        myList,
        addToHistory,
        removeFromHistory,
        markAsWatched,
        patchHistoryItem,
        clearWatchHistory,
        watchHistory
    ]);

    return (
        <ProfileContext.Provider value={value}>
            {children}
        </ProfileContext.Provider>
    );
};

export default ProfileContext;



