/**
 * TI — Routes performance : actions à mener par objectif (lead/CTO : ajout, modification,
 * suppression ; collaborateur : changement de statut sur sa propre fiche).
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import { TEST_USER_ID } from '../test/fixtures/users';

const mockCycleFind = jest.fn();
const mockCycleFindOne = jest.fn();
const mockCycleFindById = jest.fn();
const mockCycleCreate = jest.fn();
const mockCycleUpdateMany = jest.fn();
const mockReviewFind = jest.fn();
const mockReviewFindOne = jest.fn();
const mockReviewCreate = jest.fn();
const mockReviewFindOneAndUpdate = jest.fn();
const mockUserFindById = jest.fn();
const mockUserFind = jest.fn();
const mockRoleFindById = jest.fn();
const mockTeamFind = jest.fn();
const mockProfileFind = jest.fn();
const mockProfileFindOne = jest.fn();
const mockProfileFindOneAndUpdate = jest.fn();

jest.mock('../domain/performance/entities/PerformanceCycle', () => {
  const actual = jest.requireActual('../domain/performance/entities/PerformanceCycle');
  return {
    ...actual,
    PerformanceCycle: {
      find: (...args: unknown[]) => mockCycleFind(...args),
      findOne: (...args: unknown[]) => mockCycleFindOne(...args),
      findById: (...args: unknown[]) => mockCycleFindById(...args),
      create: (...args: unknown[]) => mockCycleCreate(...args),
      updateMany: (...args: unknown[]) => mockCycleUpdateMany(...args)
    }
  };
});

jest.mock('../domain/performance/entities/PerformanceReview', () => {
  const actual = jest.requireActual('../domain/performance/entities/PerformanceReview');
  return {
    ...actual,
    PerformanceReview: {
      find: (...args: unknown[]) => mockReviewFind(...args),
      findOne: (...args: unknown[]) => mockReviewFindOne(...args),
      create: (...args: unknown[]) => mockReviewCreate(...args),
      findOneAndUpdate: (...args: unknown[]) => mockReviewFindOneAndUpdate(...args)
    }
  };
});

jest.mock('../domain/user/entities/User', () => ({
  User: {
    findById: (...args: unknown[]) => mockUserFindById(...args),
    find: (...args: unknown[]) => mockUserFind(...args)
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

jest.mock('../domain/performance/entities/GeneralAssessmentReferentialProfile', () => {
  const actual = jest.requireActual('../domain/performance/entities/GeneralAssessmentReferentialProfile');
  return {
    ...actual,
    GeneralAssessmentReferentialProfile: {
      find: (...args: unknown[]) => mockProfileFind(...args),
      findOne: (...args: unknown[]) => mockProfileFindOne(...args),
      findOneAndUpdate: (...args: unknown[]) => mockProfileFindOneAndUpdate(...args)
    }
  };
});

jest.mock('../middleware/authMiddleware', () => {
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>('../test/mocks/authMiddleware');
  return { authenticate: auth.mockAuthenticate() };
});

jest.mock('../utils/logger', () => jest.requireActual('../test/mocks/logger').loggerMockFactory());
import { performanceRoutes } from './performanceRoutes';

const ACTIVE_CYCLE = { _id: 'cycle-active', label: 'S2-2026', status: 'active' };
const CLOSED_CYCLE = { _id: 'cycle-closed', label: 'S1-2026', status: 'closed' };
const TARGET_USER_ID = '507f1f77bcf86cd799439099';
const TEAM_A_ID = '507f1f77bcf86cd799439a01';
const TEAM_B_ID = '507f1f77bcf86cd799439b02';
const VALID_CYCLE_OBJECT_ID = '507f1f77bcf86cd799439ccc';

function actorLean(overrides: Record<string, unknown> = {}) {
  return { role: null, roleId: null, ...overrides };
}

function objectiveFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'obj-1',
    title: 'Delivery produit',
    weight: 1,
    krs: [],
    actions: [] as unknown[],
    selfAssessment: {},
    managerAssessment: {},
    ...overrides
  };
}

const EXISTING_ACTION = {
  id: 'act-1',
  label: 'Binômer avec un senior',
  status: 'a_faire',
  createdBy: { id: 'lead', name: 'lead', role: 'lead' },
  createdAt: new Date('2026-09-01')
};

function makeReviewDoc(overrides: Record<string, unknown> = {}) {
  const base = {
    _id: 'review-1',
    __v: 0,
    user: TARGET_USER_ID,
    cycle: ACTIVE_CYCLE._id,
    team: TEAM_A_ID as string | null,
    objectives: [objectiveFixture({ actions: [EXISTING_ACTION] })] as unknown[],
    qualitative: {},
    generalSelfAssessment: { axes: { technique: [], impact: [], collaboration: [], leadership: [] } },
    generalManagerAssessment: { axes: { technique: [], impact: [], collaboration: [], leadership: [] } },
    status: 'en_cours',
    createdBy: { id: TEST_USER_ID, name: 'admin', role: 'collaborateur' },
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
    ...overrides
  };
  return {
    ...base,
    toObject: () => structuredClone({ objectives: base.objectives }),
    populate: () => Promise.resolve(base)
  };
}

function asSuperAdmin() {
  mockUserFindById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
  });
}

function asLeadOf(teamId: string) {
  mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(actorLean()) }) });
  mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ _id: teamId }]) }) });
}

/** findOneAndUpdate renvoie un doc reflétant les objectifs écrits. */
function echoUpdate() {
  mockReviewFindOneAndUpdate.mockImplementation((_filter: unknown, update: { $set: { objectives: unknown[] } }) =>
    Promise.resolve(makeReviewDoc({ objectives: update.$set.objectives }))
  );
}

describe('performanceRoutes — actions à mener (TI)', () => {
  const app = createTestApp({ mountPath: '/api/performance', router: performanceRoutes });
  const base = `/api/performance/reviews/${TARGET_USER_ID}/objectives/obj-1/actions`;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(actorLean()) }) });
    mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
    mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
    mockReviewFindOne.mockResolvedValue(makeReviewDoc());
    echoUpdate();
  });

  describe('POST /reviews/:userId/objectives/:objectiveId/actions', () => {
    it('201 ajoute une action "à faire" (lead de l\'équipe)', async () => {
      asLeadOf(TEAM_A_ID);
      const res = await request(app).post(base).send({ label: 'Suivre la formation TS', dueDate: '2026-10-31' });
      expect(res.status).toBe(201);
      expect(res.body.action).toMatchObject({ label: 'Suivre la formation TS', status: 'a_faire' });
      const [filter, update] = mockReviewFindOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ _id: 'review-1', __v: 0 });
      expect(update.$set.objectives[0].actions).toHaveLength(2);
      expect(update.$set.updatedBy.role).toBe('lead');
    });

    it('400 si le libellé est vide', async () => {
      asSuperAdmin();
      const res = await request(app).post(base).send({ label: '' });
      expect(res.status).toBe(400);
      expect(mockReviewFindOneAndUpdate).not.toHaveBeenCalled();
    });

    it("403 si l'acteur n'est pas lead de l'équipe de la fiche", async () => {
      asLeadOf(TEAM_B_ID);
      const res = await request(app).post(base).send({ label: 'x' });
      expect(res.status).toBe(403);
    });

    it('403 si le cycle ciblé est clos', async () => {
      asSuperAdmin();
      mockCycleFindById.mockResolvedValue(CLOSED_CYCLE);
      const res = await request(app).post(base).send({ label: 'x', cycleId: VALID_CYCLE_OBJECT_ID });
      expect(res.status).toBe(403);
    });

    it("404 si l'objectif n'existe pas", async () => {
      asSuperAdmin();
      const res = await request(app)
        .post(`/api/performance/reviews/${TARGET_USER_ID}/objectives/nope/actions`)
        .send({ label: 'x' });
      expect(res.status).toBe(404);
    });

    it('400 si l’identifiant du collaborateur est invalide', async () => {
      asSuperAdmin();
      const res = await request(app).post('/api/performance/reviews/pas-un-id/objectives/obj-1/actions').send({ label: 'x' });
      expect(res.status).toBe(400);
    });

    it("403 si un lead tente de s'assigner une action à lui-même", async () => {
      asLeadOf(TEAM_A_ID);
      const res = await request(app)
        .post(`/api/performance/reviews/${TEST_USER_ID}/objectives/obj-1/actions`)
        .send({ label: 'x' });
      expect(res.status).toBe(403);
    });

    it('409 si la fiche change en continu (verrou optimiste)', async () => {
      asSuperAdmin();
      mockReviewFindOneAndUpdate.mockResolvedValue(null);
      const res = await request(app).post(base).send({ label: 'x' });
      expect(res.status).toBe(409);
    });
  });

  describe('PATCH /reviews/:userId/objectives/:objectiveId/actions/:actionId', () => {
    it('200 modifie libellé et statut (terminé => completedAt)', async () => {
      asSuperAdmin();
      const res = await request(app).patch(`${base}/act-1`).send({ label: 'Nouveau libellé', status: 'termine' });
      expect(res.status).toBe(200);
      expect(res.body.action).toMatchObject({ label: 'Nouveau libellé', status: 'termine' });
      expect(res.body.action.completedAt).toBeDefined();
    });

    it('404 si l’action est inconnue', async () => {
      asSuperAdmin();
      const res = await request(app).patch(`${base}/nope`).send({ status: 'termine' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /reviews/:userId/objectives/:objectiveId/actions/:actionId', () => {
    it('200 supprime l’action', async () => {
      asSuperAdmin();
      const res = await request(app).delete(`${base}/act-1`);
      expect(res.status).toBe(200);
      const [, update] = mockReviewFindOneAndUpdate.mock.calls[0];
      expect(update.$set.objectives[0].actions).toEqual([]);
    });
  });

  describe('PATCH /reviews/me/objectives/:objectiveId/actions/:actionId/status', () => {
    const url = '/api/performance/reviews/me/objectives/obj-1/actions/act-1/status';

    it('200 le collaborateur passe son action "en cours" sur sa propre fiche', async () => {
      const res = await request(app).patch(url).send({ status: 'en_cours' });
      expect(res.status).toBe(200);
      expect(mockReviewFindOne).toHaveBeenCalledWith({ user: TEST_USER_ID, cycle: ACTIVE_CYCLE._id });
      expect(res.body.action).toMatchObject({ id: 'act-1', status: 'en_cours' });
      const [, update] = mockReviewFindOneAndUpdate.mock.calls[0];
      expect(update.$set.updatedBy.role).toBe('collaborateur');
    });

    it('400 si le statut est invalide', async () => {
      const res = await request(app).patch(url).send({ status: 'fini' });
      expect(res.status).toBe(400);
    });

    it("ignore toute autre modification que le statut (libellé non modifiable)", async () => {
      const res = await request(app).patch(url).send({ status: 'termine', label: 'hack' });
      expect(res.status).toBe(200);
      expect(res.body.action.label).toBe(EXISTING_ACTION.label);
    });

    it("200 cible l'action reprise de l'ancien champ coachingAction", async () => {
      mockReviewFindOne.mockResolvedValue(
        makeReviewDoc({ objectives: [objectiveFixture({ managerAssessment: { coachingAction: 'Ancienne action' } })] })
      );
      const res = await request(app)
        .patch('/api/performance/reviews/me/objectives/obj-1/actions/act-legacy-obj-1/status')
        .send({ status: 'termine' });
      expect(res.status).toBe(200);
      const [, update] = mockReviewFindOneAndUpdate.mock.calls[0];
      expect(update.$set.objectives[0].managerAssessment.coachingAction).toBeUndefined();
      expect(update.$set.objectives[0].actions[0]).toMatchObject({ label: 'Ancienne action', status: 'termine' });
    });
  });
});
