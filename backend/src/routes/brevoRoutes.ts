import { Router, Request, Response } from 'express';
import { getBrevoClient, type BrevoTransactionalEventType } from '../infrastructure/brevo/BrevoClient';
import { logger } from '../utils/logger';
import { authenticate } from '../middleware/authMiddleware';

const TRANSACTIONAL_EVENT_TYPES: BrevoTransactionalEventType[] = [
  'requests', 'delivered', 'hardBounces', 'softBounces', 'bounces', 'opened', 'clicks',
  'spam', 'invalid', 'deferred', 'blocked', 'unsubscribed', 'error', 'loadedByProxy'
];

const router = Router();

/**
 * GET /api/brevo/account
 * Returns Brevo account details (requires BREVO_API_KEY).
 */
router.get('/account', authenticate, async (req: Request, res: Response) => {
  try {
    const client = getBrevoClient();
    if (!client.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Brevo non configuré (BREVO_API_KEY manquant)'
      });
    }
    const account = await client.getAccount();
    if (!account) {
      return res.status(502).json({
        success: false,
        message: 'Impossible de récupérer le compte Brevo'
      });
    }
    res.json({ success: true, account });
  } catch (error) {
    logger.error('Error fetching Brevo account:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du compte Brevo',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/brevo/stats
 * Aggregated stats for the marketing dashboard: contacts count, lists, recent campaigns.
 */
router.get('/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const client = getBrevoClient();
    if (!client.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Brevo non configuré (BREVO_API_KEY manquant)'
      });
    }

    const [contactsCount, lists, campaigns, manualCampaigns] = await Promise.all([
      client.getContactsCount(),
      client.getLists(),
      client.getCampaigns(10),
      client.getManualCampaigns(50)
    ]);

    const totalSubscribers = lists.reduce((sum, l) => sum + (l.totalSubscribers || 0), 0);

    const normalizeStats = (stats: unknown): Record<string, number> | undefined => {
      if (!stats || typeof stats !== 'object') return undefined;
      const g = (stats as { globalStats?: Record<string, number> }).globalStats;
      const s = g || (stats as Record<string, number>);
      if (!s || typeof s !== 'object') return undefined;
      return {
        sent: s.sent,
        delivered: s.delivered,
        opened: s.viewed ?? s.opened,
        clicked: s.clickers ?? s.uniqueClicks ?? s.clicked,
        unsubscribed: s.unsubscriptions ?? s.unsubscribed,
        hardBounces: s.hardBounces,
        softBounces: s.softBounces
      };
    };

    const mapCampaign = (c: { id: number; name: string; subject?: string; type: string; status: string; scheduledAt?: string; sentDate?: string; statistics?: unknown }) => ({
      id: c.id,
      name: c.name,
      subject: c.subject,
      type: c.type,
      status: c.status,
      scheduledAt: c.scheduledAt,
      sentDate: c.sentDate,
      statistics: normalizeStats(c.statistics)
    });

    const allEmpty = contactsCount === 0 && lists.length === 0 && campaigns.length === 0 && manualCampaigns.length === 0;
    let brevoAuthFailed = false;
    if (allEmpty) {
      const account = await client.getAccount();
      if (!account) {
        brevoAuthFailed = true;
        logger.warn('Brevo stats all zero and getAccount failed – likely invalid or expired API key (401)');
      }
    }

    res.json({
      success: true,
      brevoAuthFailed: brevoAuthFailed || undefined,
      stats: {
        contactsCount,
        listsCount: lists.length,
        totalSubscribers,
        lists: lists.map((l) => ({
          id: l.id,
          name: l.name,
          totalSubscribers: l.totalSubscribers,
          totalBlacklisted: l.totalBlacklisted,
          uniqueSubscribers: l.uniqueSubscribers
        })),
        recentCampaigns: campaigns.map(mapCampaign),
        manualCampaigns: manualCampaigns.map(mapCampaign)
      }
    });
  } catch (error) {
    logger.error('Error fetching Brevo stats:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques Brevo',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/brevo/status
 * Check if Brevo is configured (no auth required for a simple check, or keep auth for consistency).
 */
router.get('/status', authenticate, async (req: Request, res: Response) => {
  const client = getBrevoClient();
  res.json({
    success: true,
    configured: client.isConfigured()
  });
});

/**
 * GET /api/brevo/transactional/events
 * Logs des emails transactionnels (activité : envoyés, livrés, ouverts, clics, bounces, etc.).
 * Query: days (défaut 30, max 90), limit (défaut 200), event (optionnel).
 */
router.get('/transactional/events', authenticate, async (req: Request, res: Response) => {
  try {
    const client = getBrevoClient();
    if (!client.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Brevo non configuré (BREVO_API_KEY manquant)'
      });
    }
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days || 30), 10) || 30));
    const limit = Math.min(2500, Math.max(1, parseInt(String(req.query.limit || 200), 10) || 200));
    const eventParam = typeof req.query.event === 'string' ? req.query.event : undefined;
    const event = eventParam && TRANSACTIONAL_EVENT_TYPES.includes(eventParam as BrevoTransactionalEventType)
      ? (eventParam as BrevoTransactionalEventType)
      : undefined;
    const events = await client.getTransactionalEvents({ days, limit, event });
    res.json({ success: true, events });
  } catch (error) {
    logger.error('Error fetching Brevo transactional events:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des logs transactionnels',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/brevo/campaigns/:campaignId/recipients?type=clickers|unsubscribed
 * Export des emails ayant cliqué ou désinscrit pour une campagne (export Brevo asynchrone, poll puis CSV).
 * Timeout long (90s).
 */
router.get('/campaigns/:campaignId/recipients', authenticate, async (req: Request, res: Response) => {
  try {
    const client = getBrevoClient();
    if (!client.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Brevo non configuré (BREVO_API_KEY manquant)'
      });
    }
    const campaignId = parseInt(String(req.params.campaignId), 10);
    const typeParam = typeof req.query.type === 'string' ? req.query.type : '';
    if (!campaignId || !['clickers', 'unsubscribed'].includes(typeParam)) {
      return res.status(400).json({
        success: false,
        message: 'Paramètre type requis: clickers ou unsubscribed'
      });
    }
    const emails = await client.getCampaignRecipientEmails(campaignId, typeParam as 'clickers' | 'unsubscribed');
    res.json({ success: true, emails });
  } catch (error) {
    logger.error('Error fetching campaign recipients:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'export des destinataires',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export const brevoRoutes = router;
