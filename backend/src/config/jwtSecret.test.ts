/**
 * TU — Secret JWT obligatoire
 */
import { resolveJwtSecret } from './jwtSecret';

const STRONG = 'a'.repeat(20) + 'B'.repeat(20);

describe('resolveJwtSecret', () => {
  it('retourne le secret s’il est assez long', () => {
    expect(resolveJwtSecret({ JWT_SECRET: STRONG, NODE_ENV: 'production' })).toBe(STRONG);
  });

  it('refuse de démarrer sans secret hors tests', () => {
    expect(() => resolveJwtSecret({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET manquant/);
    expect(() => resolveJwtSecret({ NODE_ENV: 'development' })).toThrow(/JWT_SECRET manquant/);
    expect(() => resolveJwtSecret({})).toThrow(/JWT_SECRET manquant/);
  });

  it('refuse un secret trop court', () => {
    expect(() => resolveJwtSecret({ JWT_SECRET: 'court', NODE_ENV: 'production' })).toThrow(/trop court/);
  });

  it('refuse les valeurs d’exemple connues (ancien défaut, modèle d’env)', () => {
    expect(() => resolveJwtSecret({ JWT_SECRET: 'your-super-secret-jwt-key-change-in-production' })).toThrow(/exemple/);
    expect(() => resolveJwtSecret({ JWT_SECRET: 'votre-secret-jwt-min-32-caracteres' })).toThrow(/exemple/);
  });

  it('génère un secret aléatoire en test uniquement', () => {
    const a = resolveJwtSecret({ NODE_ENV: 'test' });
    const b = resolveJwtSecret({ NODE_ENV: 'test' });
    expect(a).toHaveLength(96);
    expect(a).not.toBe(b);
  });
});
