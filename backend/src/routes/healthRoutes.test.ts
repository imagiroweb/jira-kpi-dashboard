/**
 * TI — Routes Health : GET /, /live, /ready, /detailed
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import { createWorklogAppServiceMock } from '../test/mocks/worklogAppService';

jest.mock('../utils/logger', () =>
  jest.requireActual('../test/mocks/logger').loggerMockFactory()
);

const mockWorklogAppService = createWorklogAppServiceMock();
jest.mock('../application/services/WorklogApplicationService', () => ({
  worklogAppService: mockWorklogAppService,
}));

jest.mock('../websocket/socketHandler', () => ({
  getConnectedClientsCount: jest.fn(),
}));

import { getConnectedClientsCount } from '../websocket/socketHandler';
import { healthRoutes } from './healthRoutes';

const mockGetConnectedClientsCount = getConnectedClientsCount as jest.MockedFunction<
  typeof getConnectedClientsCount
>;

describe('healthRoutes (TI)', () => {
  const app = createTestApp({ mountPath: '/api/health', router: healthRoutes });

  beforeEach(() => {
    jest.clearAllMocks();
    mockWorklogAppService.testConnection.mockResolvedValue({ success: true });
    mockGetConnectedClientsCount.mockReturnValue(0);
  });

  describe('GET /api/health/', () => {
    it('retourne 200 avec status ok, timestamp ISO et uptime', async () => {
      const res = await request(app).get('/api/health/');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /api/health/live', () => {
    it('retourne 200 avec status alive', async () => {
      const res = await request(app).get('/api/health/live');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'alive' });
    });
  });

  describe('GET /api/health/ready', () => {
    it('retourne 200 avec status ready si Jira est connecté', async () => {
      mockWorklogAppService.testConnection.mockResolvedValue({ success: true });

      const res = await request(app).get('/api/health/ready');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ready' });
      expect(mockWorklogAppService.testConnection).toHaveBeenCalled();
    });

    it('retourne 503 si la connexion Jira échoue', async () => {
      mockWorklogAppService.testConnection.mockResolvedValue({ success: false });

      const res = await request(app).get('/api/health/ready');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'not ready', reason: 'Jira not connected' });
    });

    it('retourne 503 si testConnection lève une erreur', async () => {
      mockWorklogAppService.testConnection.mockRejectedValue(new Error('network'));

      const res = await request(app).get('/api/health/ready');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'not ready', reason: 'Health check failed' });
    });
  });

  describe('GET /api/health/detailed', () => {
    it('retourne 200 avec status ok et connectedClients mocké si Jira est connecté', async () => {
      mockWorklogAppService.testConnection.mockResolvedValue({ success: true });
      mockGetConnectedClientsCount.mockReturnValue(7);

      const res = await request(app).get('/api/health/detailed');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.services.jira).toEqual({ status: 'ok', message: 'Connected' });
      expect(res.body.services.websocket).toEqual({ status: 'ok', connectedClients: 7 });
      expect(res.body.memory).toEqual(
        expect.objectContaining({
          used: expect.any(Number),
          total: expect.any(Number),
          unit: 'MB',
        })
      );
      expect(mockGetConnectedClientsCount).toHaveBeenCalled();
    });

    it('retourne 503 avec status degraded si Jira n’est pas connecté', async () => {
      mockWorklogAppService.testConnection.mockResolvedValue({ success: false });
      mockGetConnectedClientsCount.mockReturnValue(2);

      const res = await request(app).get('/api/health/detailed');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.services.jira).toEqual({ status: 'error', message: 'Connection failed' });
      expect(res.body.services.websocket).toEqual({ status: 'ok', connectedClients: 2 });
    });

    it('retourne 503 avec status degraded si testConnection lève une erreur', async () => {
      mockWorklogAppService.testConnection.mockRejectedValue(new Error('timeout'));

      const res = await request(app).get('/api/health/detailed');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.services.jira).toEqual({
        status: 'error',
        message: 'Connection check failed',
      });
    });
  });
});
