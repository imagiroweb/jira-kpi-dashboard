import request from 'supertest';
import express, { Express } from 'express';

jest.mock('../application/services/AuthService', () => ({
  authService: {
    verifyToken: jest.fn()
  }
}));

jest.mock('../domain/user/entities/User', () => ({
  User: {
    findById: jest.fn()
  }
}));

import { authService } from '../application/services/AuthService';
import { User } from '../domain/user/entities/User';
import { authenticate, optionalAuth, requireSuperAdmin } from './authMiddleware';

const mockVerifyToken = authService.verifyToken as jest.Mock;
const mockUserFindById = User.findById as jest.Mock;

function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.get('/protected', authenticate, (req, res) => {
    res.json({ success: true, user: req.user });
  });

  app.get('/optional', optionalAuth, (req, res) => {
    res.json({ success: true, hasUser: Boolean(req.user), user: req.user ?? null });
  });

  app.get('/admin', authenticate, requireSuperAdmin, (_req, res) => {
    res.json({ success: true });
  });

  return app;
}

describe('authMiddleware', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('authenticate retourne 401 si header Authorization manquant', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it('authenticate retourne 401 si token invalide', async () => {
    mockVerifyToken.mockReturnValue(null);
    const res = await request(app).get('/protected').set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalide|expiré/i);
  });

  it('authenticate attache req.user et passe la requête si token valide', async () => {
    mockVerifyToken.mockReturnValue({
      userId: 'u1',
      email: 'admin@test.com',
      provider: 'local'
    });
    const res = await request(app).get('/protected').set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toEqual({
      userId: 'u1',
      email: 'admin@test.com',
      provider: 'local'
    });
  });

  it('optionalAuth laisse passer sans token', async () => {
    const res = await request(app).get('/optional');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, hasUser: false, user: null });
  });

  it('optionalAuth attache user quand token valide', async () => {
    mockVerifyToken.mockReturnValue({
      userId: 'u2',
      email: 'user@test.com',
      provider: 'microsoft'
    });
    const res = await request(app).get('/optional').set('Authorization', 'Bearer token-ok');
    expect(res.status).toBe(200);
    expect(res.body.hasUser).toBe(true);
    expect(res.body.user.email).toBe('user@test.com');
  });

  it('requireSuperAdmin retourne 403 pour un utilisateur non super_admin', async () => {
    mockVerifyToken.mockReturnValue({ userId: 'u1', email: 'u@test.com', provider: 'local' });
    mockUserFindById.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ role: undefined })
      })
    });

    const res = await request(app).get('/admin').set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('requireSuperAdmin autorise un super_admin', async () => {
    mockVerifyToken.mockReturnValue({ userId: 'u1', email: 'u@test.com', provider: 'local' });
    mockUserFindById.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ role: 'super_admin' })
      })
    });

    const res = await request(app).get('/admin').set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
