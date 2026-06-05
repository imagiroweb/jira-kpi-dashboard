const mockJiraClientCtor = jest.fn();
const mockWorklogRepoCtor = jest.fn();
const mockSprintRepoCtor = jest.fn();
const mockCachedWorklogCtor = jest.fn();
const mockCachedSprintCtor = jest.fn();

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('./jira/JiraClient', () => ({
  JiraClient: mockJiraClientCtor,
}));

jest.mock('./jira/JiraWorklogRepository', () => ({
  JiraWorklogRepository: mockWorklogRepoCtor,
}));

jest.mock('./jira/JiraSprintRepository', () => ({
  JiraSprintRepository: mockSprintRepoCtor,
}));

jest.mock('./cache/CacheDecorator', () => ({
  CachedWorklogRepository: mockCachedWorklogCtor,
  CachedSprintRepository: mockCachedSprintCtor,
}));

import { logger } from '../utils/logger';
import { Container } from './Container';

describe('Container', () => {
  beforeEach(() => {
    Container.reset();
    jest.clearAllMocks();
    mockJiraClientCtor.mockImplementation(() => ({ tag: 'jira-client' }));
    mockWorklogRepoCtor.mockImplementation(() => ({ tag: 'worklog-repo' }));
    mockSprintRepoCtor.mockImplementation(() => ({ tag: 'sprint-repo' }));
    mockCachedWorklogCtor.mockImplementation((inner: unknown) => ({ tag: 'cached-worklog', inner }));
    mockCachedSprintCtor.mockImplementation((inner: unknown) => ({ tag: 'cached-sprint', inner }));
  });

  it('retourne un singleton et journalise l’initialisation', () => {
    const first = Container.getInstance();
    const second = Container.getInstance();
    expect(first).toBe(second);
    expect(logger.info).toHaveBeenCalledWith('DI Container initialized');
  });

  it('câble jiraClient, repositories et calculateurs', () => {
    const container = Container.getInstance();

    expect(container.jiraClient).toEqual({ tag: 'jira-client' });
    expect(mockJiraClientCtor).toHaveBeenCalledTimes(1);

    const worklogRepo = container.worklogRepository;
    expect(mockWorklogRepoCtor).toHaveBeenCalledWith({ tag: 'jira-client' });
    expect(mockCachedWorklogCtor).toHaveBeenCalledWith({ tag: 'worklog-repo' });
    expect(worklogRepo).toEqual({ tag: 'cached-worklog', inner: { tag: 'worklog-repo' } });

    const sprintRepo = container.sprintRepository;
    expect(mockSprintRepoCtor).toHaveBeenCalledWith({ tag: 'jira-client' });
    expect(mockCachedSprintCtor).toHaveBeenCalledWith({ tag: 'sprint-repo' });
    expect(sprintRepo).toEqual({ tag: 'cached-sprint', inner: { tag: 'sprint-repo' } });

    expect(container.worklogMetricsCalculator).toBeDefined();
    expect(container.sprintMetricsCalculator).toBeDefined();
  });

  it('expose les use cases avec les dépendances injectées', () => {
    const container = Container.getInstance();

    expect(container.searchWorklogsUseCase.execute).toEqual(expect.any(Function));
    expect(container.getSprintIssuesUseCase.execute).toEqual(expect.any(Function));
    expect(container.getVelocityHistoryUseCase.execute).toEqual(expect.any(Function));
  });
});
