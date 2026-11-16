import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message = 'Ressource introuvable.') => new ApiError(404, 'not_found', message);
export const unauthorized = (message = 'Authentification requise.') => new ApiError(401, 'unauthorized', message);

/** Enveloppe un handler async pour que ses erreurs arrivent au middleware d'erreurs. */
export const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

/** Valide params / query / body avec zod et range le résultat dans req.valid. */
export const validate = schemas => (req, _res, next) => {
  try {
    req.valid = {};
    for (const [key, schema] of Object.entries(schemas)) req.valid[key] = schema.parse(req[key] ?? {});
    next();
  } catch (error) {
    next(error);
  }
};

export function notFoundHandler(_req, _res, next) {
  next(notFound('Route introuvable.'));
}

// Express reconnaît un middleware d'erreurs à ses 4 arguments : _next doit rester dans la signature.
export function errorHandler(error, req, res, _next) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'invalid_request', message: 'Requête invalide.', details: error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })) },
    });
  }
  if (error instanceof ApiError) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
  }
  if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
    return res.status(error.status || 400).json({ error: { code: 'invalid_body', message: 'Corps de requête invalide.' } });
  }
  // Jamais de détail interne dans la réponse : il part uniquement dans les logs.
  console.error(`[api] ${req.method} ${req.originalUrl}`, error);
  return res.status(500).json({ error: { code: 'internal_error', message: 'Erreur interne.' } });
}
