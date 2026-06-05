/** Factory minimale pour mocker worklogAppService dans les tests de routes Jira/worklog */
export function createWorklogAppServiceMock() {
  return {
    searchWorklogs: jest.fn(),
    calculateMetrics: jest.fn(),
    getConfiguredProjects: jest.fn(),
    getProjects: jest.fn(),
    getConfiguredBoards: jest.fn(),
    getSprintIssuesForAllConfiguredBoards: jest.fn(),
    getSprintIssuesForBoard: jest.fn(),
    getResolvedByDay: jest.fn(),
    getActiveSprintDateRange: jest.fn(),
    getAllProjects: jest.fn(),
    getEpicProgressByBoard: jest.fn(),
    searchEpicsByTitle: jest.fn(),
    getEpicDetails: jest.fn(),
    getTimeTrackingConfig: jest.fn(),
    testConnection: jest.fn(),
    getWorklogsForIssue: jest.fn(),
    getWorklogsForUser: jest.fn(),
    getWorklogsForProject: jest.fn(),
    getSprintIssuesForProject: jest.fn(),
    getVelocityHistory: jest.fn(),
    getSupportBoardKPI: jest.fn(),
  };
}

export type WorklogAppServiceMock = ReturnType<typeof createWorklogAppServiceMock>;
