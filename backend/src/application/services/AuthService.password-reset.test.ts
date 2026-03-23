/**
 * TU — AuthService : requestPasswordReset & resetPassword
 */
import mongoose from 'mongoose';
import crypto from 'crypto';

const mockUserFindOne = jest.fn();
const mockUserUpdateOne = jest.fn();
const mockLogCreate = jest.fn();
const mockEmailSend = jest.fn();

jest.mock('../../domain/user/entities/User', () => ({
  User: {
    // Simule le chainage Mongoose .findOne({}).select('+field')
    findOne: (...args: unknown[]) => ({
      select: () => mockUserFindOne(...args)
    }),
    updateOne: (...args: unknown[]) => mockUserUpdateOne(...args)
  }
}));

jest.mock('../../domain/user/entities/UserActivityLog', () => ({
  UserActivityLog: {
    create: (...args: unknown[]) => mockLogCreate(...args)
  }
}));

jest.mock('../../domain/user/entities/Role', () => ({
  Role: { findOne: jest.fn(), findById: jest.fn() },
  PAGE_IDS: ['dashboard', 'users', 'support', 'epics', 'marketing', 'produit', 'gestionUtilisateurs']
}));

jest.mock('../../infrastructure/email/NodemailerEmailService', () => ({
  emailService: {
    sendPasswordResetEmail: (...args: unknown[]) => mockEmailSend(...args)
  }
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

import { AuthService } from './AuthService';

describe('AuthService — réinitialisation de mot de passe', () => {
  let service: AuthService;
  const userId = new mongoose.Types.ObjectId();

  const mockUser = {
    _id: userId,
    email: 'user@test.com',
    firstName: 'Jean',
    isActive: true,
    provider: 'local'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService();
    mockUserUpdateOne.mockResolvedValue({});
    mockLogCreate.mockResolvedValue({});
  });

  // ─────────────────────────────────────────────────────────
  // requestPasswordReset
  // ─────────────────────────────────────────────────────────

  describe('requestPasswordReset', () => {
    it("retourne success: true si l'email n'existe pas (anti-enumeration)", async () => {
      mockUserFindOne.mockResolvedValue(null);

      const result = await service.requestPasswordReset('unknown@test.com');

      expect(result.success).toBe(true);
      expect(mockEmailSend).not.toHaveBeenCalled();
      expect(mockLogCreate).not.toHaveBeenCalled();
    });

    it("retourne success: true si l'utilisateur est inactif (anti-enumeration)", async () => {
      mockUserFindOne.mockResolvedValue({ ...mockUser, isActive: false });

      const result = await service.requestPasswordReset('user@test.com');

      expect(result.success).toBe(true);
      expect(mockEmailSend).not.toHaveBeenCalled();
    });

    it("stocke le hash SHA-256 du token et envoie l'email", async () => {
      mockUserFindOne.mockResolvedValue(mockUser);
      mockEmailSend.mockResolvedValue(true);

      const result = await service.requestPasswordReset('user@test.com');

      expect(result.success).toBe(true);
      expect(mockUserUpdateOne).toHaveBeenCalledWith(
        { _id: userId },
        {
          $set: {
            passwordResetToken: expect.any(String),
            passwordResetExpires: expect.any(Date)
          }
        }
      );
      expect(mockEmailSend).toHaveBeenCalledWith(
        { email: mockUser.email, firstName: mockUser.firstName },
        expect.stringContaining('/reset-password?token=')
      );
    });

    it("le token stocke est le hash SHA-256 du token transmis dans l'URL (jamais en clair)", async () => {
      mockUserFindOne.mockResolvedValue(mockUser);
      mockEmailSend.mockResolvedValue(true);

      await service.requestPasswordReset('user@test.com');

      const resetUrl: string = mockEmailSend.mock.calls[0][1];
      const url = new URL(resetUrl);
      const plainToken = url.searchParams.get('token')!;

      const expectedHash = crypto.createHash('sha256').update(plainToken).digest('hex');
      const storedHash: string = mockUserUpdateOne.mock.calls[0][1].$set.passwordResetToken;

      expect(storedHash).toBe(expectedHash);
      expect(storedHash).not.toBe(plainToken);
    });

    it("l'expiration est definie a ~1 heure dans le futur", async () => {
      mockUserFindOne.mockResolvedValue(mockUser);
      mockEmailSend.mockResolvedValue(true);

      const before = Date.now();
      await service.requestPasswordReset('user@test.com');
      const after = Date.now();

      const expires: Date = mockUserUpdateOne.mock.calls[0][1].$set.passwordResetExpires;
      const expiresMs = expires.getTime();

      expect(expiresMs).toBeGreaterThanOrEqual(before + 59 * 60 * 1000);
      expect(expiresMs).toBeLessThanOrEqual(after + 61 * 60 * 1000);
    });

    it("construit l'URL de reset avec APP_BASE_URL", async () => {
      process.env.APP_BASE_URL = 'https://app.example.com';
      mockUserFindOne.mockResolvedValue(mockUser);
      mockEmailSend.mockResolvedValue(true);

      await service.requestPasswordReset('user@test.com');

      const resetUrl: string = mockEmailSend.mock.calls[0][1];
      expect(resetUrl).toMatch(/^https:\/\/app\.example\.com\/reset-password\?token=/);

      delete process.env.APP_BASE_URL;
    });

    it("cree un log password_reset_request avec emailSent: true", async () => {
      mockUserFindOne.mockResolvedValue(mockUser);
      mockEmailSend.mockResolvedValue(true);

      await service.requestPasswordReset('user@test.com');

      expect(mockLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'password_reset_request',
          timestamp: expect.any(Date),
          meta: { emailSent: true }
        })
      );
    });

    it("supprime le token et retourne success: false si l'envoi d'email echoue", async () => {
      mockUserFindOne.mockResolvedValue(mockUser);
      mockEmailSend.mockResolvedValue(false);

      const result = await service.requestPasswordReset('user@test.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('SMTP');

      const lastUpdateCall = mockUserUpdateOne.mock.calls[mockUserUpdateOne.mock.calls.length - 1];
      expect(lastUpdateCall).toEqual([
        { _id: userId },
        { $unset: { passwordResetToken: '', passwordResetExpires: '' } }
      ]);
    });

    it("cree un log password_reset_request avec emailSent: false si l'email echoue", async () => {
      mockUserFindOne.mockResolvedValue(mockUser);
      mockEmailSend.mockResolvedValue(false);

      await service.requestPasswordReset('user@test.com');

      expect(mockLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'password_reset_request',
          meta: { emailSent: false }
        })
      );
    });

    it("retourne success: false en cas d'erreur inattendue", async () => {
      mockUserFindOne.mockRejectedValue(new Error('DB error'));

      const result = await service.requestPasswordReset('user@test.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Erreur serveur');
    });
  });

  // ─────────────────────────────────────────────────────────
  // resetPassword
  // ─────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it("retourne success: false si le mot de passe est trop court", async () => {
      const result = await service.resetPassword('valid-token', 'short');

      expect(result.success).toBe(false);
      expect(result.error).toContain('12 caractères');
      expect(mockUserFindOne).not.toHaveBeenCalled();
    });

    it("retourne success: false si le mot de passe ne contient pas de majuscule", async () => {
      const result = await service.resetPassword('valid-token', 'monmotdepasse123!');

      expect(result.success).toBe(false);
      expect(result.error).toContain('majuscule');
    });

    it("retourne success: false si le token est invalide ou expire", async () => {
      mockUserFindOne.mockResolvedValue(null);

      const result = await service.resetPassword('invalid-token', 'MonMotDePasse123!');

      expect(result.success).toBe(false);
      expect(result.error).toContain('invalide ou a expiré');
    });

    it("recherche le token via son hash SHA-256 (jamais en clair)", async () => {
      const plainToken = 'super-secret-plain-token';
      const expectedHash = crypto.createHash('sha256').update(plainToken).digest('hex');

      mockUserFindOne.mockResolvedValue(null);

      await service.resetPassword(plainToken, 'MonMotDePasse123!');

      expect(mockUserFindOne).toHaveBeenCalledWith(
        expect.objectContaining({ passwordResetToken: expectedHash })
      );
    });

    it("met a jour le mot de passe et invalide le token si valide", async () => {
      mockUserFindOne.mockResolvedValue({ ...mockUser, _id: userId });

      const result = await service.resetPassword('valid-token', 'MonMotDePasse123!');

      expect(result.success).toBe(true);
      expect(mockUserUpdateOne).toHaveBeenCalledWith(
        { _id: userId },
        {
          $set: { password: expect.any(String) },
          $unset: { passwordResetToken: '', passwordResetExpires: '' }
        }
      );
    });

    it("stocke le nouveau mot de passe hashe en bcrypt (pas en clair)", async () => {
      const plainPassword = 'MonMotDePasse123!';
      mockUserFindOne.mockResolvedValue({ ...mockUser, _id: userId });

      await service.resetPassword('valid-token', plainPassword);

      const storedPassword: string = mockUserUpdateOne.mock.calls[0][1].$set.password;
      expect(storedPassword).not.toBe(plainPassword);
      expect(storedPassword).toMatch(/^\$2[aby]/);
    });

    it("cree un log password_reset_complete apres reset reussi", async () => {
      mockUserFindOne.mockResolvedValue({ ...mockUser, _id: userId });

      await service.resetPassword('valid-token', 'MonMotDePasse123!');

      expect(mockLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'password_reset_complete',
          timestamp: expect.any(Date)
        })
      );
    });

    it("retourne success: false en cas d'erreur inattendue", async () => {
      mockUserFindOne.mockRejectedValue(new Error('DB error'));

      const result = await service.resetPassword('token', 'MonMotDePasse123!');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Erreur serveur');
    });
  });
});
