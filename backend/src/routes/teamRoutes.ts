import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import { Team, ITeam } from '../domain/team/entities/Team';
import { canAssignUserToTeam, hasGlobalTeamManagementAccess, TeamAssignmentActor } from '../domain/team/teamAssignment';
import { authenticate } from '../middleware/authMiddleware';
import { User } from '../domain/user/entities/User';
import { Role } from '../domain/user/entities/Role';

const router = Router();

function fail(res: Response, status: number, message: string, error?: unknown) {
  return res.status(status).json({
    success: false,
    message,
    ...(error ? { error: error instanceof Error ? error.message : 'Unknown error' } : {})
  });
}

function serializeTeam(team: ITeam) {
  return {
    id: team._id,
    name: team.name,
    leadIds: team.leadIds,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt
  };
}

/**
 * Charge le contexte de permission (rôle global, délégation, équipes dirigées)
 * de l'utilisateur authentifié pour la gestion des équipes. `null` si
 * l'utilisateur n'existe plus (jeton valide pour un compte supprimé).
 */
async function loadActorContext(userId: string): Promise<TeamAssignmentActor | null> {
  const user = await User.findById(userId).select('role roleId canManageTeamAssignment').lean();
  if (!user) return null;

  let performanceGlobalAccess = false;
  if (user.roleId) {
    const role = await Role.findById(user.roleId).select('performanceGlobalAccess').lean();
    performanceGlobalAccess = role?.performanceGlobalAccess ?? false;
  }

  const ledTeams = await Team.find({ leadIds: userId }).select('_id').lean();

  return {
    isSuperAdmin: user.role === 'super_admin',
    performanceGlobalAccess,
    canManageTeamAssignment: user.canManageTeamAssignment ?? false,
    leadTeamIds: ledTeams.map((t) => (t._id as mongoose.Types.ObjectId).toString())
  };
}

/** Exige un accès global à la gestion des équipes (CTO via `performanceGlobalAccess`, ou super_admin). */
async function requireGlobalTeamManagementAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = await loadActorContext(req.user!.userId);
    if (!actor || !hasGlobalTeamManagementAccess(actor)) {
      return fail(res, 403, 'Accès réservé au CTO ou aux administrateurs');
    }
    next();
  } catch (error) {
    logger.error('Error checking team management access:', error);
    fail(res, 500, 'Erreur serveur', error);
  }
}

/**
 * Liste des équipes. Ouvert à tout utilisateur authentifié : nécessaire pour
 * afficher les noms d'équipe et alimenter les sélecteurs côté frontend, pas
 * seulement pour le CTO.
 * GET /api/teams
 */
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const teams = await Team.find().sort({ name: 1 });
    res.json({ success: true, teams: teams.map(serializeTeam) });
  } catch (error) {
    logger.error('Error listing teams:', error);
    fail(res, 500, 'Erreur lors de la récupération des équipes', error);
  }
});

/**
 * Création d'une équipe (CTO/super_admin uniquement).
 * POST /api/teams
 */
router.post(
  '/',
  authenticate,
  requireGlobalTeamManagementAccess,
  [body('name').trim().notEmpty().withMessage('Nom requis'), body('leadIds').optional().isArray()],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return fail(res, 400, errors.array().map((e) => e.msg).join(', '));

      const { name, leadIds } = req.body;
      const existing = await Team.findOne({ name });
      if (existing) return fail(res, 400, 'Une équipe avec ce nom existe déjà');

      const team = await Team.create({ name, leadIds: leadIds ?? [] });
      res.status(201).json({ success: true, team: serializeTeam(team) });
    } catch (error) {
      logger.error('Error creating team:', error);
      fail(res, 500, "Erreur lors de la création de l'équipe", error);
    }
  }
);

/**
 * Renommage / mise à jour des leads d'une équipe (CTO/super_admin uniquement).
 * PATCH /api/teams/:id
 */
router.patch(
  '/:id',
  authenticate,
  requireGlobalTeamManagementAccess,
  [body('name').optional().trim().notEmpty(), body('leadIds').optional().isArray()],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return fail(res, 400, errors.array().map((e) => e.msg).join(', '));

      const { id } = req.params;
      const team = await Team.findById(id);
      if (!team) return fail(res, 404, 'Équipe introuvable');

      if (typeof req.body.name === 'string') team.name = req.body.name;
      if (Array.isArray(req.body.leadIds)) team.leadIds = req.body.leadIds;

      await team.save();
      res.json({ success: true, team: serializeTeam(team) });
    } catch (error) {
      logger.error('Error updating team:', error);
      fail(res, 500, "Erreur lors de la mise à jour de l'équipe", error);
    }
  }
);

/**
 * Rattache (ou détache, `teamId: null`) un collaborateur à une équipe. La
 * portée est résolue par `canAssignUserToTeam` : libre pour CTO/super_admin,
 * limitée à sa propre équipe pour un lead avec `canManageTeamAssignment`.
 * PATCH /api/teams/members/:userId
 */
router.patch(
  '/members/:userId',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const requestedTeamId: string | null =
        req.body?.teamId === undefined || req.body?.teamId === '' ? null : req.body.teamId;

      if (requestedTeamId !== null) {
        if (typeof requestedTeamId !== 'string' || !mongoose.Types.ObjectId.isValid(requestedTeamId)) {
          return fail(res, 400, "Identifiant d'équipe invalide");
        }
      }

      const targetUser = await User.findById(userId);
      if (!targetUser) return fail(res, 404, 'Utilisateur introuvable');

      const actor = await loadActorContext(req.user!.userId);
      if (!actor) return fail(res, 404, 'Utilisateur authentifié introuvable');

      if (requestedTeamId !== null) {
        const targetTeam = await Team.findById(requestedTeamId);
        if (!targetTeam) return fail(res, 404, 'Équipe introuvable');
      }

      const isLeadOfAnyTeam = (await Team.findOne({ leadIds: userId })) !== null;

      const decision = canAssignUserToTeam(actor, { isLeadOfAnyTeam }, requestedTeamId);
      if (!decision.allowed) return fail(res, 403, decision.reason);

      targetUser.teamId = requestedTeamId ? new mongoose.Types.ObjectId(requestedTeamId) : undefined;
      await targetUser.save();

      res.json({
        success: true,
        user: { id: targetUser._id, teamId: targetUser.teamId ?? null }
      });
    } catch (error) {
      logger.error('Error assigning user to team:', error);
      fail(res, 500, "Erreur lors du rattachement à l'équipe", error);
    }
  }
);

/**
 * Octroi/révocation du droit délégué `canManageTeamAssignment` (CTO/super_admin
 * uniquement) : c'est cette délégation qui permet ensuite à un lead d'utiliser
 * `PATCH /api/teams/members/:userId` pour sa propre équipe.
 * PATCH /api/teams/members/:userId/delegation
 */
router.patch(
  '/members/:userId/delegation',
  authenticate,
  requireGlobalTeamManagementAccess,
  [body('canManageTeamAssignment').isBoolean().withMessage('canManageTeamAssignment doit être un booléen')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return fail(res, 400, errors.array().map((e) => e.msg).join(', '));

      const { userId } = req.params;
      const targetUser = await User.findById(userId);
      if (!targetUser) return fail(res, 404, 'Utilisateur introuvable');

      targetUser.canManageTeamAssignment = req.body.canManageTeamAssignment;
      await targetUser.save();

      res.json({
        success: true,
        user: { id: targetUser._id, canManageTeamAssignment: targetUser.canManageTeamAssignment }
      });
    } catch (error) {
      logger.error('Error updating team assignment delegation:', error);
      fail(res, 500, 'Erreur lors de la mise à jour de la délégation', error);
    }
  }
);

export { router as teamRoutes };
