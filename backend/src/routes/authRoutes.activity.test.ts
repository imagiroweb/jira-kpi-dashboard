/**
 * TI — Routes d’activité (logs) : POST /me/page-view, GET /users/:id/logs, GET /users/:id/page-stats
 */
import request from 'supertest';
import express, { Express, Request } from 'express';

const mockLogFindOne = jest.fn();
const mockLogCreate = jest.fn();
const mockLogFind = jest.fn();

jest.mock('mongoose', () => {
  const actual = jest.requireActual<typeof import('mongoose')>('mongoose');
  return { ...actual, connection: { readyState: 1 } };
});

jest.mock('../middleware/authMiddleware', () => ({
  authenticate: (req: Request, _res: unknown, next: () => void) => {
    (req as Request & { user?: { userId: string; email: string; provider: string } }).user = {
      userId: '507f1f77bcf86cd799439011',
      email: 'admin@test.com',
      provider: 'local'
    };
    next();
  },
  requireSuperAdmin: (_req: unknown, _res: unknown, next: () => void) => next()
}));

jest.mock('../domain/user/entities/User', () => ({
  User: {
    findById: jest.fn().mockResolvedValue({ role: 'super_admin' }),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn()
  }
}));

jest.mock('../domain/user/entities/UserActivityLog', () => ({
  UserActivityLog: {
    get findOne() {
      return mockLogFindOne;
    },
    get create() {
      return mockLogCreate;
    },
    get find() {
      return mockLogFind;
    }
  }
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

import { authRoutes } from './authRoutes';

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app;
}

describe('Routes activité / logs (TI)', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogFindOne.mockResolvedValue(null);
    mockLogCreate.mockResolvedValue({});
    mockLogFind.mockReturnValue({
      sort: () => ({
        limit: () => ({
          lean: () => Promise.resolve([])
        })
      }),
      lean: () => Promise.resolve([])
    });
  });

  describe('POST /api/auth/me/page-view', () => {
    it('retourne 200 et enregistre une visite si page valide', async () => {
      const res = await request(app)
        .post('/api/auth/me/page-view')
        .set('Content-Type', 'application/json')
        .send({ page: 'dashboard' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockLogFindOne).toHaveBeenCalled();
      expect(mockLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'page_view',
          meta: { page: 'dashboard' }
        })
      );
    });

    it('retourne 200 sans créer de log si déduplication (findOne retourne un doc)', async () => {
      mockLogFindOne.mockResolvedValue({ _id: 'existing' });

      const res = await request(app)
        .post('/api/auth/me/page-view')
        .set('Content-Type', 'application/json')
        .send({ page: 'support' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockLogCreate).not.toHaveBeenCalled();
    });

    it('retourne 400 si page invalide', async () => {
      const res = await request(app)
        .post('/api/auth/me/page-view')
        .set('Content-Type', 'application/json')
        .send({ page: 'invalid_page' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(mockLogCreate).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/auth/users/:id/logs', () => {
    it('retourne 200 et une liste de logs', async () => {
      const logs = [
        {
          _id: { toString: () => 'log1' },
          type: 'login',
          timestamp: new Date(),
          meta: undefined
        }
      ];
      mockLogFind.mockReturnValue({
        sort: () => ({
          limit: () => ({
            lean: () => Promise.resolve(logs)
          })
        })
      });

      const res = await request(app).get('/api/auth/users/507f1f77bcf86cd799439011/logs');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.logs)).toBe(true);
      expect(res.body.logs).toHaveLength(1);
      expect(res.body.logs[0].id).toBe('log1');
      expect(res.body.logs[0].type).toBe('login');
    });

    it('accepte le paramètre limit', async () => {
      await request(app)
        .get('/api/auth/users/507f1f77bcf86cd799439011/logs')
        .query({ limit: 50 });

      expect(mockLogFind).toHaveBeenCalledWith({ userId: '507f1f77bcf86cd799439011' });
    });
  });

  describe('GET /api/auth/users/:id/page-stats', () => {
    it('retourne 200 avec pages, total, percentages et daily', async () => {
      const pageViewLogs = [
        { type: 'page_view', timestamp: new Date(), meta: { page: 'dashboard' } },
        { type: 'page_view', timestamp: new Date(), meta: { page: 'dashboard' } },
        { type: 'page_view', timestamp: new Date(), meta: { page: 'support' } }
      ];
      mockLogFind.mockReturnValue({
        lean: () => Promise.resolve(pageViewLogs)
      });

      const res = await request(app).get('/api/auth/users/507f1f77bcf86cd799439011/page-stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.pages).toEqual({ dashboard: 2, support: 1 });
      expect(res.body.total).toBe(3);
      expect(res.body.percentages).toEqual(
        expect.objectContaining({
          dashboard: expect.any(Number),
          support: expect.any(Number)
        })
      );
      expect(Array.isArray(res.body.daily)).toBe(true);
    });

    it('accepte le paramètre days', async () => {
      mockLogFind.mockReturnValue({ lean: () => Promise.resolve([]) });

      await request(app)
        .get('/api/auth/users/507f1f77bcf86cd799439011/page-stats')
        .query({ days: 7 });

      expect(mockLogFind).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '507f1f77bcf86cd799439011',
          type: 'page_view'
        })
      );
    });
  });
});
