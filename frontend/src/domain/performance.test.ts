import { describe, expect, it } from 'vitest';
import {
  GENERAL_ASSESSMENT_REFERENTIAL,
  computeAutoObjectiveStatus,
  normalizePerformanceReview,
  suggestCompetencyAxes,
  summarizeObjectiveStatuses,
  summarizeTeamReviews,
  type Objective,
  type PerformanceReview
} from './performance';

function objectiveWithStatuses(
  selfStatus: Objective['selfAssessment']['status'],
  managerStatus: Objective['managerAssessment']['status']
): Pick<Objective, 'selfAssessment' | 'managerAssessment'> {
  return {
    selfAssessment: { status: selfStatus },
    managerAssessment: { status: managerStatus }
  };
}

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
    generalSelfAssessment: undefined as unknown as PerformanceReview['generalSelfAssessment'],
    generalManagerAssessment: undefined as unknown as PerformanceReview['generalManagerAssessment'],
    status: 'en_cours',
    createdBy: { id: 'user-1', name: 'bruno' },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z'
  };
}

describe('normalizePerformanceReview', () => {
  it('remplit qualitative / assessments manquants (payload Mongoose incomplet)', () => {
    const normalized = normalizePerformanceReview(incompleteReview());

    expect(normalized.qualitative.successes.self).toBeUndefined();
    expect(normalized.qualitative.challenges).toEqual({});
    expect(normalized.qualitative.growthAreas).toEqual({});
    expect(normalized.qualitative.overallReview).toEqual({});
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

describe('computeAutoObjectiveStatus', () => {
  it('retourne "non_atteint" en dessous de 50%', () => {
    expect(computeAutoObjectiveStatus(0)).toBe('non_atteint');
    expect(computeAutoObjectiveStatus(49)).toBe('non_atteint');
  });

  it('retourne "partiellement_atteint" entre 50% (inclus) et 95% (exclu)', () => {
    expect(computeAutoObjectiveStatus(50)).toBe('partiellement_atteint');
    expect(computeAutoObjectiveStatus(94)).toBe('partiellement_atteint');
  });

  it('retourne "atteint" à partir de 95%', () => {
    expect(computeAutoObjectiveStatus(95)).toBe('atteint');
    expect(computeAutoObjectiveStatus(100)).toBe('atteint');
  });

  it('ne retourne jamais "depasse" (statut exclusivement manuel)', () => {
    expect(computeAutoObjectiveStatus(100)).not.toBe('depasse');
  });
});

describe('GENERAL_ASSESSMENT_REFERENTIAL', () => {
  it('liste 3 sous-critères pour chacun des 4 axes', () => {
    (['technique', 'impact', 'collaboration', 'leadership'] as const).forEach((axis) => {
      expect(GENERAL_ASSESSMENT_REFERENTIAL[axis]).toHaveLength(3);
    });
  });
});


describe('summarizeObjectiveStatuses', () => {
  it('compte les objectifs par statut manager, trié du moins bon au meilleur', () => {
    const summary = summarizeObjectiveStatuses([
      objectiveWithStatuses(undefined, 'atteint'),
      objectiveWithStatuses(undefined, 'non_atteint'),
      objectiveWithStatuses(undefined, 'atteint')
    ]);

    expect(summary).toEqual([
      { status: 'non_atteint', count: 1 },
      { status: 'atteint', count: 2 }
    ]);
  });

  it("retombe sur le statut collaborateur (self) quand le manager n'a pas encore statué", () => {
    const summary = summarizeObjectiveStatuses([objectiveWithStatuses('partiellement_atteint', undefined)]);

    expect(summary).toEqual([{ status: 'partiellement_atteint', count: 1 }]);
  });

  it('priorise le statut manager sur le statut collaborateur quand les deux sont renseignés', () => {
    const summary = summarizeObjectiveStatuses([objectiveWithStatuses('non_atteint', 'depasse')]);

    expect(summary).toEqual([{ status: 'depasse', count: 1 }]);
  });

  it("ignore les objectifs sans statut des deux côtés", () => {
    const summary = summarizeObjectiveStatuses([objectiveWithStatuses(undefined, undefined)]);

    expect(summary).toEqual([]);
  });

  it('renvoie un tableau vide sans objectif', () => {
    expect(summarizeObjectiveStatuses([])).toEqual([]);
  });
});

function reviewForTeamSummary(
  overrides: Partial<
    Pick<PerformanceReview, 'status' | 'objectives' | 'generalSelfAssessment' | 'generalManagerAssessment'>
  > = {}
): Pick<PerformanceReview, 'status' | 'objectives' | 'generalSelfAssessment' | 'generalManagerAssessment'> {
  return {
    status: 'dossier_manquant',
    objectives: [],
    generalSelfAssessment: { technique: [], impact: [], collaboration: [], leadership: [] },
    generalManagerAssessment: { technique: [], impact: [], collaboration: [], leadership: [] },
    ...overrides
  };
}

describe('summarizeTeamReviews', () => {
  it('renvoie des compteurs à zéro et des moyennes null sans fiche', () => {
    const summary = summarizeTeamReviews([]);
    expect(summary).toEqual({
      reviewCount: 0,
      statusCounts: { dossier_manquant: 0, en_cours: 0, complete: 0 },
      avgObjectivesScore: null,
      avgSelfAssessmentScore: null,
      avgManagerAssessmentScore: null
    });
  });

  it('compte les fiches par statut', () => {
    const summary = summarizeTeamReviews([
      reviewForTeamSummary({ status: 'dossier_manquant' }),
      reviewForTeamSummary({ status: 'en_cours' }),
      reviewForTeamSummary({ status: 'en_cours' }),
      reviewForTeamSummary({ status: 'complete' })
    ]);
    expect(summary.reviewCount).toBe(4);
    expect(summary.statusCounts).toEqual({ dossier_manquant: 1, en_cours: 2, complete: 1 });
  });

  it('moyenne le score objectifs uniquement sur les fiches ayant des objectifs définis', () => {
    const summary = summarizeTeamReviews([
      reviewForTeamSummary({
        objectives: [{ id: 'o1', title: 'Objectif', weight: 1, krs: [{ id: 'kr1', label: 'KR', weight: 1, progress: 80, progressHistory: [] }], selfAssessment: {}, managerAssessment: {} }]
      }),
      reviewForTeamSummary({ objectives: [] })
    ]);
    expect(summary.avgObjectivesScore).toBe(80);
  });

  it("moyenne les scores de grille générale uniquement sur les fiches ayant un axe noté (n'inclut pas les fiches vides comme des 0)", () => {
    const summary = summarizeTeamReviews([
      reviewForTeamSummary({
        generalSelfAssessment: {
          technique: [{ label: 'Qualité du code', score: 4 }],
          impact: [],
          collaboration: [],
          leadership: []
        }
      }),
      reviewForTeamSummary()
    ]);
    expect(summary.avgSelfAssessmentScore).toBe(4);
  });

  it('moyenne le score de la grille générale manager séparément de celui du collaborateur', () => {
    const summary = summarizeTeamReviews([
      reviewForTeamSummary({
        generalManagerAssessment: {
          technique: [{ label: 'Qualité du code', score: 5, answer: 'Excellent' }],
          impact: [],
          collaboration: [],
          leadership: []
        }
      }),
      reviewForTeamSummary({
        generalManagerAssessment: {
          technique: [{ label: 'Qualité du code', score: 3, answer: 'Correct' }],
          impact: [],
          collaboration: [],
          leadership: []
        }
      })
    ]);
    expect(summary.avgManagerAssessmentScore).toBe(4);
    expect(summary.avgSelfAssessmentScore).toBeNull();
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
