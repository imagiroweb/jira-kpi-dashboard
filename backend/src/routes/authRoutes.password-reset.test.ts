/**
 * TI — Routes POST /api/auth/forgot-password et POST /api/auth/reset-password
 */
import request from 'supertest';
import express, { Express, Request } from 'express';

const mockRequestPasswordReset = jest.fn();
const mockResetPassword = jest.fn();

jest.mock('mongoose', () => {
  const actual = jest.requireActual<typeof import('mongoose')>('mongoose');
  return { ...actual, connection: { readyState: 1 } };
});

jest.mock('express-rate-limit', () =>
  () => (_req: Request, _res: unknown, next: () => void) => next()
);

jest.mock('../application/services/AuthService', () => ({
  authService: {
    requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
    resetPassword: (...args: unknown[]) => mockResetPassword(...args),
    login: jest.fn(),
    register: jest.fn(),
    handleMicrosoftSSO: jest.fn(),
    verifyToken: jest.fn(),
    getUserById: jest.fn(),
    generateToken: jest.fn(),
    setMyRole: jest.fn()
  }
}));

jest.mock('../middleware/authMiddleware', () => ({
  authenticate: (req: Request, _res: unknown, next: () => void) => {
    (req as Request & { user?: { userId: string; email: string; provider: string } }).user = {
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
    findById: jest.fn().mockResolvedValue({ role: 'super_admin' }),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    find: jest.fn().mockReturnValue({
      select: () => ({ populate: () => ({ lean: () => Promise.resolve([]) }) })
    })
  }
}));

jest.mock('../domain/user/entities/Role', () => ({
  Role: {
    findOne: jest.fn(),
    findById: jest.fn(),
    find: jest.fn().mockResolvedValue([])
  },
  PAGE_IDS: ['dashboard', 'users', 'support', 'epics', 'marketing', 'produit', 'gestionUtilisateurs']
}));

jest.mock('../domain/user/entities/UserActivityLog', () => ({
  UserActivityLog: {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    find: jest.fn().mockReturnValue({
      sort: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }),
      lean: () => Promise.resolve([])
    })
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

describe("Routes reinitialisation de mot de passe (TI)", () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/auth/forgot-password
  // ─────────────────────────────────────────────────────────

  describe("POST /api/auth/forgot-password", () => {
    it("retourne 400 si l'email est absent", async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(mockRequestPasswordReset).not.toHaveBeenCalled();
    });

    it("retourne 400 si l'email n'est pas valide", async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'pas-un-email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(mockRequestPasswordReset).not.toHaveBeenCalled();
    });

    it("retourne 200 et appelle le service si l'email est valide", async () => {
      mockRequestPasswordReset.mockResolvedValue({ success: true });

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'user@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockRequestPasswordReset).toHaveBeenCalledWith('user@test.com');
    });

    it("normalise l'email (lowercase) avant d'appeler le service", async () => {
      mockRequestPasswordReset.mockResolvedValue({ success: true });

      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'USER@TEST.COM' });

      expect(mockRequestPasswordReset).toHaveBeenCalledWith('user@test.com');
    });

    it("retourne 500 si le service echoue (ex: SMTP indisponible)", async () => {
      mockRequestPasswordReset.mockResolvedValue({
        success: false,
        error: "Impossible d'envoyer l'email"
      });

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'user@test.com' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
    });

    it("retourne 200 meme si l'email n'existe pas (anti-enumeration)", async () => {
      mockRequestPasswordReset.mockResolvedValue({ success: true });

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'inconnu@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/auth/reset-password
  // ─────────────────────────────────────────────────────────

  describe("POST /api/auth/reset-password", () => {
    it("retourne 400 si le token est absent", async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ password: 'MonMotDePasse123!' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(mockResetPassword).not.toHaveBeenCalled();
    });

    it("retourne 400 si le mot de passe est trop court (< 12 caracteres)", async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'valid-token', password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(mockResetPassword).not.toHaveBeenCalled();
    });

    it("retourne 400 si le token et le mot de passe sont absents", async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(mockResetPassword).not.toHaveBeenCalled();
    });

    it("retourne 200 si le token et le mot de passe sont valides", async () => {
      mockResetPassword.mockResolvedValue({ success: true });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'valid-token', password: 'MonMotDePasse123!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockResetPassword).toHaveBeenCalledWith('valid-token', 'MonMotDePasse123!');
    });

    it("retourne 400 si le token est invalide ou expire", async () => {
      mockResetPassword.mockResolvedValue({
        success: false,
        error: "Ce lien de réinitialisation est invalide ou a expiré."
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'expired-token', password: 'MonMotDePasse123!' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('invalide ou a expiré');
    });

    it("retourne 400 si le mot de passe ne respecte pas les regles de complexite (service)", async () => {
      mockResetPassword.mockResolvedValue({
        success: false,
        error: 'Le mot de passe doit contenir au moins une lettre majuscule'
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'valid-token', password: 'MonMotDePasse123!' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
