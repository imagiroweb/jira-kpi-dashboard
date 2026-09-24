import { describe, expect, it } from 'vitest';
import {
  GENERAL_ASSESSMENT_REFERENTIAL,
  coachingStatusLabel,
  canCompleteReview,
  computeAutoObjectiveStatus,
  computeCoachingStatus,
  computeCyclePace,
  computeObjectiveCoaching,
  computeObjectiveWeightedScore,
  computeReviewCoaching,
  cycleMonthCheckpoints,
  formatWeightedScore,
  normalizePerformanceReview,
  suggestCompetencyAxes,
  summarizeObjectiveStatuses,
  summarizeTeamReviews,
  type Objective,
  type PerformanceReview,
  normalizeObjectiveActions,
  legacyCoachingActionId,
  summarizeObjectiveActions,
  mergeObjectiveActionsSummaries,
  isObjectiveActionOverdue
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


describe('canCompleteReview', () => {
  const fullAxes = {
    technique: [{ label: 'Qualité du code & revues', score: 4 }],
    impact: [{ label: 'Livraison (delivery)', score: 4 }],
    collaboration: [{ label: 'Communication & transparence', score: 4 }],
    leadership: [{ label: 'Initiative & autonomie', score: 4 }]
  };
  const emptyAxes = { technique: [], impact: [], collaboration: [], leadership: [] };

  it('est valide quand chaque objectif a un statut manager et que la grille est complète', () => {
    expect(
      canCompleteReview([{ managerAssessment: { status: 'atteint' } }], fullAxes)
    ).toEqual({ valid: true, errors: [] });
  });

  it('refuse une fiche sans objectif ou sans grille manager complète', () => {
    expect(canCompleteReview([], fullAxes).valid).toBe(false);
    expect(canCompleteReview([{ managerAssessment: { status: 'atteint' } }], emptyAxes).valid).toBe(false);
    expect(canCompleteReview([{ managerAssessment: {} }], fullAxes).valid).toBe(false);
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

const S2_2026 = { startDate: '2026-07-01', endDate: '2026-12-31' };

describe('computeObjectiveWeightedScore', () => {
  it('multiplie l’avancement par le poids de l’objectif', () => {
    const objective: Pick<Objective, 'weight' | 'krs'> = {
      weight: 0.3,
      krs: [{ id: 'kr-1', label: 'KR', weight: 1, progress: 50, progressHistory: [] }]
    };
    expect(computeObjectiveWeightedScore(objective)).toBeCloseTo(15);
  });
});

describe('computeCyclePace', () => {
  it('place le début du semestre à 0 et la fin à 100 % attendu', () => {
    expect(computeCyclePace(S2_2026.startDate, S2_2026.endDate, new Date('2026-07-01T00:00:00.000Z')).expectedProgress).toBe(0);
    expect(computeCyclePace(S2_2026.startDate, S2_2026.endDate, new Date('2026-12-31T00:00:00.000Z')).expectedProgress).toBe(100);
  });

  it('répartit le semestre en 6 mois : à mi-parcours, 3 mois écoulés / 50 % attendu', () => {
    const mid = computeCyclePace(S2_2026.startDate, S2_2026.endDate, new Date('2026-10-01T00:00:00.000Z'));
    expect(mid.expectedProgress).toBeCloseTo(50.27, 0);
    expect(mid.elapsedMonths).toBeCloseTo(3, 0);
    expect(mid.remainingMonths).toBeCloseTo(3, 0);
    expect(mid.monthIndex).toBe(4);
  });

  it('reste à 0 si les dates du cycle sont invalides', () => {
    const pace = computeCyclePace('invalid', 'also-invalid');
    expect(pace.expectedProgress).toBe(0);
    expect(pace.remainingMonths).toBe(6);
  });
});

describe('computeCoachingStatus', () => {
  it('est performant quand l’avancement dépasse l’attendu de plus de 8 pts', () => {
    expect(computeCoachingStatus(60, 50)).toBe('performant');
  });

  it('reste en progression dans la bande des délais (±8 pts)', () => {
    expect(computeCoachingStatus(50, 50)).toBe('en_progression');
    expect(computeCoachingStatus(55, 50)).toBe('en_progression');
    expect(computeCoachingStatus(42, 50)).toBe('en_progression');
  });

  it('demande une action à mener quand on est en retard de plus de 8 pts', () => {
    expect(computeCoachingStatus(40, 50)).toBe('action_a_mener');
  });

  it('adresse "Action requise" au collaborateur et "Action à mener" au manager', () => {
    expect(coachingStatusLabel('action_a_mener', 'self')).toBe('Action requise');
    expect(coachingStatusLabel('action_a_mener', 'manager')).toBe('Action à mener');
    expect(coachingStatusLabel('performant', 'self')).toBe('Performant');
  });
});

describe('computeObjectiveCoaching / computeReviewCoaching', () => {
  const now = new Date('2026-10-01T00:00:00.000Z');

  it('calcule score pondéré + statut d’un objectif à mi-semestre', () => {
    const coaching = computeObjectiveCoaching(
      {
        weight: 0.4,
        krs: [{ id: 'kr-1', label: 'KR', weight: 1, progress: 80, progressHistory: [] }]
      },
      S2_2026,
      now
    );
    expect(coaching.weightedScore).toBeCloseTo(32);
    expect(coaching.status).toBe('performant');
  });

  it('agrège l’avancement total de la fiche sur la même courbe à 6 mois', () => {
    const coaching = computeReviewCoaching(
      [
        { weight: 0.4, krs: [{ id: 'a', label: 'A', weight: 1, progress: 60, progressHistory: [] }] },
        { weight: 0.4, krs: [{ id: 'b', label: 'B', weight: 1, progress: 40, progressHistory: [] }] },
        { weight: 0.2, krs: [{ id: 'c', label: 'C', weight: 1, progress: 100, progressHistory: [] }] }
      ],
      S2_2026,
      now
    );
    expect(coaching.weightedScore).toBeCloseTo(60);
    expect(coaching.status).toBe('performant');
  });
});

describe('cycleMonthCheckpoints / formatWeightedScore', () => {
  it('expose les 6 jalons mensuels (17, 33, 50, 67, 83, 100)', () => {
    expect(cycleMonthCheckpoints().map((value) => Math.round(value))).toEqual([17, 33, 50, 67, 83, 100]);
  });

  it('formate le réalisé pondéré sur le poids de l’objectif', () => {
    expect(formatWeightedScore(15, 0.3)).toBe('15 / 30 pts');
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

describe('actions à mener (normalizeObjectiveActions / summarizeObjectiveActions)', () => {
  const author = { id: 'lead', name: 'lead' };
  const baseObjective = {
    id: 'obj-1',
    title: 'x',
    weight: 1,
    krs: [],
    selfAssessment: {},
    managerAssessment: {}
  };

  it("affiche l'ancien champ coachingAction comme une action à faire (même id que le backend)", () => {
    const normalized = normalizeObjectiveActions({
      ...baseObjective,
      managerAssessment: { coachingAction: 'Ancienne action' }
    });
    expect(normalized.actions).toEqual([
      expect.objectContaining({ id: legacyCoachingActionId('obj-1'), label: 'Ancienne action', status: 'a_faire' })
    ]);
  });

  it('compte par statut, les retards et le taux de réalisation ; fusionne par équipe', () => {
    const now = new Date('2026-09-24T12:00:00');
    const summary = summarizeObjectiveActions(
      [
        {
          ...baseObjective,
          actions: [
            { id: 'a', label: 'a', status: 'termine', createdBy: author, createdAt: '' },
            { id: 'b', label: 'b', status: 'en_cours', createdBy: author, createdAt: '', dueDate: '2026-09-01' },
            { id: 'c', label: 'c', status: 'a_faire', createdBy: author, createdAt: '', dueDate: '2026-12-01' }
          ]
        }
      ],
      now
    );
    expect(summary).toEqual({ total: 3, aFaire: 1, enCours: 1, termine: 1, overdue: 1, completionRate: (1 / 3) * 100 });
    const merged = mergeObjectiveActionsSummaries([summary, summarizeObjectiveActions([baseObjective], now)]);
    expect(merged.total).toBe(3);
    expect(mergeObjectiveActionsSummaries([]).completionRate).toBeNull();
  });

  it("n'est jamais en retard une fois terminée", () => {
    expect(isObjectiveActionOverdue({ status: 'termine', dueDate: '2020-01-01' })).toBe(false);
  });
});
