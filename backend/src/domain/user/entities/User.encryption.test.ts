import fs from 'fs';
import path from 'path';
import { User } from './User';
import { emailHashOf } from '../emailHash';
import { isEncryptedValue } from '../../../infrastructure/crypto/fieldEncryption';

describe('User — chiffrement des données personnelles', () => {
  it('stocke l’email chiffré, le relit en clair et calcule son empreinte de recherche', async () => {
    const user = new User({ email: '  Jean.Dupont@Adoria.com ', provider: 'microsoft' });
    await user.validate();

    const stored = user.get('email', null, { getters: false });
    expect(isEncryptedValue(stored)).toBe(true);
    expect(stored).not.toContain('dupont');
    expect(user.email).toBe('jean.dupont@adoria.com');
    expect(user.emailHash).toBe(emailHashOf('jean.dupont@adoria.com'));
    expect(user.emailHash).toBe(emailHashOf(' JEAN.DUPONT@adoria.com'));
  });

  it('rejette un email invalide malgré le chiffrement', async () => {
    const user = new User({ email: 'pas-un-email', provider: 'microsoft' });
    await expect(user.validate()).rejects.toThrow('Email invalide');
  });

  it('toObject / toJSON renvoient du clair', async () => {
    const user = new User({
      email: 'a@b.fr',
      provider: 'microsoft',
      hourlyRates: [{ startDate: null, rate: 42 }]
    });
    const obj = user.toObject() as unknown as Record<string, unknown>;
    expect(obj.email).toBe('a@b.fr');
    expect(obj.hourlyRates).toEqual([{ startDate: null, rate: 42 }]);
    expect(JSON.stringify(user.toJSON())).not.toMatch(/enc[j]?:v1:/);
  });

  it('chiffre les coûts horaires', () => {
    const user = new User({ email: 'a@b.fr', provider: 'microsoft', hourlyRates: [{ startDate: '2026-01-01', rate: 50 }] });
    const stored = user.get('hourlyRates', null, { getters: false });
    expect(isEncryptedValue(stored)).toBe(true);
    expect(user.hourlyRates).toEqual([{ startDate: '2026-01-01', rate: 50 }]);
    user.hourlyRates = undefined;
    expect(user.hourlyRates).toBeUndefined();
  });

  it('les filtres de requête sur l’email passent par emailHash (garde-fou)', () => {
    const root = path.resolve(__dirname, '../../..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
          const src = fs.readFileSync(full, 'utf8');
          if (/User\.(find|findOne|exists|countDocuments|updateOne|updateMany|deleteOne)\(\s*\{[^}]*\bemail\s*[:,}]/.test(src)) {
            offenders.push(path.relative(root, full));
          }
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
