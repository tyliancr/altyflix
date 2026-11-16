import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/, 'Identifiant invalide.');
const lang = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/, 'Code de langue invalide.');
const number = z.coerce.number().int().min(0).max(999);
// Les profils de l'application ont un id du type "<uid>_<uuid>".
const profileId = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).default('default');

export const titleParams = z.object({ id });
export const seasonParams = z.object({ id, n: number });
export const progressParams = z.object({ titleId: id });

export const episodeQuery = z.object({
  season: number.optional(),
  episode: number.optional(),
  profileId,
}).refine(value => (value.season === undefined) === (value.episode === undefined), {
  message: 'season et episode vont ensemble.',
});

export const profileQuery = z.object({ profileId });

export const progressBody = z.object({
  position: z.number().min(0).max(86400),
  duration: z.number().positive().max(86400),
  season: z.number().int().min(0).max(999).optional(),
  episode: z.number().int().min(0).max(999).optional(),
}).strict().refine(value => (value.season === undefined) === (value.episode === undefined), {
  message: 'season et episode vont ensemble.',
});

export const preferencesBody = z.object({
  audioLang: lang.optional(),
  // null = sous-titres désactivés.
  subtitleLang: lang.nullable().optional(),
  subtitleForced: z.boolean().optional(),
  subtitleSize: z.enum(['s', 'm', 'l', 'xl']).optional(),
}).strict().refine(value => Object.keys(value).length > 0, { message: 'Aucune préférence fournie.' });

export const DEFAULT_PREFERENCES = { audioLang: 'fr', subtitleLang: null, subtitleForced: false, subtitleSize: 'm' };
