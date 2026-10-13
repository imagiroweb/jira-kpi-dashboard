/**
 * TU — Anonymisation d'une fiche de performance
 */
import { anonymizeReviewContent, ANONYMIZED_ACTION_LABEL, ANONYMIZED_AUTHOR_LABEL } from './anonymizeReview';

const SUBJECT = 'user-jean';
const NEW_ID = 'anon-123';
const MANAGER = { id: 'lead-1', name: 'Marie Lead', role: 'lead' };
const JEAN = { id: SUBJECT, name: 'Jean Dupont', role: 'collaborateur' };

const review = {
  objectives: [
    {
      id: 'o1',
      title: 'Fiabiliser la synchro Jira',
      weight: 0.4,
      selfAssessment: { status: 'atteint', comment: 'J’ai tout fait' },
      managerAssessment: { status: 'partiel', comment: 'Manque de rigueur', coachingAction: 'Coaching hebdo' },
      krs: [
        {
          id: 'k1',
          label: '0 incident',
          weight: 1,
          progress: 80,
          progressHistory: [
            { value: 50, note: 'difficile ce mois-ci', evidenceUrl: 'https://jira/X-1', updatedBy: JEAN, updatedAt: new Date('2026-08-01') },
            { value: 80, updatedBy: MANAGER, updatedAt: new Date('2026-09-01') }
          ]
        }
      ],
      actions: [{ id: 'a1', label: 'Formation gestion du stress', status: 'a_faire', createdBy: MANAGER, updatedBy: JEAN }]
    }
  ],
  qualitative: { successes: { self: 'Beau semestre', manager: 'OK' }, challenges: { self: 'Santé' } },
  definedBy: MANAGER,
  createdBy: JEAN,
  updatedBy: MANAGER
};

describe('anonymizeReviewContent', () => {
  const out = anonymizeReviewContent(review, SUBJECT, NEW_ID);
  const serialized = JSON.stringify(out);

  it('efface tout le texte libre rédigé sur la personne', () => {
    for (const text of ['J’ai tout fait', 'Manque de rigueur', 'Coaching hebdo', 'difficile ce mois-ci', 'https://jira/X-1', 'Formation gestion du stress', 'Beau semestre', 'Santé']) {
      expect(serialized).not.toContain(text);
    }
    expect(out.qualitative).toEqual({ successes: {}, challenges: {}, growthAreas: {}, overallReview: {} });
    expect(out.objectives[0].actions[0].label).toBe(ANONYMIZED_ACTION_LABEL);
  });

  it('conserve les données utiles aux statistiques (objectifs, poids, avancement, statuts)', () => {
    const o = out.objectives[0];
    expect(o).toEqual(expect.objectContaining({ id: 'o1', title: 'Fiabiliser la synchro Jira', weight: 0.4 }));
    expect(o.selfAssessment).toEqual({ status: 'atteint' });
    expect(o.managerAssessment).toEqual({ status: 'partiel' });
    expect((o.krs[0] as Record<string, unknown>).progress).toBe(80);
    expect(o.krs[0].progressHistory.map((u) => (u as Record<string, unknown>).value)).toEqual([50, 80]);
    expect((o.actions[0] as Record<string, unknown>).status).toBe('a_faire');
  });

  it('remplace la personne comme autrice (identifiant et nom), sans toucher aux autres auteurs', () => {
    expect(serialized).not.toContain('Jean Dupont');
    expect(serialized).not.toContain(SUBJECT);
    expect(out.createdBy).toEqual({ id: NEW_ID, name: ANONYMIZED_AUTHOR_LABEL, role: 'collaborateur' });
    expect(out.objectives[0].krs[0].progressHistory[1].updatedBy).toEqual(MANAGER);
    expect(out.definedBy).toEqual(MANAGER);
    expect(out.objectives[0].actions[0].updatedBy?.name).toBe(ANONYMIZED_AUTHOR_LABEL);
  });

  it('ne modifie pas l’objet source', () => {
    expect(review.objectives[0].managerAssessment.comment).toBe('Manque de rigueur');
  });
});
