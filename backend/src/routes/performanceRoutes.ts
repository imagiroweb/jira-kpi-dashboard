import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import { PerformanceCycle, IPerformanceCycle } from '../domain/performance/entities/PerformanceCycle';
import { PerformanceReview, IPerformanceReview } from '../domain/performance/entities/PerformanceReview';
import { appendKeyResultProgress } from '../domain/performance/performanceReview';
import { authenticate } from '../middleware/authMiddleware';
import { User } from '../domain/user/entities/User';

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

export { router as performanceRoutes };
