/**
 * TI — Routes Brevo : /api/brevo/status, /account, /stats, /transactional/events, /campaigns/:id/recipients
 */
import request from 'supertest';
import { getBrevoClient } from '../infrastructure/brevo/BrevoClient';
import { createTestApp } from '../test/createTestApp';
import { createBrevoClientMock } from '../test/mocks/externalClients';

jest.mock('../middleware/authMiddleware', () => {
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>('../test/mocks/authMiddleware');
  return {
    authenticate: auth.bypassAuth,
    requireSuperAdmin: auth.mockRequireSuperAdmin,
  };
});

jest.mock('../utils/logger', () =>
  jest.requireActual('../test/mocks/logger').loggerMockFactory()
);

jest.mock('../infrastructure/brevo/BrevoClient', () => ({
  getBrevoClient: jest.fn(),
}));

import { brevoRoutes } from './brevoRoutes';

const mockGetBrevoClient = getBrevoClient as jest.MockedFunction<typeof getBrevoClient>;

describe('brevoRoutes (TI)', () => {
  const app = createTestApp({ mountPath: '/api/brevo', router: brevoRoutes, json: false });
  let client: ReturnType<typeof createBrevoClientMock>;

  beforeEach(() => {
    jest.clearAllMocks();
    client = createBrevoClientMock();
    mockGetBrevoClient.mockReturnValue(client as never);
    client.isConfigured.mockReturnValue(true);
    client.getContactsCount.mockResolvedValue(0);
    client.getLists.mockResolvedValue([]);
    client.getCampaigns.mockResolvedValue([]);
    client.getManualCampaigns.mockResolvedValue([]);
    client.getAccount.mockResolvedValue(null);
    client.getTransactionalEvents.mockResolvedValue([]);
    client.getCampaignRecipientEmails.mockResolvedValue([]);
  });

  describe('GET /api/brevo/status', () => {
    it('retourne configured: true si Brevo est configuré', async () => {
      client.isConfigured.mockReturnValue(true);
      const res = await request(app).get('/api/brevo/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, configured: true });
      expect(client.isConfigured).toHaveBeenCalled();
    });

    it('retourne configured: false si BREVO_API_KEY est absent', async () => {
      client.isConfigured.mockReturnValue(false);
      const res = await request(app).get('/api/brevo/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, configured: false });
    });
  });

  describe('GET /api/brevo/account', () => {
    it('retourne 503 si Brevo non configuré', async () => {
      client.isConfigured.mockReturnValue(false);
      const res = await request(app).get('/api/brevo/account');
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/BREVO_API_KEY/);
      expect(client.getAccount).not.toHaveBeenCalled();
    });

    it('retourne 502 si getAccount ne renvoie pas de compte', async () => {
      client.getAccount.mockResolvedValue(null);
      const res = await request(app).get('/api/brevo/account');
      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/compte Brevo/);
    });

    it('retourne 200 et les détails du compte', async () => {
      const account = { email: 'admin@example.com', companyName: 'Acme' };
      client.getAccount.mockResolvedValue(account);
      const res = await request(app).get('/api/brevo/account');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, account });
    });
  });

  describe('GET /api/brevo/stats', () => {
    it('agrège contacts, listes et campagnes avec statistiques normalisées', async () => {
      client.getContactsCount.mockResolvedValue(42);
      client.getLists.mockResolvedValue([
        { id: 1, name: 'Newsletter', totalSubscribers: 10, totalBlacklisted: 1, uniqueSubscribers: 9 },
        { id: 2, name: 'Promo', totalSubscribers: 5, totalBlacklisted: 0, uniqueSubscribers: 5 },
      ]);
      client.getCampaigns.mockResolvedValue([
        {
          id: 100,
          name: 'Campagne auto',
          subject: 'Hello',
          type: 'classic',
          status: 'sent',
          sentDate: '2026-01-01',
          statistics: {
            globalStats: { sent: 100, delivered: 95, viewed: 50, clickers: 10, unsubscriptions: 2, hardBounces: 1, softBounces: 2 },
          },
        },
      ]);
      client.getManualCampaigns.mockResolvedValue([
        {
          id: 200,
          name: 'Campagne manuelle',
          type: 'manual',
          status: 'draft',
          statistics: { sent: 0, delivered: 0, opened: 0, uniqueClicks: 0, unsubscribed: 0, hardBounces: 0, softBounces: 0 },
        },
      ]);

      const res = await request(app).get('/api/brevo/stats');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.brevoAuthFailed).toBeUndefined();
      expect(res.body.stats).toEqual({
        contactsCount: 42,
        listsCount: 2,
        totalSubscribers: 15,
        lists: [
          { id: 1, name: 'Newsletter', totalSubscribers: 10, totalBlacklisted: 1, uniqueSubscribers: 9 },
          { id: 2, name: 'Promo', totalSubscribers: 5, totalBlacklisted: 0, uniqueSubscribers: 5 },
        ],
        recentCampaigns: [
          {
            id: 100,
            name: 'Campagne auto',
            subject: 'Hello',
            type: 'classic',
            status: 'sent',
            scheduledAt: undefined,
            sentDate: '2026-01-01',
            statistics: {
              sent: 100,
              delivered: 95,
              opened: 50,
              clicked: 10,
              unsubscribed: 2,
              hardBounces: 1,
              softBounces: 2,
            },
          },
        ],
        manualCampaigns: [
          {
            id: 200,
            name: 'Campagne manuelle',
            subject: undefined,
            type: 'manual',
            status: 'draft',
            scheduledAt: undefined,
            sentDate: undefined,
            statistics: {
              sent: 0,
              delivered: 0,
              opened: 0,
              clicked: 0,
              unsubscribed: 0,
              hardBounces: 0,
              softBounces: 0,
            },
          },
        ],
      });
      expect(client.getCampaigns).toHaveBeenCalledWith(10);
      expect(client.getManualCampaigns).toHaveBeenCalledWith(50);
      expect(client.getAccount).not.toHaveBeenCalled();
    });

    it('retourne brevoAuthFailed si tout est vide et getAccount échoue', async () => {
      client.getContactsCount.mockResolvedValue(0);
      client.getLists.mockResolvedValue([]);
      client.getCampaigns.mockResolvedValue([]);
      client.getManualCampaigns.mockResolvedValue([]);
      client.getAccount.mockResolvedValue(null);

      const res = await request(app).get('/api/brevo/stats');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.brevoAuthFailed).toBe(true);
      expect(client.getAccount).toHaveBeenCalled();
    });
  });

  describe('GET /api/brevo/transactional/events', () => {
    it('borne days entre 1 et 90 et limit entre 1 et 2500', async () => {
      client.getTransactionalEvents.mockResolvedValue([]);
      await request(app).get('/api/brevo/transactional/events');
      expect(client.getTransactionalEvents).toHaveBeenCalledWith({ days: 30, limit: 200, event: undefined });

      await request(app).get('/api/brevo/transactional/events').query({ days: '999', limit: '5000' });
      expect(client.getTransactionalEvents).toHaveBeenCalledWith({ days: 90, limit: 2500, event: undefined });

      await request(app).get('/api/brevo/transactional/events').query({ days: '0', limit: '0' });
      expect(client.getTransactionalEvents).toHaveBeenCalledWith({ days: 30, limit: 200, event: undefined });

      await request(app).get('/api/brevo/transactional/events').query({ days: '7', limit: '50' });
      expect(client.getTransactionalEvents).toHaveBeenCalledWith({ days: 7, limit: 50, event: undefined });
    });

    it('ignore un filtre event invalide et transmet un event valide', async () => {
      client.getTransactionalEvents.mockResolvedValue([{ email: 'a@b.com', event: 'delivered' }]);

      await request(app).get('/api/brevo/transactional/events').query({ event: 'invalidType' });
      expect(client.getTransactionalEvents).toHaveBeenLastCalledWith({ days: 30, limit: 200, event: undefined });

      const res = await request(app).get('/api/brevo/transactional/events').query({ event: 'delivered' });
      expect(client.getTransactionalEvents).toHaveBeenLastCalledWith({ days: 30, limit: 200, event: 'delivered' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, events: [{ email: 'a@b.com', event: 'delivered' }] });
    });
  });

  describe('GET /api/brevo/campaigns/:campaignId/recipients', () => {
    it('retourne 400 si le type est absent ou invalide', async () => {
      const resMissing = await request(app).get('/api/brevo/campaigns/123/recipients');
      expect(resMissing.status).toBe(400);
      expect(resMissing.body.success).toBe(false);
      expect(resMissing.body.message).toMatch(/clickers ou unsubscribed/);
      expect(client.getCampaignRecipientEmails).not.toHaveBeenCalled();

      const resInvalid = await request(app).get('/api/brevo/campaigns/123/recipients').query({ type: 'opened' });
      expect(resInvalid.status).toBe(400);
      expect(client.getCampaignRecipientEmails).not.toHaveBeenCalled();

      const resBadId = await request(app).get('/api/brevo/campaigns/0/recipients').query({ type: 'clickers' });
      expect(resBadId.status).toBe(400);
      expect(client.getCampaignRecipientEmails).not.toHaveBeenCalled();
    });

    it('retourne 200 et la liste des emails exportés', async () => {
      const emails = ['alice@example.com', 'bob@example.com'];
      client.getCampaignRecipientEmails.mockResolvedValue(emails);

      const res = await request(app)
        .get('/api/brevo/campaigns/456/recipients')
        .query({ type: 'clickers' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, emails });
      expect(client.getCampaignRecipientEmails).toHaveBeenCalledWith(456, 'clickers');
    });
  });
});
