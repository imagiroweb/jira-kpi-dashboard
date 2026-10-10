import { Request, Response, NextFunction } from 'express';
import { User } from '../domain/user/entities/User';
import type { PageId } from '../domain/user/entities/Role';
import { authService } from '../application/services/AuthService';
import { logger } from '../utils/logger';

/**
 * Contrôle d'accès par page (à placer après `authenticate`) : l'utilisateur doit avoir au moins
 * une des pages indiquées visible dans son rôle (`Role.pageVisibilities`), comme dans le menu du
 * frontend. Le super_admin a toutes les pages. Un compte désactivé est refusé.
 *
 * Les droits sont relus en base à chaque requête : un changement de rôle s'applique tout de
 * suite, sans attendre l'expiration du JWT.
 */
/**
 * Même contrôle que `requirePage`, hors Express (ex. abonnement Socket.io) : vrai si le compte
 * existe, est actif et voit au moins une des pages.
 */
export async function userCanSeePage(userId: string, ...pages: PageId[]): Promise<boolean> {
  const user = await User.findById(userId).select('role roleId isActive');
  if (!user || !user.isActive) return false;
  const visible = await authService.getVisiblePages(user);
  return pages.some((page) => visible[page] === true);
}

export function requirePage(...pages: PageId[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Token d\'authentification manquant' });
      }
      const user = await User.findById(userId).select('role roleId isActive');
      if (!user || !user.isActive) {
        return res.status(401).json({ success: false, error: 'Compte introuvable ou désactivé' });
      }
      const visible = await authService.getVisiblePages(user);
      if (pages.some((page) => visible[page] === true)) {
        return next();
      }
      return res.status(403).json({ success: false, error: 'Accès non autorisé pour votre rôle' });
    } catch (error) {
      logger.error('requirePage error:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  };
}
