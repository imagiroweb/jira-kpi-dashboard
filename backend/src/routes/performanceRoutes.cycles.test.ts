/**
 * TI — GET/POST/PATCH /api/performance/cycles. Couvre en particulier la
 * sérialisation `_id` -> `id` (bug réel constaté côté frontend : PATCH
 * /cycles/undefined faute d'`id` exploitable dans la réponse de l'API).
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';

const mockCycleFind = jest.fn();
const mockCycleCreate = jest.fn();
const mockCycleFindOne = jest.fn();
const mockCycleFindById = jest.fn();
const mockCycleUpdateMany = jest.fn();
const mockUserFindById = jest.fn();
const mockRoleFindById = jest.fn();
const mockTeamFind = jest.fn();

jest.mock('../domain/performance/entities/PerformanceCycle', () => {
  const actual = jest.requireActual('../domain/performance/entities/PerformanceCycle');
  return {
    ...actual,
    PerformanceCycle: {
      find: (...args: unknown[]) => mockCycleFind(...args),
      create: (...args: unknown[]) => mockCycleCreate(...args),
      findOne: (...args: unknown[]) => mockCycleFindOne(...args),
      findById: (...args: unknown[]) => mockCycleFindById(...args),
      updateMany: (...args: unknown[]) => mockCycleUpdateMany(...args)
    }
  };
});

jest.mock('../domain/user/entities/User', () => ({
  User: {
    findById: (...args: unknown[]) => mockUserFindById(...args)
  }
}));

jest.mock('../domain/user/entities/Role', () => ({
  Role: {
    findById: (...args: unknown[]) => mockRoleFindById(...args)
  }
}));

jest.mock('../domain/team/entities/Team', () => ({
  Team: {
    find: (...args: unknown[]) => mockTeamFind(...args)
  }
}));

jest.mock('../middleware/authMiddleware', () => {
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>('../test/mocks/authMiddleware');
  return { authenticate: auth.mockAuthenticate() };
});

jest.mock('../utils/logger', () => jest.requireActual('../test/mocks/logger').loggerMockFactory());

import { performanceRoutes } from './performanceRoutes';

/** Valeur "lean" de l'acteur authentifié (User.findById(...).select().lean()). */
function actorLean(overrides: Record<string, unknown> = {}) {
  return { role: null, roleId: null, ...overrides };
}

function cycleDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'cycle-1',
    label: 'S2-2026',
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-12-31'),
    status: 'draft',
    createdAt: new Date('2026-06-01'),
    updatedAt: new Date('2026-06-01'),
    save: jest.fn(),
    ...overrides
  };
}

describe('GET/POST/PATCH /api/performance/cycles', () => {
  const app = createTestApp({ mountPath: '/api/performance', router: performanceRoutes });

  beforeEach(() => {
    jest.clearAllMocks();
    mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
    mockRoleFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) }) });
  });

  describe('GET /cycles', () => {
    it("renvoie les cycles avec un champ `id` exploitable (pas seulement `_id`)", async () => {
      mockCycleFind.mockReturnValue({ sort: () => Promise.resolve([cycleDoc()]) });

      const res = await request(app).get('/api/performance/cycles');

      expect(res.status).toBe(200);
      expect(res.body.cycles).toHaveLength(1);
      expect(res.body.cycles[0].id).toBe('cycle-1');
      expect(res.body.cycles[0]._id).toBeUndefined();
    });
  });

  describe('POST /cycles', () => {
    it('refuse sans accès global performance', async () => {
      mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(actorLean()) }) });

      const res = await request(app)
        .post('/api/performance/cycles')
        .send({ label: 'S2-2026', startDate: '2026-07-01', endDate: '2026-12-31' });

      expect(res.status).toBe(403);
    });

    it('crée le cycle et renvoie son `id`', async () => {
      mockCycleFindOne.mockResolvedValue(null);
      mockCycleCreate.mockResolvedValue(cycleDoc());

      const res = await request(app)
        .post('/api/performance/cycles')
        .send({ label: 'S2-2026', startDate: '2026-07-01', endDate: '2026-12-31' });

      expect(res.status).toBe(201);
      expect(res.body.cycle.id).toBe('cycle-1');
      expect(res.body.cycle._id).toBeUndefined();
    });

    it('refuse un libellé déjà existant', async () => {
      mockCycleFindOne.mockResolvedValue(cycleDoc());

      const res = await request(app)
        .post('/api/performance/cycles')
        .send({ label: 'S2-2026', startDate: '2026-07-01', endDate: '2026-12-31' });

      expect(res.status).toBe(400);
      expect(mockCycleCreate).not.toHaveBeenCalled();
    });

    it('referme les autres cycles actifs quand le nouveau est créé actif', async () => {
      mockCycleFindOne.mockResolvedValue(null);
      mockCycleCreate.mockResolvedValue(cycleDoc({ status: 'active' }));

      await request(app)
        .post('/api/performance/cycles')
        .send({ label: 'S2-2026', startDate: '2026-07-01', endDate: '2026-12-31', status: 'active' });

      expect(mockCycleUpdateMany).toHaveBeenCalledWith({ status: 'active' }, { $set: { status: 'closed' } });
    });
  });

  describe('PATCH /cycles/:id', () => {
    it('refuse sans accès global performance', async () => {
      mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(actorLean()) }) });

      const res = await request(app).patch('/api/performance/cycles/cycle-1').send({ status: 'active' });

      expect(res.status).toBe(403);
    });

    it('404 si le cycle est introuvable', async () => {
      mockCycleFindById.mockResolvedValue(null);

      const res = await request(app).patch('/api/performance/cycles/unknown').send({ status: 'active' });

      expect(res.status).toBe(404);
    });

    it('active le cycle, referme les autres cycles actifs, et renvoie un `id` exploitable', async () => {
      const doc = cycleDoc({ status: 'draft' });
      mockCycleFindById.mockResolvedValue(doc);

      const res = await request(app).patch('/api/performance/cycles/cycle-1').send({ status: 'active' });

      expect(res.status).toBe(200);
      expect(doc.save).toHaveBeenCalled();
      expect(doc.status).toBe('active');
      expect(mockCycleUpdateMany).toHaveBeenCalledWith(
        { _id: { $ne: 'cycle-1' }, status: 'active' },
        { $set: { status: 'closed' } }
      );
      expect(res.body.cycle.id).toBe('cycle-1');
      expect(res.body.cycle._id).toBeUndefined();
    });

    it('met à jour le libellé et les dates sans toucher au statut', async () => {
      const doc = cycleDoc();
      mockCycleFindById.mockResolvedValue(doc);

      const res = await request(app)
        .patch('/api/performance/cycles/cycle-1')
        .send({ label: 'S2-2026 (révisé)' });

      expect(res.status).toBe(200);
      expect(doc.label).toBe('S2-2026 (révisé)');
      expect(mockCycleUpdateMany).not.toHaveBeenCalled();
    });
  });
});
