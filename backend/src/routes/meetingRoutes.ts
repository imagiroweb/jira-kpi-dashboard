import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { logger } from '../utils/logger';
import { WeeklySprintMeeting, IWeeklySprintMeeting } from '../domain/meeting/entities/WeeklySprintMeeting';
import {
  applyMeetingPatch,
  buildDefaultMeeting,
  buildNextMeetingDraft,
  parseWeeklyMeetingPatch,
  snapshotFromPatch,
  stampMeetingPatchAuthors,
  WeeklyMeetingDraft
} from '../domain/meeting/weeklySprintMeeting';
import { authenticate } from '../middleware/authMiddleware';
import { emitMeetingUpdate } from '../websocket/socketHandler';

const router = Router();

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

// Même pattern que worklogRoutes : l'instance Socket.io est posée sur l'app Express au démarrage.
const getIO = (req: Request): Server | null => {
  return req.app.get('io') as Server | null;
};

/**
 * Identifiant de l'onglet/session à l'origine d'un PATCH, transmis par le client (en-tête
 * `X-Client-Origin`). Réémis tel quel dans l'événement socket pour que l'auteur de la
 * modification ignore son propre écho (il l'a déjà appliquée localement).
 */
function clientOrigin(req: Request): string | undefined {
  const header = req.headers['x-client-origin'];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 128) : undefined;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

const PATCH_RETRIES = 5;

function author(req: Request) {
  return {
    id: req.user!.userId,
    email: req.user!.email,
    name: req.user!.email.split('@')[0]
  };
}

function rowAuthor(req: Request) {
  return {
    id: req.user!.userId,
    name: req.user!.email.split('@')[0]
  };
}

function toDraft(meeting: IWeeklySprintMeeting): WeeklyMeetingDraft {
  return {
    sprint: meeting.sprint,
    teams: meeting.teams,
    blockers: meeting.blockers,
    interactions: meeting.interactions,
    retro: meeting.retro,
    actions: meeting.actions
  };
}

function serialize(meeting: IWeeklySprintMeeting) {
  return {
    id: meeting._id,
    sprint: meeting.sprint,
    teams: meeting.teams,
    blockers: meeting.blockers,
    interactions: meeting.interactions,
    retro: meeting.retro,
    actions: meeting.actions,
    createdBy: meeting.createdBy,
    updatedBy: meeting.updatedBy,
    createdAt: meeting.createdAt,
    updatedAt: meeting.updatedAt
  };
}

function serializeSummary(meeting: IWeeklySprintMeeting) {
  return {
    id: meeting._id,
    sprint: meeting.sprint,
    createdBy: meeting.createdBy,
    updatedBy: meeting.updatedBy,
    updatedAt: meeting.updatedAt,
    summary: {
      teamCount: meeting.teams?.length ?? 0,
      openBlockerCount: (meeting.blockers ?? []).filter((b) => !b.resolved).length,
      openActionCount: (meeting.actions ?? []).filter((a) => a.status !== 'Fait').length
    }
  };
}

function fail(res: Response, status: number, message: string, error?: unknown) {
  return res.status(status).json({
    success: false,
    message,
    ...(error ? { error: error instanceof Error ? error.message : 'Unknown error' } : {})
  });
}

/**
 * Liste des points hebdo (du plus récent au plus ancien)
 * GET /api/meetings
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const requested = Number(req.query.limit ?? DEFAULT_LIST_LIMIT);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIST_LIMIT)
      : DEFAULT_LIST_LIMIT;

    const meetings = await WeeklySprintMeeting.find()
      .sort({ 'sprint.date': -1, createdAt: -1 })
      .limit(limit);

    res.json({
      success: true,
      count: meetings.length,
      meetings: meetings.map(serializeSummary)
    });
  } catch (error) {
    logger.error('Error fetching weekly meetings:', error);
    fail(res, 500, 'Erreur lors de la récupération des points hebdo', error);
  }
});

/**
 * Dernier point hebdo, créé à la volée s'il n'en existe aucun
 * GET /api/meetings/latest
 */
router.get('/latest', authenticate, async (req: Request, res: Response) => {
  try {
    const meeting = await WeeklySprintMeeting.findOne().sort({ 'sprint.date': -1, createdAt: -1 });

    if (meeting) {
      return res.json({ success: true, meeting: serialize(meeting) });
    }

    const created = await WeeklySprintMeeting.create({
      ...buildDefaultMeeting(today()),
      createdBy: author(req)
    });
    logger.info(`Weekly meeting created (first one) by ${req.user!.email}`);
    res.status(201).json({ success: true, meeting: serialize(created) });
  } catch (error) {
    logger.error('Error fetching latest weekly meeting:', error);
    fail(res, 500, 'Erreur lors de la récupération du dernier point hebdo', error);
  }
});

/**
 * Détail d'un point hebdo
 * GET /api/meetings/:id
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const meeting = await WeeklySprintMeeting.findById(req.params.id);
    if (!meeting) {
      return fail(res, 404, 'Point hebdo non trouvé');
    }
    res.json({ success: true, meeting: serialize(meeting) });
  } catch (error) {
    logger.error('Error fetching weekly meeting:', error);
    fail(res, 500, 'Erreur lors de la récupération du point hebdo', error);
  }
});

/**
 * Créer un point hebdo vierge
 * POST /api/meetings
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const date = typeof req.body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date)
      ? req.body.date
      : today();

    const meeting = await WeeklySprintMeeting.create({
      ...buildDefaultMeeting(date),
      createdBy: author(req)
    });

    logger.info(`Weekly meeting created by ${req.user!.email}`);
    res.status(201).json({ success: true, meeting: serialize(meeting) });
  } catch (error) {
    logger.error('Error creating weekly meeting:', error);
    fail(res, 500, 'Erreur lors de la création du point hebdo', error);
  }
});

/**
 * Démarrer le point suivant à partir d'un point existant
 * POST /api/meetings/:id/next
 */
router.post('/:id/next', authenticate, async (req: Request, res: Response) => {
  try {
    const previous = await WeeklySprintMeeting.findById(req.params.id);
    if (!previous) {
      return fail(res, 404, 'Point hebdo non trouvé');
    }

    const date = typeof req.body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date)
      ? req.body.date
      : today();

    const meeting = await WeeklySprintMeeting.create({
      ...buildNextMeetingDraft(toDraft(previous), date),
      createdBy: author(req)
    });

    logger.info(`Weekly meeting rolled over by ${req.user!.email}`);
    res.status(201).json({ success: true, meeting: serialize(meeting) });
  } catch (error) {
    logger.error('Error rolling over weekly meeting:', error);
    fail(res, 500, 'Erreur lors de la création du point suivant', error);
  }
});

/**
 * Mise à jour partielle (sauvegarde automatique pendant la réunion).
 * Les listes sont fusionnées par id (upsert/remove) avec un verrou optimiste __v.
 * PATCH /api/meetings/:id
 */
router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const patch = parseWeeklyMeetingPatch(req.body);
    if (!patch) {
      return fail(res, 400, 'Contenu du point hebdo invalide');
    }

    const who = author(req);
    let meeting = null;
    let snapshot = {};

    for (let attempt = 0; attempt < PATCH_RETRIES; attempt += 1) {
      const current = await WeeklySprintMeeting.findById(req.params.id);
      if (!current) {
        return fail(res, 404, 'Point hebdo non trouvé');
      }

      const draft = toDraft(current);
      const stamped = stampMeetingPatchAuthors(draft, patch, rowAuthor(req));
      const next = applyMeetingPatch(draft, stamped);
      snapshot = snapshotFromPatch(next, stamped);

      const set: Record<string, unknown> = { updatedBy: who };
      if (stamped.sprint) set.sprint = next.sprint;
      if (stamped.teams) set.teams = next.teams;
      if (stamped.blockers) set.blockers = next.blockers;
      if (stamped.interactions) set.interactions = next.interactions;
      if (stamped.retro) set.retro = next.retro;
      if (stamped.actions) set.actions = next.actions;

      meeting = await WeeklySprintMeeting.findOneAndUpdate(
        { _id: req.params.id, __v: current.__v },
        { $set: set, $inc: { __v: 1 } },
        { new: true, runValidators: true }
      );
      if (meeting) break;
    }

    if (!meeting) {
      return fail(res, 409, 'Le point hebdo a été modifié en même temps, réessayez');
    }

    const io = getIO(req);
    if (io) {
      emitMeetingUpdate(io, String(meeting._id), {
        meetingId: String(meeting._id),
        patch: snapshot,
        updatedBy: who,
        updatedAt: meeting.updatedAt,
        origin: clientOrigin(req) ?? null
      });
    }

    res.json({ success: true, meeting: serialize(meeting) });
  } catch (error) {
    logger.error('Error updating weekly meeting:', error);
    fail(res, 500, 'Erreur lors de l\'enregistrement du point hebdo', error);
  }
});

/**
 * Supprimer un point hebdo
 * DELETE /api/meetings/:id
 */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const meeting = await WeeklySprintMeeting.findByIdAndDelete(req.params.id);
    if (!meeting) {
      return fail(res, 404, 'Point hebdo non trouvé');
    }
    logger.info(`Weekly meeting deleted by ${req.user!.email}`);
    res.json({ success: true, message: 'Point hebdo supprimé avec succès' });
  } catch (error) {
    logger.error('Error deleting weekly meeting:', error);
    fail(res, 500, 'Erreur lors de la suppression du point hebdo', error);
  }
});

export { router as meetingRoutes };
