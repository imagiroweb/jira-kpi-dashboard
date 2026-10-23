import { Router, Request, Response } from 'express';
import { wipService } from '../application/services/WipService';
import { countWeeks, MAX_WIP_WEEKS } from '../domain/wip/wipWeekly';
import { validateWipSettings } from '../domain/wip/wipSettings';
import { User } from '../domain/user/entities/User';
import { authenticate, requireSuperAdmin } from '../middleware/authMiddleware';
import { requirePage } from '../middleware/requirePage';
import { clientErrorDetail } from '../utils/clientError';
import { logger } from '../utils/logger';

/**
 * Page « Suivi WIP » (spec issue #79) : WIP hebdomadaire global et par équipe, terminés de la
 * semaine, seuils par équipe. Lecture : page `wip` ; modification des réglages : super admin.
 */
const router = Router();

router.use(authenticate);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = (v: unknown): v is string =>
  typeof v === 'string' && ISO_DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

async function isSuperAdmin(userId: string): Promise<boolean> {
  const user = await User.findById(userId).select('role').lean();
  return user?.role === 'super_admin';
}

/**
 * GET /api/wip/weekly?from=YYYY-MM-DD&to=YYYY-MM-DD — WIP et terminés par semaine (lundi → dimanche),
 * au total et par équipe, avec les réglages courants. 52 semaines au maximum.
 */
router.get('/weekly', requirePage('wip'), async (req: Request, res: Response) => {
  const { from, to } = req.query;
  if (!isValidDate(from) || !isValidDate(to)) {
    return res.status(400).json({ success: false, error: 'Paramètres from et to obligatoires (YYYY-MM-DD)' });
  }
  if (from > to) {
    return res.status(400).json({ success: false, error: 'La date de début doit précéder la date de fin' });
  }
  if (countWeeks(from, to) > MAX_WIP_WEEKS) {
    return res.status(400).json({
      success: false,
      error: `Période trop longue : ${MAX_WIP_WEEKS} semaines au maximum, réduisez la période`,
    });
  }
  try {
    const [data, canEdit] = await Promise.all([wipService.getWeekly(from, to), isSuperAdmin(req.user!.userId)]);
    res.json({ success: true, data, canEdit });
  } catch (error) {
    logger.error('Error fetching WIP weekly:', error);
    res.status(500).json({ success: false, error: 'Impossible de calculer le WIP', message: clientErrorDetail(error) });
  }
});

/** GET /api/wip/settings — réglages partagés (statuts, devs et maximum par dev par équipe). */
router.get('/settings', requirePage('wip'), async (req: Request, res: Response) => {
  try {
    const [settings, canEdit] = await Promise.all([wipService.getSettings(), isSuperAdmin(req.user!.userId)]);
    res.json({ success: true, settings, canEdit });
  } catch (error) {
    logger.error('Error fetching WIP settings:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/** PUT /api/wip/settings — remplace les réglages (super admin uniquement). */
router.put('/settings', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = validateWipSettings(req.body);
  if (!result.ok) {
    return res.status(400).json({ success: false, errors: result.errors });
  }
  try {
    const unknown = await wipService.findUnknownStatuses([...result.value.startStatuses, ...result.value.endStatuses]);
    if (unknown.length > 0) {
      return res.status(400).json({ success: false, errors: [`Statut inconnu dans Jira : ${unknown.join(', ')}`] });
    }
    const settings = await wipService.saveSettings(result.value, req.user!.userId);
    res.json({ success: true, settings });
  } catch (error) {
    logger.error('Error saving WIP settings:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

export { router as wipRoutes };
