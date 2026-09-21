/**
 * TI — Routes performance (portée équipe/CTO) : cycles, liste/détail scopés,
 * définition d'objectifs, évaluation manager.
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

/** Valeur "lean" de l'acteur authentifié (User.findById(...).select().lean()). */
function actorLean(overrides: Record<string, unknown> = {}) {
  return { role: null, roleId: null, ...overrides };
}

function objectiveFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'obj-1',
    title: 'Delivery produit',
    weight: 1,
    krs: [{ id: 'kr-1', label: '100% des US en temps', weight: 1, progress: 0, progressHistory: [] }],
    selfAssessment: {},
    managerAssessment: {},
    ...overrides
  };
}

/** Document mocké pour une fiche existante : direct-await ET .populate() supportés. */
function makeReviewDoc(overrides: Record<string, unknown> = {}) {
  const base = {
    _id: 'review-1',
    __v: 0,
    user: TARGET_USER_ID,
    cycle: ACTIVE_CYCLE._id,
    team: null as string | null,
    objectives: [] as unknown[],
    qualitative: {},
    competencyScores: {},
    generalSelfAssessment: { axes: { technique: [], impact: [], collaboration: [], leadership: [] } },
    generalManagerAssessment: { axes: { technique: [], impact: [], collaboration: [], leadership: [] } },
    status: 'dossier_manquant',
    createdBy: { id: TEST_USER_ID, name: 'admin', role: 'collaborateur' },
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
    ...overrides
  };
  return {
    ...base,
    toObject: () =>
      structuredClone({
        objectives: base.objectives,
        qualitative: base.qualitative,
        competencyScores: base.competencyScores,
        generalSelfAssessment: base.generalSelfAssessment,
        generalManagerAssessment: base.generalManagerAssessment
      }),
    populate: () => Promise.resolve(base)
  };
}

describe('performanceRoutes — portée équipe/CTO (TI)', () => {
  const app = createTestApp({ mountPath: '/api/performance', router: performanceRoutes });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindById.mockImplementation((id: string) => {
      if (id === TEST_USER_ID) {
        return { select: () => ({ lean: () => Promise.resolve(actorLean()) }) };
      }
      return { select: () => ({ lean: () => Promise.resolve({ teamId: null }) }) };
    });
    mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
    mockUserFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
    mockCycleFindOne.mockResolvedValue(null);
  });

  describe('GET /cycles', () => {
    it('200 liste les cycles', async () => {
      mockCycleFind.mockReturnValue({ sort: () => Promise.resolve([ACTIVE_CYCLE]) });
      const res = await request(app).get('/api/performance/cycles');
      expect(res.status).toBe(200);
      expect(res.body.cycles).toHaveLength(1);
    });
  });

  describe('POST /cycles', () => {
    const payload = { label: 'S2-2026', startDate: '2026-07-01', endDate: '2026-12-31' };

    it("403 si l'acteur n'a pas d'accès global", async () => {
      const res = await request(app).post('/api/performance/cycles').send(payload);
      expect(res.status).toBe(403);
    });

    it('400 si les dates sont invalides (acteur super_admin)', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      const res = await request(app).post('/api/performance/cycles').send({ label: 'X', startDate: 'nope', endDate: 'nope' });
      expect(res.status).toBe(400);
    });

    it('400 si un cycle du même libellé existe déjà', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      const res = await request(app).post('/api/performance/cycles').send(payload);
      expect(res.status).toBe(400);
      expect(mockCycleCreate).not.toHaveBeenCalled();
    });

    it('201 crée un cycle en "draft" par défaut', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockCycleCreate.mockResolvedValue({ ...ACTIVE_CYCLE, status: 'draft' });

      const res = await request(app).post('/api/performance/cycles').send(payload);

      expect(res.status).toBe(201);
      expect(mockCycleCreate).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
      expect(mockCycleUpdateMany).not.toHaveBeenCalled();
    });

    it('201 crée un cycle actif et referme les autres cycles actifs', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockCycleCreate.mockResolvedValue(ACTIVE_CYCLE);

      const res = await request(app)
        .post('/api/performance/cycles')
        .send({ ...payload, status: 'active' });

      expect(res.status).toBe(201);
      expect(mockCycleUpdateMany).toHaveBeenCalledWith({ status: 'active' }, { $set: { status: 'closed' } });
    });
  });

  describe('PATCH /cycles/:id', () => {
    it("403 si l'acteur n'a pas d'accès global", async () => {
      const res = await request(app).patch(`/api/performance/cycles/${ACTIVE_CYCLE._id}`).send({ label: 'X' });
      expect(res.status).toBe(403);
    });

    it('404 si le cycle est introuvable', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockCycleFindById.mockResolvedValue(null);
      const res = await request(app).patch(`/api/performance/cycles/${ACTIVE_CYCLE._id}`).send({ label: 'X' });
      expect(res.status).toBe(404);
    });

    it("200 active un cycle et referme les autres cycles actifs (hors lui-même)", async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      const cycle = { ...CLOSED_CYCLE, save: jest.fn().mockResolvedValue(undefined) };
      mockCycleFindById.mockResolvedValue(cycle);

      const res = await request(app).patch(`/api/performance/cycles/${CLOSED_CYCLE._id}`).send({ status: 'active' });

      expect(res.status).toBe(200);
      expect(cycle.status).toBe('active');
      expect(mockCycleUpdateMany).toHaveBeenCalledWith(
        { _id: { $ne: cycle._id }, status: 'active' },
        { $set: { status: 'closed' } }
      );
    });
  });

  describe('GET /reviews', () => {
    it("403 si l'acteur n'a ni accès global ni équipe dirigée", async () => {
      const res = await request(app).get('/api/performance/reviews');
      expect(res.status).toBe(403);
    });

    it('404 si aucun cycle actif', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockCycleFindOne.mockResolvedValue(null);
      const res = await request(app).get('/api/performance/reviews');
      expect(res.status).toBe(404);
    });

    it("403 si un lead demande une équipe qu'il ne dirige pas", async () => {
      mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(actorLean()) }) });
      mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ _id: TEAM_A_ID }]) }) });
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);

      const res = await request(app).get(`/api/performance/reviews?teamId=${TEAM_B_ID}`);
      expect(res.status).toBe(403);
    });

    it('200 le CTO/super_admin voit toutes les fiches (aucun filtre équipe)', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFind.mockReturnValue({
        populate: () => ({ sort: () => Promise.resolve([makeReviewDoc()]) })
      });

      const res = await request(app).get('/api/performance/reviews');

      expect(res.status).toBe(200);
      expect(res.body.reviews).toHaveLength(1);
      expect(mockReviewFind).toHaveBeenCalledWith({ cycle: ACTIVE_CYCLE._id });
    });

    it("renseigne l'équipe depuis User.teamId si la fiche n'en a pas", async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFind.mockReturnValue({
        populate: () => ({ sort: () => Promise.resolve([makeReviewDoc({ team: null })]) })
      });
      mockUserFind.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve([{ _id: TARGET_USER_ID, teamId: TEAM_A_ID }]) })
      });
      mockTeamFind.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve([{ _id: TEAM_A_ID, name: 'Choco' }]) })
      });

      const res = await request(app).get('/api/performance/reviews');

      expect(res.status).toBe(200);
      expect(res.body.reviews[0].team).toBe(TEAM_A_ID);
      expect(res.body.reviews[0].teamNameSnapshot).toBe('Choco');
    });

    it('200 un lead ne voit que les fiches de ses équipes', async () => {
      mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(actorLean()) }) });
      mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ _id: TEAM_A_ID }]) }) });
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFind.mockReturnValue({ populate: () => ({ sort: () => Promise.resolve([]) }) });

      const res = await request(app).get('/api/performance/reviews');

      expect(res.status).toBe(200);
      expect(mockReviewFind).toHaveBeenCalledWith({ cycle: ACTIVE_CYCLE._id, team: { $in: [TEAM_A_ID] } });
    });
  });

  describe('GET /reviews/:userId', () => {
    const url = `/api/performance/reviews/${TARGET_USER_ID}`;

    it('404 si aucun cycle actif', async () => {
      mockCycleFindOne.mockResolvedValue(null);
      const res = await request(app).get(url);
      expect(res.status).toBe(404);
    });

    it("404 si aucune fiche pour ce cycle", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockReturnValue({ populate: () => Promise.resolve(null) });
      const res = await request(app).get(url);
      expect(res.status).toBe(404);
    });

    it("403 si l'acteur n'a pas accès à l'équipe de la fiche", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockReturnValue({ populate: () => Promise.resolve(makeReviewDoc({ team: TEAM_A_ID })) });
      mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(actorLean()) }) });

      const res = await request(app).get(url);
      expect(res.status).toBe(403);
    });

    it('200 un lead accède à la fiche d\'un collaborateur de son équipe', async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockReturnValue({ populate: () => Promise.resolve(makeReviewDoc({ team: TEAM_A_ID })) });
      mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(actorLean()) }) });
      mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ _id: TEAM_A_ID }]) }) });

      const res = await request(app).get(url);
      expect(res.status).toBe(200);
    });

    it('200 chacun accède à sa propre fiche même sans portée particulière', async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockReturnValue({ populate: () => Promise.resolve(makeReviewDoc({ user: TEST_USER_ID })) });

      const res = await request(app).get(`/api/performance/reviews/${TEST_USER_ID}`);
      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /reviews/:userId/objectives', () => {
    const url = `/api/performance/reviews/${TARGET_USER_ID}/objectives`;
    const validPayload = { objectives: [objectiveFixture()] };

    it("400 si objectives n'est pas un tableau", async () => {
      const res = await request(app).patch(url).send({ objectives: 'nope' });
      expect(res.status).toBe(400);
    });

    it("400 si la définition est invalide (poids déséquilibrés)", async () => {
      const res = await request(app)
        .patch(url)
        .send({ objectives: [objectiveFixture({ weight: 0.5 })] });
      expect(res.status).toBe(400);
    });

    it('404 si aucun cycle actif', async () => {
      mockCycleFindOne.mockResolvedValue(null);
      const res = await request(app).patch(url).send(validPayload);
      expect(res.status).toBe(404);
    });

    it('403 si le cycle ciblé est clos', async () => {
      mockCycleFindById.mockResolvedValue(CLOSED_CYCLE);
      const res = await request(app).patch(url).send({ ...validPayload, cycleId: VALID_CYCLE_OBJECT_ID });
      expect(res.status).toBe(403);
    });

    it("403 si l'acteur n'a pas accès à l'équipe du collaborateur", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(null);
      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) return { select: () => ({ lean: () => Promise.resolve(actorLean()) }) };
        return { select: () => ({ lean: () => Promise.resolve({ teamId: TEAM_A_ID }) }) };
      });

      const res = await request(app).patch(url).send(validPayload);
      expect(res.status).toBe(403);
    });

    it("200 un lead définit les objectifs et crée la fiche à la volée pour un membre de son équipe", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(null);
      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) return { select: () => ({ lean: () => Promise.resolve(actorLean()) }) };
        return { select: () => ({ lean: () => Promise.resolve({ teamId: TEAM_A_ID }) }) };
      });
      mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ _id: TEAM_A_ID }]) }) });
      mockReviewCreate.mockResolvedValue(makeReviewDoc({ team: TEAM_A_ID }));
      mockReviewFindOneAndUpdate.mockResolvedValue(
        makeReviewDoc({ team: TEAM_A_ID, objectives: [objectiveFixture()], status: 'en_cours' })
      );

      const res = await request(app).patch(url).send(validPayload);

      expect(res.status).toBe(200);
      expect(mockReviewCreate).toHaveBeenCalledWith(
        expect.objectContaining({ user: TARGET_USER_ID, team: TEAM_A_ID })
      );
      const [, update] = mockReviewFindOneAndUpdate.mock.calls[0];
      expect(update.$set.definedBy).toEqual(expect.objectContaining({ role: 'lead' }));
    });

    it("200 conserve l'avancement des KR repris lors d'une redéfinition", async () => {
      const existing = makeReviewDoc({
        team: TEAM_A_ID,
        objectives: [objectiveFixture({ krs: [{ id: 'kr-1', label: 'Ancien', weight: 1, progress: 70, progressHistory: [{ value: 70, updatedBy: { id: 'x', name: 'y' }, updatedAt: new Date() }] }] })]
      });
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(existing);
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockReviewFindOneAndUpdate.mockResolvedValue(makeReviewDoc({ team: TEAM_A_ID }));

      const res = await request(app)
        .patch(url)
        .send({ objectives: [objectiveFixture({ krs: [{ id: 'kr-1', label: 'Nouveau libellé', weight: 1 }] })] });

      expect(res.status).toBe(200);
      const [, update] = mockReviewFindOneAndUpdate.mock.calls[0];
      expect(update.$set.objectives[0].krs[0].progress).toBe(70);
      expect(update.$set.objectives[0].krs[0].label).toBe('Nouveau libellé');
    });

    it('409 si la fiche a été modifiée en même temps (verrou optimiste épuisé)', async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(makeReviewDoc({ team: TEAM_A_ID }));
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockReviewFindOneAndUpdate.mockResolvedValue(null);

      const res = await request(app).patch(url).send(validPayload);

      expect(res.status).toBe(409);
      expect(mockReviewFindOneAndUpdate).toHaveBeenCalledTimes(5);
    });
  });

  describe('PATCH /reviews/:userId/general-self-assessment', () => {
    const url = `/api/performance/reviews/${TARGET_USER_ID}/general-self-assessment`;
    const validPayload = { axes: { technique: [{ label: 'Qualité du code & revues', score: 5 }] } };

    it("400 si axes n'est pas un objet", async () => {
      const res = await request(app).patch(url).send({ axes: 'nope' });
      expect(res.status).toBe(400);
    });

    it('400 si la définition est invalide (note hors 1-5)', async () => {
      const res = await request(app)
        .patch(url)
        .send({ axes: { technique: [{ label: 'X', score: 7 }] } });
      expect(res.status).toBe(400);
    });

    it('404 si aucun cycle actif', async () => {
      mockCycleFindOne.mockResolvedValue(null);
      const res = await request(app).patch(url).send(validPayload);
      expect(res.status).toBe(404);
    });

    it('403 si le cycle ciblé est clos', async () => {
      mockCycleFindById.mockResolvedValue(CLOSED_CYCLE);
      const res = await request(app).patch(url).send({ ...validPayload, cycleId: VALID_CYCLE_OBJECT_ID });
      expect(res.status).toBe(403);
    });

    it("403 si l'acteur n'a pas accès à l'équipe du collaborateur", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(null);
      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) return { select: () => ({ lean: () => Promise.resolve(actorLean()) }) };
        return { select: () => ({ lean: () => Promise.resolve({ teamId: TEAM_A_ID }) }) };
      });

      const res = await request(app).patch(url).send(validPayload);
      expect(res.status).toBe(403);
    });

    it("200 un lead définit l'auto-évaluation générale et crée la fiche à la volée pour un membre de son équipe", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(null);
      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) return { select: () => ({ lean: () => Promise.resolve(actorLean()) }) };
        return { select: () => ({ lean: () => Promise.resolve({ teamId: TEAM_A_ID }) }) };
      });
      mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ _id: TEAM_A_ID }]) }) });
      mockReviewCreate.mockResolvedValue(makeReviewDoc({ team: TEAM_A_ID }));
      mockReviewFindOneAndUpdate.mockResolvedValue(
        makeReviewDoc({ team: TEAM_A_ID, generalSelfAssessment: { axes: { technique: [{ label: 'Qualité du code & revues', score: 5 }], impact: [], collaboration: [], leadership: [] } } })
      );

      const res = await request(app).patch(url).send(validPayload);

      expect(res.status).toBe(200);
      expect(mockReviewCreate).toHaveBeenCalledWith(
        expect.objectContaining({ user: TARGET_USER_ID, team: TEAM_A_ID })
      );
      expect(res.body.review.generalSelfAssessment.technique).toEqual([
        { label: 'Qualité du code & revues', score: 5 }
      ]);
    });

    it("200 remplace les sous-critères de l'axe fourni sans toucher aux autres axes déjà renseignés", async () => {
      const existing = makeReviewDoc({
        team: TEAM_A_ID,
        generalSelfAssessment: {
          axes: {
            technique: [{ label: 'Ancien critère', score: 2 }],
            impact: [{ label: 'Livraison (delivery)', score: 4 }],
            collaboration: [],
            leadership: []
          }
        }
      });
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(existing);
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockReviewFindOneAndUpdate.mockResolvedValue(makeReviewDoc({ team: TEAM_A_ID }));

      const res = await request(app).patch(url).send(validPayload);

      expect(res.status).toBe(200);
      const [, update] = mockReviewFindOneAndUpdate.mock.calls[0];
      expect(update.$set.generalSelfAssessment.axes.technique).toEqual([
        { label: 'Qualité du code & revues', score: 5 }
      ]);
      expect(update.$set.generalSelfAssessment.axes.impact).toEqual([
        { label: 'Livraison (delivery)', score: 4 }
      ]);
    });

    it('409 si la fiche a été modifiée en même temps (verrou optimiste épuisé)', async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(makeReviewDoc({ team: TEAM_A_ID }));
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockReviewFindOneAndUpdate.mockResolvedValue(null);

      const res = await request(app).patch(url).send(validPayload);

      expect(res.status).toBe(409);
      expect(mockReviewFindOneAndUpdate).toHaveBeenCalledTimes(5);
    });
  });

  describe('PATCH /reviews/:userId/general-manager-assessment', () => {
    const url = `/api/performance/reviews/${TARGET_USER_ID}/general-manager-assessment`;

    /** Référentiel minimal utilisé par ces tests : un sous-critère par axe technique/impact, chacun avec ses 5 réponses. */
    function referentialProfileFixture(overrides: Record<string, unknown> = {}) {
      return {
        roleProfile: 'dev_back',
        label: 'Développeur Back',
        axes: {
          technique: [
            {
              label: 'Qualité du code & revues',
              answers: [
                { text: 'Réponse 1 (faible)', points: 1 },
                { text: 'Réponse 2', points: 2 },
                { text: 'Réponse 3', points: 3 },
                { text: 'Réponse correcte', points: 4 },
                { text: 'Réponse excellente', points: 5 }
              ]
            }
          ],
          impact: [
            {
              label: 'Livraison (delivery)',
              answers: [
                { text: 'R1', points: 1 },
                { text: 'R2', points: 2 },
                { text: 'R3', points: 3 },
                { text: 'R4 bonne', points: 4 },
                { text: 'R5', points: 5 }
              ]
            }
          ],
          collaboration: [],
          leadership: []
        },
        ...overrides
      };
    }

    const validPayload = {
      roleProfile: 'dev_back',
      axes: { technique: [{ label: 'Qualité du code & revues', answer: 'Réponse correcte' }] }
    };

    it("400 si axes n'est pas un objet", async () => {
      const res = await request(app).patch(url).send({ axes: 'nope' });
      expect(res.status).toBe(400);
    });

    it('400 si un sous-critère est incomplet (réponse manquante)', async () => {
      const res = await request(app)
        .patch(url)
        .send({ roleProfile: 'dev_back', axes: { technique: [{ label: 'X' }] } });
      expect(res.status).toBe(400);
      expect(mockProfileFindOne).not.toHaveBeenCalled();
    });

    it('400 si roleProfile est inconnu', async () => {
      const res = await request(app)
        .patch(url)
        .send({ roleProfile: 'product_owner', axes: { technique: [{ label: 'X', answer: 'Y' }] } });
      expect(res.status).toBe(400);
    });

    it('404 si aucun cycle actif', async () => {
      mockCycleFindOne.mockResolvedValue(null);
      const res = await request(app).patch(url).send(validPayload);
      expect(res.status).toBe(404);
    });

    it('403 si le cycle ciblé est clos', async () => {
      mockCycleFindById.mockResolvedValue(CLOSED_CYCLE);
      const res = await request(app).patch(url).send({ ...validPayload, cycleId: VALID_CYCLE_OBJECT_ID });
      expect(res.status).toBe(403);
    });

    it("403 si l'acteur n'a pas accès à l'équipe du collaborateur", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(null);
      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) return { select: () => ({ lean: () => Promise.resolve(actorLean()) }) };
        return { select: () => ({ lean: () => Promise.resolve({ teamId: TEAM_A_ID }) }) };
      });

      const res = await request(app).patch(url).send(validPayload);
      expect(res.status).toBe(403);
    });

    it("400 si aucun profil de poste n'est connu (ni fourni, ni déjà mémorisé sur la fiche) alors qu'un sous-critère est noté", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(makeReviewDoc({ team: TEAM_A_ID }));
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });

      const res = await request(app)
        .patch(url)
        .send({ axes: { technique: [{ label: 'Qualité du code & revues', answer: 'Réponse correcte' }] } });

      expect(res.status).toBe(400);
      expect(mockProfileFindOne).not.toHaveBeenCalled();
    });

    it("400 si aucun référentiel n'est encore configuré pour le profil de poste ciblé", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(makeReviewDoc({ team: TEAM_A_ID }));
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockProfileFindOne.mockResolvedValue(null);

      const res = await request(app).patch(url).send(validPayload);

      expect(res.status).toBe(400);
    });

    it("400 si la réponse choisie n'existe pas (ou plus) dans le référentiel", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(makeReviewDoc({ team: TEAM_A_ID }));
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockProfileFindOne.mockResolvedValue(referentialProfileFixture());

      const res = await request(app)
        .patch(url)
        .send({
          roleProfile: 'dev_back',
          axes: { technique: [{ label: 'Qualité du code & revues', answer: 'Réponse qui n\'existe pas' }] }
        });

      expect(res.status).toBe(400);
      expect(mockReviewFindOneAndUpdate).not.toHaveBeenCalled();
    });

    it("200 un lead note la grille manager (résolution du score depuis le référentiel) et crée la fiche à la volée", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(null);
      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) return { select: () => ({ lean: () => Promise.resolve(actorLean()) }) };
        return { select: () => ({ lean: () => Promise.resolve({ teamId: TEAM_A_ID }) }) };
      });
      mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ _id: TEAM_A_ID }]) }) });
      mockProfileFindOne.mockResolvedValue(referentialProfileFixture());
      mockReviewCreate.mockResolvedValue(makeReviewDoc({ team: TEAM_A_ID }));
      mockReviewFindOneAndUpdate.mockResolvedValue(
        makeReviewDoc({
          team: TEAM_A_ID,
          generalAssessmentRoleProfile: 'dev_back',
          generalManagerAssessment: {
            axes: {
              technique: [{ label: 'Qualité du code & revues', score: 4, answer: 'Réponse correcte' }],
              impact: [],
              collaboration: [],
              leadership: []
            }
          }
        })
      );

      const res = await request(app).patch(url).send(validPayload);

      expect(res.status).toBe(200);
      expect(mockProfileFindOne).toHaveBeenCalledWith({ roleProfile: 'dev_back' });
      expect(mockReviewCreate).toHaveBeenCalledWith(
        expect.objectContaining({ user: TARGET_USER_ID, team: TEAM_A_ID })
      );
      const [, update] = mockReviewFindOneAndUpdate.mock.calls[0];
      expect(update.$set.generalManagerAssessment.axes.technique).toEqual([
        { label: 'Qualité du code & revues', score: 4, answer: 'Réponse correcte' }
      ]);
      expect(update.$set.generalAssessmentRoleProfile).toBe('dev_back');
      expect(res.body.review.generalManagerAssessment.technique).toEqual([
        { label: 'Qualité du code & revues', score: 4, answer: 'Réponse correcte' }
      ]);
      expect(res.body.review.generalAssessmentRoleProfile).toBe('dev_back');
    });

    it("200 réutilise le profil de poste déjà mémorisé sur la fiche quand roleProfile n'est pas refourni", async () => {
      const existing = makeReviewDoc({ team: TEAM_A_ID, generalAssessmentRoleProfile: 'qa' });
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(existing);
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockProfileFindOne.mockResolvedValue(referentialProfileFixture({ roleProfile: 'qa', label: 'QA' }));
      mockReviewFindOneAndUpdate.mockResolvedValue(makeReviewDoc({ team: TEAM_A_ID, generalAssessmentRoleProfile: 'qa' }));

      const res = await request(app)
        .patch(url)
        .send({ axes: { technique: [{ label: 'Qualité du code & revues', answer: 'Réponse correcte' }] } });

      expect(res.status).toBe(200);
      expect(mockProfileFindOne).toHaveBeenCalledWith({ roleProfile: 'qa' });
      const [, update] = mockReviewFindOneAndUpdate.mock.calls[0];
      // Le profil n'a pas changé : pas besoin de le réécrire.
      expect(update.$set.generalAssessmentRoleProfile).toBeUndefined();
    });

    it('200 mémorise le profil de poste seul, sans sous-critère à résoudre', async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(makeReviewDoc({ team: TEAM_A_ID }));
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockReviewFindOneAndUpdate.mockResolvedValue(
        makeReviewDoc({ team: TEAM_A_ID, generalAssessmentRoleProfile: 'dba' })
      );

      const res = await request(app).patch(url).send({ roleProfile: 'dba', axes: {} });

      expect(res.status).toBe(200);
      expect(mockProfileFindOne).not.toHaveBeenCalled();
      const [, update] = mockReviewFindOneAndUpdate.mock.calls[0];
      expect(update.$set.generalAssessmentRoleProfile).toBe('dba');
    });

    it("200 remplace les sous-critères de l'axe fourni sans toucher aux autres axes déjà renseignés, ni à generalSelfAssessment", async () => {
      const existing = makeReviewDoc({
        team: TEAM_A_ID,
        generalSelfAssessment: {
          axes: { technique: [{ label: 'Qualité du code & revues', score: 2 }], impact: [], collaboration: [], leadership: [] }
        },
        generalManagerAssessment: {
          axes: {
            technique: [{ label: 'Ancien critère', score: 3 }],
            impact: [{ label: 'Livraison (delivery)', score: 4 }],
            collaboration: [],
            leadership: []
          }
        }
      });
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(existing);
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockProfileFindOne.mockResolvedValue(referentialProfileFixture());
      mockReviewFindOneAndUpdate.mockResolvedValue(makeReviewDoc({ team: TEAM_A_ID }));

      const res = await request(app).patch(url).send(validPayload);

      expect(res.status).toBe(200);
      const [, update] = mockReviewFindOneAndUpdate.mock.calls[0];
      expect(update.$set.generalManagerAssessment.axes.technique).toEqual([
        { label: 'Qualité du code & revues', score: 4, answer: 'Réponse correcte' }
      ]);
      expect(update.$set.generalManagerAssessment.axes.impact).toEqual([
        { label: 'Livraison (delivery)', score: 4 }
      ]);
      expect(update.$set.generalSelfAssessment).toBeUndefined();
    });

    it('409 si la fiche a été modifiée en même temps (verrou optimiste épuisé)', async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(makeReviewDoc({ team: TEAM_A_ID }));
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockProfileFindOne.mockResolvedValue(referentialProfileFixture());
      mockReviewFindOneAndUpdate.mockResolvedValue(null);

      const res = await request(app).patch(url).send(validPayload);

      expect(res.status).toBe(409);
      expect(mockReviewFindOneAndUpdate).toHaveBeenCalledTimes(5);
    });
  });

  describe('GET /general-assessment-referential', () => {
    const url = '/api/performance/general-assessment-referential';

    it('200 liste les profils triés et sérialisés', async () => {
      const stored = [
        {
          roleProfile: 'dev_back',
          label: 'Développeur Back',
          axes: { technique: [], impact: [], collaboration: [], leadership: [] },
          updatedBy: { id: TEST_USER_ID, name: 'admin' },
          updatedAt: new Date('2026-09-01')
        }
      ];
      mockProfileFind.mockReturnValue({ sort: jest.fn().mockResolvedValue(stored) });

      const res = await request(app).get(url);

      expect(res.status).toBe(200);
      expect(res.body.profiles).toEqual([
        expect.objectContaining({ roleProfile: 'dev_back', label: 'Développeur Back' })
      ]);
    });

    it("200 renvoie une liste vide si aucun profil n'a encore été enregistré", async () => {
      mockProfileFind.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });

      const res = await request(app).get(url);

      expect(res.status).toBe(200);
      expect(res.body.profiles).toEqual([]);
    });
  });

  describe('PUT /general-assessment-referential/:roleProfile', () => {
    const url = '/api/performance/general-assessment-referential/dev_back';
    const emptyAxes = { technique: [], impact: [], collaboration: [], leadership: [] };
    const validPayload = { label: 'Développeur Back', axes: emptyAxes };

    it("403 si l'acteur n'a pas d'accès global", async () => {
      const res = await request(app).put(url).send(validPayload);
      expect(res.status).toBe(403);
      expect(mockProfileFindOneAndUpdate).not.toHaveBeenCalled();
    });

    it('400 si le profil de poste est inconnu', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });

      const res = await request(app)
        .put('/api/performance/general-assessment-referential/product_owner')
        .send(validPayload);

      expect(res.status).toBe(400);
      expect(mockProfileFindOneAndUpdate).not.toHaveBeenCalled();
    });

    it('400 si le label est manquant', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });

      const res = await request(app).put(url).send({ axes: emptyAxes });

      expect(res.status).toBe(400);
      expect(mockProfileFindOneAndUpdate).not.toHaveBeenCalled();
    });

    it('400 si les axes sont invalides (axe manquant)', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      const { leadership: _leadership, ...incompleteAxes } = emptyAxes;

      const res = await request(app)
        .put(url)
        .send({ label: 'Développeur Back', axes: incompleteAxes });

      expect(res.status).toBe(400);
      expect(mockProfileFindOneAndUpdate).not.toHaveBeenCalled();
    });

    it('200 crée ou met à jour le profil (upsert) et renvoie le profil sérialisé', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockProfileFindOneAndUpdate.mockResolvedValue({
        roleProfile: 'dev_back',
        label: 'Développeur Back',
        axes: emptyAxes,
        updatedBy: { id: TEST_USER_ID, name: 'admin' },
        updatedAt: new Date('2026-09-01')
      });

      const res = await request(app).put(url).send(validPayload);

      expect(res.status).toBe(200);
      expect(res.body.profile).toEqual(
        expect.objectContaining({ roleProfile: 'dev_back', label: 'Développeur Back' })
      );
      expect(mockProfileFindOneAndUpdate).toHaveBeenCalledWith(
        { roleProfile: 'dev_back' },
        expect.objectContaining({
          $set: expect.objectContaining({ label: 'Développeur Back', axes: emptyAxes })
        }),
        expect.objectContaining({ new: true, upsert: true, runValidators: true })
      );
    });
  });

  describe('PATCH /reviews/:userId/manager-assessment', () => {
    const url = `/api/performance/reviews/${TARGET_USER_ID}/manager-assessment`;
    const payload = { objectives: [{ id: 'obj-1', status: 'atteint', comment: 'Bien joué' }] };

    it('404 si aucun cycle actif', async () => {
      mockCycleFindOne.mockResolvedValue(null);
      const res = await request(app).patch(url).send(payload);
      expect(res.status).toBe(404);
    });

    it('403 si le cycle ciblé est clos', async () => {
      mockCycleFindById.mockResolvedValue(CLOSED_CYCLE);
      const res = await request(app).patch(url).send({ ...payload, cycleId: VALID_CYCLE_OBJECT_ID });
      expect(res.status).toBe(403);
    });

    it("404 si aucune fiche n'existe pour ce cycle", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(null);
      const res = await request(app).patch(url).send(payload);
      expect(res.status).toBe(404);
    });

    it("403 si l'acteur n'a pas accès à l'équipe de la fiche", async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(makeReviewDoc({ team: TEAM_B_ID, objectives: [objectiveFixture()] }));
      mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(actorLean()) }) });
      mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ _id: TEAM_A_ID }]) }) });

      const res = await request(app).patch(url).send(payload);
      expect(res.status).toBe(403);
    });

    it('200 applique l\'évaluation manager et passe la fiche à "complete" (tous objectifs évalués)', async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(
        makeReviewDoc({ team: TEAM_A_ID, objectives: [objectiveFixture()], status: 'en_cours' })
      );
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockReviewFindOneAndUpdate.mockResolvedValue(
        makeReviewDoc({
          team: TEAM_A_ID,
          status: 'complete',
          objectives: [objectiveFixture({ managerAssessment: { status: 'atteint', comment: 'Bien joué' } })]
        })
      );

      const res = await request(app).patch(url).send(payload);

      expect(res.status).toBe(200);
      const [, update] = mockReviewFindOneAndUpdate.mock.calls[0];
      expect(update.$set.status).toBe('complete');
      expect(update.$set.objectives[0].managerAssessment).toEqual({ status: 'atteint', comment: 'Bien joué' });
    });

    it('409 si la fiche a été modifiée en même temps (verrou optimiste épuisé)', async () => {
      mockCycleFindOne.mockResolvedValue(ACTIVE_CYCLE);
      mockReviewFindOne.mockResolvedValue(makeReviewDoc({ team: TEAM_A_ID, objectives: [objectiveFixture()] }));
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockReviewFindOneAndUpdate.mockResolvedValue(null);

      const res = await request(app).patch(url).send(payload);

      expect(res.status).toBe(409);
      expect(mockReviewFindOneAndUpdate).toHaveBeenCalledTimes(5);
    });
  });
});
