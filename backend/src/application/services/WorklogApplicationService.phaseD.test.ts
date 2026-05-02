/**
 * Phase D — WorklogApplicationService : chemins Jira lourds (KPI support, resolved-by-day,
 * sprint board / batch, projets, epics, détails epic) via container mocké.
 */
import { SprintMetricsCalculator } from '../../domain/kpi/services/SprintMetricsCalculator';
import type { SprintIssuesResult } from './WorklogApplicationService';

const sprintMetricsCalculator = new SprintMetricsCalculator();

const mockJiraClient = {
  configuredProjectKeys: ['ABC'],
  configuredBoardIds: [1],
  getProjects: jest.fn(),
  getAllProjects: jest.fn(),
  getBoard: jest.fn(),
  getBoardSprints: jest.fn(),
  getBoardConfiguration: jest.fn(),
  getFilterJql: jest.fn(),
  searchIssuesWithPagination: jest.fn(),
  searchIssuesLimited: jest.fn(),
  searchIssuesPage: jest.fn(),
  searchApproximateCount: jest.fn(),
  getBoardSprintIssues: jest.fn(),
  getSprintIssues: jest.fn(),
  getIssueWorklogs: jest.fn()
};

const mockWorklogRepo = {
  search: jest.fn(),
  findByProject: jest.fn(),
  findByIssue: jest.fn(),
  findByUser: jest.fn(),
  findByOpenSprints: jest.fn()
};

const mockSprintRepo = {
  findBacklogIssues: jest.fn(),
  findOpenSprintIssues: jest.fn(),
  findOpenSprints: jest.fn(),
  findClosedSprints: jest.fn(),
  findByBoard: jest.fn(),
  findById: jest.fn(),
  findSprintIssues: jest.fn()
};

const mockWorklogMetrics = {
  calculate: jest.fn().mockReturnValue({
    totalTimeSpentHours: 0,
    billableHours: 0,
    worklogCount: 0,
    uniqueUsers: 0,
    uniqueIssues: 0,
    byUser: {},
    byProject: {},
    byDay: {}
  })
};

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../infrastructure/Container', () => ({
  container: () => ({
    jiraClient: mockJiraClient,
    worklogRepository: mockWorklogRepo,
    sprintRepository: mockSprintRepo,
    sprintMetricsCalculator,
    worklogMetricsCalculator: mockWorklogMetrics,
    getVelocityHistoryUseCase: { execute: jest.fn() },
    getSprintIssuesUseCase: { execute: jest.fn() },
    searchWorklogsUseCase: { execute: jest.fn() }
  })
}));

import { WorklogApplicationService } from './WorklogApplicationService';

describe('WorklogApplicationService (phase D — Jira orchestration)', () => {
  const service = new WorklogApplicationService();
  const initialResolvedProject = process.env.JIRA_RESOLVED_BY_DAY_PROJECT;
  const initialResolutionName = process.env.JIRA_RESOLUTION_NAME;
  const initialResolutionId = process.env.JIRA_RESOLUTION_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.JIRA_RESOLVED_BY_DAY_PROJECT;
    delete process.env.JIRA_RESOLUTION_NAME;
    delete process.env.JIRA_RESOLUTION_ID;

    mockJiraClient.configuredProjectKeys = ['ABC'];
    mockJiraClient.configuredBoardIds = [1];
    mockJiraClient.getBoard.mockImplementation(async (id: number) => ({
      id,
      name: `Board-${id}`,
      location: { projectKey: id === 2 ? 'PROJ2' : 'PROJ' }
    }));
    mockJiraClient.getBoardSprints.mockResolvedValue([
      { id: 50, name: 'Sprint', state: 'active', startDate: '2026-04-01T00:00:00.000Z', endDate: '2026-04-20T00:00:00.000Z' }
    ]);
    mockJiraClient.getBoardConfiguration.mockResolvedValue(null);
    mockJiraClient.getFilterJql.mockResolvedValue(null);
    mockJiraClient.searchIssuesWithPagination.mockResolvedValue({
      issues: [],
      total: 0,
      startAt: 0,
      maxResults: 0
    });
    mockJiraClient.searchIssuesLimited.mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 0 });
    mockJiraClient.searchIssuesPage.mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 0 });
    mockJiraClient.searchApproximateCount.mockResolvedValue(0);
    mockJiraClient.getBoardSprintIssues.mockResolvedValue([]);
    mockJiraClient.getSprintIssues.mockResolvedValue([]);
    mockJiraClient.getIssueWorklogs.mockResolvedValue([]);

    mockWorklogRepo.search.mockResolvedValue([]);
    mockWorklogRepo.findByProject.mockResolvedValue([]);
    mockSprintRepo.findBacklogIssues.mockResolvedValue([]);

    mockJiraClient.getProjects.mockResolvedValue([{ key: 'K', name: 'Proj', id: 'id1' }]);
    mockJiraClient.getAllProjects.mockResolvedValue([{ key: 'ALL', name: 'All', id: 'id2' }]);
  });

  afterEach(() => {
    if (initialResolvedProject === undefined) delete process.env.JIRA_RESOLVED_BY_DAY_PROJECT;
    else process.env.JIRA_RESOLVED_BY_DAY_PROJECT = initialResolvedProject;
    if (initialResolutionName === undefined) delete process.env.JIRA_RESOLUTION_NAME;
    else process.env.JIRA_RESOLUTION_NAME = initialResolutionName;
    if (initialResolutionId === undefined) delete process.env.JIRA_RESOLUTION_ID;
    else process.env.JIRA_RESOLUTION_ID = initialResolutionId;
  });

  it('getProjects et getAllProjects mappent ou retournent [] en erreur', async () => {
    await expect(service.getProjects()).resolves.toEqual([{ key: 'K', name: 'Proj', id: 'id1' }]);
    mockJiraClient.getProjects.mockRejectedValueOnce(new Error('down'));
    await expect(service.getProjects()).resolves.toEqual([]);

    await expect(service.getAllProjects()).resolves.toEqual([{ key: 'ALL', name: 'All', id: 'id2' }]);
    mockJiraClient.getAllProjects.mockRejectedValueOnce(new Error('down'));
    await expect(service.getAllProjects()).resolves.toEqual([]);
  });

  it('getResolvedByDay (legacy boards) agrège des issues résolues par jour', async () => {
    mockJiraClient.configuredBoardIds = [10];
    mockJiraClient.getBoard.mockResolvedValue({
      id: 10,
      name: 'Main',
      location: { projectKey: 'PROJ' }
    });
    mockJiraClient.searchIssuesWithPagination.mockResolvedValue({
      issues: [
        {
          key: 'PROJ-1',
          fields: {
            resolutiondate: '2026-04-10T15:00:00.000Z',
            updated: '2026-04-10T15:00:00.000Z',
            issuetype: { name: 'Story' },
            customfield_10127: 2
          }
        }
      ],
      total: 1,
      startAt: 0,
      maxResults: 1
    });

    const tickets = await service.getResolvedByDay('2026-04-10', '2026-04-10', 'tickets', false);
    expect(tickets.byDay.length).toBe(1);
    expect(tickets.boards.some((b) => b.name === 'Main')).toBe(true);
    expect(tickets.totalResolvedTickets).toBeGreaterThanOrEqual(1);

    mockJiraClient.searchIssuesWithPagination.mockResolvedValue({
      issues: [
        {
          key: 'PROJ-2',
          fields: {
            resolutiondate: '2026-04-10T12:00:00.000Z',
            customfield_10127: 5
          }
        }
      ],
      total: 1,
      startAt: 0,
      maxResults: 1
    });
    const points = await service.getResolvedByDay('2026-04-10', '2026-04-10', 'points', false);
    expect(points.totalsBySeries?.length).toBeGreaterThan(0);
  });

  it('getResolvedByDay retourne vide si aucun board configuré', async () => {
    mockJiraClient.configuredBoardIds = [];
    const res = await service.getResolvedByDay('2026-04-01', '2026-04-02', 'tickets', false);
    expect(res.byDay).toEqual([]);
    expect(res.boards).toEqual([]);
  });

  it('getSprintIssuesForBoard avec plage appelle search par projet + updated', async () => {
    mockJiraClient.searchIssuesWithPagination.mockResolvedValue({
      issues: [
        {
          key: 'PROJ-9',
          fields: {
            summary: 'Issue',
            issuetype: { name: 'Story' },
            status: { name: 'Done', statusCategory: { key: 'done', name: 'Done' } },
            timeoriginalestimate: 3600,
            customfield_10127: 3
          }
        }
      ],
      total: 1,
      startAt: 0,
      maxResults: 1
    });
    const res = await service.getSprintIssuesForBoard(5, '2026-04-01', '2026-04-15');
    expect(res.issues).toHaveLength(1);
    expect(res.issues[0].issueKey).toBe('PROJ-9');
    expect(mockJiraClient.searchIssuesWithPagination).toHaveBeenCalled();
  });

  it('getSprintIssuesForBoard sans plage utilise sprints actifs et backlog', async () => {
    mockJiraClient.getBoardSprintIssues.mockResolvedValueOnce([
      {
        key: 'PROJ-1',
        fields: {
          summary: 'A',
          issuetype: { name: 'Story' },
          status: { name: 'To Do', statusCategory: { key: 'new', name: 'To Do' } },
          customfield_10127: 1
        }
      }
    ]);
    mockSprintRepo.findBacklogIssues.mockResolvedValueOnce([]);
    const res = await service.getSprintIssuesForBoard(1);
    expect(res.issues).toHaveLength(1);
    expect(mockSprintRepo.findBacklogIssues).toHaveBeenCalled();
  });

  it('getSprintIssuesForAllConfiguredBoards agrège succès et échec', async () => {
    mockJiraClient.configuredBoardIds = [1, 2];
    mockJiraClient.getBoard.mockImplementation(async (id: number) => ({
      id,
      name: `B${id}`,
      location: { projectKey: 'P' }
    }));

    const okSprint: SprintIssuesResult = {
      issues: [
        {
          issueKey: 'P-1',
          summary: 'x',
          issueType: 'Task',
          status: 'Open',
          statusCategory: 'To Do',
          statusCategoryKey: 'new',
          storyPoints: null,
          originalEstimateSeconds: null
        }
      ],
      statusCounts: { total: 1, todo: 1, inProgress: 0, qa: 0, resolved: 0 },
      storyPointsByStatus: { total: 0, todo: 0, inProgress: 0, qa: 0, resolved: 0 },
      totalStoryPoints: 0,
      backlog: { ticketCount: 0, storyPoints: 0 }
    };

    const spy = jest.spyOn(service, 'getSprintIssuesForBoard');
    spy.mockResolvedValueOnce(okSprint).mockRejectedValueOnce(new Error('batch-fail'));

    const batch = await service.getSprintIssuesForAllConfiguredBoards('2026-04-01', '2026-04-15');
    spy.mockRestore();

    expect(batch).toHaveLength(2);
    expect(batch[0].success).toBe(true);
    expect(batch[1].success).toBe(false);
    expect(batch[1].error).toMatch(/batch-fail/);
  });

  it('getSupportBoardKPI avec issues vides termine sans erreur', async () => {
    mockJiraClient.configuredBoardIds = [1];
    mockJiraClient.getBoardSprints.mockResolvedValue([
      { id: 1, name: 'S', state: 'active', startDate: '2026-04-01T00:00:00.000Z', endDate: '2026-04-15T00:00:00.000Z' }
    ]);
    const kpi = await service.getSupportBoardKPI(undefined, undefined, true);
    expect(kpi.statusCounts.total).toBe(0);
    expect(kpi.ponderationByStatus.total).toBe(0);
  });

  it('getEpicProgressByBoard sans projet retourne vide', async () => {
    mockJiraClient.getBoard.mockResolvedValueOnce({ id: 99, name: 'Orphan', location: {} });
    const res = await service.getEpicProgressByBoard(99, 'all', 'all', 1, 20);
    expect(res.epicCount).toBe(0);
    expect(res.projectKey).toBeNull();
  });

  it('getEpicProgressByBoard charge une page et fetchEpicDirectProgress', async () => {
    mockJiraClient.getBoard.mockResolvedValue({ id: 1, name: 'B', location: { projectKey: 'PROJ' } });
    mockJiraClient.searchIssuesPage.mockResolvedValue({
      issues: [
        {
          key: 'PROJ-100',
          fields: {
            summary: 'CLI001 - test epic',
            issuetype: { name: 'Epic' },
            status: { name: 'Open', statusCategory: { key: 'new' } },
            customfield_10992: 1,
            customfield_10001: { name: 'T1' }
          }
        }
      ],
      startAt: 0,
      maxResults: 20,
      total: 0
    });
    mockJiraClient.searchApproximateCount.mockResolvedValue(3);
    mockJiraClient.searchIssuesWithPagination.mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 0 });

    const res = await service.getEpicProgressByBoard(1, 'epic', 'new', 1, 20, 'CLI');
    expect(res.epics.length).toBe(1);
    expect(res.epics[0].epicKey).toBe('PROJ-100');
  });

  it('searchEpicsByTitle avec et sans query', async () => {
    mockJiraClient.getBoard.mockResolvedValue({ id: 1, name: 'B', location: { projectKey: 'PROJ' } });
    mockJiraClient.searchIssuesLimited.mockResolvedValue({
      issues: [
        {
          key: 'PROJ-50',
          fields: {
            summary: 'Hello',
            issuetype: { name: 'Epic' },
            status: { name: 'Open', statusCategory: { key: 'new' } }
          }
        }
      ],
      total: 1,
      startAt: 0,
      maxResults: 20
    });
    const withQ = await service.searchEpicsByTitle(1, 'Hel', 'all', 'all');
    expect(withQ.results).toHaveLength(1);

    mockJiraClient.searchIssuesLimited.mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 0 });
    const empty = await service.searchEpicsByTitle(1, '', 'legend', 'done');
    expect(empty.results).toEqual([]);
  });

  it('getEpicDetails lève si epic introuvable', async () => {
    mockJiraClient.searchIssuesWithPagination.mockResolvedValueOnce({ issues: [], total: 0, startAt: 0, maxResults: 0 });
    await expect(service.getEpicDetails('MISS-1')).rejects.toThrow(/not found/);
  });

  it('getEpicDetails retourne la hiérarchie pour un Epic', async () => {
    mockJiraClient.searchIssuesWithPagination
      .mockResolvedValueOnce({
        issues: [
          {
            key: 'PROJ-1',
            fields: {
              summary: 'Root',
              issuetype: { name: 'Epic' },
              status: { name: 'Open', statusCategory: { key: 'new' } },
              timeoriginalestimate: 0,
              timespent: 0,
              customfield_10992: null
            }
          }
        ],
        total: 1,
        startAt: 0,
        maxResults: 1
      })
      .mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 0 });

    const details = await service.getEpicDetails('PROJ-1');
    expect(details.epicKey).toBe('PROJ-1');
    expect(details.children).toEqual([]);
  });
});
