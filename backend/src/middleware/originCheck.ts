import { Request, Response, NextFunction } from 'express';
import { sessionCookieName, readSessionCookie } from '../config/sessionCookie';
import { logger } from '../utils/logger';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Protection CSRF, en complément de SameSite=Strict : une requête qui modifie des données et
 * qui porte le cookie de session doit venir d'une origine autorisée (CORS_ORIGIN). Les clients
 * non navigateurs (scripts d'import avec `Authorization: Bearer`) n'envoient pas le cookie et ne
 * sont pas concernés.
 */
export function createOriginCheck(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins.map((o) => o.trim().replace(/\/$/, '')).filter(Boolean));
  return (req: Request, res: Response, next: NextFunction) => {
    if (!UNSAFE_METHODS.has(req.method)) return next();
    if (!readSessionCookie(req.headers.cookie)) return next();

    const origin = originOf(req.get('origin')) ?? originOf(req.get('referer'));
    if (origin && allowed.has(origin)) return next();

    logger.warn(`Requête refusée (origine non autorisée ${origin ?? 'absente'}) : ${req.method} ${req.originalUrl}`);
    return res.status(403).json({ success: false, error: 'Origine de la requête non autorisée' });
  };
}

export { sessionCookieName };
