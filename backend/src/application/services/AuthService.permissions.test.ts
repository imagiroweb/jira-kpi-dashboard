/**
 * TU — AuthService.buildUserWithPermissions (via login) : performanceGlobalAccess,
 * teamId, leadTeamIds, canManageTeamAssignment renvoyés au frontend.
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const mockUserFindOne = jest.fn();
const mockRoleFindById = jest.fn();
const mockTeamFind = jest.fn();
const mockLogFindOne = jest.fn();
const mockLogCreate = jest.fn();

jest.mock('../../domain/user/entities/User', () => ({
  User: {
    findOne: (...args: unknown[]) => mockUserFindOne(...args),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOneAndUpdate: jest.fn(),
    create: jest.fn()
  }
}));

jest.mock('../../domain/user/entities/Role', () => ({
  Role: {
    findOne: jest.fn(),
    findById: (...args: unknown[]) => mockRoleFindById(...args)
  },
  PAGE_IDS: ['dashboard', 'users', 'support', 'epics', 'marketing', 'produit', 'gestionUtilisateurs']
}));

jest.mock('../../domain/team/entities/Team', () => ({
  Team: {
    find: (...args: unknown[]) => mockTeamFind(...args)
  }
}));

jest.mock('../../domain/user/entities/UserActivityLog', () => ({
  UserActivityLog: {
    findOne: (...args: unknown[]) => mockLogFindOne(...args),
    create: (...args: unknown[]) => mockLogCreate(...args)
  }
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

import { AuthService } from './AuthService';

const TEAM_A_ID = new mongoose.Types.ObjectId();

async function baseUser(overrides: Record<string, unknown> = {}) {
  const hashedPassword = await bcrypt.hash('ValidPass123!', 12);
  return {
    _id: new mongoose.Types.ObjectId(),
    email: 'collaborateur@test.com',
    password: hashedPassword,
    isActive: true,
    provider: 'local',
    role: undefined,
    roleId: undefined,
    teamId: undefined,
    canManageTeamAssignment: false,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe('AuthService — champs de portée Performance renvoyés au login', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService();
    mockLogFindOne.mockResolvedValue(null);
    mockLogCreate.mockResolvedValue({});
    mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
  });

  it('un simple collaborateur reçoit des valeurs par défaut neutres', async () => {
    mockUserFindOne.mockResolvedValue(await baseUser());

    const result = await service.login('collaborateur@test.com', 'ValidPass123!');

    expect(result.user?.performanceGlobalAccess).toBe(false);
    expect(result.user?.teamId).toBeNull();
    expect(result.user?.leadTeamIds).toEqual([]);
    expect(result.user?.canManageTeamAssignment).toBe(false);
  });

  it('super_admin a toujours performanceGlobalAccess', async () => {
    mockUserFindOne.mockResolvedValue(await baseUser({ role: 'super_admin' }));

    const result = await service.login('collaborateur@test.com', 'ValidPass123!');

    expect(result.user?.performanceGlobalAccess).toBe(true);
  });

  it("un rôle avec performanceGlobalAccess donne l'accès global (CTO)", async () => {
    const roleId = new mongoose.Types.ObjectId();
    mockUserFindOne.mockResolvedValue(await baseUser({ roleId }));
    mockRoleFindById.mockReturnValue({
      name: 'CTO',
      performanceGlobalAccess: true,
      lean: () => Promise.resolve({ name: 'CTO', performanceGlobalAccess: true })
    });

    const result = await service.login('collaborateur@test.com', 'ValidPass123!');

    expect(result.user?.performanceGlobalAccess).toBe(true);
    expect(result.user?.roleName).toBe('CTO');
  });

  it("un rôle sans performanceGlobalAccess ne donne pas l'accès global", async () => {
    const roleId = new mongoose.Types.ObjectId();
    mockUserFindOne.mockResolvedValue(await baseUser({ roleId }));
    mockRoleFindById.mockReturnValue({
      name: 'Dev',
      performanceGlobalAccess: false,
      lean: () => Promise.resolve({ name: 'Dev', performanceGlobalAccess: false })
    });

    const result = await service.login('collaborateur@test.com', 'ValidPass123!');

    expect(result.user?.performanceGlobalAccess).toBe(false);
  });

  it('renvoie les équipes dirigées (leadTeamIds) pour un lead', async () => {
    mockUserFindOne.mockResolvedValue(await baseUser());
    mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ _id: TEAM_A_ID }]) }) });

    const result = await service.login('collaborateur@test.com', 'ValidPass123!');

    expect(result.user?.leadTeamIds).toEqual([TEAM_A_ID.toString()]);
  });

  it("renvoie l'équipe actuelle (teamId) et la délégation canManageTeamAssignment", async () => {
    mockUserFindOne.mockResolvedValue(
      await baseUser({ teamId: TEAM_A_ID, canManageTeamAssignment: true })
    );

    const result = await service.login('collaborateur@test.com', 'ValidPass123!');

    expect(result.user?.teamId).toBe(TEAM_A_ID.toString());
    expect(result.user?.canManageTeamAssignment).toBe(true);
  });
});
