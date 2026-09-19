import { describe, expect, it } from 'vitest';
import { normalizePerformanceReview, type PerformanceReview } from './performance';

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
  });
});
