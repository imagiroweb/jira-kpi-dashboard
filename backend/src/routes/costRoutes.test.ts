/**
 * TI — Routes « Coûts horaires » (issue #44)
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import { TEST_USER_ID } from '../test/fixtures/users';

const mockUserFind = jest.fn();
const mockUserFindById = jest.fn();
const mockGetCostActor = jest.fn();
let isSuperAdmin = true;

jest.mock('../domain/user/entities/User', () => ({
  User: {
    find: (...args: unknown[]) => mockUserFind(...args),
    findById: (...args: unknown[]) => mockUserFindById(...args),
  },
}));
jest.mock('../application/services/appUserDirectory', () => ({
  getCostActor: (...args: unknown[]) => mockGetCostActor(...args),
}));
jest.mock('../middleware/authMiddleware', () => {
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>('../test/mocks/authMiddleware');
  return {
    authenticate: auth.mockAuthenticate(),
    requireSuperAdmin: (
      _req: import('express').Request,
      res: import('express').Response,
      next: import('express').NextFunction
    ) => (isSuperAdmin ? next() : res.status(403).json({ success: false, error: 'Accès réservé aux super administrateurs' })),
  };
});
jest.mock('../utils/logger', () => jest.requireActual('../test/mocks/logger').loggerMockFactory());

import { costRoutes } from './costRoutes';

const SSO_ID = '507f1f77bcf86cd799439011';
const LOCAL_ID = '507f1f77bcf86cd799439012';

const docs = (list: object[]) => ({ select: () => ({ populate: () => ({ lean: () => Promise.resolve(list) }) }) });
const userDoc = (over: object) => ({ save: jest.fn().mockResolvedValue(undefined), ...over });

describe('costRoutes (TI)', () => {
  const app = createTestApp({ mountPath: '/api/costs', router: costRoutes });

  beforeEach(() => {
    jest.clearAllMocks();
    isSuperAdmin = true;
    mockGetCostActor.mockResolvedValue({ hasAccess: true, isSuperAdmin: true });
  });

  describe('GET /users', () => {
    it('liste les comptes SSO et ajoutés, triés par nom, avec le coût horaire', async () => {
      mockUserFind.mockReturnValue(
        docs([
          { _id: { toString: () => LOCAL_ID }, email: 'z@x.com', lastName: 'Zola', provider: 'local', includedInCosts: true },
          {
            _id: { toString: () => SSO_ID },
            email: 'a@x.com',
            firstName: 'Ana',
            lastName: 'Bernard',
            provider: 'microsoft',
            roleId: { name: 'Dev' },
            hourlyRates: [{ rate: 55 }, { startDate: '2026-07-01', rate: 60 }],
          },
        ])
      );

      const res = await request(app).get('/api/costs/users');

      expect(res.status).toBe(200);
      expect(mockUserFind).toHaveBeenCalledWith({ $or: [{ provider: 'microsoft' }, { includedInCosts: true }] });
      expect(res.body.canManage).toBe(true);
      expect(res.body.users).toEqual([
        expect.objectContaining({
          id: SSO_ID,
          roleName: 'Dev',
          hourlyRates: [
            { startDate: null, rate: 55 },
            { startDate: '2026-07-01', rate: 60 },
          ],
          manual: false,
        }),
        expect.objectContaining({ id: LOCAL_ID, roleName: null, hourlyRates: [], manual: true }),
      ]);
      expect(mockGetCostActor).toHaveBeenCalledWith(TEST_USER_ID);
    });

    it("autorise un rôle Finance sans droit de gestion de la liste", async () => {
      mockGetCostActor.mockResolvedValue({ hasAccess: true, isSuperAdmin: false });
      mockUserFind.mockReturnValue(docs([]));

      const res = await request(app).get('/api/costs/users');

      expect(res.status).toBe(200);
      expect(res.body.canManage).toBe(false);
    });

    it("refuse (403) sans accès aux coûts", async () => {
      mockGetCostActor.mockResolvedValue({ hasAccess: false, isSuperAdmin: false });

      const res = await request(app).get('/api/costs/users');

      expect(res.status).toBe(403);
      expect(mockUserFind).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /users/:id', () => {
    const RATES = [
      { startDate: null, rate: 50 },
      { startDate: '2026-07-01', rate: 60 },
    ];

    it('enregistre le coût initial et les changements datés', async () => {
      const user = userDoc({ provider: 'microsoft' });
      mockUserFindById.mockResolvedValue(user);

      const res = await request(app).patch(`/api/costs/users/${SSO_ID}`).send({ hourlyRates: RATES });

      expect(res.status).toBe(200);
      expect(res.body.hourlyRates).toEqual(RATES);
      expect(user).toMatchObject({ hourlyRates: RATES });
      expect(user.save).toHaveBeenCalled();
    });

    it('efface les coûts avec une liste vide', async () => {
      const user = userDoc({ provider: 'microsoft', hourlyRates: RATES });
      mockUserFindById.mockResolvedValue(user);

      const res = await request(app).patch(`/api/costs/users/${SSO_ID}`).send({ hourlyRates: [] });

      expect(res.body.hourlyRates).toEqual([]);
      expect(user).toMatchObject({ hourlyRates: undefined });
    });

    it('refuse une liste invalide (plus de 3 coûts, dates non croissantes, coût négatif)', async () => {
      const send = (hourlyRates: unknown) => request(app).patch(`/api/costs/users/${SSO_ID}`).send({ hourlyRates });

      const tooMany = await send([...RATES, { startDate: '2026-09-01', rate: 65 }, { startDate: '2026-10-01', rate: 70 }]);
      expect(tooMany.status).toBe(400);
      expect(tooMany.body.errors[0]).toMatch(/3 coûts horaires maximum/);
      expect((await send([{ rate: 50 }, { startDate: '2026-07-01', rate: 60 }, { startDate: '2026-02-01', rate: 65 }])).status).toBe(400);
      expect((await send([{ rate: -1 }])).status).toBe(400);
      expect((await send(undefined)).status).toBe(400);
      expect(mockUserFindById).not.toHaveBeenCalled();
    });

    it('refuse un utilisateur hors liste', async () => {
      mockUserFindById.mockResolvedValue(userDoc({ provider: 'local' }));

      expect((await request(app).patch(`/api/costs/users/${LOCAL_ID}`).send({ hourlyRates: RATES })).status).toBe(404);
    });

    it('refuse (403) sans accès aux coûts', async () => {
      mockGetCostActor.mockResolvedValue({ hasAccess: false, isSuperAdmin: false });

      const res = await request(app).patch(`/api/costs/users/${SSO_ID}`).send({ hourlyRates: RATES });

      expect(res.status).toBe(403);
      expect(mockUserFindById).not.toHaveBeenCalled();
    });
  });

  describe('ajout / retrait de comptes non SSO (super admin)', () => {
    it('liste les comptes non SSO pas encore ajoutés', async () => {
      mockUserFind.mockReturnValue(docs([{ _id: { toString: () => LOCAL_ID }, email: 'l@x.com', provider: 'local' }]));

      const res = await request(app).get('/api/costs/candidates');

      expect(res.status).toBe(200);
      expect(mockUserFind).toHaveBeenCalledWith({ provider: { $ne: 'microsoft' }, includedInCosts: { $ne: true } });
      expect(res.body.users).toEqual([expect.objectContaining({ id: LOCAL_ID, manual: true })]);
    });

    it('ajoute un compte non SSO', async () => {
      const user = userDoc({ provider: 'local' });
      mockUserFindById.mockResolvedValue(user);

      const res = await request(app).post(`/api/costs/users/${LOCAL_ID}`);

      expect(res.status).toBe(201);
      expect(user).toMatchObject({ includedInCosts: true });
    });

    it('refuse un compte déjà dans la liste', async () => {
      mockUserFindById.mockResolvedValue(userDoc({ provider: 'microsoft' }));

      expect((await request(app).post(`/api/costs/users/${SSO_ID}`)).status).toBe(400);
    });

    it('retire un compte ajouté et efface ses coûts horaires', async () => {
      const user = userDoc({ provider: 'local', includedInCosts: true, hourlyRates: [{ startDate: null, rate: 30 }] });
      mockUserFindById.mockResolvedValue(user);

      const res = await request(app).delete(`/api/costs/users/${LOCAL_ID}`);

      expect(res.status).toBe(200);
      expect(user).toMatchObject({ includedInCosts: false, hourlyRates: undefined });
    });

    it('ne retire pas un compte SSO', async () => {
      mockUserFindById.mockResolvedValue(userDoc({ provider: 'microsoft' }));

      expect((await request(app).delete(`/api/costs/users/${SSO_ID}`)).status).toBe(400);
    });

    it('réserve la gestion de la liste au super admin', async () => {
      isSuperAdmin = false;

      expect((await request(app).get('/api/costs/candidates')).status).toBe(403);
      expect((await request(app).post(`/api/costs/users/${LOCAL_ID}`)).status).toBe(403);
      expect((await request(app).delete(`/api/costs/users/${LOCAL_ID}`)).status).toBe(403);
      expect(mockUserFindById).not.toHaveBeenCalled();
    });
  });
});
