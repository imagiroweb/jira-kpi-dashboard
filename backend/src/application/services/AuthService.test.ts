import { AuthService } from './AuthService';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
  });

  describe('validatePassword', () => {
    it('rejette un mot de passe trop court', () => {
      const result = service.validatePassword('Ab1!');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('12 caractères'))).toBe(true);
    });

    it('rejette un mot de passe sans majuscule', () => {
      const result = service.validatePassword('abcdefghij1!');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('majuscule'))).toBe(true);
    });

    it('rejette un mot de passe sans minuscule', () => {
      const result = service.validatePassword('ABCDEFGHIJ1!');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('minuscule'))).toBe(true);
    });

    it('rejette un mot de passe sans chiffre', () => {
      const result = service.validatePassword('Abcdefghijk!');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('chiffre'))).toBe(true);
    });

    it('rejette un mot de passe sans caractère spécial', () => {
      const result = service.validatePassword('Abcdefghij12');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('spécial'))).toBe(true);
    });

    it('accepte un mot de passe valide et renvoie un score/strength', () => {
      const result = service.validatePassword('MonMotDePasse123!');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(['weak', 'medium', 'strong', 'very-strong']).toContain(result.strength);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('donne un strength "very-strong" pour un mot de passe long et varié', () => {
      const result = service.validatePassword('MonTrèsLongMotDePasse123!@#');
      expect(result.isValid).toBe(true);
      expect(result.strength).toBe('very-strong');
    });
  });

  describe('generateToken / verifyToken', () => {
    const payload = {
      userId: '507f1f77bcf86cd799439011',
      email: 'user@example.com',
      provider: 'local' as const
    };

    it('génère un token et le décode correctement', () => {
      const token = service.generateToken(payload);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);

      const decoded = service.verifyToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(payload.userId);
      expect(decoded?.email).toBe(payload.email);
      expect(decoded?.provider).toBe(payload.provider);
    });

    it('retourne null pour un token invalide', () => {
      expect(service.verifyToken('invalid.jwt.token')).toBeNull();
      expect(service.verifyToken('')).toBeNull();
    });
  });

  describe('hashPassword / comparePassword', () => {
    it('hash un mot de passe et compare correctement', async () => {
      const password = 'MonMotDePasse123!';
      const hash = await service.hashPassword(password);
      expect(typeof hash).toBe('string');
      expect(hash).not.toBe(password);

      const same = await service.comparePassword(password, hash);
      expect(same).toBe(true);
    });

    it('compare renvoie false pour un mauvais mot de passe', async () => {
      const hash = await service.hashPassword('MonMotDePasse123!');
      const same = await service.comparePassword('WrongPassword123!', hash);
      expect(same).toBe(false);
    });
  });
});
