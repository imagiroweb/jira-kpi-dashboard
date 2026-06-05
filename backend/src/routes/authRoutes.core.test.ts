import request from 'supertest';
import express, { Express, Request } from 'express';

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  validatePassword: jest.fn(),
  getUserById: jest.fn(),
  buildUserWithPermissions: jest.fn(),
  setMyRole: jest.fn()
};

const mockRoleFind = jest.fn();

jest.mock('mongoose', () => {
  const actual = jest.requireActual<typeof import('mongoose')>('mongoose');
  return { ...actual, connection: { readyState: 1 } };
});

jest.mock('../application/services/AuthService', () => ({
  authService: mockAuthService
}));

jest.mock('../middleware/authMiddleware', () => ({
  authenticate: (req: Request, _res: unknown, next: () => void) => {
    (req as Request & { user?: { userId: string; email: string; provider: 'local' | 'microsoft' } }).user = {
      userId: '507f1f77bcf86cd799439011',
      email: 'admin@test.com',
      provider: 'local'
    };
    next();
  },
  requireSuperAdmin: (_req: unknown, _res: unknown, next: () => void) => next()
}));

jest.mock('../domain/user/entities/Role', () => ({
  PAGE_IDS: ['dashboard', 'users', 'support', 'epics', 'marketing', 'produit', 'gestionUtilisateurs'],
  Role: {
    find: (...args: unknown[]) => mockRoleFind(...args),
    findById: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn()
  }
}));

jest.mock('../domain/user/entities/User', () => ({
  User: {
    find: jest.fn(),
    findById: jest.fn()
  }
}));

jest.mock('../domain/user/entities/UserActivityLog', () => ({
  UserActivityLog: {
    findOne: jest.fn(),
    create: jest.fn(),
    find: jest.fn()
  }
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

import { authRoutes } from './authRoutes';

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app;
}

describe('authRoutes (core)', () => {
  const app = createApp();
  const initialClientId = process.env.MICROSOFT_CLIENT_ID;
  const initialTenant = process.env.MICROSOFT_TENANT_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthService.register.mockResolvedValue({
      success: true,
      token: 'jwt-token',
      user: { id: 'u1', email: 'user@test.com', provider: 'local' }
    });
    mockAuthService.login.mockResolvedValue({
      success: true,
      token: 'jwt-token',
      user: { id: 'u1', email: 'user@test.com', provider: 'local' }
    });
    mockAuthService.validatePassword.mockReturnValue({
      isValid: true,
      errors: [],
      strength: 'strong',
      score: 80
    });
    mockAuthService.getUserById.mockResolvedValue({
      _id: 'u1',
      email: 'user@test.com',
      provider: 'local'
    });
    mockAuthService.buildUserWithPermissions.mockResolvedValue({
      id: 'u1',
      email: 'user@test.com',
      provider: 'local',
      role: null,
      roleName: 'Utilisateur',
      visiblePages: { dashboard: true }
    });
    mockAuthService.setMyRole.mockResolvedValue({
      success: true,
      user: { id: 'u1', email: 'user@test.com', provider: 'local' }
    });
    mockRoleFind.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve([{ _id: { toString: () => 'r1' }, name: 'Utilisateur' }])
      })
    });
  });

  afterAll(() => {
    process.env.MICROSOFT_CLIENT_ID = initialClientId;
    process.env.MICROSOFT_TENANT_ID = initialTenant;
  });

  it('GET /api/auth/microsoft/config retourne 503 si SSO non configuré', async () => {
    delete process.env.MICROSOFT_CLIENT_ID;
    const res = await request(app).get('/api/auth/microsoft/config');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/auth/microsoft/config retourne 200 si configuré', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'client-id';
    process.env.MICROSOFT_TENANT_ID = 'tenant-id';
    const res = await request(app).get('/api/auth/microsoft/config');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.clientId).toBe('client-id');
  });

  it('POST /api/auth/register retourne 400 sur payload invalide', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'bad', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockAuthService.register).not.toHaveBeenCalled();
  });

  it('POST /api/auth/register retourne 201 sur succès', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@test.com', password: 'ValidPass123!', firstName: 'A', lastName: 'B' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockAuthService.register).toHaveBeenCalledWith('user@test.com', 'ValidPass123!', 'A', 'B', undefined);
  });

  it('POST /api/auth/register retourne 400 si le service refuse', async () => {
    mockAuthService.register.mockResolvedValue({ success: false, error: 'Email déjà utilisé' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@test.com', password: 'ValidPass123!', firstName: 'A', lastName: 'B' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/login retourne 401 si credentials invalides', async () => {
    mockAuthService.login.mockResolvedValue({ success: false, error: 'bad credentials' });
    const res = await request(app).post('/api/auth/login').send({ email: 'user@test.com', password: 'X' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/login retourne 400 sur payload invalide', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'bad-email' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/login retourne 500 si exception', async () => {
    mockAuthService.login.mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/api/auth/login').send({ email: 'user@test.com', password: 'ValidPass123!' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/validate-password retourne le résultat du service', async () => {
    const res = await request(app).post('/api/auth/validate-password').send({ password: 'ValidPass123!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.validation.score).toBe(80);
  });

  it('POST /api/auth/validate-password retourne 400 si password manquant', async () => {
    const res = await request(app).post('/api/auth/validate-password').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/auth/me retourne 404 si utilisateur introuvable', async () => {
    mockAuthService.getUserById.mockResolvedValue(null);
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/auth/me retourne le profil utilisateur si trouvé', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe('user@test.com');
  });

  it('GET /api/auth/me retourne 500 si exception', async () => {
    mockAuthService.buildUserWithPermissions.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/auth/verify retourne token valide', async () => {
    const res = await request(app).get('/api/auth/verify');
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  it('GET /api/auth/roles/for-signup retourne la liste des rôles', async () => {
    const res = await request(app).get('/api/auth/roles/for-signup');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.roles).toEqual([{ id: 'r1', name: 'Utilisateur' }]);
  });

  it('GET /api/auth/roles/for-signup retourne 500 si exception', async () => {
    mockRoleFind.mockImplementationOnce(() => {
      throw new Error('db down');
    });
    const res = await request(app).get('/api/auth/roles/for-signup');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('PATCH /api/auth/me/role retourne 400 si roleId absent', async () => {
    const res = await request(app).patch('/api/auth/me/role').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockAuthService.setMyRole).not.toHaveBeenCalled();
  });

  it('PATCH /api/auth/me/role retourne 400 si service refuse le rôle', async () => {
    mockAuthService.setMyRole.mockResolvedValue({ success: false, error: 'Rôle invalide' });
    const res = await request(app).patch('/api/auth/me/role').send({ roleId: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/register retourne 500 si exception', async () => {
    mockAuthService.register.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@test.com', password: 'ValidPass123!', firstName: 'A', lastName: 'B' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/validate-password retourne 500 si exception', async () => {
    mockAuthService.validatePassword.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const res = await request(app).post('/api/auth/validate-password').send({ password: 'ValidPass123!' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('PATCH /api/auth/me/role retourne 500 si exception', async () => {
    mockAuthService.setMyRole.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).patch('/api/auth/me/role').send({ roleId: '507f1f77bcf86cd799439011' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
