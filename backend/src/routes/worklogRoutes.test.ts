import request from 'supertest';
import express, { Express, Request } from 'express';

const mockClearCache = jest.fn();
const mockEmitAlert = jest.fn();
const mockEmitSyncProgress = jest.fn();
const mockEmitKpiUpdate = jest.fn();

const mockWorklogAppService = {
  testConnection: jest.fn(),
  getWorklogsForIssue: jest.fn(),
  getWorklogsForUser: jest.fn(),
  getWorklogsForProject: jest.fn(),
  searchWorklogs: jest.fn(),
  calculateMetrics: jest.fn(),
  getActiveSprintDateRange: jest.fn(),
  getSprintIssuesForProject: jest.fn(),
  getVelocityHistory: jest.fn(),
  getSupportBoardKPI: jest.fn(),
  getConfiguredProjects: jest.fn()
};

jest.mock('../application/services/WorklogApplicationService', () => ({
  worklogAppService: mockWorklogAppService
}));

jest.mock('../infrastructure/cache/CacheDecorator', () => ({
  globalCache: {
    clear: mockClearCache
  }
}));

jest.mock('../websocket/socketHandler', () => ({
  emitAlert: mockEmitAlert,
  emitSyncProgress: mockEmitSyncProgress,
  emitKPIUpdate: mockEmitKpiUpdate
}));

jest.mock('../middleware/authMiddleware', () => ({
  authenticate: (req: Request, _res: unknown, next: () => void) => {
    (req as Request & { user?: { userId: string; email: string; provider: 'local' | 'microsoft' } }).user = {
      userId: '507f1f77bcf86cd799439011',
      email: 'admin@test.com',
      provider: 'local'
    };
    next();
  }
}));

jest.mock('../domain/support/entities/SupportSprintSnapshot', () => ({
  SupportSprintSnapshot: {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndDelete: jest.fn()
  }
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

import { worklogRoutes } from './worklogRoutes';

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.set('io', { toString: () => 'fake-io' });
  app.use('/api/worklog', worklogRoutes);
  return app;
}

describe('worklogRoutes', () => {
  const app = createApp();
  const worklogItem = {
    toJSON: () => ({ issueKey: 'ABC-1', timeSpentSeconds: 3600 })
  };
  const defaultMetrics = {
    totalTimeSpentHours: 1,
    billableHours: 1,
    worklogCount: 1,
    uniqueUsers: 1,
    uniqueIssues: 1,
    byUser: {},
    byProject: {},
    byDay: { '2026-04-29': 1 }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockWorklogAppService.testConnection.mockResolvedValue({ success: true, endpoint: 'jira-v3', version: '3' });
    mockWorklogAppService.getWorklogsForIssue.mockResolvedValue([worklogItem]);
    mockWorklogAppService.getWorklogsForUser.mockResolvedValue([worklogItem]);
    mockWorklogAppService.getWorklogsForProject.mockResolvedValue([worklogItem]);
    mockWorklogAppService.searchWorklogs.mockResolvedValue([worklogItem]);
    mockWorklogAppService.calculateMetrics.mockReturnValue(defaultMetrics);
    mockWorklogAppService.getActiveSprintDateRange.mockResolvedValue({ from: '2026-04-01', to: '2026-04-15' });
    mockWorklogAppService.getConfiguredProjects.mockResolvedValue(['ABC', 'DEF']);
    mockWorklogAppService.getSprintIssuesForProject.mockResolvedValue({ issues: [] });
    mockWorklogAppService.getSupportBoardKPI.mockResolvedValue({ statusCounts: { total: 0 }, backlog: { ticketCount: 0 } });
  });

  it('GET /api/worklog/user/:accountId retourne 400 si from/to manquants', async () => {
    const res = await request(app).get('/api/worklog/user/u-1');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockWorklogAppService.getWorklogsForUser).not.toHaveBeenCalled();
  });

  it('GET /api/worklog/search utilise projectKeys en priorite et dedupe', async () => {
    const res = await request(app)
      .get('/api/worklog/search')
      .query({ from: '2026-04-01', to: '2026-04-10', projectKeys: ['ABC, DEF', 'ABC'], issueKey: 'ABC-1' });

    expect(res.status).toBe(200);
    expect(mockWorklogAppService.searchWorklogs).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '2026-04-01',
        to: '2026-04-10',
        projectKeys: ['ABC', 'DEF'],
        issueKey: 'ABC-1',
        openSprints: false
      })
    );
  });

  it('GET /api/worklog/search resolve activeSprint puis force openSprints=false', async () => {
    const res = await request(app)
      .get('/api/worklog/search')
      .query({ activeSprint: 'true', openSprints: 'true' });

    expect(res.status).toBe(200);
    expect(mockWorklogAppService.getActiveSprintDateRange).toHaveBeenCalled();
    expect(mockWorklogAppService.searchWorklogs).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '2026-04-01',
        to: '2026-04-15',
        openSprints: false
      })
    );
  });

  it('GET /api/worklog/report retourne 400 sans plage ni activeSprint resolvable', async () => {
    mockWorklogAppService.getActiveSprintDateRange.mockResolvedValue(null);
    const res = await request(app).get('/api/worklog/report').query({ activeSprint: 'true' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/worklog/report groupe sur byUser quand groupBy=user', async () => {
    mockWorklogAppService.calculateMetrics.mockReturnValue({
      ...defaultMetrics,
      byUser: { john: { timeSpentHours: 2 } }
    });
    const res = await request(app)
      .get('/api/worklog/report')
      .query({ from: '2026-04-01', to: '2026-04-15', groupBy: 'user', projectKey: 'ABC' });

    expect(res.status).toBe(200);
    expect(res.body.groupBy).toBe('user');
    expect(res.body.data).toEqual({ john: { timeSpentHours: 2 } });
    expect(mockWorklogAppService.searchWorklogs).toHaveBeenCalledWith(
      expect.objectContaining({ projectKey: 'ABC', openSprints: false })
    );
  });

  it('DELETE /api/worklog/cache vide le cache et emet une alerte websocket', async () => {
    const res = await request(app).delete('/api/worklog/cache');
    expect(res.status).toBe(200);
    expect(mockClearCache).toHaveBeenCalledTimes(1);
    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
  });

  it('POST /api/worklog/sync synchronise les projets et emet la progression', async () => {
    mockWorklogAppService.getConfiguredProjects.mockResolvedValue(['ABC', 'DEF']);
    mockWorklogAppService.getSprintIssuesForProject.mockResolvedValue({ issues: [] });

    const res = await request(app).post('/api/worklog/sync');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.projectsSynced).toBe(2);
    expect(mockClearCache).toHaveBeenCalled();
    expect(mockEmitSyncProgress).toHaveBeenCalled();
    expect(mockEmitKpiUpdate).toHaveBeenCalled();
  });
});
