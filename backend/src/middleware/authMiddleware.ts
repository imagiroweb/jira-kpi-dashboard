import { Request, Response, NextFunction } from 'express';
import { authService, AuthTokenPayload } from '../application/services/AuthService';
import { readSessionCookie } from '../config/sessionCookie';

// Extend Express Request type (namespace required for Express augmentation)
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

/**
 * Jeton de session : cookie HttpOnly posé à la connexion (navigateur), sinon en-tête
 * `Authorization: Bearer …` (scripts d'administration / d'import).
 */
export function extractSessionToken(req: Request): string | null {
  const fromCookie = readSessionCookie(req.headers.cookie);
  if (fromCookie) return fromCookie;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    return token || null;
  }
  return null;
}

/**
 * Vérifie la session (JWT + compte actif + version de session) et attache l'utilisateur à la requête.
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const token = extractSessionToken(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Token d\'authentification manquant'
    });
  }

  const payload = await authService.validateSession(token);
  if (!payload) {
    return res.status(401).json({
      success: false,
      error: 'Session invalide ou expirée'
    });
  }

  req.user = payload;
  next();
};

/**
 * Require super_admin role - use after authenticate
 */
export const requireSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { User } = await import('../domain/user/entities/User');
    const user = await User.findById(req.user!.userId).select('role').lean();
    if (!user || user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Accès réservé aux super administrateurs'
      });
    }
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
};

