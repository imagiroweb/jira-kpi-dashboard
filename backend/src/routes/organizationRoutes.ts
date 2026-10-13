import { Router, Request, Response } from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/authMiddleware';
import { Organization, DEFAULT_RETENTION } from '../domain/organization/entities/Organization';
import { parseRetentionInput } from '../domain/organization/retention';
import { User } from '../domain/user/entities/User';
import { logger } from '../utils/logger';

/**
 * Paramètres de l'organisation de l'administrateur connecté (super admin).
 */
const router = Router();

router.use(authenticate, requireSuperAdmin);

async function currentOrganizationId(req: Request): Promise<string | null> {
  const user = await User.findById(req.user!.userId).select('organizationId').lean();
  return user?.organizationId ? String(user.organizationId) : null;
}

function serialize(org: {
  name: string;
  slug: string;
  allowedEmailDomains?: string[];
  allowLocalAccounts?: boolean;
  retention?: Partial<typeof DEFAULT_RETENTION>;
}) {
  return {
    name: org.name,
    slug: org.slug,
    allowedEmailDomains: org.allowedEmailDomains ?? [],
    allowLocalAccounts: org.allowLocalAccounts ?? false,
    retention: { ...DEFAULT_RETENTION, ...(org.retention ?? {}) }
  };
}

/**
 * GET /api/organizations/me — paramètres de mon organisation (durées de conservation incluses).
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const orgId = await currentOrganizationId(req);
    if (!orgId) return res.status(404).json({ success: false, error: 'Aucune organisation' });
    const org = await Organization.findById(orgId).select('name slug allowedEmailDomains allowLocalAccounts retention').lean();
    if (!org) return res.status(404).json({ success: false, error: 'Organisation introuvable' });
    res.json({ success: true, organization: serialize(org) });
  } catch (error) {
    logger.error('Get organization error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/**
 * PATCH /api/organizations/me/retention — durées de conservation (entier ou null = pas de purge).
 * Body : { activityLogMonths?, performanceReviewYears?, inactiveAccountMonths? }
 */
router.patch('/me/retention', async (req: Request, res: Response) => {
  try {
    const parsed = parseRetentionInput((req.body ?? {}) as Record<string, unknown>);
    if (!parsed.value) return res.status(400).json({ success: false, errors: parsed.errors });
    const orgId = await currentOrganizationId(req);
    if (!orgId) return res.status(404).json({ success: false, error: 'Aucune organisation' });

    const $set = Object.fromEntries(Object.entries(parsed.value).map(([k, v]) => [`retention.${k}`, v]));
    const org = await Organization.findByIdAndUpdate(orgId, { $set }, { new: true, runValidators: true })
      .select('name slug allowedEmailDomains allowLocalAccounts retention')
      .lean();
    if (!org) return res.status(404).json({ success: false, error: 'Organisation introuvable' });
    logger.info(`Durées de conservation modifiées (${org.slug}) par ${req.user!.userId} : ${JSON.stringify(parsed.value)}`);
    res.json({ success: true, organization: serialize(org) });
  } catch (error) {
    logger.error('Update retention error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

export const organizationRoutes = router;
