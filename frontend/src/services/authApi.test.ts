import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockPatch = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: {
    create: () => ({
      get: mockGet,
      post: mockPost,
      patch: mockPatch,
      interceptors: { request: { use: vi.fn() } },
    }),
  },
}));

import { authApi } from './authApi';

describe('authApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('login', () => {
    it('retourne success, token et user en cas de succès', async () => {
      const user = {
        id: '1',
        email: 'user@test.com',
        provider: 'local' as const,
        roleName: 'Utilisateur',
      };
      mockPost.mockResolvedValueOnce({
        data: { success: true, token: 'jwt-token', user },
      });

      const result = await authApi.login('user@test.com', 'Password123!');

      expect(mockPost).toHaveBeenCalledWith('/api/auth/login', {
        email: 'user@test.com',
        password: 'Password123!',
      });
      expect(result.success).toBe(true);
      expect(result.token).toBe('jwt-token');
      expect(result.user).toEqual(user);
    });

    it('retourne success false et error en cas d’erreur métier', async () => {
      mockPost.mockRejectedValueOnce({
        response: { data: { error: 'Email ou mot de passe incorrect' } },
      });

      const result = await authApi.login('bad@test.com', 'wrong');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email ou mot de passe incorrect');
    });

    it('retourne un message générique en cas d’erreur réseau', async () => {
      mockPost.mockRejectedValueOnce(new Error('Network error'));

      const result = await authApi.login('user@test.com', 'pass');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erreur de connexion au serveur');
    });
  });

  describe('register', () => {
    it('retourne success et user après inscription', async () => {
      const user = {
        id: '2',
        email: 'new@test.com',
        provider: 'local' as const,
      };
      mockPost.mockResolvedValueOnce({
        data: { success: true, token: 'jwt-new', user },
      });

      const result = await authApi.register(
        'new@test.com',
        'SecurePass123!',
        'Jean',
        'Dupont',
        'role-id'
      );

      expect(mockPost).toHaveBeenCalledWith('/api/auth/register', {
        email: 'new@test.com',
        password: 'SecurePass123!',
        firstName: 'Jean',
        lastName: 'Dupont',
        roleId: 'role-id',
      });
      expect(result.success).toBe(true);
      expect(result.user).toEqual(user);
    });

    it('retourne les erreurs de validation du serveur', async () => {
      mockPost.mockRejectedValueOnce({
        response: {
          data: { errors: ['Le mot de passe doit contenir au moins 12 caractères'] },
        },
      });

      const result = await authApi.register('new@test.com', 'short', 'Jean', 'Dupont');

      expect(result.success).toBe(false);
      expect(result.error).toContain('12 caractères');
    });
  });

  describe('validatePassword', () => {
    it('retourne la validation quand le serveur répond', async () => {
      const validation = {
        isValid: true,
        errors: [] as string[],
        strength: 'strong' as const,
        score: 75,
      };
      mockPost.mockResolvedValueOnce({ data: { success: true, validation } });

      const result = await authApi.validatePassword('MonMotDePasse123!');

      expect(mockPost).toHaveBeenCalledWith('/api/auth/validate-password', {
        password: 'MonMotDePasse123!',
      });
      expect(result).toEqual(validation);
    });

    it('retourne null en cas d’erreur', async () => {
      mockPost.mockRejectedValueOnce(new Error('Server error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await authApi.validatePassword('pass');

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('verifyToken', () => {
    it('retourne true si le token est valide', async () => {
      mockGet.mockResolvedValueOnce({ data: { success: true, valid: true } });

      const result = await authApi.verifyToken();

      expect(mockGet).toHaveBeenCalledWith('/api/auth/verify');
      expect(result).toBe(true);
    });

    it('retourne false si le token est invalide ou erreur', async () => {
      mockGet.mockRejectedValueOnce(new Error('Unauthorized'));

      const result = await authApi.verifyToken();

      expect(result).toBe(false);
    });
  });

  describe('getCurrentUser', () => {
    it('retourne l’utilisateur connecté', async () => {
      const user = {
        id: '1',
        email: 'u@test.com',
        provider: 'local' as const,
        visiblePages: { dashboard: true, users: false } as Record<string, boolean>,
      };
      mockGet.mockResolvedValueOnce({ data: { success: true, user } });

      const result = await authApi.getCurrentUser();

      expect(mockGet).toHaveBeenCalledWith('/api/auth/me');
      expect(result).toEqual(user);
    });

    it('retourne null en cas d’erreur', async () => {
      mockGet.mockRejectedValueOnce(new Error('Unauthorized'));

      const result = await authApi.getCurrentUser();

      expect(result).toBeNull();
    });
  });

  describe('getMicrosoftConfig', () => {
    it('retourne la config Microsoft si activée', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          success: true,
          enabled: true,
          clientId: 'client-1',
          tenantId: 'tenant-1',
          redirectUri: 'http://localhost/callback',
        },
      });

      const result = await authApi.getMicrosoftConfig();

      expect(mockGet).toHaveBeenCalledWith('/api/auth/microsoft/config');
      expect(result.enabled).toBe(true);
      expect(result.clientId).toBe('client-1');
    });

    it('retourne une config vide si l’API échoue', async () => {
      mockGet.mockRejectedValueOnce(new Error('Not found'));

      const result = await authApi.getMicrosoftConfig();

      expect(result).toEqual({
        enabled: false,
        clientId: '',
        tenantId: '',
        redirectUri: '',
      });
    });
  });

  describe('microsoftCallback', () => {
    it('retourne success et user après callback Microsoft', async () => {
      const user = {
        id: '3',
        email: 'ms@test.com',
        provider: 'microsoft' as const,
      };
      mockPost.mockResolvedValueOnce({
        data: { success: true, token: 'ms-token', user },
      });

      const result = await authApi.microsoftCallback('ms-access-token');

      expect(mockPost).toHaveBeenCalledWith('/api/auth/microsoft/callback', {
        accessToken: 'ms-access-token',
      });
      expect(result.success).toBe(true);
      expect(result.user).toEqual(user);
    });

    it('retourne error en cas d’échec Microsoft', async () => {
      mockPost.mockRejectedValueOnce({
        response: { data: { error: 'Token invalide' } },
      });

      const result = await authApi.microsoftCallback('bad-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Token invalide');
    });
  });

  describe('getRolesForSignup', () => {
    it('retourne la liste des rôles', async () => {
      const roles = [
        { id: 'r1', name: 'Utilisateur' },
        { id: 'r2', name: 'Admin' },
      ];
      mockGet.mockResolvedValueOnce({ data: { success: true, roles } });

      const result = await authApi.getRolesForSignup();

      expect(mockGet).toHaveBeenCalledWith('/api/auth/roles/for-signup');
      expect(result).toEqual(roles);
    });

    it('lance une erreur si success false', async () => {
      mockGet.mockResolvedValueOnce({ data: { success: false, error: 'Forbidden' } });

      await expect(authApi.getRolesForSignup()).rejects.toThrow('Forbidden');
    });
  });
});
