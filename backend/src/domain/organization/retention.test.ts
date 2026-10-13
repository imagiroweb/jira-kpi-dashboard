/**
 * TU — Durées de conservation
 */
import { computeRetentionCutoffs, parseRetentionInput } from './retention';

const NOW = new Date('2026-09-28T10:00:00Z');

describe('computeRetentionCutoffs', () => {
  it('calcule les dates limites à partir des durées', () => {
    const c = computeRetentionCutoffs({ activityLogMonths: 12, performanceReviewYears: 5, inactiveAccountMonths: 6 }, NOW);
    expect(c.activityLogsBefore?.toISOString()).toBe('2025-09-28T10:00:00.000Z');
    expect(c.performanceCyclesEndedBefore?.toISOString()).toBe('2021-09-28T10:00:00.000Z');
    expect(c.inactiveAccountsDeactivatedBefore?.toISOString()).toBe('2026-03-28T10:00:00.000Z');
  });

  it('ne purge rien pour une durée non définie (null / absente / invalide)', () => {
    expect(computeRetentionCutoffs({ activityLogMonths: null, performanceReviewYears: 0 }, NOW)).toEqual({
      activityLogsBefore: null,
      performanceCyclesEndedBefore: null,
      inactiveAccountsDeactivatedBefore: null
    });
    expect(computeRetentionCutoffs(undefined, NOW).activityLogsBefore).toBeNull();
  });
});

describe('parseRetentionInput', () => {
  it('accepte des entiers dans les bornes et null', () => {
    expect(parseRetentionInput({ activityLogMonths: 6, performanceReviewYears: null })).toEqual({
      value: { activityLogMonths: 6, performanceReviewYears: null },
      errors: []
    });
  });

  it('refuse les valeurs hors bornes ou non entières', () => {
    const r = parseRetentionInput({ activityLogMonths: 0, performanceReviewYears: 2.5, inactiveAccountMonths: '12' });
    expect(r.value).toBeUndefined();
    expect(r.errors).toHaveLength(3);
  });

  it('ignore les champs absents', () => {
    expect(parseRetentionInput({})).toEqual({ value: {}, errors: [] });
  });
});
