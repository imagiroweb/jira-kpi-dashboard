import {
  encryptReviewInPlace,
  integrationSettingsMigrationSet,
  userMigrationSet
} from './encryptionMigration';
import { decryptValue, encryptString, isEncryptedValue } from '../../infrastructure/crypto/fieldEncryption';
import { emailHashOf } from '../../domain/user/emailHash';

describe('migration vers le chiffrement des champs', () => {
  it('chiffre l’email historique, calcule l’empreinte et chiffre les coûts', () => {
    const set = userMigrationSet({ email: ' Jean@Adoria.com', hourlyRates: [{ startDate: null, rate: 40 }] });
    expect(isEncryptedValue(set.email)).toBe(true);
    expect(decryptValue(set.email)).toBe('jean@adoria.com');
    expect(set.emailHash).toBe(emailHashOf('jean@adoria.com'));
    expect(decryptValue(set.hourlyRates)).toEqual([{ startDate: null, rate: 40 }]);
  });

  it('ne touche pas un utilisateur déjà migré (idempotent)', () => {
    const email = encryptString('a@b.fr');
    expect(userMigrationSet({ email, emailHash: emailHashOf('a@b.fr'), hourlyRates: encryptString('x') })).toEqual({});
  });

  it('complète l’empreinte d’un email déjà chiffré sans le rechiffrer', () => {
    const email = encryptString('a@b.fr');
    expect(userMigrationSet({ email })).toEqual({ emailHash: emailHashOf('a@b.fr') });
  });

  it('chiffre les textes libres d’une fiche et laisse les titres', () => {
    const raw = {
      objectives: [
        {
          title: 'Titre',
          krs: [{ label: 'KR', progressHistory: [{ note: 'n', evidenceUrl: '' }] }],
          actions: [{ label: 'act' }],
          selfAssessment: { comment: 'c' },
          managerAssessment: { comment: '', coachingAction: 'coach' }
        }
      ],
      qualitative: { successes: { self: 's' }, challenges: {} }
    };
    const set = encryptReviewInPlace(raw) as { objectives: any[]; qualitative: any };
    const o = set.objectives[0];
    expect(o.title).toBe('Titre');
    expect(o.krs[0].label).toBe('KR');
    expect(decryptValue(o.krs[0].progressHistory[0].note)).toBe('n');
    expect(o.krs[0].progressHistory[0].evidenceUrl).toBe('');
    expect(decryptValue(o.actions[0].label)).toBe('act');
    expect(decryptValue(o.selfAssessment.comment)).toBe('c');
    expect(decryptValue(o.managerAssessment.coachingAction)).toBe('coach');
    expect(decryptValue(set.qualitative.successes.self)).toBe('s');
    expect(encryptReviewInPlace(raw)).toEqual({});
  });

  it('chiffre les secrets d’intégration en clair uniquement', () => {
    expect(isEncryptedValue(integrationSettingsMigrationSet({ jiraApiToken: 't', mondayApiKey: '' }).jiraApiToken)).toBe(true);
    expect(integrationSettingsMigrationSet({ jiraApiToken: encryptString('t') })).toEqual({});
  });
});
