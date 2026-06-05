/**
 * TI — Routes auth (core) : register, login, validate-password, roles/for-signup, me, verify, requireMongo
 */
import request from 'supertest';
import { Request } from 'express';
import { createTestApp } from '../test/createTestApp';
import { TEST_USER, TEST_USER_ID } from '../test/fixtures/users';

const mockRegister = jest.fn();
const mockLogin = jest.fn();
const mockValidatePassword = jest.fn();
const mockGetUserById = jest.fn();
const mockBuildUserWithPermissions = jest.fn();
const mockSetMyRole = jest.fn();

const mockRoleFind = jest.fn();

let mongoReadyState = 1;

jest.mock('mongoose', () => {
  const actual = jest.requireActual('../test/mocks/mongoose').mockMongoConnected();
  return {
    ...actual,
    connection: {
      get readyState() {
        return mongoReadyState;
      },
    },
  };
});

jest.mock('express-rate-limit', () =>
  () => (_req: Request, _res: unknown, next: () => void) => next()
);

jest.mock('../application/services/AuthService', () => ({
  authService: {
    register: (...args: unknown[]) => mockRegister(...args),
    login: (...args: unknown[]) => mockLogin(...args),
    validatePassword: (...args: unknown[]) => mockValidatePassword(...args),
    getUserById: (...args: unknown[]) => mockGetUserById(...args),
    buildUserWithPermissions: (...args: unknown[]) => mockBuildUserWithPermissions(...args),
    setMyRole: (...args: unknown[]) => mockSetMyRole(...args),
    handleMicrosoftSSO: jest.fn(),
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
    verifyToken: jest.fn(),
    generateToken: jest.fn(),
  },
}));

jest.mock('../middleware/authMiddleware', () => {
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>('../test/mocks/authMiddleware');
  return {
    authenticate: auth.mockAuthenticate(),
    requireSuperAdmin: auth.mockRequireSuperAdmin,
  };
});

jest.mock('../domain/user/entities/User', () => ({
  User: {
    findById: jest.fn().mockResolvedValue({ role: 'super_admin' }),
    findOne: jest.fn(),
    find: jest.fn().mockReturnValue({
      select: () => ({ populate: () => ({ lean: () => Promise.resolve([]) }) }),
    }),
  },
}));

jest.mock('../domain/user/entities/Role', () => ({
  Role: {
    get find() {
      return mockRoleFind;
    },
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
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

describe('authRoutes — core (TI)', () => {
  const app = createTestApp({ mountPath: '/api/auth', router: authRoutes });

  const defaultUserWithPerms = {
    id: TEST_USER_ID,
    email: TEST_USER.email,
    firstName: 'Admin',
    lastName: 'Test',
    provider: 'local',
    role: 'super_admin' as const,
    roleName: 'Super admin',
    visiblePages: {
      dashboard: true,
      users: true,
      support: true,
      epics: true,
      marketing: true,
      produit: true,
      gestionUtilisateurs: true,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mongoReadyState = 1;

    mockRoleFind.mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve([
            { _id: { toString: () => 'role1' }, name: 'Développeur' },
            { _id: { toString: () => 'role2' }, name: 'Product' },
          ]),
      }),
    });

    mockValidatePassword.mockReturnValue({
      isValid: true,
      errors: [],
      strength: 'strong',
      score: 75,
    });
  });

  describe('POST /api/auth/register', () => {
    it('retourne 400 si la validation échoue (email ou mot de passe invalide)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'invalid', password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('retourne 201 avec token et user si inscription réussie', async () => {
      mockRegister.mockResolvedValue({
        success: true,
        token: 'jwt-token',
        user: { id: TEST_USER_ID, email: 'new@test.com' },
        firstLogin: true,
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'new@test.com',
          password: 'MonMotDePasse123!',
          firstName: 'New',
          lastName: 'User',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBe('jwt-token');
      expect(res.body.user).toEqual({ id: TEST_USER_ID, email: 'new@test.com' });
      expect(res.body.firstLogin).toBe(true);
      expect(mockRegister).toHaveBeenCalledWith(
        'new@test.com',
        'MonMotDePasse123!',
        'New',
        'User',
        undefined
      );
    });

    it('retourne 400 si l’email est déjà utilisé', async () => {
      mockRegister.mockResolvedValue({
        success: false,
        error: 'Un compte existe déjà avec cet email',
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'existing@test.com', password: 'MonMotDePasse123!' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('existe déjà');
    });
  });

  describe('POST /api/auth/login', () => {
    it('retourne 401 si les identifiants sont invalides', async () => {
      mockLogin.mockResolvedValue({
        success: false,
        error: 'Email ou mot de passe incorrect',
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'user@test.com', password: 'wrong-password' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
      expect(mockLogin).toHaveBeenCalledWith('user@test.com', 'wrong-password');
    });

    it('retourne 200 avec token et user si connexion réussie', async () => {
      mockLogin.mockResolvedValue({
        success: true,
        token: 'jwt-login-token',
        user: { id: TEST_USER_ID, email: 'user@test.com', provider: 'local' },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'user@test.com', password: 'MonMotDePasse123!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBe('jwt-login-token');
      expect(res.body.user).toEqual(
        expect.objectContaining({ id: TEST_USER_ID, email: 'user@test.com' })
      );
    });

    it('retourne 503 si MongoDB n’est pas connecté (requireMongo)', async () => {
      mongoReadyState = 0;

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'user@test.com', password: 'MonMotDePasse123!' });

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/base de données non connectée/i);
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/validate-password', () => {
    it('retourne 400 si le mot de passe est absent', async () => {
      const res = await request(app).post('/api/auth/validate-password').send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(mockValidatePassword).not.toHaveBeenCalled();
    });

    it('retourne 200 avec la structure validation attendue', async () => {
      mockValidatePassword.mockReturnValue({
        isValid: false,
        errors: ['Le mot de passe doit contenir au moins une lettre majuscule'],
        strength: 'weak',
        score: 20,
      });

      const res = await request(app)
        .post('/api/auth/validate-password')
        .send({ password: 'weakpass1234' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.validation).toEqual(
        expect.objectContaining({
          isValid: expect.any(Boolean),
          errors: expect.any(Array),
          strength: expect.stringMatching(/weak|medium|strong|very-strong/),
          score: expect.any(Number),
        })
      );
      expect(mockValidatePassword).toHaveBeenCalledWith('weakpass1234');
    });
  });

  describe('GET /api/auth/roles/for-signup', () => {
    it('retourne 200 avec la liste des rôles (id, name)', async () => {
      const res = await request(app).get('/api/auth/roles/for-signup');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.roles).toEqual([
        { id: 'role1', name: 'Développeur' },
        { id: 'role2', name: 'Product' },
      ]);
      expect(mockRoleFind).toHaveBeenCalled();
    });
  });

  describe('GET /api/auth/me', () => {
    it('retourne 404 si l’utilisateur n’existe pas', async () => {
      mockGetUserById.mockResolvedValue(null);

      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/non trouvé/i);
    });

    it('retourne 200 avec permissions si l’utilisateur existe', async () => {
      const dbUser = { lastLogin: new Date('2026-01-01') };
      mockGetUserById.mockResolvedValue(dbUser);
      mockBuildUserWithPermissions.mockResolvedValue(defaultUserWithPerms);

      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toEqual(
        expect.objectContaining({
          id: TEST_USER_ID,
          email: TEST_USER.email,
          role: 'super_admin',
          roleName: 'Super admin',
          visiblePages: expect.any(Object),
          lastLogin: dbUser.lastLogin.toISOString(),
        })
      );
      expect(mockGetUserById).toHaveBeenCalledWith(TEST_USER_ID);
      expect(mockBuildUserWithPermissions).toHaveBeenCalledWith(dbUser);
    });
  });

  describe('PATCH /api/auth/me/role', () => {
    it('retourne 400 si roleId est absent', async () => {
      const res = await request(app).patch('/api/auth/me/role').send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(mockSetMyRole).not.toHaveBeenCalled();
    });

    it('retourne 200 si le rôle est mis à jour', async () => {
      mockSetMyRole.mockResolvedValue({
        success: true,
        user: { id: TEST_USER_ID, roleName: 'Développeur' },
      });

      const res = await request(app)
        .patch('/api/auth/me/role')
        .send({ roleId: 'role1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toEqual({ id: TEST_USER_ID, roleName: 'Développeur' });
      expect(mockSetMyRole).toHaveBeenCalledWith(TEST_USER_ID, 'role1');
    });
  });

  describe('GET /api/auth/verify', () => {
    it('retourne 200 avec valid:true et req.user', async () => {
      const res = await request(app).get('/api/auth/verify');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.valid).toBe(true);
      expect(res.body.user).toEqual(
        expect.objectContaining({
          userId: TEST_USER_ID,
          email: TEST_USER.email,
          provider: TEST_USER.provider,
        })
      );
    });
  });
});
