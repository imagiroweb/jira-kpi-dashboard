/**
 * TU — Chiffrement des champs (AES-256-GCM) et index aveugle
 */
import crypto from 'crypto';
import {
  blindIndex,
  decryptDeepInPlace,
  decryptValue,
  DecryptionError,
  encryptJson,
  encryptString,
  isEncryptedValue,
  keyring,
  safeDecrypt
} from './fieldEncryption';

describe('fieldEncryption', () => {
  it('chiffre puis déchiffre un texte ; deux chiffrements diffèrent (IV aléatoire)', () => {
    const a = encryptString('Bilan : très bon semestre');
    const b = encryptString('Bilan : très bon semestre');
    expect(a).toMatch(/^enc:v1:ktest:/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('semestre');
    expect(decryptValue(a)).toBe('Bilan : très bon semestre');
  });

  it('est idempotent et laisse passer les valeurs historiques non chiffrées', () => {
    const enc = encryptString('x');
    expect(encryptString(enc)).toBe(enc);
    expect(decryptValue('valeur en clair')).toBe('valeur en clair');
    expect(isEncryptedValue('valeur en clair')).toBe(false);
  });

  it('chiffre une valeur JSON (ex. coûts horaires)', () => {
    const rates = [{ startDate: null, rate: 55 }];
    const enc = encryptJson(rates);
    expect(enc).toMatch(/^encj:v1:/);
    expect(enc).not.toContain('55');
    expect(decryptValue(enc)).toEqual(rates);
  });

  it('détecte une donnée altérée', () => {
    const enc = encryptString('secret');
    const tampered = enc.slice(0, -4) + (enc.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(() => decryptValue(tampered)).toThrow(DecryptionError);
    expect(safeDecrypt(tampered, 'repli')).toBe('repli');
  });

  it('refuse une clé inconnue', () => {
    expect(() => decryptValue('enc:v1:kinconnue:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toThrow(/inconnue/);
  });

  it('déchiffre une ancienne clé après rotation (clé active différente)', () => {
    const old = encryptString('ancien');
    const oldKey = { id: 'ktest', key: (keyring as unknown as { dataKeys: Map<string, Buffer> }).dataKeys.get('ktest')! };
    const indexKey = (keyring as unknown as { indexKey: Buffer }).indexKey;
    keyring.load({ dataKeys: [oldKey, { id: 'knew', key: crypto.randomBytes(32) }], activeId: 'knew', indexKey });
    try {
      expect(encryptString('nouveau')).toMatch(/^enc:v1:knew:/);
      expect(decryptValue(old)).toBe('ancien');
    } finally {
      keyring.load({ dataKeys: [oldKey], activeId: 'ktest', indexKey });
    }
  });

  it('index aveugle : déterministe, différent selon la valeur, sans la révéler', () => {
    expect(blindIndex('jean@adoria.com')).toBe(blindIndex('jean@adoria.com'));
    expect(blindIndex('jean@adoria.com')).not.toBe(blindIndex('marie@adoria.com'));
    expect(blindIndex('jean@adoria.com')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('déchiffre en profondeur un résultat lean (objets et tableaux simples)', () => {
    const oid = { toHexString: () => 'x' };
    const doc = {
      email: encryptString('jean@adoria.com'),
      nested: [{ comment: encryptString('ok') }],
      rates: encryptJson([{ rate: 1 }]),
      when: new Date('2026-01-01'),
      ref: oid
    };
    decryptDeepInPlace(doc);
    expect(doc).toEqual({ email: 'jean@adoria.com', nested: [{ comment: 'ok' }], rates: [{ rate: 1 }], when: new Date('2026-01-01'), ref: oid });
  });
});
