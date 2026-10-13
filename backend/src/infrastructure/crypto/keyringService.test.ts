/**
 * TU — Trousseau : génération, déchiffrement des clés, refus d'une mauvaise clé maître, rotation
 */
import crypto from 'crypto';

const store: Array<Record<string, unknown>> = [];
jest.mock('./EncryptionKey', () => ({
  EncryptionKey: {
    find: () => {
      const q = { sort: () => q, lean: () => Promise.resolve(store.map((d) => ({ ...d }))) };
      return q;
    },
    create: (doc: Record<string, unknown>) => {
      store.push({ ...doc, _id: String(store.length), createdAt: new Date(Date.now() + store.length) });
      return Promise.resolve(doc);
    },
    updateOne: (filter: { _id: string }, update: { $set: Record<string, unknown> }) => {
      Object.assign(store.find((d) => d._id === filter._id)!, update.$set);
      return Promise.resolve({});
    }
  }
}));
jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

import { initKeyring, rewrapAllKeys, unwrapKey, wrapKey } from './keyringService';
import { decryptValue, encryptString, keyring } from './fieldEncryption';

describe('keyringService', () => {
  const master = crypto.randomBytes(32);

  beforeEach(() => {
    store.length = 0;
  });

  afterAll(() => {
    // Restaure le trousseau de test global
    keyring.load({ dataKeys: [{ id: 'ktest', key: crypto.randomBytes(32) }], activeId: 'ktest', indexKey: crypto.randomBytes(32) });
  });

  it('enveloppe / désenveloppe une clé (AAD vérifiée)', () => {
    const key = crypto.randomBytes(32);
    const wrapped = wrapKey(master, key, 'k1:data');
    expect(unwrapKey(master, wrapped, 'k1:data')).toEqual(key);
    expect(() => unwrapKey(master, wrapped, 'k2:data')).toThrow();
  });

  it('génère clé de données et clé d’index au premier démarrage, puis les réutilise', async () => {
    await initKeyring(master);
    expect(store.map((d) => d.purpose).sort()).toEqual(['data', 'index']);
    const enc = encryptString('persistant');

    await initKeyring(master);
    expect(store).toHaveLength(2);
    expect(decryptValue(enc)).toBe('persistant');
    expect(JSON.stringify(store)).not.toContain(master.toString('hex'));
  });

  it('refuse de démarrer avec une mauvaise clé maître, sans créer de nouvelles clés', async () => {
    await initKeyring(master);
    await expect(initKeyring(crypto.randomBytes(32))).rejects.toThrow(/ne correspond pas/);
    expect(store).toHaveLength(2);
  });

  it('rotation de la clé maître : ré-enveloppe sans toucher aux données', async () => {
    await initKeyring(master);
    const enc = encryptString('donnée');
    const newMaster = crypto.randomBytes(32);

    expect(await rewrapAllKeys(master, newMaster)).toBe(2);
    await initKeyring(newMaster);
    expect(decryptValue(enc)).toBe('donnée');
    await expect(initKeyring(master)).rejects.toThrow();
  });
});
