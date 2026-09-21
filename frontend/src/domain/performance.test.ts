import { describe, expect, it } from 'vitest';
import {
  GENERAL_ASSESSMENT_REFERENTIAL,
  normalizePerformanceReview,
  suggestCompetencyAxes,
  type PerformanceReview
} from './performance';

function incompleteReview(): PerformanceReview {
  return {
    id: 'review-1',
    user: 'user-1',
    cycle: 'cycle-1',
    objectives: [
      {
        id: 'obj-1',
        title: 'Objectif',
        weight: 1,
        krs: [],
        selfAssessment: undefined as unknown as PerformanceReview['objectives'][0]['selfAssessment'],
        managerAssessment: undefined as unknown as PerformanceReview['objectives'][0]['managerAssessment']
      }
    ],
    qualitative: {} as PerformanceReview['qualitative'],
    competencyScores: {} as PerformanceReview['competencyScores'],
    generalSelfAssessment: undefined as unknown as PerformanceReview['generalSelfAssessment'],
    generalManagerAssessment: undefined as unknown as PerformanceReview['generalManagerAssessment'],
    status: 'en_cours',
    createdBy: { id: 'user-1', name: 'bruno' },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z'
  };
}

describe('normalizePerformanceReview', () => {
  it('remplit qualitative / competencyScores / assessments manquants (payload Mongoose incomplet)', () => {
    const normalized = normalizePerformanceReview(incompleteReview());

    expect(normalized.qualitative.successes.self).toBeUndefined();
    expect(normalized.qualitative.challenges).toEqual({});
    expect(normalized.qualitative.growthAreas).toEqual({});
    expect(normalized.qualitative.overallReview).toEqual({});
    expect(normalized.competencyScores.technique).toEqual({});
    expect(normalized.competencyScores.leadership).toEqual({});
    expect(normalized.objectives[0].selfAssessment).toEqual({});
    expect(normalized.objectives[0].managerAssessment).toEqual({});
    expect(normalized.generalSelfAssessment).toEqual({
      technique: [],
      impact: [],
      collaboration: [],
      leadership: []
    });
    expect(normalized.generalManagerAssessment).toEqual({
      technique: [],
      impact: [],
      collaboration: [],
      leadership: []
    });
  });
});

describe('GENERAL_ASSESSMENT_REFERENTIAL', () => {
  it('liste 3 sous-critères pour chacun des 4 axes', () => {
    (['technique', 'impact', 'collaboration', 'leadership'] as const).forEach((axis) => {
      expect(GENERAL_ASSESSMENT_REFERENTIAL[axis]).toHaveLength(3);
    });
  });
});


describe('suggestCompetencyAxes', () => {
  it('suggère un axe unique à partir d\'un mot-clé du titre', () => {
    expect(suggestCompetencyAxes("Refactoriser l'architecture technique")).toEqual(['technique']);
  });

  it('suggère un axe à partir de la description quand le titre ne matche rien', () => {
    expect(suggestCompetencyAxes('Objectif Q3', 'Améliorer la satisfaction client et le delivery')).toEqual(['impact']);
  });

  it('classe par nombre de correspondances et limite à 2 axes', () => {
    const result = suggestCompetencyAxes(
      "Mentorer l'équipe technique",
      "Vision, encadrement, recrutement et collaboration transverse avec le code et l'architecture"
    );
    expect(result).toEqual(['leadership', 'technique']);
  });

  it('ne suggère rien quand aucun mot-clé ne correspond', () => {
    expect(suggestCompetencyAxes('Titre neutre sans mot-clé particulier')).toEqual([]);
  });
});
