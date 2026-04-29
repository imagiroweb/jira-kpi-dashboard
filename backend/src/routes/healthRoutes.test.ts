import request from 'supertest';
import express, { Express } from 'express';

const mockTestConnection = jest.fn();
const mockGetConnectedClientsCount = jest.fn();

jest.mock('../application/services/WorklogApplicationService', () => ({
  worklogAppService: {
    testConnection: mockTestConnection
  }
}));

jest.mock('../websocket/socketHandler', () => ({
  getConnectedClientsCount: mockGetConnectedClientsCount
}));

import { healthRoutes } from './healthRoutes';

function createApp(): Express {
  const app = express();
  app.use('/api/health', healthRoutes);
  return app;
}

describe('healthRoutes', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConnectedClientsCount.mockReturnValue(3);
    mockTestConnection.mockResolvedValue({ success: true });
  });

  it('GET /api/health retourne un statut ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('GET /api/health/detailed retourne 200 si Jira est connecté', async () => {
    const res = await request(app).get('/api/health/detailed');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.services.jira.status).toBe('ok');
    expect(res.body.services.websocket.connectedClients).toBe(3);
  });

  it('GET /api/health/detailed retourne 503 si Jira est en erreur', async () => {
    mockTestConnection.mockResolvedValue({ success: false });
    const res = await request(app).get('/api/health/detailed');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.services.jira.status).toBe('error');
  });

  it('GET /api/health/ready retourne 200 quand prêt', async () => {
    mockTestConnection.mockResolvedValue({ success: true });
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  it('GET /api/health/ready retourne 503 quand non prêt', async () => {
    mockTestConnection.mockResolvedValue({ success: false });
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not ready');
  });
});
