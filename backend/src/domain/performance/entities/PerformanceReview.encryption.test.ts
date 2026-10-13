import mongoose from 'mongoose';
import { PerformanceReview } from './PerformanceReview';
import { IntegrationSettings } from '../../settings/integrationSettings';
import { isEncryptedValue } from '../../../infrastructure/crypto/fieldEncryption';

const author = { id: 'u1', name: 'Lead', role: 'lead' as const };

function sampleReview() {
  return new PerformanceReview({
    user: new mongoose.Types.ObjectId(),
    cycle: new mongoose.Types.ObjectId(),
    createdBy: author,
    objectives: [
      {
        id: 'o1',
        title: 'Livrer le module X',
        krs: [
          {
            id: 'k1',
            label: 'KR visible',
            progressHistory: [{ value: 50, note: 'À mi-chemin', evidenceUrl: 'https://x/y', updatedBy: author }]
          }
        ],
        actions: [{ id: 'a1', label: 'Suivre une formation', createdBy: author }],
        selfAssessment: { status: 'atteint', comment: 'Je suis satisfait' },
        managerAssessment: { status: 'atteint', comment: 'Bon travail', coachingAction: 'Mentorat' }
      }
    ],
    qualitative: { successes: { self: 'Succès perso', manager: 'Succès vu du lead' } }
  });
}

describe('PerformanceReview — chiffrement des appréciations', () => {
  it('chiffre les textes libres et laisse les titres en clair', async () => {
    const review = sampleReview();
    await review.validate();
    const raw = review.toObject({ transform: false }) as unknown as {
      objectives: Array<Record<string, any>>;
      qualitative: Record<string, any>;
    };
    const objective = raw.objectives[0];
    expect(objective.title).toBe('Livrer le module X');
    expect(objective.krs[0].label).toBe('KR visible');
    for (const value of [
      objective.krs[0].progressHistory[0].note,
      objective.krs[0].progressHistory[0].evidenceUrl,
      objective.actions[0].label,
      objective.selfAssessment.comment,
      objective.managerAssessment.comment,
      objective.managerAssessment.coachingAction,
      raw.qualitative.successes.self,
      raw.qualitative.successes.manager
    ]) {
      expect(isEncryptedValue(value)).toBe(true);
    }
  });

  it('relit en clair via les getters et toObject()', () => {
    const review = sampleReview();
    expect(review.objectives[0].managerAssessment?.comment).toBe('Bon travail');
    const plain = review.toObject();
    expect(plain.objectives[0].actions![0].label).toBe('Suivre une formation');
    expect(plain.qualitative.successes.manager).toBe('Succès vu du lead');
    expect(JSON.stringify(review.toJSON())).not.toMatch(/enc[j]?:v1:/);
  });

  it('une action sans libellé reste refusée', async () => {
    const review = sampleReview();
    review.objectives[0].actions![0].label = '   ';
    await expect(review.validate()).rejects.toThrow();
  });
});

describe('IntegrationSettings — secrets chiffrés', () => {
  it('chiffre le jeton Jira et la clé Monday, pas l’URL', () => {
    const doc = new IntegrationSettings({ jiraUrl: 'https://jira', jiraApiToken: ' secret ', mondayApiKey: 'mk' });
    expect(isEncryptedValue(doc.get('jiraApiToken', null, { getters: false }))).toBe(true);
    expect(isEncryptedValue(doc.get('mondayApiKey', null, { getters: false }))).toBe(true);
    expect(doc.get('jiraUrl', null, { getters: false })).toBe('https://jira');
    expect(doc.toObject().jiraApiToken).toBe('secret');
  });
});
