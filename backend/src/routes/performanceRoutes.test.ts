/**
 * TI — Routes performance (core) : ma fiche (lecture + création à la volée),
 * mise à jour d'avancement d'un KR.
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import { TEST_USER_ID } from '../test/fixtures/users';

const mockCycleFindOne = jest.fn();
const mockCycleFindById = jest.fn();
const mockReviewFindOne = jest.fn();
const mockReviewCreate = jest.fn();
const mockReviewFindOneAndUpdate = jest.fn();
const mockUserFindById = jest.fn();
const mockUserFind = jest.fn();
const mockTeamFind = jest.fn();

jest.mock('../domain/performance/entities/PerformanceCycle', () => {
  const actual = jest.requireActual('../domain/performance/entities/PerformanceCycle');
  return {
    ...actual,
    PerformanceCycle: {
      findOne: (...args: unknown[]) => mockCycleFindOne(...args),
      findById: (...args: unknown[]) => mockCycleFindById(...args)
    }
  };
});

jest.mock('../domain/performance/entities/PerformanceReview', () => {
  const actual = jest.requireActual('../domain/performance/entities/PerformanceReview');
  return {
    ...actual,
    PerformanceReview: {
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

const ACTIVE_CYCLE = { _id: 'cycle-active', label: 'S2-2026', status: 'active' };
const CLOSED_CYCLE = { _id: 'cycle-closed', label: 'S1-2026', status: 'closed' };
const VALID_OBJECT_ID = '507f1f77bcf86cd799439099';

function makeReview(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'review-1',
    user: TEST_USER_ID,
    cycle: ACTIVE_CYCLE._id,
    objectives: [],
    qualitative: {},
    status: 'dossier_manquant',
    createdBy: { id: TEST_USER_ID, name: 'admin', role: 'collaborateur' },
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
    ...overrides
  };
}

function krFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'kr-1',
    label: '100% des US en temps',
    weight: 0.4,
    progress: 0,
    progressHistory: [],
    ...overrides
  };
}

function objectiveFixture(krs = [krFixture()]) {
  return {
    id: 'obj-1',
    title: 'Delivery produit',
    weight: 0.4,
    krs,
    selfAssessment: {},
    managerAssessment: {}
  };
}

/** Document mocké tel que renvoyé par `PerformanceReview.findOne` dans la route progress. */
function makeReviewDoc(
  objectives = [objectiveFixture()],
  overrides: { qualitative?: Record<string, unknown> } = {}
) {
  return {
    _id: 'review-1',
    __v: 0,
    status: 'en_cours',
    toObject: () => ({
      objectives: structuredClone(objectives),
      qualitative: structuredClone(overrides.qualitative ?? {})
    })
  };
}

describe('performanceRoutes (TI)', () => {
  const app = createTestApp({ mountPath: '/api/performance', router: performanceRoutes });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ teamId: 'team-1' }) })
    });
    mockUserFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
    mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
  });

  describe('GET /reviews/me', () => {
    it("404 si aucun cycle actif et aucun cycleId fourni", async () => {
      mockCycleFindOne.mockResolvedValue(null);

      const res = await request(app).get('/api/performance/reviews/me');

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/aucun cycle/i);
    });

    it('400 si cycleId n\'est pas un ObjectId valide', async () => {
      const res = await request(app).get('/api/performance/reviews/me?cycleId=not-an-id');
      expect(res.status).toBe(400);
      expect(mockCycleFindById).not.toHaveBeenCalled();
    });

    it('404 si le cycleId demandé est introuvable', async () => {
      mockCycleFindById.mockResolvedValue(null);
      const res = await request(app).get(`/api/performance/reviews/me?cycleId=${VALID_OBJECT_ID}`);
      expect(res.status).toBe(404);
      expect(mockCycleFindById).toHaveBeenCalledWith(VALID_OBJECT_ID);
    });

    it('200 renvoie la fiche existante sans la recréer', async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(makeReview());

      const res = await request(app).get('/api/performance/reviews/me');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.review.status).toBe('dossier_manquant');
      expect(res.body.review.qualitative).toEqual({
        successes: {},
        challenges: {},
        growthAreas: {},
        overallReview: {}
      });
      expect(mockReviewCreate).not.toHaveBeenCalled();
    });

    it('201 crée la fiche à la volée sur le cycle actif si elle n\'existe pas, avec l\'équipe actuelle', async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(null);
      mockReviewCreate.mockResolvedValue(makeReview());

      const res = await request(app).get('/api/performance/reviews/me');

      expect(res.status).toBe(201);
      expect(mockReviewCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          user: TEST_USER_ID,
          cycle: ACTIVE_CYCLE._id,
          team: 'team-1',
          createdBy: expect.objectContaining({ id: TEST_USER_ID, role: 'collaborateur' })
        })
      );
    });

    it('404 si aucune fiche et que le cycle demandé est clos (pas de création rétroactive)', async () => {
      mockCycleFindById.mockResolvedValue(CLOSED_CYCLE);
      mockReviewFindOne.mockResolvedValue(null);

      const res = await request(app).get(`/api/performance/reviews/me?cycleId=${VALID_OBJECT_ID}`);

      expect(res.status).toBe(404);
      expect(mockReviewCreate).not.toHaveBeenCalled();
    });
  });

  describe('POST /reviews/me/objectives/:objectiveId/krs/:krId/progress', () => {
    const url = '/api/performance/reviews/me/objectives/obj-1/krs/kr-1/progress';

    it('400 si value n\'est pas un nombre', async () => {
      const res = await request(app).post(url).send({ value: 'beaucoup' });
      expect(res.status).toBe(400);
    });

    it('404 si aucun cycle actif', async () => {
      mockCycleFindOne.mockResolvedValue(null);
      const res = await request(app).post(url).send({ value: 50 });
      expect(res.status).toBe(404);
    });

    it('403 si le cycle ciblé est clos', async () => {
      mockCycleFindById.mockResolvedValue(CLOSED_CYCLE);
      const res = await request(app).post(url).send({ value: 50, cycleId: VALID_OBJECT_ID });
      expect(res.status).toBe(403);
    });

    it('404 si aucune fiche n\'existe pour ce cycle', async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(null);
      const res = await request(app).post(url).send({ value: 50 });
      expect(res.status).toBe(404);
    });

    it('404 si l\'objectif est introuvable', async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(makeReviewDoc([]));
      const res = await request(app).post(url).send({ value: 50 });
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/objectif/i);
    });

    it('404 si le résultat clé est introuvable', async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(makeReviewDoc([objectiveFixture([])]));
      const res = await request(app).post(url).send({ value: 50 });
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/résultat clé/i);
    });

    it("200 met à jour l'avancement du KR avec la note et le lien de preuve", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(makeReviewDoc());
      mockReviewFindOneAndUpdate.mockResolvedValue(
        makeReview({
          objectives: [
            objectiveFixture([
              krFixture({
                progress: 70,
                progressHistory: [
                  {
                    value: 70,
                    note: 'US livrée',
                    evidenceUrl: 'https://jira.adoria.fr/DEV-1',
                    updatedBy: { id: TEST_USER_ID, name: 'admin', role: 'collaborateur' },
                    updatedAt: new Date()
                  }
                ]
              })
            ])
          ]
        })
      );

      const res = await request(app)
        .post(url)
        .send({ value: 70, note: 'US livrée', evidenceUrl: 'https://jira.adoria.fr/DEV-1' });

      expect(res.status).toBe(200);
      expect(res.body.review.objectives[0].krs[0].progress).toBe(70);
      expect(res.body.review.objectives[0].krs[0].progressHistory[0].evidenceUrl).toBe(
        'https://jira.adoria.fr/DEV-1'
      );

      const [filter, update] = mockReviewFindOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ _id: 'review-1', __v: 0 });
      expect(update.$set.objectives[0].krs[0].progress).toBe(70);
      expect(update.$set.updatedBy).toEqual(
        expect.objectContaining({ id: TEST_USER_ID, role: 'collaborateur' })
      );
    });

    it('409 si la fiche a été modifiée en même temps (verrou optimiste épuisé)', async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(makeReviewDoc());
      mockReviewFindOneAndUpdate.mockResolvedValue(null);

      const res = await request(app).post(url).send({ value: 50 });

      expect(res.status).toBe(409);
      expect(mockReviewFindOneAndUpdate).toHaveBeenCalledTimes(5);
    });
  });

  describe('PATCH /reviews/me/self-assessment', () => {
    const url = '/api/performance/reviews/me/self-assessment';
    const payload = { objectives: [{ id: 'obj-1', status: 'atteint', comment: 'Auto-évaluation' }] };

    it('404 si aucun cycle actif', async () => {
      mockCycleFindOne.mockResolvedValue(null);
      const res = await request(app).patch(url).send(payload);
      expect(res.status).toBe(404);
    });

    it('403 si le cycle ciblé est clos', async () => {
      mockCycleFindById.mockResolvedValue(CLOSED_CYCLE);
      const res = await request(app).patch(url).send({ ...payload, cycleId: VALID_OBJECT_ID });
      expect(res.status).toBe(403);
    });

    it("404 si aucune fiche n'existe pour ce cycle", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(null);
      const res = await request(app).patch(url).send(payload);
      expect(res.status).toBe(404);
    });

    it("200 applique l'auto-évaluation d'un objectif sans toucher au manager", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(
        makeReviewDoc([objectiveFixture([krFixture()])])
      );
      mockReviewFindOneAndUpdate.mockResolvedValue(
        makeReview({
          objectives: [
            { ...objectiveFixture([krFixture()]), selfAssessment: { status: 'atteint', comment: 'Auto-évaluation' } }
          ]
        })
      );

      const res = await request(app).patch(url).send(payload);

      expect(res.status).toBe(200);
      const [, update] = mockReviewFindOneAndUpdate.mock.calls[0];
      expect(update.$set.objectives[0].selfAssessment).toEqual({ status: 'atteint', comment: 'Auto-évaluation' });
      expect(update.$set.objectives[0]).not.toHaveProperty('managerAssessment.status');
    });

    it("200 fusionne le bilan qualitatif côté self", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(
        makeReviewDoc([], {
          qualitative: { successes: { manager: 'Bravo' } }
        })
      );
      mockReviewFindOneAndUpdate.mockResolvedValue(makeReview());

      const res = await request(app)
        .patch(url)
        .send({ qualitative: { successes: 'Content de moi' } });

      expect(res.status).toBe(200);
      const [, update] = mockReviewFindOneAndUpdate.mock.calls[0];
      expect(update.$set.qualitative.successes).toEqual({ manager: 'Bravo', self: 'Content de moi' });
    });

    it('409 si la fiche a été modifiée en même temps (verrou optimiste épuisé)', async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(makeReviewDoc());
      mockReviewFindOneAndUpdate.mockResolvedValue(null);

      const res = await request(app).patch(url).send(payload);

      expect(res.status).toBe(409);
      expect(mockReviewFindOneAndUpdate).toHaveBeenCalledTimes(5);
    });
  });
});
