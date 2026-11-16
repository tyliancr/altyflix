import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { notFound, validate, wrap } from './lib/errors.js';
import { createCatalog } from './services/catalog.js';
import { episodeQuery, preferencesBody, profileQuery, progressBody, progressParams, seasonParams, titleParams } from './schemas.js';

export function createRoutes({ store, config, auth }) {
  const router = Router();
  const catalog = createCatalog({ store, config });

  // La délivrance d'URLs signées est limitée plus strictement que le reste.
  const playbackLimiter = rateLimit({
    windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Trop de demandes de lecture. Réessayez dans une minute.' } },
  });

  router.use(auth);

  // --- Catalogue ---------------------------------------------------------------------------
  router.get('/titles/:id', validate({ params: titleParams }), wrap(async (req, res) => {
    res.json(catalog.publicTitle(await catalog.getTitle(req.valid.params.id)));
  }));

  router.get('/titles/:id/playback', playbackLimiter, validate({ params: titleParams, query: episodeQuery }), wrap(async (req, res) => {
    res.json(await catalog.playback(req.valid.params.id, req.valid.query, req.uid));
  }));

  router.get('/titles/:id/next', validate({ params: titleParams, query: episodeQuery }), wrap(async (req, res) => {
    const title = await catalog.getTitle(req.valid.params.id);
    const { season, episode } = req.valid.query;
    if (title.type !== 'series' || season === undefined) return res.json({ next: null });
    const next = await catalog.nextEpisode(title.id, season, episode);
    res.json({ next: next ? catalog.publicEpisode(next) : null });
  }));

  router.get('/series/:id/seasons/:n/episodes', validate({ params: seasonParams }), wrap(async (req, res) => {
    const { id, n } = req.valid.params;
    const title = await catalog.getTitle(id);
    if (title.type !== 'series') throw notFound('Ce titre n\'est pas une série.');
    const episodes = await catalog.getEpisodes(id, n);
    if (!episodes.length) throw notFound('Saison introuvable.');
    res.json({ titleId: id, season: n, episodes: episodes.map(catalog.publicEpisode) });
  }));

  // --- Données de l'utilisateur connecté ---------------------------------------------------
  router.get('/me/progress/:titleId', validate({ params: progressParams, query: episodeQuery }), wrap(async (req, res) => {
    res.json({ progress: await catalog.getProgress(req.valid.params.titleId, req.valid.query, req.uid) });
  }));

  router.put('/me/progress/:titleId', validate({ params: progressParams, query: profileQuery, body: progressBody }), wrap(async (req, res) => {
    res.json({ progress: await catalog.saveProgress(req.valid.params.titleId, req.valid.body, req.uid, req.valid.query.profileId) });
  }));

  router.get('/me/continue-watching', validate({ query: profileQuery }), wrap(async (req, res) => {
    res.json({ items: await catalog.continueWatching(req.uid, req.valid.query.profileId) });
  }));

  router.get('/me/preferences', validate({ query: profileQuery }), wrap(async (req, res) => {
    res.json({ preferences: await catalog.getPreferences(req.uid, req.valid.query.profileId) });
  }));

  router.put('/me/preferences', validate({ query: profileQuery, body: preferencesBody }), wrap(async (req, res) => {
    await store.setPreferences(req.uid, req.valid.query.profileId, req.valid.body);
    res.json({ preferences: await catalog.getPreferences(req.uid, req.valid.query.profileId) });
  }));

  return router;
}
