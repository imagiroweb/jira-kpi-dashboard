/**
 * TI — Routes auth Microsoft : GET /microsoft/config, POST /microsoft/callback
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import { TEST_USER_ID } from '../test/fixtures/users';

const mockHandleMicrosoftSSO = jest.fn();
const mockVerifyIdToken = jest.fn();
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
    login: jest.fn(),
    validatePassword: jest.fn(),
    getUserById: jest.fn(),
    buildUserWithPermissions: jest.fn(),
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

jest.mock('../infrastructure/microsoft/MicrosoftIdTokenVerifier', () => {
  const actual = jest.requireActual('../infrastructure/microsoft/MicrosoftIdTokenVerifier');
  return {
    ...actual,
    microsoftIdTokenVerifier: { verify: (...args: unknown[]) => mockVerifyIdToken(...args) },
  };
});

jest.mock('../utils/logger', () =>
  jest.requireActual('../test/mocks/logger').loggerMockFactory()
);

import { authRoutes } from './authRoutes';
import { MicrosoftTokenError } from '../infrastructure/microsoft/MicrosoftIdTokenVerifier';

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

    it('utilise l’autorité « organizations » par défaut (multi-entreprises, jamais les comptes perso)', async () => {
      process.env.MICROSOFT_CLIENT_ID = 'ms-client-id';
      delete process.env.MICROSOFT_TENANT_ID;
      delete process.env.MICROSOFT_AUTHORITY_TENANT;

      const res = await request(app).get('/api/auth/microsoft/config');

      expect(res.body.tenantId).toBe('organizations');
    });

    it('reste accessible (200) même si MongoDB est déconnecté', async () => {
      mongoReadyState = 0;
      process.env.MICROSOFT_CLIENT_ID = 'ms-client-id';

      const res = await request(app).get('/api/auth/microsoft/config');

      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(true);
    });

    it('fallback redirectUri pointe vers la route SPA /auth/... (pas /api/...)', async () => {
      process.env.MICROSOFT_CLIENT_ID = 'ms-client-id';
      delete process.env.MICROSOFT_REDIRECT_URI;

      const res = await request(app).get('/api/auth/microsoft/config');

      expect(res.status).toBe(200);
      expect(res.body.redirectUri).toMatch(/\/auth\/microsoft\/callback$/);
      expect(res.body.redirectUri).not.toMatch(/\/api\/auth\/microsoft\/callback/);
    });
  });

  describe('GET /api/auth/microsoft/callback', () => {
    it('renvoie une page HTML qui redirige vers la route SPA', async () => {
      const res = await request(app).get('/api/auth/microsoft/callback');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('/auth/microsoft/callback');
      expect(res.text).toContain('location.hash');
    });

    it('reste accessible même si MongoDB est déconnecté', async () => {
      mongoReadyState = 0;

      const res = await request(app).get('/api/auth/microsoft/callback');

      expect(res.status).toBe(200);
      expect(res.text).toContain('location.replace');
    });
  });

  describe('POST /api/auth/microsoft/callback', () => {
    const identity = {
      tenantId: '8f2c1d3e-1234-4abc-9def-0123456789ab',
      objectId: 'oid-1',
      email: 'user@company.com',
      firstName: 'Jean',
      lastName: 'Dupont',
    };

    beforeEach(() => {
      process.env.MICROSOFT_CLIENT_ID = 'ms-client-id';
    });

    it('retourne 400 si idToken ou nonce est absent', async () => {
      const res = await request(app).post('/api/auth/microsoft/callback').send({ idToken: 'a.b.c' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });

    it('retourne 400 si idToken contient des caractères invalides', async () => {
      const res = await request(app)
        .post('/api/auth/microsoft/callback')
        .send({ idToken: 'tok\nen', nonce: 'n' });

      expect(res.status).toBe(400);
      expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });

    it('n’appelle plus Microsoft Graph et ne fait pas confiance à un access token', async () => {
      const res = await request(app)
        .post('/api/auth/microsoft/callback')
        .send({ accessToken: 'any-graph-token' });

      expect(res.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('retourne 401 si le jeton est rejeté (signature, audience, émetteur, nonce…)', async () => {
      mockVerifyIdToken.mockRejectedValue(new MicrosoftTokenError('audience invalide'));

      const res = await request(app)
        .post('/api/auth/microsoft/callback')
        .send({ idToken: 'a.b.c', nonce: 'n1' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Jeton Microsoft invalide/);
      expect(mockHandleMicrosoftSSO).not.toHaveBeenCalled();
    });

    it('retourne 503 si la vérification est indisponible (JWKS injoignable)', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('JWKS Microsoft indisponible (500)'));

      const res = await request(app)
        .post('/api/auth/microsoft/callback')
        .send({ idToken: 'a.b.c', nonce: 'n1' });

      expect(res.status).toBe(503);
    });

    it('propage le refus métier (tenant non autorisé → 403)', async () => {
      mockVerifyIdToken.mockResolvedValue(identity);
      mockHandleMicrosoftSSO.mockResolvedValue({ success: false, status: 403, error: 'Votre organisation n’est pas autorisée' });

      const res = await request(app)
        .post('/api/auth/microsoft/callback')
        .send({ idToken: 'a.b.c', nonce: 'n1' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/pas autorisée/);
    });

    it('retourne 200 avec token et user si SSO réussit', async () => {
      mockVerifyIdToken.mockResolvedValue(identity);
      mockHandleMicrosoftSSO.mockResolvedValue({
        success: true,
        token: 'sso-jwt',
        user: { id: TEST_USER_ID, email: 'user@company.com', provider: 'microsoft' },
        firstLogin: false,
      });

      const res = await request(app)
        .post('/api/auth/microsoft/callback')
        .send({ idToken: 'a.b.c', nonce: 'n1' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('sso-jwt');
      expect(mockVerifyIdToken).toHaveBeenCalledWith('a.b.c', { clientId: 'ms-client-id', nonce: 'n1' });
      expect(mockHandleMicrosoftSSO).toHaveBeenCalledWith(identity);
    });
  });
});
