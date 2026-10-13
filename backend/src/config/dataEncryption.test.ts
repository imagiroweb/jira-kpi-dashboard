import { parseMasterKey, resolveMasterKey } from './dataEncryption';

describe('dataEncryption (clé maître)', () => {
  it('accepte 64 caractères hexadécimaux ou 32 octets en base64', () => {
    expect(parseMasterKey('a'.repeat(64))?.length).toBe(32);
    expect(parseMasterKey(Buffer.alloc(32, 7).toString('base64'))?.length).toBe(32);
    expect(parseMasterKey('trop-court')).toBeNull();
  });

  it('refuse de démarrer sans clé hors tests, et refuse une clé invalide', () => {
    expect(() => resolveMasterKey({ NODE_ENV: 'production' })).toThrow(/DATA_ENCRYPTION_KEY manquant/);
    expect(() => resolveMasterKey({ NODE_ENV: 'production', DATA_ENCRYPTION_KEY: 'abc' })).toThrow(/invalide/);
    expect(resolveMasterKey({ NODE_ENV: 'production', DATA_ENCRYPTION_KEY: 'b'.repeat(64) })).toEqual(Buffer.from('b'.repeat(64), 'hex'));
  });

  it('génère une clé stable par processus en test', () => {
    expect(resolveMasterKey({ NODE_ENV: 'test' })).toBe(resolveMasterKey({ NODE_ENV: 'test' }));
  });
});
