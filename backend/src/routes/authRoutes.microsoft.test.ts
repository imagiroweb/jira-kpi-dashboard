/**
 * TI — Routes auth Microsoft : GET /microsoft/config, POST /microsoft/callback
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import { TEST_USER_ID } from '../test/fixtures/users';

const mockHandleMicrosoftSSO = jest.fn();
const originalEnv = process.env;

let mongoReadyState = 1;
let mockFetch: jest.Mock;

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

jest.mock('../application/services/AuthService', () => ({
  authService: {
    handleMicrosoftSSO: (...args: unknown[]) => mockHandleMicrosoftSSO(...args),
    register: jest.fn(),
    login: jest.fn(),
    validatePassword: jest.fn(),
    getUserById: jest.fn(),
    buildUserWithPermissions: jest.fn(),
    setMyRole: jest.fn(),
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
    findOne: jest.fn(),
    findById: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
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

describe('authRoutes — Microsoft (TI)', () => {
  const app = createTestApp({ mountPath: '/api/auth', router: authRoutes });

  beforeEach(() => {
    jest.clearAllMocks();
    mongoReadyState = 1;
    process.env = { ...originalEnv };

    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('GET /api/auth/microsoft/config', () => {
    it('retourne 503 si MICROSOFT_CLIENT_ID est absent', async () => {
      delete process.env.MICROSOFT_CLIENT_ID;

      const res = await request(app).get('/api/auth/microsoft/config');

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.enabled).toBe(false);
      expect(res.body.error).toMatch(/non configuré/i);
    });

    it('retourne 200 avec la config SSO si MICROSOFT_CLIENT_ID est défini', async () => {
      process.env.MICROSOFT_CLIENT_ID = 'ms-client-id';
      process.env.MICROSOFT_TENANT_ID = 'tenant-123';
      process.env.MICROSOFT_REDIRECT_URI = 'https://app.example.com/callback';

      const res = await request(app).get('/api/auth/microsoft/config');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.enabled).toBe(true);
      expect(res.body.clientId).toBe('ms-client-id');
      expect(res.body.tenantId).toBe('tenant-123');
      expect(res.body.redirectUri).toBe('https://app.example.com/callback');
    });

    it('reste accessible (200) même si MongoDB est déconnecté', async () => {
      mongoReadyState = 0;
      process.env.MICROSOFT_CLIENT_ID = 'ms-client-id';

      const res = await request(app).get('/api/auth/microsoft/config');

      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(true);
    });
  });

  describe('POST /api/auth/microsoft/callback', () => {
    it('retourne 400 si accessToken est absent', async () => {
      const res = await request(app).post('/api/auth/microsoft/callback').send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Token Microsoft manquant/i);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('retourne 401 si Microsoft Graph rejette le token', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 });

      const res = await request(app)
        .post('/api/auth/microsoft/callback')
        .send({ accessToken: 'invalid-token' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Token Microsoft invalide/i);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me',
        expect.objectContaining({
          headers: { Authorization: 'Bearer invalid-token' },
        })
      );
      expect(mockHandleMicrosoftSSO).not.toHaveBeenCalled();
    });

    it('retourne 200 avec token et user si SSO réussit', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'ms-user-id',
            mail: 'user@company.com',
            userPrincipalName: 'user@company.com',
            givenName: 'Jean',
            surname: 'Dupont',
          }),
      });

      mockHandleMicrosoftSSO.mockResolvedValue({
        success: true,
        token: 'sso-jwt',
        user: { id: TEST_USER_ID, email: 'user@company.com', provider: 'microsoft' },
        firstLogin: false,
      });

      const res = await request(app)
        .post('/api/auth/microsoft/callback')
        .send({ accessToken: 'valid-ms-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBe('sso-jwt');
      expect(res.body.user).toEqual(
        expect.objectContaining({ id: TEST_USER_ID, email: 'user@company.com' })
      );
      expect(mockHandleMicrosoftSSO).toHaveBeenCalledWith(
        'ms-user-id',
        'user@company.com',
        'Jean',
        'Dupont'
      );
    });
  });
});
