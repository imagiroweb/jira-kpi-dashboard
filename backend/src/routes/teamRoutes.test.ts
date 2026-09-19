/**
 * TI — Routes équipes : liste, création, renommage, rattachement de collaborateur, délégation
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import { TEST_USER_ID } from '../test/fixtures/users';

const mockTeamFind = jest.fn();
const mockTeamFindOne = jest.fn();
const mockTeamFindById = jest.fn();
const mockTeamCreate = jest.fn();
const mockUserFindById = jest.fn();
const mockUserFind = jest.fn();
const mockRoleFindById = jest.fn();

jest.mock('../domain/team/entities/Team', () => ({
  Team: {
    find: (...args: unknown[]) => mockTeamFind(...args),
    findOne: (...args: unknown[]) => mockTeamFindOne(...args),
    findById: (...args: unknown[]) => mockTeamFindById(...args),
    create: (...args: unknown[]) => mockTeamCreate(...args)
  }
}));

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

jest.mock('../middleware/authMiddleware', () => {
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>('../test/mocks/authMiddleware');
  return { authenticate: auth.mockAuthenticate() };
});

jest.mock('../utils/logger', () => jest.requireActual('../test/mocks/logger').loggerMockFactory());

import { teamRoutes } from './teamRoutes';

const TARGET_USER_ID = '507f1f77bcf86cd799439099';
const TEAM_A_ID = '507f1f77bcf86cd799439a01';
const TEAM_B_ID = '507f1f77bcf86cd799439b02';

/** Valeur "lean" renvoyée pour l'acteur authentifié (chaîne .select().lean()). */
function actorLean(overrides: Record<string, unknown> = {}) {
  return { role: null, roleId: null, canManageTeamAssignment: false, ...overrides };
}

interface MockUserDoc {
  _id: string;
  teamId: string | { toString(): string } | null;
  canManageTeamAssignment: boolean;
  save: jest.Mock;
}

/** Document mocké pour l'utilisateur ciblé (récupéré sans .select(), avec .save()). */
function userDoc(overrides: Partial<MockUserDoc> = {}): MockUserDoc {
  return {
    _id: TARGET_USER_ID,
    teamId: null,
    canManageTeamAssignment: false,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe('teamRoutes (TI)', () => {
  const app = createTestApp({ mountPath: '/api/teams', router: teamRoutes });

  beforeEach(() => {
    jest.clearAllMocks();
    // Par défaut : acteur = simple collaborateur, aucune équipe dirigée.
    mockUserFindById.mockImplementation((id: string) => {
      if (id === TEST_USER_ID) {
        return { select: () => ({ lean: () => Promise.resolve(actorLean()) }) };
      }
      return userDoc({ _id: id });
    });
    mockTeamFind.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve([]) }),
      sort: () => Promise.resolve([])
    });
    mockTeamFindOne.mockResolvedValue(null);
    mockUserFind.mockReturnValue({
      select: () => ({ sort: () => Promise.resolve([]) })
    });
  });

  describe('GET /', () => {
    it('200 renvoie la liste des équipes triées', async () => {
      mockTeamFind.mockReturnValue({
        sort: () =>
          Promise.resolve([
            { _id: TEAM_A_ID, name: 'Choco', leadIds: [], createdAt: new Date(), updatedAt: new Date() }
          ])
      });

      const res = await request(app).get('/api/teams');

      expect(res.status).toBe(200);
      expect(res.body.teams).toHaveLength(1);
      expect(res.body.teams[0].name).toBe('Choco');
    });
  });

  describe('GET /roster', () => {
    it("403 si l'acteur n'a pas d'accès global", async () => {
      const res = await request(app).get('/api/teams/roster');
      expect(res.status).toBe(403);
      expect(mockUserFind).not.toHaveBeenCalled();
    });

    it('200 renvoie tous les collaborateurs actifs, y compris sans équipe (acteur super_admin)', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockUserFind.mockReturnValue({
        select: () => ({
          sort: () =>
            Promise.resolve([
              { _id: TARGET_USER_ID, firstName: 'Bob', lastName: 'Dupont', email: 'bob@test.com', teamId: null },
              { _id: TEST_USER_ID, firstName: 'Alice', lastName: 'Martin', email: 'alice@test.com', teamId: TEAM_A_ID }
            ])
        })
      });

      const res = await request(app).get('/api/teams/roster');

      expect(res.status).toBe(200);
      expect(mockUserFind).toHaveBeenCalledWith({ isActive: true });
      expect(res.body.users).toEqual([
        { id: TARGET_USER_ID, firstName: 'Bob', lastName: 'Dupont', email: 'bob@test.com', teamId: null },
        { id: TEST_USER_ID, firstName: 'Alice', lastName: 'Martin', email: 'alice@test.com', teamId: TEAM_A_ID }
      ]);
    });

    it('200 pour un CTO avec accès global délégué via un rôle (performanceGlobalAccess)', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ roleId: 'role-1' })) })
      });
      mockRoleFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve({ performanceGlobalAccess: true }) })
      });
      mockUserFind.mockReturnValue({
        select: () => ({ sort: () => Promise.resolve([]) })
      });

      const res = await request(app).get('/api/teams/roster');

      expect(res.status).toBe(200);
      expect(res.body.users).toEqual([]);
    });
  });

  describe('POST /', () => {
    it("403 si l'acteur n'a pas d'accès global", async () => {
      const res = await request(app).post('/api/teams').send({ name: 'Choco' });
      expect(res.status).toBe(403);
      expect(mockTeamCreate).not.toHaveBeenCalled();
    });

    it('400 si le nom est manquant (acteur super_admin)', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      const res = await request(app).post('/api/teams').send({});
      expect(res.status).toBe(400);
    });

    it('400 si une équipe du même nom existe déjà', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockTeamFindOne.mockResolvedValue({ _id: TEAM_A_ID, name: 'Choco' });

      const res = await request(app).post('/api/teams').send({ name: 'Choco' });

      expect(res.status).toBe(400);
      expect(mockTeamCreate).not.toHaveBeenCalled();
    });

    it('201 crée une équipe (acteur super_admin)', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockTeamCreate.mockResolvedValue({
        _id: TEAM_A_ID,
        name: 'Choco',
        leadIds: [],
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const res = await request(app).post('/api/teams').send({ name: 'Choco' });

      expect(res.status).toBe(201);
      expect(mockTeamCreate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Choco', leadIds: [] }));
    });

    it('201 crée une équipe avec accès global délégué via un rôle (performanceGlobalAccess)', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ roleId: 'role-1' })) })
      });
      mockRoleFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve({ performanceGlobalAccess: true }) })
      });
      mockTeamCreate.mockResolvedValue({
        _id: TEAM_A_ID,
        name: 'QA',
        leadIds: [],
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const res = await request(app).post('/api/teams').send({ name: 'QA' });

      expect(res.status).toBe(201);
    });
  });

  describe('PATCH /:id', () => {
    it("403 si l'acteur n'a pas d'accès global", async () => {
      const res = await request(app).patch(`/api/teams/${TEAM_A_ID}`).send({ name: 'Nouveau nom' });
      expect(res.status).toBe(403);
    });

    it('404 si l\'équipe est introuvable', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      mockTeamFindById.mockResolvedValue(null);

      const res = await request(app).patch(`/api/teams/${TEAM_A_ID}`).send({ name: 'Nouveau nom' });
      expect(res.status).toBe(404);
    });

    it('200 renomme et met à jour les leads', async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      const team = {
        _id: TEAM_A_ID,
        name: 'Choco',
        leadIds: [],
        save: jest.fn().mockResolvedValue(undefined)
      };
      mockTeamFindById.mockResolvedValue(team);

      const res = await request(app)
        .patch(`/api/teams/${TEAM_A_ID}`)
        .send({ name: 'Choco 2.0', leadIds: [TARGET_USER_ID] });

      expect(res.status).toBe(200);
      expect(team.name).toBe('Choco 2.0');
      expect(team.leadIds).toEqual([TARGET_USER_ID]);
      expect(team.save).toHaveBeenCalled();
    });
  });

  describe('PATCH /members/:userId', () => {
    const url = `/api/teams/members/${TARGET_USER_ID}`;

    it("400 si teamId n'est pas un ObjectId valide", async () => {
      const res = await request(app).patch(url).send({ teamId: 'not-an-id' });
      expect(res.status).toBe(400);
    });

    it('404 si le collaborateur ciblé est introuvable', async () => {
      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) {
          return { select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) }) };
        }
        return null;
      });

      const res = await request(app).patch(url).send({ teamId: TEAM_A_ID });
      expect(res.status).toBe(404);
    });

    it("404 si l'équipe demandée est introuvable", async () => {
      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) {
          return { select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) }) };
        }
        return userDoc();
      });
      mockTeamFindById.mockResolvedValue(null);

      const res = await request(app).patch(url).send({ teamId: TEAM_A_ID });
      expect(res.status).toBe(404);
    });

    it('403 si le collaborateur authentifié ne dispose ni de la délégation, ni d\'un accès global', async () => {
      mockTeamFindById.mockResolvedValue({ _id: TEAM_A_ID, name: 'Choco' });

      const res = await request(app).patch(url).send({ teamId: TEAM_A_ID });

      expect(res.status).toBe(403);
      const target = userDoc();
      expect(target.save).not.toHaveBeenCalled();
    });

    it('403 si un lead avec délégation tente de détacher un collaborateur (teamId null)', async () => {
      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) {
          return {
            select: () => ({ lean: () => Promise.resolve(actorLean({ canManageTeamAssignment: true })) })
          };
        }
        return userDoc();
      });
      mockTeamFindOne.mockResolvedValue({ _id: TEAM_A_ID, leadIds: [TEST_USER_ID] }); // isLeadOfAnyTeam(target) -> false attendu, mais on force le find pour leadTeamIds

      const res = await request(app).patch(url).send({ teamId: null });
      expect(res.status).toBe(403);
    });

    it("403 si un lead avec délégation tente de rattacher à une équipe qu'il ne dirige pas", async () => {
      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) {
          return {
            select: () => ({ lean: () => Promise.resolve(actorLean({ canManageTeamAssignment: true })) })
          };
        }
        return userDoc();
      });
      // L'acteur ne dirige aucune équipe (leadTeamIds vide) : Team.find({leadIds: actorId}) -> []
      mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
      mockTeamFindById.mockResolvedValue({ _id: TEAM_B_ID, name: 'Autre équipe' });
      mockTeamFindOne.mockResolvedValue(null); // target non-lead

      const res = await request(app).patch(url).send({ teamId: TEAM_B_ID });
      expect(res.status).toBe(403);
    });

    it('200 un lead avec délégation rattache un collaborateur (non-lead) à sa propre équipe', async () => {
      const target = userDoc();
      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) {
          return {
            select: () => ({ lean: () => Promise.resolve(actorLean({ canManageTeamAssignment: true })) })
          };
        }
        return target;
      });
      mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ _id: TEAM_A_ID }]) }) });
      mockTeamFindById.mockResolvedValue({ _id: TEAM_A_ID, name: 'Choco' });
      mockTeamFindOne.mockResolvedValue(null); // target n'est lead d'aucune équipe

      const res = await request(app).patch(url).send({ teamId: TEAM_A_ID });

      expect(res.status).toBe(200);
      expect(target.save).toHaveBeenCalled();
      expect(target.teamId?.toString()).toBe(TEAM_A_ID);
    });

    it('200 le CTO/super_admin peut détacher un collaborateur (teamId null)', async () => {
      const target = userDoc({ teamId: TEAM_A_ID });
      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) {
          return { select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) }) };
        }
        return target;
      });

      const res = await request(app).patch(url).send({ teamId: null });

      expect(res.status).toBe(200);
      expect(target.save).toHaveBeenCalled();
      expect(res.body.user.teamId).toBeNull();
    });
  });

  describe('PATCH /members/:userId/delegation', () => {
    const url = `/api/teams/members/${TARGET_USER_ID}/delegation`;

    it("403 si l'acteur n'a pas d'accès global", async () => {
      const res = await request(app).patch(url).send({ canManageTeamAssignment: true });
      expect(res.status).toBe(403);
    });

    it("400 si canManageTeamAssignment n'est pas un booléen", async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
      });
      const res = await request(app).patch(url).send({ canManageTeamAssignment: 'oui' });
      expect(res.status).toBe(400);
    });

    it('404 si le collaborateur ciblé est introuvable', async () => {
      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) {
          return { select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) }) };
        }
        return null;
      });

      const res = await request(app).patch(url).send({ canManageTeamAssignment: true });
      expect(res.status).toBe(404);
    });

    it('200 octroie la délégation à un lead', async () => {
      const target = userDoc({ canManageTeamAssignment: false });
      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) {
          return { select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) }) };
        }
        return target;
      });

      const res = await request(app).patch(url).send({ canManageTeamAssignment: true });

      expect(res.status).toBe(200);
      expect(target.canManageTeamAssignment).toBe(true);
      expect(target.save).toHaveBeenCalled();
    });
  });
});
