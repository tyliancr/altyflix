import { ApiError, notFound } from '../lib/errors.js';
import { signedMediaUrl } from '../lib/signing.js';
import { DEFAULT_PREFERENCES } from '../schemas.js';

/** Logique métier partagée par les routes : catalogue, reprise, épisode suivant, URL signées. */
export function createCatalog({ store, config }) {
  const progressKey = (profileId, titleId, season, episode) =>
    `${profileId}__${titleId}${season !== undefined && season !== null ? `__s${season}e${episode}` : ''}`;

  async function getTitle(id) {
    const title = await store.getTitle(id);
    if (!title || !title.published) throw notFound('Titre introuvable.');
    return title;
  }

  async function getEpisodes(titleId, season) {
    return (await store.listEpisodes(titleId, season)).filter(item => item.published !== false);
  }

  const isCompleted = (position, duration, markers) => position >= Math.min(markers?.credits?.start ?? Infinity, duration * 0.95);

  function publicTitle(title) {
    return {
      id: title.id,
      type: title.type,
      title: title.title,
      synopsis: title.synopsis || '',
      year: title.year ?? null,
      posterUrl: title.posterUrl ?? null,
      backdropUrl: title.backdropUrl ?? null,
      duration: title.media?.duration ?? null,
      seasons: title.type === 'series' ? title.seasons || [] : [],
      audioLanguages: title.audioLanguages || [],
      subtitleLanguages: title.subtitleLanguages || [],
    };
  }

  const publicEpisode = item => ({
    titleId: item.titleId,
    season: item.season,
    episode: item.episode,
    title: item.title,
    synopsis: item.synopsis || '',
    duration: item.media?.duration ?? null,
    stillUrl: item.stillUrl ?? null,
  });

  async function profileProgress(uid, profileId) {
    return (await store.listProgress(uid, 100, profileId)).filter(item => item.profileId === profileId);
  }

  async function nextEpisode(titleId, season, episode) {
    const episodes = await getEpisodes(titleId);
    const index = episodes.findIndex(item => item.season === season && item.episode === episode);
    return index === -1 ? null : episodes[index + 1] || null;
  }

  /** Renvoie ce qu'il faut lire : le film, l'épisode demandé, ou à défaut l'épisode à reprendre. */
  async function resolvePlayable(title, { season, episode }, uid, profileId) {
    if (title.type !== 'series') return { media: title.media, markers: title.markers || {}, season: null, episode: null, episodeTitle: null };
    let target;
    if (season !== undefined) {
      target = await store.getEpisode(title.id, season, episode);
    } else {
      const last = (await profileProgress(uid, profileId)).find(item => item.titleId === title.id);
      if (last) {
        target = last.completed
          ? (await nextEpisode(title.id, last.season, last.episode)) || (await store.getEpisode(title.id, last.season, last.episode))
          : await store.getEpisode(title.id, last.season, last.episode);
      }
      target ||= (await getEpisodes(title.id))[0];
    }
    if (!target || target.published === false) throw notFound('Épisode introuvable.');
    return { media: target.media, markers: target.markers || {}, season: target.season, episode: target.episode, episodeTitle: target.title };
  }

  async function getPreferences(uid, profileId) {
    const stored = await store.getPreferences(uid, profileId);
    const { audioLang, subtitleLang, subtitleForced, subtitleSize } = { ...DEFAULT_PREFERENCES, ...stored };
    return { audioLang, subtitleLang, subtitleForced, subtitleSize };
  }

  async function playback(titleId, query, uid) {
    const title = await getTitle(titleId);
    const playable = await resolvePlayable(title, query, uid, query.profileId);
    if (!playable.media?.dir) throw notFound('Aucun média associé à ce titre.');
    const signed = signedMediaUrl(config.mediaBaseUrl, playable.media.dir, 'master.m3u8', { secret: config.signingSecret, ttl: config.playbackTtl });
    const [progress, preferences, next] = await Promise.all([
      store.getProgress(uid, progressKey(query.profileId, title.id, playable.season, playable.episode)),
      getPreferences(uid, query.profileId),
      title.type === 'series' ? nextEpisode(title.id, playable.season, playable.episode) : null,
    ]);
    return {
      titleId: title.id,
      type: title.type,
      title: title.title,
      season: playable.season,
      episode: playable.episode,
      episodeTitle: playable.episodeTitle,
      duration: playable.media.duration,
      hlsUrl: signed.url,
      expiresAt: signed.expiresAt,
      audioTracks: playable.media.audio || [],
      subtitles: playable.media.subtitles || [],
      thumbnailsUrl: playable.media.thumbnails ? signed.base + playable.media.thumbnails : null,
      markers: { recap: playable.markers.recap ?? null, intro: playable.markers.intro ?? null, credits: playable.markers.credits ?? null },
      resume: progress && !progress.completed && progress.position > 10 ? { position: progress.position, duration: progress.duration } : null,
      preferences,
      next: next ? publicEpisode(next) : null,
    };
  }

  async function saveProgress(titleId, body, uid, profileId) {
    const title = await getTitle(titleId);
    const isSeries = title.type === 'series';
    if (isSeries && body.season === undefined) throw new ApiError(400, 'invalid_request', 'season et episode sont requis pour une série.');
    const target = isSeries ? await store.getEpisode(title.id, body.season, body.episode) : title;
    if (!target || target.published === false) throw notFound('Épisode introuvable.');
    const duration = target.media?.duration || body.duration;
    const position = Math.min(body.position, duration);
    const data = {
      profileId,
      titleId: title.id,
      type: title.type,
      season: isSeries ? body.season : null,
      episode: isSeries ? body.episode : null,
      position: Math.round(position * 10) / 10,
      duration,
      completed: isCompleted(position, duration, target.markers),
    };
    await store.setProgress(uid, progressKey(profileId, title.id, data.season, data.episode), data);
    return data;
  }

  async function getProgress(titleId, query, uid) {
    const title = await getTitle(titleId);
    if (title.type === 'series' && query.season === undefined) {
      return (await profileProgress(uid, query.profileId)).find(item => item.titleId === title.id) || null;
    }
    return store.getProgress(uid, progressKey(query.profileId, title.id, query.season, query.episode));
  }

  async function continueWatching(uid, profileId) {
    const latestByTitle = new Map();
    for (const item of await profileProgress(uid, profileId)) {
      if (!latestByTitle.has(item.titleId)) latestByTitle.set(item.titleId, item);
    }
    const rows = await Promise.all([...latestByTitle.values()].slice(0, 20).map(async item => {
      const title = await store.getTitle(item.titleId);
      if (!title?.published) return null;
      let current = item;
      let episodeTitle = null;
      if (title.type === 'series') {
        if (item.completed) {
          // Épisode terminé : on propose le suivant depuis le début.
          const next = await nextEpisode(title.id, item.season, item.episode);
          if (!next) return null;
          current = { ...item, season: next.season, episode: next.episode, position: 0, duration: next.media?.duration || 0 };
          episodeTitle = next.title;
        } else {
          episodeTitle = (await store.getEpisode(title.id, item.season, item.episode))?.title ?? null;
        }
      } else if (item.completed) {
        return null;
      }
      return {
        titleId: title.id,
        type: title.type,
        title: title.title,
        posterUrl: title.posterUrl ?? null,
        backdropUrl: title.backdropUrl ?? null,
        season: current.season,
        episode: current.episode,
        episodeTitle,
        position: current.position,
        duration: current.duration,
        progress: current.duration ? Math.min(1, current.position / current.duration) : 0,
        updatedAt: item.updatedAt,
      };
    }));
    return rows.filter(Boolean);
  }

  return { getTitle, getEpisodes, publicTitle, publicEpisode, nextEpisode, playback, saveProgress, getProgress, continueWatching, getPreferences };
}
