/**
 * TI — Routes auth (admin) : users, roles (super_admin)
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import { TEST_USER_ID } from '../test/fixtures/users';

const mockBuildUserWithPermissions = jest.fn();
const mockUserFindById = jest.fn();
const mockUserFind = jest.fn();
const mockRoleFind = jest.fn();
const mockRoleFindById = jest.fn();
const mockRoleFindOne = jest.fn();
const mockRoleCreate = jest.fn();

const defaultPageVisibilities = {
  dashboard: true,
  users: true,
  support: true,
  epics: true,
  marketing: true,
  produit: true,
  gestionUtilisateurs: false,
};

let isSuperAdmin = true;

jest.mock('mongoose', () =>
  jest.requireActual('../test/mocks/mongoose').mockMongoConnected()
);

jest.mock('../application/services/AuthService', () => ({
  authService: {
    buildUserWithPermissions: (...args: unknown[]) => mockBuildUserWithPermissions(...args),
    register: jest.fn(),
    login: jest.fn(),
    validatePassword: jest.fn(),
    getUserById: jest.fn(),
    setMyRole: jest.fn(),
    handleMicrosoftSSO: jest.fn(),
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
    verifyToken: jest.fn(),
    generateToken: jest.fn(),
  },
}));

jest.mock('../middleware/authMiddleware', () => {
  const actual = jest.requireActual('../middleware/authMiddleware');
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>('../test/mocks/authMiddleware');
  return {
    authenticate: auth.mockAuthenticate(),
    requireSuperAdmin: actual.requireSuperAdmin,
  };
});

jest.mock('../domain/user/entities/User', () => ({
  User: {
    findById: (...args: unknown[]) => mockUserFindById(...args),
    find: (...args: unknown[]) => mockUserFind(...args),
    findOne: jest.fn(),
  },
}));

jest.mock('../domain/user/entities/Role', () => ({
  Role: {
    find: (...args: unknown[]) => mockRoleFind(...args),
    findById: (...args: unknown[]) => mockRoleFindById(...args),
    findOne: (...args: unknown[]) => mockRoleFindOne(...args),
    create: (...args: unknown[]) => mockRoleCreate(...args),
  },
  PAGE_IDS: ['dashboard', 'users', 'support', 'epics', 'marketing', 'produit', 'gestionUtilisateurs'],
}));

jest.mock('../domain/user/entities/UserActivityLog', () => ({
  UserActivityLog: {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    find: jest.fn().mockReturnValue({
      sort: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }),
      lean: () => Promise.resolve([]),
    }),
  },
}));

jest.mock('../utils/logger', () =>
  jest.requireActual('../test/mocks/logger').loggerMockFactory()
);

import { authRoutes } from './authRoutes';

describe('authRoutes — admin (TI)', () => {
  const app = createTestApp({ mountPath: '/api/auth', router: authRoutes });

  const targetUserId = '507f1f77bcf86cd799439099';
  const roleId = '507f1f77bcf86cd799439022';

  beforeEach(() => {
    jest.clearAllMocks();
    isSuperAdmin = true;

    mockUserFindById.mockImplementation((id: string) => {
      if (id === TEST_USER_ID) {
        return {
          select: () => ({
            lean: () =>
              Promise.resolve(isSuperAdmin ? { role: 'super_admin' } : { role: null }),
          }),
        };
      }
      return Promise.resolve(null);
    });

    mockUserFind.mockReturnValue({
      select: () => ({
        populate: () => ({
          lean: () =>
            Promise.resolve([
              {
                _id: { toString: () => targetUserId },
                email: 'member@test.com',
                firstName: 'Member',
                lastName: 'User',
                provider: 'local',
                isActive: true,
                roleId: { _id: { toString: () => roleId }, name: 'Développeur' },
              },
            ]),
        }),
      }),
    });

    mockRoleFind.mockReturnValue({
      lean: () =>
        Promise.resolve([
          {
            _id: { toString: () => roleId },
            name: 'Développeur',
            pageVisibilities: defaultPageVisibilities,
          },
        ]),
    });

    mockBuildUserWithPermissions.mockResolvedValue({
      id: targetUserId,
      email: 'member@test.com',
      firstName: 'Member',
      lastName: 'User',
      provider: 'local',
      role: null,
      roleName: 'Développeur',
      visiblePages: defaultPageVisibilities,
    });
  });

  describe('GET /api/auth/users', () => {
    it('retourne 200 avec users et roles pour un super_admin', async () => {
      const res = await request(app).get('/api/auth/users');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users[0]).toEqual(
        expect.objectContaining({
          id: targetUserId,
          email: 'member@test.com',
          roleName: 'Développeur',
        })
      );
      expect(Array.isArray(res.body.roles)).toBe(true);
      expect(res.body.roles[0]).toEqual(
        expect.objectContaining({ id: roleId, name: 'Développeur' })
      );
    });

    it('retourne 403 si l’utilisateur n’est pas super_admin', async () => {
      isSuperAdmin = false;

      const res = await request(app).get('/api/auth/users');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/super administrateurs/i);
      expect(mockUserFind).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/auth/users/:id', () => {
    it('retourne 404 si l’utilisateur cible n’existe pas', async () => {
      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) {
          return {
            select: () => ({ lean: () => Promise.resolve({ role: 'super_admin' }) }),
          };
        }
        return Promise.resolve(null);
      });

      const res = await request(app)
        .patch(`/api/auth/users/${targetUserId}`)
        .send({ role: 'super_admin' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('retourne 200 et promeut en super_admin', async () => {
      const userDoc = {
        role: undefined as string | undefined,
        roleId: roleId as string | undefined,
        save: jest.fn().mockResolvedValue(undefined),
      };

      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) {
          return {
            select: () => ({ lean: () => Promise.resolve({ role: 'super_admin' }) }),
          };
        }
        if (id === targetUserId) {
          return Promise.resolve(userDoc);
        }
        return Promise.resolve(null);
      });

      mockBuildUserWithPermissions.mockResolvedValue({
        id: targetUserId,
        email: 'member@test.com',
        provider: 'local',
        role: 'super_admin',
        roleName: 'Super admin',
        visiblePages: defaultPageVisibilities,
      });

      const res = await request(app)
        .patch(`/api/auth/users/${targetUserId}`)
        .send({ role: 'super_admin' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(userDoc.role).toBe('super_admin');
      expect(userDoc.roleId).toBeUndefined();
      expect(userDoc.save).toHaveBeenCalled();
      expect(res.body.user.role).toBe('super_admin');
    });

    it('retourne 200 et assigne un roleId', async () => {
      const userDoc = {
        role: 'super_admin' as string | undefined,
        roleId: undefined as string | undefined,
        save: jest.fn().mockResolvedValue(undefined),
      };

      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) {
          return {
            select: () => ({ lean: () => Promise.resolve({ role: 'super_admin' }) }),
          };
        }
        if (id === targetUserId) {
          return Promise.resolve(userDoc);
        }
        return Promise.resolve(null);
      });

      mockRoleFindById.mockResolvedValue({ _id: roleId, name: 'Développeur' });

      const res = await request(app)
        .patch(`/api/auth/users/${targetUserId}`)
        .send({ roleId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(userDoc.role).toBeUndefined();
      expect(userDoc.roleId).toBe(roleId);
      expect(userDoc.save).toHaveBeenCalled();
      expect(mockRoleFindById).toHaveBeenCalledWith(roleId);
    });

    it('retourne 400 si le roleId n’existe pas', async () => {
      const userDoc = {
        role: undefined as string | undefined,
        roleId: undefined as string | undefined,
        save: jest.fn(),
      };

      mockUserFindById.mockImplementation((id: string) => {
        if (id === TEST_USER_ID) {
          return {
            select: () => ({ lean: () => Promise.resolve({ role: 'super_admin' }) }),
          };
        }
        if (id === targetUserId) {
          return Promise.resolve(userDoc);
        }
        return Promise.resolve(null);
      });

      mockRoleFindById.mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/auth/users/${targetUserId}`)
        .send({ roleId: 'unknown-role' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Rôle non trouvé/i);
      expect(userDoc.save).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/auth/roles', () => {
    it('retourne 200 avec la liste des rôles et pageVisibilities', async () => {
      const res = await request(app).get('/api/auth/roles');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.roles).toEqual([
        expect.objectContaining({
          id: roleId,
          name: 'Développeur',
          pageVisibilities: defaultPageVisibilities,
        }),
      ]);
    });
  });

  describe('POST /api/auth/roles', () => {
    it('retourne 400 si pageVisibilities est invalide', async () => {
      const res = await request(app)
        .post('/api/auth/roles')
        .send({
          name: 'Marketing',
          pageVisibilities: { dashboard: true, users: 'yes' },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(mockRoleCreate).not.toHaveBeenCalled();
    });

    it('retourne 400 si un rôle avec ce nom existe déjà', async () => {
      mockRoleFindOne.mockResolvedValue({ _id: roleId, name: 'Développeur' });

      const res = await request(app)
        .post('/api/auth/roles')
        .send({ name: 'Développeur' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/existe déjà/i);
    });

    it('retourne 201 si le rôle est créé', async () => {
      mockRoleFindOne.mockResolvedValue(null);
      mockRoleCreate.mockResolvedValue({
        _id: { toString: () => 'new-role-id' },
        name: 'Support',
        pageVisibilities: defaultPageVisibilities,
      });

      const res = await request(app)
        .post('/api/auth/roles')
        .send({ name: 'Support', pageVisibilities: defaultPageVisibilities });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.role).toEqual(
        expect.objectContaining({
          id: 'new-role-id',
          name: 'Support',
          pageVisibilities: defaultPageVisibilities,
        })
      );
      expect(mockRoleCreate).toHaveBeenCalled();
    });
  });

  describe('PATCH /api/auth/roles/:id', () => {
    it('retourne 404 si le rôle n’existe pas', async () => {
      mockRoleFindById.mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/auth/roles/${roleId}`)
        .send({ name: 'Renommé' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('retourne 200 si le rôle est mis à jour', async () => {
      const roleDoc = {
        _id: { toString: () => roleId },
        name: 'Développeur',
        pageVisibilities: { ...defaultPageVisibilities },
        save: jest.fn().mockResolvedValue(undefined),
      };
      mockRoleFindById.mockResolvedValue(roleDoc);

      const updatedVisibilities = { ...defaultPageVisibilities, gestionUtilisateurs: true };

      const res = await request(app)
        .patch(`/api/auth/roles/${roleId}`)
        .send({ name: 'Dev senior', pageVisibilities: updatedVisibilities });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(roleDoc.name).toBe('Dev senior');
      expect(roleDoc.pageVisibilities).toEqual(updatedVisibilities);
      expect(roleDoc.save).toHaveBeenCalled();
      expect(res.body.role).toEqual(
        expect.objectContaining({ id: roleId, name: 'Dev senior' })
      );
    });
  });
});
