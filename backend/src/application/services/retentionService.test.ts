/**
 * TU — Purge des données selon les durées de conservation
 */
const mockOrgFind = jest.fn();
const mockUserDistinct = jest.fn();
const mockUserFindArgs: unknown[] = [];
const mockLogDeleteMany = jest.fn();
const mockCycleDistinct = jest.fn();
const mockReviewDeleteMany = jest.fn();

jest.mock('../../domain/organization/entities/Organization', () => ({
  Organization: { find: () => ({ select: () => ({ lean: () => mockOrgFind() }) }) }
}));
jest.mock('../../domain/user/entities/User', () => ({
  User: {
    find: (filter: unknown) => {
      mockUserFindArgs.push(filter);
      return { distinct: () => mockUserDistinct(filter) };
    }
  }
}));
jest.mock('../../domain/user/entities/UserActivityLog', () => ({
  UserActivityLog: { deleteMany: (...a: unknown[]) => mockLogDeleteMany(...a) }
}));
jest.mock('../../domain/performance/entities/PerformanceCycle', () => ({
  PerformanceCycle: { find: (f: unknown) => ({ distinct: () => mockCycleDistinct(f) }) }
}));
jest.mock('../../domain/performance/entities/PerformanceReview', () => ({
  PerformanceReview: { deleteMany: (...a: unknown[]) => mockReviewDeleteMany(...a) }
}));
jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

import { purgeExpiredData, registerAccountAnonymizer } from './retentionService';

const NOW = new Date('2026-09-28T00:00:00Z');

describe('purgeExpiredData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindArgs.length = 0;
    mockLogDeleteMany.mockResolvedValue({ deletedCount: 42 });
    mockReviewDeleteMany.mockResolvedValue({ deletedCount: 3 });
  });

  it('supprime les logs d’activité au-delà de la durée de l’organisation', async () => {
    mockOrgFind.mockResolvedValue([{ _id: 'o1', slug: 'adoria', retention: { activityLogMonths: 12 } }]);
    mockUserDistinct.mockResolvedValue(['u1', 'u2']);

    const [report] = await purgeExpiredData(NOW);

    expect(mockLogDeleteMany).toHaveBeenCalledWith({
      userId: { $in: ['u1', 'u2'] },
      timestamp: { $lt: new Date('2025-09-28T00:00:00Z') }
    });
    expect(report).toEqual({ organization: 'adoria', activityLogsDeleted: 42, performanceReviewsDeleted: 0, accountsAnonymized: 0 });
    expect(mockReviewDeleteMany).not.toHaveBeenCalled();
  });

  it('supprime les fiches des cycles terminés depuis plus de N années, seulement pour l’organisation', async () => {
    mockOrgFind.mockResolvedValue([{ _id: 'o1', slug: 'adoria', retention: { activityLogMonths: null, performanceReviewYears: 5 } }]);
    mockUserDistinct.mockResolvedValue(['u1']);
    mockCycleDistinct.mockResolvedValue(['c-2020']);

    const [report] = await purgeExpiredData(NOW);

    expect(mockCycleDistinct).toHaveBeenCalledWith({ endDate: { $lt: new Date('2021-09-28T00:00:00Z') } });
    expect(mockReviewDeleteMany).toHaveBeenCalledWith({ user: { $in: ['u1'] }, cycle: { $in: ['c-2020'] } });
    expect(report.performanceReviewsDeleted).toBe(3);
    expect(mockLogDeleteMany).not.toHaveBeenCalled();
  });

  it('anonymise les comptes désactivés depuis plus de N mois', async () => {
    const anonymize = jest.fn().mockResolvedValue(undefined);
    registerAccountAnonymizer(anonymize);
    mockOrgFind.mockResolvedValue([{ _id: 'o1', slug: 'adoria', retention: { activityLogMonths: null, inactiveAccountMonths: 6 } }]);
    mockUserDistinct.mockImplementation(async (filter: { isActive?: boolean }) => (filter.isActive === false ? ['old1', 'old2'] : ['u1']));

    const [report] = await purgeExpiredData(NOW);

    expect(mockUserFindArgs).toContainEqual({
      organizationId: 'o1',
      isActive: false,
      anonymizedAt: null,
      deactivatedAt: { $ne: null, $lt: new Date('2026-03-28T00:00:00Z') }
    });
    expect(anonymize).toHaveBeenCalledWith('old1', 'retention');
    expect(anonymize).toHaveBeenCalledWith('old2', 'retention');
    expect(report.accountsAnonymized).toBe(2);
  });

  it('ne purge rien si aucune durée n’est définie', async () => {
    mockOrgFind.mockResolvedValue([{ _id: 'o1', slug: 'adoria', retention: { activityLogMonths: null } }]);
    mockUserDistinct.mockResolvedValue(['u1']);

    await purgeExpiredData(NOW);

    expect(mockLogDeleteMany).not.toHaveBeenCalled();
    expect(mockReviewDeleteMany).not.toHaveBeenCalled();
  });
});
