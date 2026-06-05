import { Request, Response, NextFunction } from 'express';
import { AuthTokenPayload } from '../../application/services/AuthService';
import { TEST_USER } from '../fixtures/users';

/** Passe sans attacher d'utilisateur (routes publiques ou sans auth) */
export function bypassAuth(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

/** Simule un utilisateur authentifié (JWT bypass) */
export function mockAuthenticate(user: AuthTokenPayload = TEST_USER) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.user = user;
    next();
  };
}

/** Bypass du contrôle super_admin (User.findById mocké séparément si besoin) */
export function mockRequireSuperAdmin(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

/** Simule un refus 401 (token absent) */
export function mockAuthDenied(_req: Request, res: Response, _next: NextFunction): void {
  res.status(401).json({
    success: false,
    error: 'Token d\'authentification manquant',
  });
}
