import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import {
  PerformanceCycle,
  IPerformanceCycle,
  PERFORMANCE_CYCLE_STATUSES
} from '../domain/performance/entities/PerformanceCycle';
import {
  PerformanceReview,
  IPerformanceReview,
  PERFORMANCE_REVIEW_STATUSES
} from '../domain/performance/entities/PerformanceReview';
import {
  appendKeyResultProgress,
  applyManagerAssessment,
  applyObjectivesDefinition,
  applySelfAssessment,
  AssessmentInput,
  computeReviewStatus,
  ObjectiveDefinitionInput,
  validateObjectivesDefinition
} from '../domain/performance/performanceReview';
import {
  canAccessReviewForTeam,
  hasGlobalPerformanceAccess,
  PerformanceScopeActor,
  resolveAuthorRole
} from '../domain/performance/performanceScope';
import { authenticate } from '../middleware/authMiddleware';
import { User } from '../domain/user/entities/User';
import { Role } from '../domain/user/entities/Role';
import { Team } from '../domain/team/entities/Team';

const router = Router();

const PROGRESS_RETRIES = 5;

function author(req: Request) {
  return {
    id: req.user!.userId,
    name: req.user!.email.split('@')[0],
    role: 'collaborateur' as const
  };
}

function fail(res: Response, status: number, message: string, error?: unknown) {
  return res.status(status).json({
    success: false,
    message,
    ...(error ? { error: error instanceof Error ? error.message : 'Unknown error' } : {})
  });
}

function serialize(review: IPerformanceReview) {
  return {
    id: review._id,
    user: review.user,
    cycle: review.cycle,
    team: review.team,
    teamNameSnapshot: review.teamNameSnapshot,
    objectives: review.objectives,
    qualitative: review.qualitative,
    competencyScores: review.competencyScores,
    status: review.status,
    definedBy: review.definedBy,
    createdBy: review.createdBy,
    updatedBy: review.updatedBy,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt
  };
}

/**
 * Résout le cycle ciblé : celui demandé en query/body (`cycleId`), sinon le
 * cycle actif. Retourne `undefined` si l'id fourni n'est pas un ObjectId
 * valide (pour distinguer un 400 d'un 404 côté appelant).
 */
async function resolveCycle(cycleId: unknown): Promise<IPerformanceCycle | null | undefined> {
  if (typeof cycleId === 'string' && cycleId.trim()) {
    if (!mongoose.Types.ObjectId.isValid(cycleId)) {
      return undefined;
    }
    return PerformanceCycle.findById(cycleId);
  }
  return PerformanceCycle.findOne({ status: 'active' });
}

/**
 * Ma fiche de performance pour un cycle (le cycle actif par défaut).
 * Créée à la volée si elle n'existe pas encore ET que le cycle est actif
 * (pas de création rétroactive sur un cycle clos, ni sans cycle du tout).
 * GET /api/performance/reviews/me?cycleId=
 */
router.get('/reviews/me', authenticate, async (req: Request, res: Response) => {
  try {
    const requestedCycleId = req.query.cycleId as string | undefined;
    const cycle = await resolveCycle(requestedCycleId);
    if (cycle === undefined) {
      return fail(res, 400, 'Identifiant de cycle invalide');
    }
    if (!cycle) {
      return fail(res, 404, requestedCycleId ? 'Cycle introuvable' : 'Aucun cycle de performance actif');
    }

    const existing = await PerformanceReview.findOne({ user: req.user!.userId, cycle: cycle._id });
    if (existing) {
      return res.json({ success: true, review: serialize(existing) });
    }

    if (cycle.status !== 'active') {
      return fail(res, 404, 'Aucune fiche de performance pour ce cycle');
    }

    const user = await User.findById(req.user!.userId).select('teamId').lean();

    const created = await PerformanceReview.create({
      user: req.user!.userId,
      cycle: cycle._id,
      team: user?.teamId ?? undefined,
      createdBy: author(req)
    });
    logger.info(`Performance review created for ${req.user!.email} (cycle ${cycle.label})`);

    res.status(201).json({ success: true, review: serialize(created) });
  } catch (error) {
    logger.error('Error fetching my performance review:', error);
    fail(res, 500, 'Erreur lors de la récupération de la fiche de performance', error);
  }
});

/**
 * Ajoute une mise à jour d'avancement à un KR de ma fiche (pourcentage libre
 * 0-100, note et lien de preuve Jira/Confluence optionnels). Les objectifs et
 * KR sont définis par le lead ou le CTO (pas par cette route). Verrou
 * optimiste (`__v`) avec quelques tentatives en cas d'écriture concurrente,
 * même pattern que `PATCH /api/meetings/:id`.
 * POST /api/performance/reviews/me/objectives/:objectiveId/krs/:krId/progress
 */
router.post(
  '/reviews/me/objectives/:objectiveId/krs/:krId/progress',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const value = Number(req.body?.value);
      if (!Number.isFinite(value)) {
        return fail(res, 400, "La valeur d'avancement doit être un nombre");
      }
      const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
      const evidenceUrl = typeof req.body?.evidenceUrl === 'string' ? req.body.evidenceUrl : undefined;

      const cycle = await resolveCycle(req.body?.cycleId);
      if (cycle === undefined) {
        return fail(res, 400, 'Identifiant de cycle invalide');
      }
      if (!cycle) {
        return fail(res, 404, req.body?.cycleId ? 'Cycle introuvable' : 'Aucun cycle de performance actif');
      }
      if (cycle.status !== 'active') {
        return fail(res, 403, "Ce cycle est clos, l'avancement ne peut plus être modifié");
      }

      const { objectiveId, krId } = req.params;
      const who = author(req);

      let updated: IPerformanceReview | null = null;

      for (let attempt = 0; attempt < PROGRESS_RETRIES; attempt += 1) {
        const current = await PerformanceReview.findOne({ user: req.user!.userId, cycle: cycle._id });
        if (!current) {
          return fail(res, 404, "Aucune fiche de performance pour ce cycle — ouvrez-la d'abord (GET /reviews/me)");
        }

        const objectives = current.toObject().objectives;
        const objectiveIndex = objectives.findIndex((o) => o.id === objectiveId);
        if (objectiveIndex === -1) {
          return fail(res, 404, 'Objectif introuvable');
        }
        const krIndex = objectives[objectiveIndex].krs.findIndex((k) => k.id === krId);
        if (krIndex === -1) {
          return fail(res, 404, 'Résultat clé introuvable');
        }

        objectives[objectiveIndex].krs[krIndex] = appendKeyResultProgress(
          objectives[objectiveIndex].krs[krIndex],
          { value, note, evidenceUrl },
          who
        );

        updated = await PerformanceReview.findOneAndUpdate(
          { _id: current._id, __v: current.__v },
          { $set: { objectives, updatedBy: who } },
          { new: true, runValidators: true }
        );
        if (updated) break;
      }

      if (!updated) {
        return fail(res, 409, 'La fiche a été modifiée en même temps, réessayez');
      }

      res.json({ success: true, review: serialize(updated) });
    } catch (error) {
      logger.error('Error updating key result progress:', error);
      fail(res, 500, "Erreur lors de la mise à jour de l'avancement", error);
    }
  }
);


const REVIEW_UPDATE_RETRIES = 5;

/**
 * Charge le contexte de portée (accès global CTO, équipes dirigées) de
 * l'utilisateur authentifié pour les routes de gestion (cycles, définition
 * d'objectifs, évaluation manager). `null` si le compte n'existe plus.
 */
async function loadPerformanceActorContext(userId: string): Promise<PerformanceScopeActor | null> {
  const user = await User.findById(userId).select('role roleId').lean();
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
    leadTeamIds: ledTeams.map((t) => (t._id as mongoose.Types.ObjectId).toString())
  };
}

/** Exige un accès global à la section Performance (CTO via `performanceGlobalAccess`, ou super_admin). */
async function requireGlobalPerformanceAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = await loadPerformanceActorContext(req.user!.userId);
    if (!actor || !hasGlobalPerformanceAccess(actor)) {
      return fail(res, 403, 'Accès réservé au CTO ou aux administrateurs');
    }
    next();
  } catch (error) {
    logger.error('Error checking global performance access:', error);
    fail(res, 500, 'Erreur serveur', error);
  }
}

/**
 * Liste des cycles de performance. Ouvert à tout utilisateur authentifié
 * (nécessaire pour un sélecteur de cycle côté frontend).
 * GET /api/performance/cycles
 */
router.get('/cycles', authenticate, async (_req: Request, res: Response) => {
  try {
    const cycles = await PerformanceCycle.find().sort({ startDate: -1 });
    res.json({ success: true, cycles });
  } catch (error) {
    logger.error('Error listing performance cycles:', error);
    fail(res, 500, 'Erreur lors de la récupération des cycles', error);
  }
});

/**
 * Création d'un cycle de performance (CTO/super_admin uniquement). Statut
 * "draft" par défaut — voir PATCH /cycles/:id pour l'activer.
 * POST /api/performance/cycles
 */
router.post(
  '/cycles',
  authenticate,
  requireGlobalPerformanceAccess,
  [
    body('label').trim().notEmpty().withMessage('Libellé requis'),
    body('startDate').isISO8601().withMessage('Date de début invalide'),
    body('endDate').isISO8601().withMessage('Date de fin invalide'),
    body('status').optional().isIn(PERFORMANCE_CYCLE_STATUSES)
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return fail(res, 400, errors.array().map((e) => e.msg).join(', '));

      const { label, startDate, endDate, status } = req.body;
      const existing = await PerformanceCycle.findOne({ label });
      if (existing) return fail(res, 400, 'Un cycle avec ce libellé existe déjà');

      if (status === 'active') {
        await PerformanceCycle.updateMany({ status: 'active' }, { $set: { status: 'closed' } });
      }

      const cycle = await PerformanceCycle.create({ label, startDate, endDate, status: status ?? 'draft' });
      res.status(201).json({ success: true, cycle });
    } catch (error) {
      logger.error('Error creating performance cycle:', error);
      fail(res, 500, 'Erreur lors de la création du cycle', error);
    }
  }
);

/**
 * Mise à jour d'un cycle (label/dates/statut). CTO/super_admin uniquement.
 * Activer un cycle (`status: 'active'`) referme automatiquement tout autre
 * cycle actif — un seul cycle actif à la fois (invariant du modèle).
 * PATCH /api/performance/cycles/:id
 */
router.patch(
  '/cycles/:id',
  authenticate,
  requireGlobalPerformanceAccess,
  [
    body('label').optional().trim().notEmpty(),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
    body('status').optional().isIn(PERFORMANCE_CYCLE_STATUSES)
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return fail(res, 400, errors.array().map((e) => e.msg).join(', '));

      const { id } = req.params;
      const cycle = await PerformanceCycle.findById(id);
      if (!cycle) return fail(res, 404, 'Cycle introuvable');

      if (typeof req.body.label === 'string') cycle.label = req.body.label;
      if (typeof req.body.startDate === 'string') cycle.startDate = new Date(req.body.startDate);
      if (typeof req.body.endDate === 'string') cycle.endDate = new Date(req.body.endDate);

      if (typeof req.body.status === 'string' && req.body.status !== cycle.status) {
        if (req.body.status === 'active') {
          await PerformanceCycle.updateMany(
            { _id: { $ne: cycle._id }, status: 'active' },
            { $set: { status: 'closed' } }
          );
        }
        cycle.status = req.body.status;
      }

      await cycle.save();
      res.json({ success: true, cycle });
    } catch (error) {
      logger.error('Error updating performance cycle:', error);
      fail(res, 500, 'Erreur lors de la mise à jour du cycle', error);
    }
  }
);

/**
 * Liste des fiches de performance dans la portée de l'acteur : toutes pour
 * le CTO/super_admin (filtrables par équipe), celles de son (ses) équipe(s)
 * pour un lead. Un simple collaborateur n'a pas accès à cette liste (voir
 * GET /reviews/me pour sa propre fiche).
 * GET /api/performance/reviews?cycleId=&teamId=&status=
 */
router.get('/reviews', authenticate, async (req: Request, res: Response) => {
  try {
    const actor = await loadPerformanceActorContext(req.user!.userId);
    if (!actor) return fail(res, 404, 'Utilisateur authentifié introuvable');

    const isGlobal = hasGlobalPerformanceAccess(actor);
    if (!isGlobal && actor.leadTeamIds.length === 0) {
      return fail(res, 403, "Accès réservé au CTO, aux administrateurs, et aux leads d'équipe");
    }

    const requestedCycleId = req.query.cycleId as string | undefined;
    const cycle = await resolveCycle(requestedCycleId);
    if (cycle === undefined) return fail(res, 400, 'Identifiant de cycle invalide');
    if (!cycle) return fail(res, 404, requestedCycleId ? 'Cycle introuvable' : 'Aucun cycle de performance actif');

    const filter: Record<string, unknown> = { cycle: cycle._id };

    const requestedTeamId = req.query.teamId as string | undefined;
    if (requestedTeamId) {
      if (!mongoose.Types.ObjectId.isValid(requestedTeamId)) {
        return fail(res, 400, "Identifiant d'équipe invalide");
      }
      if (!isGlobal && !actor.leadTeamIds.includes(requestedTeamId)) {
        return fail(res, 403, "Vous n'avez pas accès à cette équipe");
      }
      filter.team = requestedTeamId;
    } else if (!isGlobal) {
      filter.team = { $in: actor.leadTeamIds };
    }

    const requestedStatus = req.query.status as string | undefined;
    if (requestedStatus) {
      if (!PERFORMANCE_REVIEW_STATUSES.includes(requestedStatus as (typeof PERFORMANCE_REVIEW_STATUSES)[number])) {
        return fail(res, 400, 'Statut invalide');
      }
      filter.status = requestedStatus;
    }

    const reviews = await PerformanceReview.find(filter)
      .populate('user', 'firstName lastName email')
      .sort({ updatedAt: -1 });

    res.json({ success: true, reviews: reviews.map(serialize) });
  } catch (error) {
    logger.error('Error listing performance reviews:', error);
    fail(res, 500, 'Erreur lors de la récupération des fiches de performance', error);
  }
});

/**
 * Membres d'équipe dans la portée de l'acteur (pour compléter la liste des fiches de `GET /reviews`
 * avec les collaborateurs qui n'ont pas encore de fiche ouverte pour ce cycle — une fiche n'existe
 * que si le collaborateur a déjà visité sa page ou qu'un lead/CTO lui a déjà défini des objectifs).
 * Mêmes règles de portée que `GET /reviews` : tout le monde pour le CTO/super_admin (filtrable par
 * équipe), les équipes dirigées pour un lead. N'inclut que les comptes actifs.
 * GET /api/performance/team-members?teamId=
 */
router.get('/team-members', authenticate, async (req: Request, res: Response) => {
  try {
    const actor = await loadPerformanceActorContext(req.user!.userId);
    if (!actor) return fail(res, 404, 'Utilisateur authentifié introuvable');

    const isGlobal = hasGlobalPerformanceAccess(actor);
    if (!isGlobal && actor.leadTeamIds.length === 0) {
      return fail(res, 403, "Accès réservé au CTO, aux administrateurs, et aux leads d'équipe");
    }

    const filter: Record<string, unknown> = { isActive: true };

    const requestedTeamId = req.query.teamId as string | undefined;
    if (requestedTeamId) {
      if (!mongoose.Types.ObjectId.isValid(requestedTeamId)) {
        return fail(res, 400, "Identifiant d'équipe invalide");
      }
      if (!isGlobal && !actor.leadTeamIds.includes(requestedTeamId)) {
        return fail(res, 403, "Vous n'avez pas accès à cette équipe");
      }
      filter.teamId = requestedTeamId;
    } else if (isGlobal) {
      filter.teamId = { $ne: null };
    } else {
      filter.teamId = { $in: actor.leadTeamIds };
    }

    const users = await User.find(filter)
      .select('firstName lastName email teamId')
      .sort({ firstName: 1, lastName: 1 });

    res.json({
      success: true,
      members: users.map((u) => ({
        id: u._id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        teamId: u.teamId
      }))
    });
  } catch (error) {
    logger.error('Error listing team members:', error);
    fail(res, 500, "Erreur lors de la récupération des membres d'équipe", error);
  }
});

/**
 * Détail de la fiche de performance d'un collaborateur (dans la portée de
 * l'acteur, ou sa propre fiche).
 * GET /api/performance/reviews/:userId?cycleId=
 */
router.get('/reviews/:userId', authenticate, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const requestedCycleId = req.query.cycleId as string | undefined;
    const cycle = await resolveCycle(requestedCycleId);
    if (cycle === undefined) return fail(res, 400, 'Identifiant de cycle invalide');
    if (!cycle) return fail(res, 404, requestedCycleId ? 'Cycle introuvable' : 'Aucun cycle de performance actif');

    const review = await PerformanceReview.findOne({ user: userId, cycle: cycle._id }).populate(
      'user',
      'firstName lastName email'
    );
    if (!review) return fail(res, 404, 'Aucune fiche de performance pour ce cycle');

    if (userId !== req.user!.userId) {
      const actor = await loadPerformanceActorContext(req.user!.userId);
      if (!actor) return fail(res, 404, 'Utilisateur authentifié introuvable');
      const reviewTeamId = review.team ? review.team.toString() : undefined;
      if (!canAccessReviewForTeam(actor, reviewTeamId)) {
        return fail(res, 403, "Vous n'avez pas accès à la fiche de ce collaborateur");
      }
    }

    res.json({ success: true, review: serialize(review) });
  } catch (error) {
    logger.error('Error fetching performance review:', error);
    fail(res, 500, 'Erreur lors de la récupération de la fiche de performance', error);
  }
});

/**
 * (Re)définit les objectifs d'un collaborateur pour un cycle (lead pour son
 * équipe, ou CTO/super_admin pour n'importe qui) — fusion par id qui
 * préserve l'avancement déjà saisi (voir `applyObjectivesDefinition`). Crée
 * la fiche à la volée sur le cycle actif si elle n'existe pas encore, avec
 * l'équipe actuelle du collaborateur (même règle que GET /reviews/me).
 * PATCH /api/performance/reviews/:userId/objectives
 */
router.patch('/reviews/:userId/objectives', authenticate, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const objectivesInput = req.body?.objectives;
    if (!Array.isArray(objectivesInput)) {
      return fail(res, 400, 'objectives doit être un tableau');
    }

    const validation = validateObjectivesDefinition(objectivesInput as ObjectiveDefinitionInput[]);
    if (!validation.valid) {
      return fail(res, 400, validation.errors.join(', '));
    }

    const cycle = await resolveCycle(req.body?.cycleId);
    if (cycle === undefined) return fail(res, 400, 'Identifiant de cycle invalide');
    if (!cycle) return fail(res, 404, req.body?.cycleId ? 'Cycle introuvable' : 'Aucun cycle de performance actif');
    if (cycle.status !== 'active') {
      return fail(res, 403, "Ce cycle est clos, les objectifs ne peuvent plus être modifiés");
    }

    const actor = await loadPerformanceActorContext(req.user!.userId);
    if (!actor) return fail(res, 404, 'Utilisateur authentifié introuvable');

    let updated: IPerformanceReview | null = null;

    for (let attempt = 0; attempt < REVIEW_UPDATE_RETRIES; attempt += 1) {
      let current = await PerformanceReview.findOne({ user: userId, cycle: cycle._id });

      const targetUser = current ? null : await User.findById(userId).select('teamId').lean();
      if (!current && !targetUser) {
        return fail(res, 404, 'Collaborateur introuvable');
      }

      const reviewTeamId = current
        ? current.team?.toString()
        : targetUser?.teamId
        ? targetUser.teamId.toString()
        : undefined;

      if (!canAccessReviewForTeam(actor, reviewTeamId)) {
        return fail(res, 403, "Vous n'avez pas accès à la fiche de ce collaborateur");
      }

      const who = { ...author(req), role: resolveAuthorRole(actor, reviewTeamId) };

      if (!current) {
        current = await PerformanceReview.create({
          user: userId,
          cycle: cycle._id,
          team: reviewTeamId,
          createdBy: who
        });
      }

      const objectives = applyObjectivesDefinition(current.toObject().objectives, objectivesInput);
      const status = computeReviewStatus(objectives, current.status);

      updated = await PerformanceReview.findOneAndUpdate(
        { _id: current._id, __v: current.__v },
        { $set: { objectives, definedBy: who, updatedBy: who, status } },
        { new: true, runValidators: true }
      );
      if (updated) break;
    }

    if (!updated) {
      return fail(res, 409, 'La fiche a été modifiée en même temps, réessayez');
    }

    res.json({ success: true, review: serialize(updated) });
  } catch (error) {
    logger.error('Error defining performance review objectives:', error);
    fail(res, 500, 'Erreur lors de la définition des objectifs', error);
  }
});

/**
 * Évaluation manager d'une fiche existante (par objectif, bilan qualitatif
 * "manager", grille de compétences "manager") — lead pour son équipe, ou
 * CTO/super_admin pour n'importe qui. Ne crée jamais la fiche : les
 * objectifs doivent déjà avoir été définis.
 * PATCH /api/performance/reviews/:userId/manager-assessment
 */
router.patch('/reviews/:userId/manager-assessment', authenticate, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const input: AssessmentInput = {
      objectives: Array.isArray(req.body?.objectives) ? req.body.objectives : undefined,
      qualitative: typeof req.body?.qualitative === 'object' ? req.body.qualitative : undefined,
      competencyScores: typeof req.body?.competencyScores === 'object' ? req.body.competencyScores : undefined
    };

    const cycle = await resolveCycle(req.body?.cycleId);
    if (cycle === undefined) return fail(res, 400, 'Identifiant de cycle invalide');
    if (!cycle) return fail(res, 404, req.body?.cycleId ? 'Cycle introuvable' : 'Aucun cycle de performance actif');
    if (cycle.status !== 'active') {
      return fail(res, 403, "Ce cycle est clos, l'évaluation ne peut plus être modifiée");
    }

    const actor = await loadPerformanceActorContext(req.user!.userId);
    if (!actor) return fail(res, 404, 'Utilisateur authentifié introuvable');

    let updated: IPerformanceReview | null = null;

    for (let attempt = 0; attempt < REVIEW_UPDATE_RETRIES; attempt += 1) {
      const current = await PerformanceReview.findOne({ user: userId, cycle: cycle._id });
      if (!current) {
        return fail(res, 404, "Aucune fiche de performance pour ce cycle — définissez d'abord ses objectifs");
      }

      const reviewTeamId = current.team?.toString();
      if (!canAccessReviewForTeam(actor, reviewTeamId)) {
        return fail(res, 403, "Vous n'avez pas accès à la fiche de ce collaborateur");
      }

      const who = { ...author(req), role: resolveAuthorRole(actor, reviewTeamId) };
      const plain = current.toObject();

      const result = applyManagerAssessment(
        { objectives: plain.objectives, qualitative: plain.qualitative, competencyScores: plain.competencyScores },
        input
      );
      const status = computeReviewStatus(result.objectives, current.status);

      updated = await PerformanceReview.findOneAndUpdate(
        { _id: current._id, __v: current.__v },
        {
          $set: {
            objectives: result.objectives,
            qualitative: result.qualitative,
            competencyScores: result.competencyScores,
            updatedBy: who,
            status
          }
        },
        { new: true, runValidators: true }
      );
      if (updated) break;
    }

    if (!updated) {
      return fail(res, 409, 'La fiche a été modifiée en même temps, réessayez');
    }

    res.json({ success: true, review: serialize(updated) });
  } catch (error) {
    logger.error('Error applying manager assessment:', error);
    fail(res, 500, "Erreur lors de l'application de l'évaluation manager", error);
  }
});


/**
 * Auto-évaluation du collaborateur sur sa propre fiche (par objectif, bilan
 * qualitatif "self", grille de compétences "self") — jamais côté d'un autre
 * collaborateur (voir PATCH /reviews/:userId/manager-assessment pour le
 * pendant lead/CTO). Ne crée jamais la fiche : les objectifs doivent déjà
 * avoir été définis par un lead/CTO.
 * PATCH /api/performance/reviews/me/self-assessment
 */
router.patch('/reviews/me/self-assessment', authenticate, async (req: Request, res: Response) => {
  try {
    const input: AssessmentInput = {
      objectives: Array.isArray(req.body?.objectives) ? req.body.objectives : undefined,
      qualitative: typeof req.body?.qualitative === 'object' ? req.body.qualitative : undefined,
      competencyScores: typeof req.body?.competencyScores === 'object' ? req.body.competencyScores : undefined
    };

    const cycle = await resolveCycle(req.body?.cycleId);
    if (cycle === undefined) return fail(res, 400, 'Identifiant de cycle invalide');
    if (!cycle) return fail(res, 404, req.body?.cycleId ? 'Cycle introuvable' : 'Aucun cycle de performance actif');
    if (cycle.status !== 'active') {
      return fail(res, 403, "Ce cycle est clos, l'auto-évaluation ne peut plus être modifiée");
    }

    const who = author(req);

    let updated: IPerformanceReview | null = null;

    for (let attempt = 0; attempt < REVIEW_UPDATE_RETRIES; attempt += 1) {
      const current = await PerformanceReview.findOne({ user: req.user!.userId, cycle: cycle._id });
      if (!current) {
        return fail(res, 404, "Aucune fiche de performance pour ce cycle — ouvrez-la d'abord (GET /reviews/me)");
      }

      const plain = current.toObject();
      const result = applySelfAssessment(
        { objectives: plain.objectives, qualitative: plain.qualitative, competencyScores: plain.competencyScores },
        input
      );
      const status = computeReviewStatus(result.objectives, current.status);

      updated = await PerformanceReview.findOneAndUpdate(
        { _id: current._id, __v: current.__v },
        {
          $set: {
            objectives: result.objectives,
            qualitative: result.qualitative,
            competencyScores: result.competencyScores,
            updatedBy: who,
            status
          }
        },
        { new: true, runValidators: true }
      );
      if (updated) break;
    }

    if (!updated) {
      return fail(res, 409, 'La fiche a été modifiée en même temps, réessayez');
    }

    res.json({ success: true, review: serialize(updated) });
  } catch (error) {
    logger.error('Error applying self assessment:', error);
    fail(res, 500, "Erreur lors de l'application de l'auto-évaluation", error);
  }
});

export { router as performanceRoutes };
