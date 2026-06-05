/**
 * TI — Routes d’activité (logs) : POST /me/page-view, GET /users/:id/logs, GET /users/:id/page-stats
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import { TEST_USER_ID } from '../test/fixtures/users';

const mockLogFindOne = jest.fn();
const mockLogCreate = jest.fn();
const mockLogFind = jest.fn();

jest.mock('mongoose', () =>
  jest.requireActual('../test/mocks/mongoose').mockMongoConnected()
);

jest.mock('../middleware/authMiddleware', () => {
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>('../test/mocks/authMiddleware');
  return {
    authenticate: auth.mockAuthenticate(),
    requireSuperAdmin: auth.mockRequireSuperAdmin,
  };
});

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

jest.mock('../utils/logger', () =>
  jest.requireActual('../test/mocks/logger').loggerMockFactory()
);

import { authRoutes } from './authRoutes';

describe('Routes activité / logs (TI)', () => {
  const app = createTestApp({ mountPath: '/api/auth', router: authRoutes });

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

    it('retourne 500 si la création du log échoue', async () => {
      mockLogCreate.mockRejectedValueOnce(new Error('db fail'));
      const res = await request(app)
        .post('/api/auth/me/page-view')
        .set('Content-Type', 'application/json')
        .send({ page: 'dashboard' });
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
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

      const res = await request(app).get(`/api/auth/users/${TEST_USER_ID}/logs`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.logs)).toBe(true);
      expect(res.body.logs).toHaveLength(1);
      expect(res.body.logs[0].id).toBe('log1');
      expect(res.body.logs[0].type).toBe('login');
    });

    it('accepte le paramètre limit', async () => {
      await request(app)
        .get(`/api/auth/users/${TEST_USER_ID}/logs`)
        .query({ limit: 50 });

      expect(mockLogFind).toHaveBeenCalledWith({ userId: TEST_USER_ID });
    });

    it('retourne 500 si la récupération des logs échoue', async () => {
      mockLogFind.mockImplementationOnce(() => {
        throw new Error('db fail');
      });
      const res = await request(app).get(`/api/auth/users/${TEST_USER_ID}/logs`);
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
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

      const res = await request(app).get(`/api/auth/users/${TEST_USER_ID}/page-stats`);

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
        .get(`/api/auth/users/${TEST_USER_ID}/page-stats`)
        .query({ days: 7 });

      expect(mockLogFind).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_USER_ID,
          type: 'page_view'
        })
      );
    });

    it('retourne 500 si le calcul des stats échoue', async () => {
      mockLogFind.mockImplementationOnce(() => {
        throw new Error('db fail');
      });
      const res = await request(app).get(`/api/auth/users/${TEST_USER_ID}/page-stats`);
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });
});
