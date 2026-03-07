import { Request, Response, NextFunction } from 'express';
import { authService, AuthTokenPayload } from '../application/services/AuthService';

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
 * Middleware to verify JWT token and attach user to request
 */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Token d\'authentification manquant'
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const payload = authService.verifyToken(token);

  if (!payload) {
    return res.status(401).json({
      success: false,
      error: 'Token invalide ou expiré'
    });
  }

  // Attach user info to request
  req.user = payload;
  next();
};

/**
 * Optional authentication - doesn't fail if no token
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = authService.verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }

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

