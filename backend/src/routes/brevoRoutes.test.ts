import request from 'supertest';
import express, { Express, Request } from 'express';

const mockBrevoClient = {
  isConfigured: jest.fn(),
  getAccount: jest.fn(),
  getContactsCount: jest.fn(),
  getLists: jest.fn(),
  getCampaigns: jest.fn(),
  getManualCampaigns: jest.fn(),
  getTransactionalEvents: jest.fn(),
  getCampaignRecipientEmails: jest.fn()
};

const mockGetBrevoClient = jest.fn();

jest.mock('../infrastructure/brevo/BrevoClient', () => ({
  getBrevoClient: () => mockGetBrevoClient()
}));

jest.mock('../middleware/authMiddleware', () => ({
  authenticate: (req: Request, _res: unknown, next: () => void) => {
    (req as Request & { user?: { userId: string; email: string; provider: 'local' | 'microsoft' } }).user = {
      userId: '507f1f77bcf86cd799439011',
      email: 'admin@test.com',
      provider: 'local'
    };
    next();
  }
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

import { brevoRoutes } from './brevoRoutes';

function createApp(): Express {
  const app = express();
  app.use('/api/brevo', brevoRoutes);
  return app;
}

describe('brevoRoutes', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBrevoClient.mockReturnValue(mockBrevoClient);
    mockBrevoClient.isConfigured.mockReturnValue(true);
    mockBrevoClient.getAccount.mockResolvedValue({ email: 'owner@test.com' });
    mockBrevoClient.getContactsCount.mockResolvedValue(10);
    mockBrevoClient.getLists.mockResolvedValue([{ id: 1, name: 'Main', totalSubscribers: 4, totalBlacklisted: 0, uniqueSubscribers: 4 }]);
    mockBrevoClient.getCampaigns.mockResolvedValue([]);
    mockBrevoClient.getManualCampaigns.mockResolvedValue([]);
    mockBrevoClient.getTransactionalEvents.mockResolvedValue([]);
    mockBrevoClient.getCampaignRecipientEmails.mockResolvedValue(['a@test.com']);
  });

  it('GET /api/brevo/status retourne la config', async () => {
    const res = await request(app).get('/api/brevo/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, configured: true });
  });

  it('GET /api/brevo/account retourne 503 si non configuré', async () => {
    mockBrevoClient.isConfigured.mockReturnValue(false);
    const res = await request(app).get('/api/brevo/account');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/brevo/stats retourne les stats agrégées', async () => {
    mockBrevoClient.getCampaigns.mockResolvedValue([
      { id: 12, name: 'C1', type: 'classic', status: 'sent', statistics: { globalStats: { sent: 10, delivered: 9, viewed: 5, clickers: 2, unsubscriptions: 1, hardBounces: 0, softBounces: 1 } } }
    ]);
    const res = await request(app).get('/api/brevo/stats');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stats.contactsCount).toBe(10);
    expect(res.body.stats.totalSubscribers).toBe(4);
    expect(res.body.stats.recentCampaigns[0].statistics.opened).toBe(5);
  });

  it('GET /api/brevo/transactional/events borne days/limit et filtre event', async () => {
    await request(app)
      .get('/api/brevo/transactional/events')
      .query({ days: 999, limit: 9999, event: 'opened' });

    expect(mockBrevoClient.getTransactionalEvents).toHaveBeenCalledWith({
      days: 90,
      limit: 2500,
      event: 'opened'
    });
  });

  it('GET /api/brevo/campaigns/:id/recipients retourne 400 si query type invalide', async () => {
    const res = await request(app).get('/api/brevo/campaigns/10/recipients').query({ type: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/brevo/campaigns/:id/recipients retourne les emails', async () => {
    const res = await request(app).get('/api/brevo/campaigns/10/recipients').query({ type: 'clickers' });
    expect(res.status).toBe(200);
    expect(mockBrevoClient.getCampaignRecipientEmails).toHaveBeenCalledWith(10, 'clickers');
    expect(res.body.emails).toEqual(['a@test.com']);
  });

  it('GET /api/brevo/account retourne 200 avec le compte', async () => {
    const res = await request(app).get('/api/brevo/account');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.account.email).toBe('owner@test.com');
  });

  it('GET /api/brevo/account retourne 502 si getAccount renvoie null', async () => {
    mockBrevoClient.getAccount.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/brevo/account');
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/brevo/account retourne 500 en exception', async () => {
    mockBrevoClient.getAccount.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/brevo/account');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/brevo/stats retourne 503 si non configuré', async () => {
    mockBrevoClient.isConfigured.mockReturnValue(false);
    const res = await request(app).get('/api/brevo/stats');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/brevo/stats met brevoAuthFailed si tout est vide et compte null', async () => {
    mockBrevoClient.getContactsCount.mockResolvedValue(0);
    mockBrevoClient.getLists.mockResolvedValue([]);
    mockBrevoClient.getCampaigns.mockResolvedValue([]);
    mockBrevoClient.getManualCampaigns.mockResolvedValue([]);
    mockBrevoClient.getAccount.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/brevo/stats');
    expect(res.status).toBe(200);
    expect(res.body.brevoAuthFailed).toBe(true);
  });

  it('GET /api/brevo/stats normalise statistics sans globalStats (opened, uniqueClicks)', async () => {
    mockBrevoClient.getCampaigns.mockResolvedValue([
      {
        id: 1,
        name: 'C',
        type: 'classic',
        status: 'sent',
        statistics: { opened: 2, uniqueClicks: 1, unsubscribed: 0, hardBounces: 0, softBounces: 0, sent: 1, delivered: 1 }
      }
    ]);
    const res = await request(app).get('/api/brevo/stats');
    expect(res.status).toBe(200);
    const stats = res.body.stats.recentCampaigns[0].statistics;
    expect(stats.opened).toBe(2);
    expect(stats.clicked).toBe(1);
  });

  it('GET /api/brevo/stats retourne 500 en exception', async () => {
    mockBrevoClient.getContactsCount.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/brevo/stats');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/brevo/transactional/events retourne 503 si non configuré', async () => {
    mockBrevoClient.isConfigured.mockReturnValue(false);
    const res = await request(app).get('/api/brevo/transactional/events');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/brevo/transactional/events ignore event inconnu', async () => {
    await request(app).get('/api/brevo/transactional/events').query({ event: 'not-a-real-type' });
    expect(mockBrevoClient.getTransactionalEvents).toHaveBeenCalledWith(
      expect.objectContaining({ event: undefined })
    );
  });

  it('GET /api/brevo/transactional/events retourne 500 en exception', async () => {
    mockBrevoClient.getTransactionalEvents.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/brevo/transactional/events');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/brevo/campaigns/:id/recipients retourne 503 si non configuré', async () => {
    mockBrevoClient.isConfigured.mockReturnValue(false);
    const res = await request(app).get('/api/brevo/campaigns/10/recipients').query({ type: 'clickers' });
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/brevo/campaigns/:id/recipients retourne 500 en exception', async () => {
    mockBrevoClient.getCampaignRecipientEmails.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/brevo/campaigns/10/recipients').query({ type: 'unsubscribed' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
