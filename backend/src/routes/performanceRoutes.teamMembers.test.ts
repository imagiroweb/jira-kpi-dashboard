/**
 * TI — GET /api/performance/team-members : complète la liste des fiches
 * (GET /reviews) avec les collaborateurs de l'équipe qui n'ont pas encore de
 * fiche ouverte pour le cycle courant.
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';

const mockUserFindById = jest.fn();
const mockUserFind = jest.fn();
const mockRoleFindById = jest.fn();
const mockTeamFind = jest.fn();

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

jest.mock('../middleware/authMiddleware', () => {
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>('../test/mocks/authMiddleware');
  return { authenticate: auth.mockAuthenticate() };
});

jest.mock('../utils/logger', () => jest.requireActual('../test/mocks/logger').loggerMockFactory());

import { performanceRoutes } from './performanceRoutes';

const TEAM_A_ID = '507f1f77bcf86cd799439a01';
const TEAM_B_ID = '507f1f77bcf86cd799439b02';

/** Valeur "lean" de l'acteur authentifié (User.findById(...).select().lean()). */
function actorLean(overrides: Record<string, unknown> = {}) {
  return { role: null, roleId: null, ...overrides };
}

function memberDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: '507f1f77bcf86cd799439c01',
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alice@test.com',
    teamId: TEAM_A_ID,
    ...overrides
  };
}

function userFindChain(result: unknown[]) {
  return { select: () => ({ sort: () => Promise.resolve(result) }) };
}

describe('GET /api/performance/team-members', () => {
  const app = createTestApp({ mountPath: '/api/performance', router: performanceRoutes });

  beforeEach(() => {
    jest.clearAllMocks();
    mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
    mockRoleFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    mockUserFind.mockReturnValue(userFindChain([]));
  });

  it("404 si l'utilisateur authentifié n'existe plus", async () => {
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });

    const res = await request(app).get('/api/performance/team-members');
    expect(res.status).toBe(404);
  });

  it("403 si ni accès global, ni lead d'aucune équipe", async () => {
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(actorLean()) }) });

    const res = await request(app).get('/api/performance/team-members');
    expect(res.status).toBe(403);
  });

  it('400 si teamId fourni est un identifiant invalide', async () => {
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
    });

    const res = await request(app).get('/api/performance/team-members?teamId=not-an-id');
    expect(res.status).toBe(400);
  });

  it("403 si un lead demande une équipe qu'il ne dirige pas", async () => {
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(actorLean()) }) });
    mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ _id: TEAM_A_ID }]) }) });

    const res = await request(app).get(`/api/performance/team-members?teamId=${TEAM_B_ID}`);
    expect(res.status).toBe(403);
  });

  it('200 pour le CTO/super_admin sans teamId : filtre sur les comptes actifs rattachés à une équipe', async () => {
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
    });
    mockUserFind.mockReturnValue(userFindChain([memberDoc()]));

    const res = await request(app).get('/api/performance/team-members');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.members).toEqual([
      { id: '507f1f77bcf86cd799439c01', firstName: 'Alice', lastName: 'Martin', email: 'alice@test.com', teamId: TEAM_A_ID }
    ]);
    expect(mockUserFind).toHaveBeenCalledWith({ isActive: true, teamId: { $ne: null } });
  });

  it('200 pour le CTO/super_admin avec teamId : filtre sur cette équipe précise', async () => {
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(actorLean({ role: 'super_admin' })) })
    });
    mockUserFind.mockReturnValue(userFindChain([memberDoc()]));

    const res = await request(app).get(`/api/performance/team-members?teamId=${TEAM_A_ID}`);
    expect(res.status).toBe(200);
    expect(mockUserFind).toHaveBeenCalledWith({ isActive: true, teamId: TEAM_A_ID });
  });

  it('200 pour un lead sans teamId : filtre sur ses équipes dirigées', async () => {
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(actorLean()) }) });
    mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ _id: TEAM_A_ID }]) }) });
    mockUserFind.mockReturnValue(userFindChain([memberDoc()]));

    const res = await request(app).get('/api/performance/team-members');
    expect(res.status).toBe(200);
    expect(mockUserFind).toHaveBeenCalledWith({ isActive: true, teamId: { $in: [TEAM_A_ID] } });
  });

  it("200 pour un lead avec teamId dans son périmètre", async () => {
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(actorLean()) }) });
    mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ _id: TEAM_A_ID }]) }) });
    mockUserFind.mockReturnValue(userFindChain([memberDoc()]));

    const res = await request(app).get(`/api/performance/team-members?teamId=${TEAM_A_ID}`);
    expect(res.status).toBe(200);
    expect(mockUserFind).toHaveBeenCalledWith({ isActive: true, teamId: TEAM_A_ID });
  });
});
