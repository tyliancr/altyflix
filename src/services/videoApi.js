// Client de l'API vidéo ALTYFLIX (dossier /api). Toutes les requêtes portent l'ID token Firebase.
import { auth } from '../config/firebase';

// Vide en production (même origine, redirigée par Netlify) ; http://localhost:3100 en développement.
const BASE = (import.meta.env.VITE_VIDEO_API_BASE || '').replace(/\/+$/, '');

export class VideoApiError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

async function request(path, { method = 'GET', query, body, signal, keepalive } = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query || {})) {
        if (value !== undefined && value !== null) params.set(key, String(value));
    }
    const headers = {};
    const token = await auth.currentUser?.getIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';

    let response;
    try {
        response = await fetch(`${BASE}/api${path}${params.size ? `?${params}` : ''}`, {
            method, headers, signal, keepalive, cache: 'no-store', body: body ? JSON.stringify(body) : undefined,
        });
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        throw new VideoApiError(0, 'network_error', 'Connexion impossible. Vérifiez votre réseau.');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new VideoApiError(response.status, data?.error?.code || 'error', data?.error?.message || `Service indisponible (${response.status})`);
    }
    return data;
}

const episodeQuery = ({ season, episode, profileId } = {}) => ({ season: season ?? undefined, episode: episode ?? undefined, profileId });

export const getTitle = (id, options) => request(`/titles/${id}`, options);

/** Identifiant d'un titre hébergé à partir de sa fiche TMDB : "movie-10378", "tv-1399". */
export const hostedTitleId = (type, tmdbId) => `${type === 'tv' ? 'tv' : 'movie'}-${tmdbId}`;

/**
 * Cherche si une fiche TMDB a une vidéo hébergée par ALTYFLIX. Renvoie son identifiant, ou null
 * (titre absent, API injoignable ou trop lente) : l'appelant garde alors son comportement habituel.
 */
export async function findHostedTitle(type, tmdbId, { timeout = 2500 } = {}) {
    if (!tmdbId) return null;
    const id = hostedTitleId(type, tmdbId);
    try {
        await getTitle(id, { signal: AbortSignal.timeout(timeout) });
        return id;
    } catch {
        return null;
    }
}

export const getPlayback = (id, target, options) => request(`/titles/${id}/playback`, { ...options, query: episodeQuery(target) });

export const getNextEpisode = (id, target, options) => request(`/titles/${id}/next`, { ...options, query: episodeQuery(target) });

export const getEpisodes = (id, season, options) => request(`/series/${id}/seasons/${season}/episodes`, options);

export const getProgress = (titleId, target, options) => request(`/me/progress/${titleId}`, { ...options, query: episodeQuery(target) });

/** keepalive : la requête survit à la fermeture de l'onglet (sauvegarde finale). */
export const saveProgress = (titleId, { position, duration, season, episode }, { profileId, keepalive } = {}) =>
    request(`/me/progress/${titleId}`, {
        method: 'PUT', keepalive, query: { profileId },
        body: { position, duration, ...(season !== null && season !== undefined ? { season, episode } : {}) },
    });

export const getContinueWatching = (profileId, options) => request('/me/continue-watching', { ...options, query: { profileId } });

export const getPreferences = (profileId, options) => request('/me/preferences', { ...options, query: { profileId } });

export const savePreferences = (preferences, profileId) => request('/me/preferences', { method: 'PUT', query: { profileId }, body: preferences });
