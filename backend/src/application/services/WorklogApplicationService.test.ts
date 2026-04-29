import { DateRange } from '../../domain/worklog/value-objects/DateRange';

const mockContainerDeps = {
  worklogRepository: {
    search: jest.fn(),
    findByIssue: jest.fn(),
    findByUser: jest.fn(),
    findByProject: jest.fn()
  },
  worklogMetricsCalculator: {
    calculate: jest.fn()
  },
  sprintRepository: {
    findOpenSprintIssues: jest.fn(),
    findBacklogIssues: jest.fn()
  },
  sprintMetricsCalculator: {
    calculate: jest.fn()
  },
  getVelocityHistoryUseCase: {
    execute: jest.fn()
  }
};

jest.mock('../../infrastructure/Container', () => ({
  container: () => mockContainerDeps
}));

import { WorklogApplicationService } from './WorklogApplicationService';

describe('WorklogApplicationService', () => {
  const service = new WorklogApplicationService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('searchWorklogs délègue au repository avec les filtres', async () => {
    const expected = [{ id: 'w1' }];
    mockContainerDeps.worklogRepository.search.mockResolvedValue(expected);

    const result = await service.searchWorklogs({ projectKey: 'ABC', from: '2026-04-01', to: '2026-04-10' });

    expect(mockContainerDeps.worklogRepository.search).toHaveBeenCalledWith({
      projectKey: 'ABC',
      from: '2026-04-01',
      to: '2026-04-10'
    });
    expect(result).toBe(expected);
  });

  it('calculateMetrics mappe les métriques calculées au format legacy', () => {
    mockContainerDeps.worklogMetricsCalculator.calculate.mockReturnValue({
      totalTimeSpentHours: 12,
      billableHours: 8,
      worklogCount: 5,
      uniqueUsers: 2,
      uniqueIssues: 4,
      byUser: [{ accountId: 'u1' }],
      byProject: [{ projectKey: 'ABC' }],
      byDay: [{ date: '2026-04-01' }]
    });

    const metrics = service.calculateMetrics([] as never[]);

    expect(metrics.totalTimeSpentHours).toBe(12);
    expect(metrics.byProject).toEqual([{ projectKey: 'ABC' }]);
  });

  it('getWorklogsForUser crée un DateRange puis appelle findByUser', async () => {
    mockContainerDeps.worklogRepository.findByUser.mockResolvedValue([]);

    await service.getWorklogsForUser('account-1', '2026-04-01', '2026-04-15');

    expect(mockContainerDeps.worklogRepository.findByUser).toHaveBeenCalledTimes(1);
    const [, range] = mockContainerDeps.worklogRepository.findByUser.mock.calls[0];
    expect(range).toBeInstanceOf(DateRange);
    expect((range as DateRange).fromISO).toBe('2026-04-01');
    expect((range as DateRange).toISO).toBe('2026-04-15');
  });

  it('getSprintIssuesForProject agrège issues + backlog et mappe originalEstimateSeconds', async () => {
    mockContainerDeps.sprintRepository.findOpenSprintIssues.mockResolvedValue([
      {
        issueKey: 'ABC-1',
        summary: 'Issue 1',
        issueType: 'Story',
        status: 'In Progress',
        statusCategory: 'indeterminate',
        statusCategoryKey: 'indeterminate',
        storyPoints: 3,
        originalEstimate: { toSeconds: 7200 }
      }
    ]);
    mockContainerDeps.sprintRepository.findBacklogIssues.mockResolvedValue([
      { storyPoints: 2 },
      { storyPoints: null }
    ]);
    mockContainerDeps.sprintMetricsCalculator.calculate.mockReturnValue({
      statusCounts: { total: 1, todo: 0, inProgress: 1, qa: 0, resolved: 0 },
      storyPointsByStatus: { total: 3, todo: 0, inProgress: 3, qa: 0, resolved: 0 },
      totalStoryPoints: 3
    });

    const result = await service.getSprintIssuesForProject('ABC');

    expect(result.issues[0].originalEstimateSeconds).toBe(7200);
    expect(result.backlog).toEqual({ ticketCount: 2, storyPoints: 2 });
    expect(result.totalStoryPoints).toBe(3);
  });

  it('getVelocityHistory délègue au use case et retourne la forme attendue', async () => {
    mockContainerDeps.getVelocityHistoryUseCase.execute.mockResolvedValue({
      sprints: [{ id: 1, name: 'Sprint 1' }],
      averageVelocity: 21,
      trend: 'stable'
    });

    const result = await service.getVelocityHistory('ABC', 5);

    expect(mockContainerDeps.getVelocityHistoryUseCase.execute).toHaveBeenCalledWith('ABC', 5);
    expect(result.averageVelocity).toBe(21);
    expect(result.trend).toBe('stable');
  });
});
