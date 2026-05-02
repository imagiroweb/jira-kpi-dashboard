/**
 * Phase C — client Jira : config, getters, appels REST courants et repli timetracking.
 */
const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      get: mockGet,
      post: mockPost,
      interceptors: {
        request: { use: jest.fn((onFulfilled: unknown) => onFulfilled) },
        response: { use: jest.fn((onFulfilled: unknown) => onFulfilled) }
      }
    }))
  }
}));

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import axios from 'axios';
import { JiraClient } from './JiraClient';

describe('JiraClient', () => {
  const baseEnv = (): void => {
    process.env.JIRA_URL = 'https://test.atlassian.net';
    process.env.JIRA_EMAIL = 'user@test.com';
    process.env.JIRA_API_TOKEN = 'secret-token';
    delete process.env.JIRA_PROJECT_KEY;
    delete process.env.JIRA_BOARD_ID;
    delete process.env.JIRA_HOURS_PER_DAY;
    delete process.env.JIRA_DAYS_PER_WEEK;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    baseEnv();
    (axios.create as jest.Mock).mockReturnValue({
      get: mockGet,
      post: mockPost,
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      }
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lève si JIRA_URL / email / token manquent', () => {
    delete process.env.JIRA_URL;
    expect(() => new JiraClient()).toThrow(/Missing Jira configuration/);
  });

  it('expose configuredProjectKeys et configuredBoardIds (parse env)', () => {
    process.env.JIRA_PROJECT_KEY = ' ABC , DEF ';
    process.env.JIRA_BOARD_ID = ' 1, bad, 3 ';
    const client = new JiraClient();
    expect(client.configuredProjectKeys).toEqual(['ABC', 'DEF']);
    expect(client.configuredBoardIds).toEqual([1, 3]);
  });

  it('getBoard retourne les données ou null si erreur', async () => {
    mockGet.mockResolvedValueOnce({ data: { id: 9, name: 'B' } });
    const ok = await new JiraClient().getBoard(9);
    expect(ok).toEqual({ id: 9, name: 'B' });

    mockGet.mockRejectedValueOnce(new Error('404'));
    const missing = await new JiraClient().getBoard(99);
    expect(missing).toBeNull();
  });

  it('getBoardConfiguration et getFilterJql gèrent les erreurs', async () => {
    mockGet.mockResolvedValueOnce({ data: { filter: { id: 'f1' } } });
    expect(await new JiraClient().getBoardConfiguration(1)).toEqual({ filter: { id: 'f1' } });

    mockGet.mockRejectedValueOnce(new Error('x'));
    expect(await new JiraClient().getBoardConfiguration(1)).toBeNull();

    mockGet.mockResolvedValueOnce({ data: { jql: 'project = X' } });
    expect(await new JiraClient().getFilterJql('1')).toBe('project = X');

    mockGet.mockRejectedValueOnce(new Error('x'));
    expect(await new JiraClient().getFilterJql('1')).toBeNull();
  });

  it('getProjects sans clés appelle /project', async () => {
    mockGet.mockResolvedValueOnce({ data: [{ id: '1', key: 'K', name: 'N' }] });
    const projects = await new JiraClient().getProjects();
    expect(mockGet).toHaveBeenCalledWith('/rest/api/3/project');
    expect(projects).toHaveLength(1);
  });

  it('getProjects avec clés agrège les succès et ignore les échecs', async () => {
    process.env.JIRA_PROJECT_KEY = 'A,B';
    mockGet.mockResolvedValueOnce({ data: { key: 'A', name: 'A1', id: '1' } });
    mockGet.mockRejectedValueOnce(new Error('missing'));
    const projects = await new JiraClient().getProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].key).toBe('A');
  });

  it('getAllProjects délègue à /project', async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await new JiraClient().getAllProjects();
    expect(mockGet).toHaveBeenCalledWith('/rest/api/3/project');
  });

  it('getTimeTrackingConfig utilise l’API ou le fallback env', async () => {
    mockGet.mockResolvedValueOnce({
      data: { workingHoursPerDay: 7.5, workingDaysPerWeek: 4 }
    });
    const ok = await new JiraClient().getTimeTrackingConfig();
    expect(ok.workingHoursPerDay).toBe(7.5);
    expect(ok.workingDaysPerWeek).toBe(4);

    mockGet.mockRejectedValueOnce(new Error('down'));
    process.env.JIRA_HOURS_PER_DAY = '6';
    process.env.JIRA_DAYS_PER_WEEK = '4';
    const fb = await new JiraClient().getTimeTrackingConfig();
    expect(fb.workingHoursPerDay).toBe(6);
    expect(fb.workingDaysPerWeek).toBe(4);
  });

  it('getBoards et getBoardSprints', async () => {
    mockGet.mockResolvedValueOnce({ data: { values: [{ id: 1, name: 'B1' }] } });
    const boards = await new JiraClient().getBoards();
    expect(boards).toHaveLength(1);

    mockGet.mockResolvedValueOnce({
      data: { values: [{ id: 10, name: 'S', state: 'active' }] }
    });
    const sprints = await new JiraClient().getBoardSprints(5, 'active');
    expect(mockGet).toHaveBeenCalledWith('/rest/agile/1.0/board/5/sprint', { params: { state: 'active' } });
    expect(sprints[0].id).toBe(10);
  });

  it('searchApproximateCount lit count ou 0', async () => {
    mockPost.mockResolvedValueOnce({ data: { count: 42 } });
    expect(await new JiraClient().searchApproximateCount('project = X')).toBe(42);
    mockPost.mockResolvedValueOnce({ data: {} });
    expect(await new JiraClient().searchApproximateCount('jql')).toBe(0);
  });

  it('getIssueWorklogs pagine jusqu’à total', async () => {
    mockGet
      .mockResolvedValueOnce({
        data: { worklogs: [{ id: '1' }], total: 2, startAt: 0, maxResults: 100 }
      })
      .mockResolvedValueOnce({
        data: { worklogs: [{ id: '2' }], total: 2, startAt: 1, maxResults: 100 }
      });
    const logs = await new JiraClient().getIssueWorklogs('ABC-1');
    expect(logs).toHaveLength(2);
  });

  it('get délègue data', async () => {
    mockGet.mockResolvedValueOnce({ data: { hello: true } });
    const d = await new JiraClient().get<{ hello: boolean }>('/rest/api/3/me');
    expect(d.hello).toBe(true);
  });

  it('searchIssuesWithPagination avance les timers entre pages', async () => {
    mockGet
      .mockResolvedValueOnce({
        data: { issues: [{ id: '1', key: 'A-1', fields: {} }], nextPageToken: 'tok1' }
      })
      .mockResolvedValueOnce({
        data: { issues: [], nextPageToken: undefined }
      });
    const p = new JiraClient().searchIssuesWithPagination('project = T', 'key', 50);
    await jest.runAllTimersAsync();
    const res = await p;
    expect(res.issues.length).toBe(1);
  });
});
