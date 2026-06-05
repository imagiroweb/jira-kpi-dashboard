import { DateRange } from '../../domain/worklog/value-objects/DateRange';

const mockJiraClient = {
  getProjects: jest.fn(),
  configuredProjectKeys: ['ABC'],
  configuredBoardIds: [10],
  getBoard: jest.fn(),
  getBoardSprints: jest.fn(),
  getTimeTrackingConfig: jest.fn()
};

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
  },
  jiraClient: mockJiraClient
};

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../infrastructure/Container', () => ({
  container: () => mockContainerDeps
}));

import { WorklogApplicationService } from './WorklogApplicationService';

describe('WorklogApplicationService', () => {
  const service = new WorklogApplicationService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockJiraClient.getProjects.mockReset().mockResolvedValue([]);
    mockJiraClient.getBoard.mockReset().mockResolvedValue({ id: 10, name: 'Board', location: { projectKey: 'ABC' } });
    mockJiraClient.getBoardSprints.mockReset().mockResolvedValue([]);
    mockJiraClient.getTimeTrackingConfig.mockReset().mockResolvedValue({ workingHoursPerDay: 8, workingDaysPerWeek: 5 });
    mockJiraClient.configuredProjectKeys = ['ABC'];
    mockJiraClient.configuredBoardIds = [10];
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

  it('getWorklogsForIssue délègue findByIssue', async () => {
    mockContainerDeps.worklogRepository.findByIssue.mockResolvedValue([]);
    await service.getWorklogsForIssue('K-1');
    expect(mockContainerDeps.worklogRepository.findByIssue).toHaveBeenCalledWith('K-1');
  });

  it('getWorklogsForProject délègue findByProject avec DateRange', async () => {
    mockContainerDeps.worklogRepository.findByProject.mockResolvedValue([]);
    await service.getWorklogsForProject('PRJ', '2026-04-01', '2026-04-10');
    expect(mockContainerDeps.worklogRepository.findByProject).toHaveBeenCalledWith(
      'PRJ',
      expect.any(DateRange)
    );
  });

  it('testConnection retourne success ou false selon getProjects', async () => {
    mockJiraClient.getProjects.mockResolvedValueOnce([{ key: 'A' }]);
    await expect(service.testConnection()).resolves.toEqual(
      expect.objectContaining({ success: true, endpoint: 'Jira Cloud REST API', version: '3' })
    );
    mockJiraClient.getProjects.mockRejectedValueOnce(new Error('down'));
    await expect(service.testConnection()).resolves.toEqual({ success: false });
  });

  it('getTimeTrackingConfig délègue au client Jira', async () => {
    mockJiraClient.getTimeTrackingConfig.mockResolvedValue({ workingHoursPerDay: 7, workingDaysPerWeek: 4 });
    await expect(service.getTimeTrackingConfig()).resolves.toEqual({
      workingHoursPerDay: 7,
      workingDaysPerWeek: 4
    });
  });

  it('getConfiguredProjects retourne les clés ou [] si erreur', async () => {
    await expect(service.getConfiguredProjects()).resolves.toEqual(['ABC']);
    const desc = Object.getOwnPropertyDescriptor(mockJiraClient, 'configuredProjectKeys');
    try {
      Object.defineProperty(mockJiraClient, 'configuredProjectKeys', {
        configurable: true,
        get: () => {
          throw new Error('no jira');
        }
      });
      await expect(service.getConfiguredProjects()).resolves.toEqual([]);
    } finally {
      if (desc) Object.defineProperty(mockJiraClient, 'configuredProjectKeys', desc);
      else {
        Object.defineProperty(mockJiraClient, 'configuredProjectKeys', {
          value: ['ABC'],
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
    }
  });

  it('getConfiguredBoards mappe les boards et gère null / erreur', async () => {
    mockJiraClient.getBoard.mockResolvedValueOnce({ id: 10, name: 'Real', location: { projectKey: 'P' } });
    const ok = await service.getConfiguredBoards();
    expect(ok[0].name).toBe('Real');

    mockJiraClient.getBoard.mockResolvedValueOnce(null);
    const fallback = await service.getConfiguredBoards();
    expect(fallback[0].name).toBe('Board 10');
    expect(fallback[0].projectKey).toBeNull();

    mockJiraClient.getBoard.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(service.getConfiguredBoards()).resolves.toEqual([]);
  });

  it('getActiveSprintDateRange retourne null ou la plage depuis les sprints', async () => {
    mockJiraClient.configuredBoardIds = [];
    await expect(service.getActiveSprintDateRange()).resolves.toBeNull();

    mockJiraClient.configuredBoardIds = [10];
    mockJiraClient.getBoard.mockResolvedValue({ id: 10, name: 'B', location: {} });
    mockJiraClient.getBoardSprints.mockImplementation(async (_id: number, state?: string) => {
      if (state === 'active') return [];
      if (state === 'closed') {
        return [
          { id: 1, startDate: '2026-03-01T00:00:00.000Z', endDate: '2026-03-14T00:00:00.000Z' },
          { id: 2, startDate: '2026-04-01T00:00:00.000Z', endDate: '2026-04-15T00:00:00.000Z' }
        ];
      }
      return [];
    });
    const range = await service.getActiveSprintDateRange();
    expect(range).toEqual({ from: '2026-04-01', to: '2026-04-15' });
  });
});
