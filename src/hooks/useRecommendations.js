/**
 * useRecommendations.js
 *
 * Custom hook that builds a personalized taste profile from the user's
 * watch history and returns ready-to-render recommendations.
 *
 * Returns:
 *   recommendations  — array of TMDB items
 *   matchScores      — Map<id, 0-99> score for each item
 *   seedTitle        — name of the seed content ("Parce que vous avez regardé X")
 *   loading          — boolean
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useProfile } from '../contexts/ProfileContext';
import { buildTasteProfile, fetchRecommendations } from '../services/recommendationEngine';

const DEBOUNCE_MS = 800;

const useRecommendations = () => {
    const { watchHistory, myList, currentProfile } = useProfile();

    const [recommendations, setRecommendations] = useState([]);
    const [matchScores, setMatchScores]         = useState(new Map());
    const [seedTitle, setSeedTitle]             = useState(null);
    const [loading, setLoading]                 = useState(false);

    const timerRef    = useRef(null);
    const activeRef   = useRef(false); // prevent stale state on unmount
    const requestVersion = useRef(0);

    useEffect(() => {
        setRecommendations([]);
        setMatchScores(new Map());
        setSeedTitle(null);
    }, [currentProfile?.id]);

    const run = useCallback(async (history, list) => {
        const version = ++requestVersion.current;
        setLoading(true);
        try {
            // Build taste profile from last 10 watched items (with myList fallback)
            const profile = await buildTasteProfile(history, list, 10);

            // IDs to exclude: already in myList OR finished (progress >= 85%), normalized to Number & String
            const excludeIds = new Set();
            for (const i of (list || [])) {
                const rawId = i.id ?? i.contentId;
                if (rawId != null) {
                    excludeIds.add(Number(rawId));
                    excludeIds.add(String(rawId));
                }
            }
            for (const i of (history || [])) {
                if (i.progress >= 85) {
                    const rawId = i.contentId ?? i.id;
                    if (rawId != null) {
                        excludeIds.add(Number(rawId));
                        excludeIds.add(String(rawId));
                    }
                }
            }

            const { items, matchScores: scores } = await fetchRecommendations(profile, excludeIds, 24);

            if (!activeRef.current || version !== requestVersion.current) return;

            setRecommendations(items);
            setMatchScores(scores);
            setSeedTitle(profile.seedTitle);
        } catch (err) {
            console.warn('[useRecommendations] error:', err);
        } finally {
            if (activeRef.current && version === requestVersion.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        activeRef.current = true;

        // Ne pas charger sans profil actif ou en mode Enfant
        if (!currentProfile?.id || currentProfile?.isKid) {
            setRecommendations([]);
            setMatchScores(new Map());
            setSeedTitle(null);
            setLoading(false);
            return () => { activeRef.current = false; };
        }

        // Debounce so we don't fire on every single history update
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            run(watchHistory, myList);
        }, DEBOUNCE_MS);

        return () => {
            activeRef.current = false;
            // A request counter, not a DOM ref: cleanup invalidates outstanding work.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            requestVersion.current++;
            clearTimeout(timerRef.current);
        };
    }, [watchHistory, myList, currentProfile?.id, currentProfile?.isKid, run]);

    return { recommendations, matchScores, seedTitle, loading };
};

export default useRecommendations;
