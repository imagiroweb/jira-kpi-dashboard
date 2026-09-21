import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { logger } from '../utils/logger';
import {
  buildImportPlanFromInterviewsDir,
  ImportPlanEntry
} from '../scripts/import-okr/buildImportPlan';
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
  applyGeneralAssessmentAxes,
  applyGeneralSelfAssessment,
  applyManagerAssessment,
  applyObjectivesDefinition,
  applySelfAssessment,
  AssessmentInput,
  completeCompetencyScores,
  completeGeneralAssessmentAxes,
  completeGeneralSelfAssessment,
  completeQualitative,
  computeReviewStatus,
  GeneralAssessmentAxesInput,
  GeneralSelfAssessmentInput,
  ObjectiveDefinitionInput,
  validateGeneralAssessmentAxes,
  validateGeneralSelfAssessment,
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
import { teamOverridesForReviews, toIdString } from '../domain/performance/reviewTeam';

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

function serialize(
  review: IPerformanceReview,
  teamOverride?: { team?: string; teamNameSnapshot?: string }
) {
  return {
    id: review._id,
    user: review.user,
    cycle: review.cycle,
    team: teamOverride?.team ?? toIdString(review.team),
    teamNameSnapshot: teamOverride?.teamNameSnapshot ?? review.teamNameSnapshot,
    objectives: review.objectives,
    qualitative: completeQualitative(review.qualitative),
    competencyScores: completeCompetencyScores(review.competencyScores),
    generalSelfAssessment: completeGeneralSelfAssessment(review.generalSelfAssessment?.axes),
    generalManagerAssessment: completeGeneralAssessmentAxes(review.generalManagerAssessment?.axes),
    status: review.status,
    definedBy: review.definedBy,
    createdBy: review.createdBy,
    updatedBy: review.updatedBy,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt
  };
}

/**
 * Sérialise un cycle de performance pour l'API (`_id` -> `id`, comme `serialize` ci-dessus pour
 * les fiches et `serializeTeam` dans teamRoutes.ts) — sans cette conversion, le frontend reçoit
 * un cycle sans `id` exploitable (bug réel constaté : PATCH /cycles/undefined).
 */
function serializeCycle(cycle: IPerformanceCycle) {
  return {
    id: cycle._id,
    label: cycle.label,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    status: cycle.status,
    createdAt: cycle.createdAt,
    updatedAt: cycle.updatedAt
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
      const overrides = await teamOverridesForReviews([existing]);
      return res.json({
        success: true,
        review: serialize(existing, overrides.get(toIdString(existing._id) ?? ''))
      });
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
    res.json({ success: true, cycles: cycles.map(serializeCycle) });
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
      res.status(201).json({ success: true, cycle: serializeCycle(cycle) });
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
      res.json({ success: true, cycle: serializeCycle(cycle) });
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

    const overrides = await teamOverridesForReviews(reviews);
    res.json({
      success: true,
      reviews: reviews.map((review) => serialize(review, overrides.get(toIdString(review._id) ?? '')))
    });
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

    const scopedTeamQuery = requestedTeamId
      ? { _id: requestedTeamId }
      : isGlobal
        ? {}
        : { _id: { $in: actor.leadTeamIds } };
    const scopedTeams = await Team.find(scopedTeamQuery).select('leadIds').lean();
    const leadUserIds = [
      ...new Set(scopedTeams.flatMap((team) => (team.leadIds ?? []).map((id) => id.toString())))
    ];
    if (leadUserIds.length > 0) {
      const teamClause = { ...filter };
      delete teamClause.isActive;
      filter.$or = [teamClause, { _id: { $in: leadUserIds } }];
      delete filter.teamId;
    }

    const users = await User.find(filter)
      .select('firstName lastName email teamId')
      .sort({ firstName: 1, lastName: 1 });

    res.json({
      success: true,
      members: users.map((u) => ({
        id: toIdString(u._id) ?? String(u._id),
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        teamId: toIdString(u.teamId) ?? ''
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

    const overrides = await teamOverridesForReviews([review]);
    const hydratedTeam = overrides.get(toIdString(review._id) ?? '');

    if (userId !== req.user!.userId) {
      const actor = await loadPerformanceActorContext(req.user!.userId);
      if (!actor) return fail(res, 404, 'Utilisateur authentifié introuvable');
      const reviewTeamId = hydratedTeam?.team ?? toIdString(review.team);
      if (!canAccessReviewForTeam(actor, reviewTeamId)) {
        return fail(res, 403, "Vous n'avez pas accès à la fiche de ce collaborateur");
      }
    }

    res.json({ success: true, review: serialize(review, hydratedTeam) });
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

      const targetUser = await User.findById(userId).select('teamId').lean();
      if (!current && !targetUser) {
        return fail(res, 404, 'Collaborateur introuvable');
      }

      const reviewTeamId = toIdString(current?.team) ?? toIdString(targetUser?.teamId);

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

      const $set: Record<string, unknown> = { objectives, definedBy: who, updatedBy: who, status };
      if (reviewTeamId && !toIdString(current.team)) $set.team = reviewTeamId;

      updated = await PerformanceReview.findOneAndUpdate(
        { _id: current._id, __v: current.__v },
        { $set },
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
 * (Re)définit l'auto-évaluation générale (4 axes de compétence × sous-critères notés 1-5) d'un
 * collaborateur pour un cycle — lead pour son équipe, ou CTO/super_admin pour n'importe qui,
 * même portée que PATCH /reviews/:userId/objectives. Distincte du "Bilan du cycle" (qualitative +
 * competencyScores, remplis à chaque cycle par le collaborateur et son manager — voir
 * self-assessment / manager-assessment ci-dessous) : une évaluation plus large des compétences,
 * alimentée aujourd'hui par l'import Excel (voir `buildGeneralAssessmentImportPlan.ts` /
 * `runGeneralAssessmentImport.ts`), pas encore par une UI de saisie manuelle. Remplace
 * entièrement les sous-critères d'un axe fourni dans `axes` ; un axe absent du corps de la
 * requête n'est pas modifié (pas de fusion par id, contrairement aux objectifs — pas
 * d'avancement à préserver ici). Crée la fiche à la volée sur le cycle actif si elle n'existe pas
 * encore, avec l'équipe actuelle du collaborateur (même règle que GET /reviews/me).
 * PATCH /api/performance/reviews/:userId/general-self-assessment
 */
router.patch('/reviews/:userId/general-self-assessment', authenticate, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const axesInput = req.body?.axes;
    if (!axesInput || typeof axesInput !== 'object' || Array.isArray(axesInput)) {
      return fail(res, 400, 'axes doit être un objet');
    }

    const validation = validateGeneralSelfAssessment(axesInput as GeneralSelfAssessmentInput);
    if (!validation.valid) {
      return fail(res, 400, validation.errors.join(', '));
    }

    const cycle = await resolveCycle(req.body?.cycleId);
    if (cycle === undefined) return fail(res, 400, 'Identifiant de cycle invalide');
    if (!cycle) return fail(res, 404, req.body?.cycleId ? 'Cycle introuvable' : 'Aucun cycle de performance actif');
    if (cycle.status !== 'active') {
      return fail(res, 403, "Ce cycle est clos, l'auto-évaluation générale ne peut plus être modifiée");
    }

    const actor = await loadPerformanceActorContext(req.user!.userId);
    if (!actor) return fail(res, 404, 'Utilisateur authentifié introuvable');

    let updated: IPerformanceReview | null = null;

    for (let attempt = 0; attempt < REVIEW_UPDATE_RETRIES; attempt += 1) {
      let current = await PerformanceReview.findOne({ user: userId, cycle: cycle._id });

      const targetUser = await User.findById(userId).select('teamId').lean();
      if (!current && !targetUser) {
        return fail(res, 404, 'Collaborateur introuvable');
      }

      const reviewTeamId = toIdString(current?.team) ?? toIdString(targetUser?.teamId);

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

      const generalSelfAssessment = applyGeneralSelfAssessment(
        current.toObject().generalSelfAssessment?.axes,
        axesInput as GeneralSelfAssessmentInput
      );

      const $set: Record<string, unknown> = { generalSelfAssessment: { axes: generalSelfAssessment }, updatedBy: who };
      if (reviewTeamId && !toIdString(current.team)) $set.team = reviewTeamId;

      updated = await PerformanceReview.findOneAndUpdate(
        { _id: current._id, __v: current.__v },
        { $set },
        { new: true, runValidators: true }
      );
      if (updated) break;
    }

    if (!updated) {
      return fail(res, 409, 'La fiche a été modifiée en même temps, réessayez');
    }

    res.json({ success: true, review: serialize(updated) });
  } catch (error) {
    logger.error('Error defining general self-assessment:', error);
    fail(res, 500, "Erreur lors de la définition de l'auto-évaluation générale", error);
  }
});

/**
 * Évaluation manager sur la grille générale (mêmes 4 axes × sous-critères que
 * `generalSelfAssessment`, référentiel commun `GENERAL_ASSESSMENT_REFERENTIAL`) — permet de noter
 * chaque sous-critère côté manager et de le rapprocher de l'auto-évaluation du collaborateur pour
 * repérer d'éventuels désaccords. Même portée d'accès que l'évaluation manager par objectif :
 * lead pour son équipe, ou CTO/super_admin pour n'importe qui. Remplace entièrement les
 * sous-critères d'un axe fourni dans `axes` ; un axe absent du corps de la requête n'est pas
 * modifié. Crée la fiche à la volée sur le cycle actif si elle n'existe pas encore.
 * PATCH /api/performance/reviews/:userId/general-manager-assessment
 */
router.patch('/reviews/:userId/general-manager-assessment', authenticate, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const axesInput = req.body?.axes;
    if (!axesInput || typeof axesInput !== 'object' || Array.isArray(axesInput)) {
      return fail(res, 400, 'axes doit être un objet');
    }

    const validation = validateGeneralAssessmentAxes(axesInput as GeneralAssessmentAxesInput);
    if (!validation.valid) {
      return fail(res, 400, validation.errors.join(', '));
    }

    const cycle = await resolveCycle(req.body?.cycleId);
    if (cycle === undefined) return fail(res, 400, 'Identifiant de cycle invalide');
    if (!cycle) return fail(res, 404, req.body?.cycleId ? 'Cycle introuvable' : 'Aucun cycle de performance actif');
    if (cycle.status !== 'active') {
      return fail(res, 403, "Ce cycle est clos, l'évaluation manager générale ne peut plus être modifiée");
    }

    const actor = await loadPerformanceActorContext(req.user!.userId);
    if (!actor) return fail(res, 404, 'Utilisateur authentifié introuvable');

    let updated: IPerformanceReview | null = null;

    for (let attempt = 0; attempt < REVIEW_UPDATE_RETRIES; attempt += 1) {
      let current = await PerformanceReview.findOne({ user: userId, cycle: cycle._id });

      const targetUser = await User.findById(userId).select('teamId').lean();
      if (!current && !targetUser) {
        return fail(res, 404, 'Collaborateur introuvable');
      }

      const reviewTeamId = toIdString(current?.team) ?? toIdString(targetUser?.teamId);

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

      const generalManagerAssessment = applyGeneralAssessmentAxes(
        current.toObject().generalManagerAssessment?.axes,
        axesInput as GeneralAssessmentAxesInput
      );

      const $set: Record<string, unknown> = {
        generalManagerAssessment: { axes: generalManagerAssessment },
        updatedBy: who
      };
      if (reviewTeamId && !toIdString(current.team)) $set.team = reviewTeamId;

      updated = await PerformanceReview.findOneAndUpdate(
        { _id: current._id, __v: current.__v },
        { $set },
        { new: true, runValidators: true }
      );
      if (updated) break;
    }

    if (!updated) {
      return fail(res, 409, 'La fiche a été modifiée en même temps, réessayez');
    }

    res.json({ success: true, review: serialize(updated) });
  } catch (error) {
    logger.error('Error defining general manager assessment:', error);
    fail(res, 500, "Erreur lors de la définition de l'évaluation manager générale", error);
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

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 40 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname);
    cb(null, ['.xlsx', '.ods'].includes(ext) && !base.startsWith('~$') && !base.includes('..'));
  }
});

function serializeImportPlanEntry(entry: ImportPlanEntry) {
  return {
    name: entry.name,
    team: entry.team,
    relativePath: entry.relativePath,
    outcome: entry.outcome,
    email: entry.matchedUser?.email ?? null,
    warnings: entry.warnings,
    errors: entry.errors,
    objectiveTitles: entry.objectives?.map((o) => o.title) ?? []
  };
}

/**
 * Import des fichiers d'entretien (xlsx/ods) : scan + matching roster (email Entra),
 * dry-run ou écriture des objectifs. CTO/super_admin uniquement. Les fichiers restent
 * en mémoire le temps de la requête — aucun token ni fichier n'est persisté.
 * POST /api/performance/import-okr
 */
router.post(
  '/import-okr',
  authenticate,
  requireGlobalPerformanceAccess,
  importUpload.array('files', 40),
  async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      return fail(res, 400, 'Ajoute au moins un fichier .xlsx ou .ods');
    }

    const cycleId = typeof req.body?.cycleId === 'string' ? req.body.cycleId : undefined;
    const dryRun = req.body?.dryRun === 'true' || req.body?.dryRun === true;

    const cycle = await resolveCycle(cycleId);
    if (cycle === undefined) return fail(res, 400, 'Identifiant de cycle invalide');
    if (!cycle) return fail(res, 404, cycleId ? 'Cycle introuvable' : 'Aucun cycle de performance actif');
    if (!dryRun && cycle.status !== 'active') {
      return fail(res, 403, 'Ce cycle n’est pas actif, les objectifs ne peuvent pas être importés');
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okr-import-ui-'));
    try {
      for (const file of files) {
        const base = path.basename(file.originalname);
        fs.writeFileSync(path.join(tmpDir, base), file.buffer);
      }

      const users = await User.find({ isActive: true }).select('firstName lastName email teamId').lean();
      const roster = users.map((u) => ({
        id: u._id.toString(),
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        teamId: u.teamId ? u.teamId.toString() : null
      }));

      const plan = await buildImportPlanFromInterviewsDir(tmpDir, roster);
      const actor = await loadPerformanceActorContext(req.user!.userId);
      if (!actor) return fail(res, 404, 'Utilisateur authentifié introuvable');

      const writes: { name: string; email: string; ok: boolean; error?: string }[] = [];
      if (!dryRun) {
        for (const entry of plan) {
          if (entry.outcome !== 'ready' || !entry.matchedUser || !entry.apiInput) continue;
          try {
            await writeImportedObjectives(req, actor, entry.matchedUser.id, entry.apiInput, cycle);
            writes.push({ name: entry.name, email: entry.matchedUser.email, ok: true });
          } catch (error) {
            writes.push({
              name: entry.name,
              email: entry.matchedUser.email,
              ok: false,
              error: error instanceof Error ? error.message : 'Échec de l’écriture'
            });
          }
        }
      }

      res.json({
        success: true,
        dryRun,
        cycle: { id: cycle._id, label: cycle.label, status: cycle.status },
        entries: plan.map(serializeImportPlanEntry),
        writes
      });
    } catch (error) {
      logger.error('Error importing OKR interview files:', error);
      fail(res, 500, 'Erreur lors de l’import des fichiers d’entretien', error);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
);

async function writeImportedObjectives(
  req: Request,
  actor: PerformanceScopeActor,
  userId: string,
  objectivesInput: ObjectiveDefinitionInput[],
  cycle: IPerformanceCycle
): Promise<void> {
  let updated: IPerformanceReview | null = null;

  for (let attempt = 0; attempt < REVIEW_UPDATE_RETRIES; attempt += 1) {
    let current = await PerformanceReview.findOne({ user: userId, cycle: cycle._id });
    const targetUser = await User.findById(userId).select('teamId').lean();
    if (!current && !targetUser) {
      throw new Error('Collaborateur introuvable');
    }

    const reviewTeamId = toIdString(current?.team) ?? toIdString(targetUser?.teamId);

    if (!canAccessReviewForTeam(actor, reviewTeamId)) {
      throw new Error("Vous n'avez pas accès à la fiche de ce collaborateur");
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

    const $set: Record<string, unknown> = { objectives, definedBy: who, updatedBy: who, status };
    if (reviewTeamId && !toIdString(current.team)) $set.team = reviewTeamId;

    updated = await PerformanceReview.findOneAndUpdate(
      { _id: current._id, __v: current.__v },
      { $set },
      { new: true, runValidators: true }
    );
    if (updated) return;
  }

  throw new Error('La fiche a été modifiée en même temps, réessayez');
}

export { router as performanceRoutes };
