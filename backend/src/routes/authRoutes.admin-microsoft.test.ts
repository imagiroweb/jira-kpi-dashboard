import request from 'supertest';
import express, { Express, Request } from 'express';

const mockHandleMicrosoftSSO = jest.fn();
const mockBuildUserWithPermissions = jest.fn();
const mockUserFind = jest.fn();
const mockUserFindById = jest.fn();
const mockRoleFind = jest.fn();
const mockRoleFindById = jest.fn();
const mockRoleFindOne = jest.fn();
const mockRoleCreate = jest.fn();

jest.mock('mongoose', () => {
  const actual = jest.requireActual<typeof import('mongoose')>('mongoose');
  return { ...actual, connection: { readyState: 1 } };
});

jest.mock('../application/services/AuthService', () => ({
  authService: {
    register: jest.fn(),
    login: jest.fn(),
    validatePassword: jest.fn(),
    getUserById: jest.fn(),
    setMyRole: jest.fn(),
    handleMicrosoftSSO: (...args: unknown[]) => mockHandleMicrosoftSSO(...args),
    buildUserWithPermissions: (...args: unknown[]) => mockBuildUserWithPermissions(...args),
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn()
  }
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

jest.mock('../domain/user/entities/User', () => ({
  User: {
    find: (...args: unknown[]) => mockUserFind(...args),
    findById: (...args: unknown[]) => mockUserFindById(...args)
  }
}));

jest.mock('../domain/user/entities/Role', () => ({
  PAGE_IDS: ['dashboard', 'users', 'support', 'epics', 'marketing', 'produit', 'gestionUtilisateurs'],
  Role: {
    find: (...args: unknown[]) => mockRoleFind(...args),
    findById: (...args: unknown[]) => mockRoleFindById(...args),
    findOne: (...args: unknown[]) => mockRoleFindOne(...args),
    create: (...args: unknown[]) => mockRoleCreate(...args)
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

describe('authRoutes (admin + microsoft)', () => {
  const app = createApp();
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();

    mockUserFind.mockReturnValue({
      select: () => ({
        populate: () => ({
          lean: () =>
            Promise.resolve([
              {
                _id: { toString: () => 'u1' },
                email: 'u1@test.com',
                firstName: 'U',
                lastName: 'One',
                roleId: { _id: { toString: () => 'r1' }, name: 'Analyste' },
                provider: 'local',
                isActive: true
              }
            ])
        })
      })
    });

    const roles = [{ _id: { toString: () => 'r1' }, name: 'Analyste', pageVisibilities: { dashboard: true } }];
    mockRoleFind.mockReturnValue({
      lean: () => Promise.resolve(roles),
      select: () => ({
        lean: () => Promise.resolve(roles)
      })
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('POST /api/auth/microsoft/callback retourne 400 sans accessToken', async () => {
    const res = await request(app).post('/api/auth/microsoft/callback').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/microsoft/callback retourne 401 si token graph invalide', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const res = await request(app).post('/api/auth/microsoft/callback').send({ accessToken: 'bad' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/microsoft/callback retourne 200 sur succès', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'ms-1',
        mail: 'microsoft@test.com',
        userPrincipalName: 'upn@test.com',
        givenName: 'Mic',
        surname: 'Soft'
      })
    }) as unknown as typeof fetch;
    mockHandleMicrosoftSSO.mockResolvedValue({
      success: true,
      token: 'jwt',
      user: { id: 'u1', email: 'microsoft@test.com' },
      firstLogin: true
    });

    const res = await request(app).post('/api/auth/microsoft/callback').send({ accessToken: 'ok' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockHandleMicrosoftSSO).toHaveBeenCalled();
  });

  it('POST /api/auth/microsoft/callback retourne 401 si le service refuse', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'ms-1',
        userPrincipalName: 'upn@test.com'
      })
    }) as unknown as typeof fetch;
    mockHandleMicrosoftSSO.mockResolvedValue({
      success: false,
      error: 'Compte non autorisé'
    });

    const res = await request(app).post('/api/auth/microsoft/callback').send({ accessToken: 'ok' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/microsoft/callback retourne 500 si exception', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('graph down')) as unknown as typeof fetch;
    const res = await request(app).post('/api/auth/microsoft/callback').send({ accessToken: 'ok' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/auth/users retourne la liste des users + roles', async () => {
    const res = await request(app).get('/api/auth/users');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.users[0].email).toBe('u1@test.com');
    expect(res.body.roles[0].id).toBe('r1');
  });

  it('GET /api/auth/users retourne 500 si exception', async () => {
    mockUserFind.mockImplementationOnce(() => {
      throw new Error('db down');
    });
    const res = await request(app).get('/api/auth/users');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('PATCH /api/auth/users/:id retourne 404 si user introuvable', async () => {
    mockUserFindById.mockResolvedValue(null);
    const res = await request(app).patch('/api/auth/users/unknown').send({ role: 'super_admin' });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('PATCH /api/auth/users/:id met à jour roleId et retourne user enrichi', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const roleDoc = { _id: 'r2', name: 'Manager' };
    mockUserFindById.mockResolvedValue({ save, role: undefined, roleId: undefined });
    mockRoleFindById.mockResolvedValue(roleDoc);
    mockBuildUserWithPermissions.mockResolvedValue({
      id: 'u1',
      email: 'u1@test.com',
      firstName: 'U',
      lastName: 'One',
      provider: 'local',
      role: null,
      roleName: 'Manager',
      visiblePages: { dashboard: true }
    });

    const res = await request(app).patch('/api/auth/users/u1').send({ roleId: 'r2' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(save).toHaveBeenCalled();
  });

  it('PATCH /api/auth/users/:id accepte role=super_admin', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    mockUserFindById.mockResolvedValue({ save, role: undefined, roleId: 'r1' });
    mockBuildUserWithPermissions.mockResolvedValue({
      id: 'u1',
      email: 'u1@test.com',
      firstName: 'U',
      lastName: 'One',
      provider: 'local',
      role: 'super_admin',
      roleName: 'Super admin',
      visiblePages: { dashboard: true }
    });

    const res = await request(app).patch('/api/auth/users/u1').send({ role: 'super_admin' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PATCH /api/auth/users/:id retourne 400 si roleId invalide', async () => {
    mockUserFindById.mockResolvedValue({ save: jest.fn() });
    mockRoleFindById.mockResolvedValue(null);
    const res = await request(app).patch('/api/auth/users/u1').send({ roleId: 'r404' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('PATCH /api/auth/users/:id nettoie role/roleId si roleId vide', async () => {
    const userDoc = { save: jest.fn().mockResolvedValue(undefined), role: 'super_admin', roleId: 'r1' };
    mockUserFindById.mockResolvedValue(userDoc);
    mockBuildUserWithPermissions.mockResolvedValue({
      id: 'u1',
      email: 'u1@test.com',
      firstName: 'U',
      lastName: 'One',
      provider: 'local',
      role: null,
      roleName: 'Utilisateur',
      visiblePages: { dashboard: true }
    });
    const res = await request(app).patch('/api/auth/users/u1').send({ roleId: '' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PATCH /api/auth/users/:id retourne 500 sur exception', async () => {
    mockUserFindById.mockRejectedValue(new Error('db down'));
    const res = await request(app).patch('/api/auth/users/u1').send({ roleId: 'r2' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/auth/roles retourne la liste', async () => {
    const res = await request(app).get('/api/auth/roles');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.roles[0].name).toBe('Analyste');
  });

  it('GET /api/auth/roles retourne 500 si exception', async () => {
    mockRoleFind.mockImplementationOnce(() => {
      throw new Error('db down');
    });
    const res = await request(app).get('/api/auth/roles');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/roles retourne 400 si nom déjà existant', async () => {
    mockRoleFindOne.mockResolvedValue({ _id: 'r1', name: 'Analyste' });
    const res = await request(app)
      .post('/api/auth/roles')
      .send({ name: 'Analyste', pageVisibilities: { dashboard: true, users: true, support: true, epics: true, marketing: true, produit: true, gestionUtilisateurs: false } });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/roles crée un rôle', async () => {
    mockRoleFindOne.mockResolvedValue(null);
    mockRoleCreate.mockResolvedValue({
      _id: { toString: () => 'r3' },
      name: 'Nouveau',
      pageVisibilities: { dashboard: true }
    });
    const res = await request(app).post('/api/auth/roles').send({ name: 'Nouveau' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/auth/roles retourne 400 si payload invalide', async () => {
    const res = await request(app).post('/api/auth/roles').send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/roles retourne 500 sur exception', async () => {
    mockRoleFindOne.mockRejectedValue(new Error('db down'));
    const res = await request(app).post('/api/auth/roles').send({ name: 'X' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('PATCH /api/auth/roles/:id retourne 404 si rôle introuvable', async () => {
    mockRoleFindById.mockResolvedValue(null);
    const res = await request(app).patch('/api/auth/roles/r404').send({ name: 'X' });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('PATCH /api/auth/roles/:id met à jour le rôle', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    mockRoleFindById.mockResolvedValue({
      _id: { toString: () => 'r1' },
      name: 'Analyste',
      pageVisibilities: { dashboard: true },
      save
    });
    const res = await request(app)
      .patch('/api/auth/roles/r1')
      .send({ name: 'Analyste Senior', pageVisibilities: { dashboard: true, users: true, support: true, epics: true, marketing: true, produit: true, gestionUtilisateurs: true } });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(save).toHaveBeenCalled();
  });

  it('PATCH /api/auth/roles/:id retourne 400 si payload invalide', async () => {
    const res = await request(app).patch('/api/auth/roles/r1').send({ pageVisibilities: { dashboard: true } });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('PATCH /api/auth/roles/:id retourne 500 sur exception', async () => {
    mockRoleFindById.mockRejectedValue(new Error('db down'));
    const res = await request(app).patch('/api/auth/roles/r1').send({ name: 'X' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
