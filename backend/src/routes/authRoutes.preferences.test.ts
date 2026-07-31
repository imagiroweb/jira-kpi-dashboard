/**
 * TI — Préférences utilisateur : filtres par défaut Roadmap Adoria 2026
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import { TEST_USER_ID } from '../test/fixtures/users';

const mockUserFindById = jest.fn();
const mockUserFindByIdAndUpdate = jest.fn();

let authMode: 'pass' | 'deny' = 'pass';

jest.mock('mongoose', () =>
  jest.requireActual('../test/mocks/mongoose').mockMongoConnected()
);

jest.mock('../middleware/authMiddleware', () => {
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>(
    '../test/mocks/authMiddleware'
  );
  return {
    authenticate: (
      req: import('express').Request,
      res: import('express').Response,
      next: import('express').NextFunction
    ) => {
      if (authMode === 'deny') {
        return auth.mockAuthDenied(req, res, next);
      }
      return auth.mockAuthenticate()(req, res, next);
    },
    requireSuperAdmin: auth.mockRequireSuperAdmin,
  };
});

jest.mock('../domain/user/entities/User', () => ({
  ROADMAP_ADORIA_QUARTER_FILTERS: ['all', 'Q1', 'Q2', 'Q3', 'Q4'],
  DEFAULT_ROADMAP_ADORIA_2026_FILTERS: { trimestre: 'all', statut: [] },
  User: {
    findById: (...args: unknown[]) => mockUserFindById(...args),
    findByIdAndUpdate: (...args: unknown[]) => mockUserFindByIdAndUpdate(...args),
    findOne: jest.fn(),
  },
}));

jest.mock('../domain/user/entities/UserActivityLog', () => ({
  UserActivityLog: {
    findOne: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
  },
}));

jest.mock('../utils/logger', () =>
  jest.requireActual('../test/mocks/logger').loggerMockFactory()
);

import { authRoutes } from './authRoutes';

function leanChain(resolved: unknown) {
  return {
    select: () => ({
      lean: () => Promise.resolve(resolved),
    }),
    lean: () => Promise.resolve(resolved),
  };
}

describe('Préférences Roadmap Adoria 2026 (TI)', () => {
  const app = createTestApp({ mountPath: '/api/auth', router: authRoutes });
  const path = '/api/auth/me/preferences/roadmap-adoria-2026-filters';

  beforeEach(() => {
    jest.clearAllMocks();
    authMode = 'pass';
  });

  describe(`GET ${path}`, () => {
    it('retourne 401 sans authentification', async () => {
      authMode = 'deny';

      const res = await request(app).get(path);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(mockUserFindById).not.toHaveBeenCalled();
    });

    it('retourne les filtres par défaut si aucune préférence', async () => {
      mockUserFindById.mockReturnValue(leanChain({ preferences: undefined }));

      const res = await request(app).get(path);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.filters).toEqual({ trimestre: 'all', statut: [] });
      expect(mockUserFindById).toHaveBeenCalledWith(TEST_USER_ID);
    });

    it('retourne les filtres enregistrés', async () => {
      mockUserFindById.mockReturnValue(
        leanChain({
          preferences: {
            roadmapAdoria2026Filters: { trimestre: 'Q2', statut: ['En cours', 'Done'] },
          },
        })
      );

      const res = await request(app).get(path);

      expect(res.status).toBe(200);
      expect(res.body.filters).toEqual({
        trimestre: 'Q2',
        statut: ['Done', 'En cours'],
      });
    });

    it('complète les préférences partielles (trimestre / statut manquants)', async () => {
      mockUserFindById.mockReturnValue(
        leanChain({
          preferences: {
            roadmapAdoria2026Filters: { statut: 'pas-un-tableau' },
          },
        })
      );

      const res = await request(app).get(path);

      expect(res.status).toBe(200);
      expect(res.body.filters).toEqual({ trimestre: 'all', statut: [] });
    });

    it('ignore un trimestre hors enum et conserve un statut valide', async () => {
      mockUserFindById.mockReturnValue(
        leanChain({
          preferences: {
            roadmapAdoria2026Filters: { trimestre: 'Q5', statut: ['En cours'] },
          },
        })
      );

      const res = await request(app).get(path);

      expect(res.status).toBe(200);
      expect(res.body.filters).toEqual({ trimestre: 'all', statut: ['En cours'] });
    });

    it('retourne 404 si utilisateur introuvable', async () => {
      mockUserFindById.mockReturnValue(leanChain(null));

      const res = await request(app).get(path);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('retourne 500 si la lecture échoue', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.reject(new Error('db fail')),
        }),
      });

      const res = await request(app).get(path);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe(`PUT ${path}`, () => {
    it('retourne 401 sans authentification', async () => {
      authMode = 'deny';

      const res = await request(app)
        .put(path)
        .send({ trimestre: 'all', statut: [] });

      expect(res.status).toBe(401);
      expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('enregistre les filtres et renvoie le résultat', async () => {
      const filters = { trimestre: 'Q3', statut: ['To do'] };
      mockUserFindByIdAndUpdate.mockReturnValue(
        leanChain({
          preferences: { roadmapAdoria2026Filters: filters },
        })
      );

      const res = await request(app)
        .put(path)
        .set('Content-Type', 'application/json')
        .send(filters);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.filters).toEqual(filters);
      expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith(
        TEST_USER_ID,
        { $set: { 'preferences.roadmapAdoria2026Filters': filters } },
        { new: true, select: 'preferences.roadmapAdoria2026Filters' }
      );
    });

    it('normalise statut (trim, unicité, tri)', async () => {
      mockUserFindByIdAndUpdate.mockReturnValue(
        leanChain({
          preferences: {
            roadmapAdoria2026Filters: { trimestre: 'Q1', statut: ['A', 'B'] },
          },
        })
      );

      const res = await request(app)
        .put(path)
        .send({ trimestre: 'Q1', statut: [' B ', 'A', 'A', ''] });

      expect(res.status).toBe(200);
      expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith(
        TEST_USER_ID,
        {
          $set: {
            'preferences.roadmapAdoria2026Filters': {
              trimestre: 'Q1',
              statut: ['A', 'B'],
            },
          },
        },
        expect.any(Object)
      );
    });

    it('retourne 400 si trimestre invalide', async () => {
      const res = await request(app)
        .put(path)
        .send({ trimestre: 'Q5', statut: [] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('retourne 400 si statut n’est pas un tableau de chaînes', async () => {
      const res = await request(app)
        .put(path)
        .send({ trimestre: 'all', statut: [1, 2] });

      expect(res.status).toBe(400);
      expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('retourne 400 si body vide ou statut trop long', async () => {
      const empty = await request(app).put(path).send({});
      expect(empty.status).toBe(400);

      const tooLong = await request(app)
        .put(path)
        .send({ trimestre: 'all', statut: ['x'.repeat(201)] });
      expect(tooLong.status).toBe(400);
      expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('retourne 404 si utilisateur introuvable à l’update', async () => {
      mockUserFindByIdAndUpdate.mockReturnValue(leanChain(null));

      const res = await request(app)
        .put(path)
        .send({ trimestre: 'all', statut: [] });

      expect(res.status).toBe(404);
    });

    it('retourne 500 si l’update échoue', async () => {
      mockUserFindByIdAndUpdate.mockReturnValue({
        lean: () => Promise.reject(new Error('db fail')),
      });

      const res = await request(app)
        .put(path)
        .send({ trimestre: 'all', statut: [] });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });
});
