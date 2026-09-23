import { Router, Request, Response, NextFunction } from 'express';
import { param, validationResult } from 'express-validator';
import { User } from '../domain/user/entities/User';
import { isInCostList } from '../domain/user/costList';
import { validateHourlyRates, type HourlyRate } from '../domain/user/hourlyRates';
import { getCostActor } from '../application/services/appUserDirectory';
import { authenticate, requireSuperAdmin } from '../middleware/authMiddleware';
import { logger } from '../utils/logger';

/**
 * Page « Coûts horaires » (issue #44) : coût horaire des utilisateurs connectés par SSO et des comptes
 * non SSO ajoutés par un super admin. Accès : super admin ou rôle ayant la page `couts` (ex. Finance).
 */
const router = Router();

/** Refuse (403) si l'utilisateur n'a pas accès aux coûts ; expose `res.locals.canManage` (super admin). */
async function requireCostAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = await getCostActor(req.user!.userId);
    if (!actor.hasAccess) {
      return res.status(403).json({ success: false, error: 'Accès réservé aux utilisateurs ayant accès aux coûts' });
    }
    res.locals.canManage = actor.isSuperAdmin;
    next();
  } catch (error) {
    logger.error('Cost access check error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

function rejectInvalid(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ success: false, errors: errors.array().map((e) => e.msg) });
  return true;
}

interface CostUserDoc {
  _id: { toString: () => string };
  email: string;
  firstName?: string;
  lastName?: string;
  provider?: string;
  isActive?: boolean;
  role?: string;
  roleId?: { name?: string } | null;
  hourlyRates?: HourlyRate[];
  includedInCosts?: boolean;
}

const COST_USER_FIELDS = 'email firstName lastName provider isActive role roleId hourlyRates includedInCosts';

function toCostUser(u: CostUserDoc) {
  return {
    id: u._id.toString(),
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    provider: u.provider ?? 'local',
    isActive: u.isActive !== false,
    roleName: u.roleId?.name ?? (u.role === 'super_admin' ? 'Super admin' : null),
    /** Coût initial puis changements datés (vide si aucun coût). */
    hourlyRates: (u.hourlyRates ?? []).map((r) => ({ startDate: r.startDate ?? null, rate: r.rate })),
    /** Compte non SSO ajouté manuellement (retirable par un super admin). */
    manual: u.provider !== 'microsoft',
  };
}

const byName = (a: CostUserDoc, b: CostUserDoc) =>
  `${a.lastName ?? ''} ${a.firstName ?? ''} ${a.email}`.localeCompare(`${b.lastName ?? ''} ${b.firstName ?? ''} ${b.email}`, 'fr');

/**
 * GET /api/costs/users — utilisateurs de la liste des coûts (SSO + ajoutés), avec leur coût horaire.
 * `canManage` : l'appelant (super admin) peut ajouter / retirer des comptes non SSO.
 */
router.get('/users', authenticate, requireCostAccess, async (_req: Request, res: Response) => {
  try {
    const users = await User.find({ $or: [{ provider: 'microsoft' }, { includedInCosts: true }] })
      .select(COST_USER_FIELDS)
      .populate('roleId', 'name')
      .lean<CostUserDoc[]>();
    res.json({ success: true, users: [...users].sort(byName).map(toCostUser), canManage: res.locals.canManage === true });
  } catch (error) {
    logger.error('List cost users error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/**
 * PATCH /api/costs/users/:id — remplace les coûts horaires (€) d'un utilisateur de la liste :
 * `hourlyRates` = [] (aucun coût) ou coût initial `{ startDate: null, rate }` suivi d'au plus deux
 * changements `{ startDate: 'YYYY-MM-DD', rate }` à dates croissantes (3 coûts maximum).
 */
router.patch(
  '/users/:id',
  authenticate,
  requireCostAccess,
  [param('id').isMongoId().withMessage('Identifiant invalide')],
  async (req: Request, res: Response) => {
    if (rejectInvalid(req, res)) return;
    const validation = validateHourlyRates(req.body?.hourlyRates);
    if (!validation.ok) return res.status(400).json({ success: false, errors: [validation.error] });
    try {
      const user = await User.findById(req.params.id);
      if (!user || !isInCostList(user)) {
        return res.status(404).json({ success: false, error: 'Utilisateur absent de la liste des coûts' });
      }
      user.hourlyRates = validation.rates.length > 0 ? validation.rates : undefined;
      await user.save();
      res.json({ success: true, hourlyRates: validation.rates });
    } catch (error) {
      logger.error('Update hourly cost error:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
);

/** GET /api/costs/candidates — comptes non SSO pas encore dans la liste (super admin). */
router.get('/candidates', authenticate, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const users = await User.find({ provider: { $ne: 'microsoft' }, includedInCosts: { $ne: true } })
      .select(COST_USER_FIELDS)
      .populate('roleId', 'name')
      .lean<CostUserDoc[]>();
    res.json({ success: true, users: [...users].sort(byName).map(toCostUser) });
  } catch (error) {
    logger.error('List cost candidates error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/** POST /api/costs/users/:id — ajoute un compte non SSO à la liste des coûts (super admin). */
router.post(
  '/users/:id',
  authenticate,
  requireSuperAdmin,
  [param('id').isMongoId().withMessage('Identifiant invalide')],
  async (req: Request, res: Response) => {
    if (rejectInvalid(req, res)) return;
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
      if (isInCostList(user)) return res.status(400).json({ success: false, error: 'Utilisateur déjà dans la liste des coûts' });
      user.includedInCosts = true;
      await user.save();
      res.status(201).json({ success: true });
    } catch (error) {
      logger.error('Include cost user error:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
);

/**
 * DELETE /api/costs/users/:id — retire un compte non SSO ajouté manuellement (super admin). Ses coûts
 * horaires sont effacés : il ne compte plus dans les coûts des épics.
 */
router.delete(
  '/users/:id',
  authenticate,
  requireSuperAdmin,
  [param('id').isMongoId().withMessage('Identifiant invalide')],
  async (req: Request, res: Response) => {
    if (rejectInvalid(req, res)) return;
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
      if (user.provider === 'microsoft') {
        return res.status(400).json({ success: false, error: 'Un compte SSO ne peut pas être retiré de la liste' });
      }
      user.includedInCosts = false;
      user.hourlyRates = undefined;
      await user.save();
      res.json({ success: true });
    } catch (error) {
      logger.error('Exclude cost user error:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
);

export { router as costRoutes };
