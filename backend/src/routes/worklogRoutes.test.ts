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
import { SupportSprintSnapshot } from '../domain/support/entities/SupportSprintSnapshot';

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

  it('GET /api/worklog/test retourne l’état de connexion', async () => {
    const res = await request(app).get('/api/worklog/test');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.endpoint).toBe('jira-v3');
  });

  it('GET /api/worklog/test retourne 500 si le test échoue', async () => {
    mockWorklogAppService.testConnection.mockRejectedValueOnce(new Error('jira down'));
    const res = await request(app).get('/api/worklog/test');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/worklog/issue/:issueKey retourne les worklogs', async () => {
    const res = await request(app).get('/api/worklog/issue/ABC-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.issueKey).toBe('ABC-1');
    expect(res.body.count).toBe(1);
  });

  it('GET /api/worklog/issue/:issueKey retourne 500 en erreur', async () => {
    mockWorklogAppService.getWorklogsForIssue.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/worklog/issue/ABC-1');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
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

  it('GET /api/worklog/project/:projectKey retourne 400 si from/to manquants', async () => {
    const res = await request(app).get('/api/worklog/project/ABC');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/worklog/project/:projectKey retourne 500 en erreur service', async () => {
    mockWorklogAppService.getWorklogsForProject.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app)
      .get('/api/worklog/project/ABC')
      .query({ from: '2026-04-01', to: '2026-04-15' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/worklog/sprint-issues/:projectKey remonte les stats sprint', async () => {
    mockWorklogAppService.getSprintIssuesForProject.mockResolvedValue({
      issues: [{ issueKey: 'ABC-1' }],
      statusCounts: { total: 1, todo: 1, inProgress: 0, qa: 0, resolved: 0 },
      storyPointsByStatus: { total: 3, todo: 3, inProgress: 0, qa: 0, resolved: 0 },
      totalStoryPoints: 3,
      backlog: { ticketCount: 0, storyPoints: 0 }
    });
    const res = await request(app).get('/api/worklog/sprint-issues/ABC');
    expect(res.status).toBe(200);
    expect(res.body.issueCount).toBe(1);
  });

  it('GET /api/worklog/sprint-issues/:projectKey retourne 500 en erreur', async () => {
    mockWorklogAppService.getSprintIssuesForProject.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/worklog/sprint-issues/ABC');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/worklog/velocity-history/:projectKey retourne la vélocité', async () => {
    mockWorklogAppService.getVelocityHistory.mockResolvedValue({
      sprints: [{ id: 1, name: 'S1' }],
      averageVelocity: 8,
      trend: 'stable'
    });
    const res = await request(app).get('/api/worklog/velocity-history/ABC').query({ sprintCount: 5 });
    expect(res.status).toBe(200);
    expect(mockWorklogAppService.getVelocityHistory).toHaveBeenCalledWith('ABC', 5);
    expect(res.body.averageVelocity).toBe(8);
  });

  it('GET /api/worklog/velocity-history/:projectKey retourne 500 en erreur', async () => {
    mockWorklogAppService.getVelocityHistory.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/worklog/velocity-history/ABC');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/worklog/support-kpi appelle le service en mode activeSprint par défaut', async () => {
    const res = await request(app).get('/api/worklog/support-kpi');
    expect(res.status).toBe(200);
    expect(mockWorklogAppService.getSupportBoardKPI).toHaveBeenCalledWith(undefined, undefined, true);
  });

  it('GET /api/worklog/support-kpi retourne 500 en erreur', async () => {
    mockWorklogAppService.getSupportBoardKPI.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/worklog/support-kpi');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/worklog/cache/stats retourne un message statique', async () => {
    const res = await request(app).get('/api/worklog/cache/stats');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET endpoints stub discover/saved-reports/attributes répondent 200', async () => {
    const discover = await request(app).get('/api/worklog/discover');
    const reports = await request(app).get('/api/worklog/saved-reports');
    const attrs = await request(app).get('/api/worklog/attributes');
    expect(discover.status).toBe(200);
    expect(reports.status).toBe(200);
    expect(attrs.status).toBe(200);
  });

  it('DELETE /api/worklog/cache vide le cache et emet une alerte websocket', async () => {
    const res = await request(app).delete('/api/worklog/cache');
    expect(res.status).toBe(200);
    expect(mockClearCache).toHaveBeenCalledTimes(1);
    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
  });

  it('DELETE /api/worklog/cache retourne 500 si clear échoue', async () => {
    mockClearCache.mockImplementationOnce(() => {
      throw new Error('cache down');
    });
    const res = await request(app).delete('/api/worklog/cache');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
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

  it('POST /api/worklog/sync retourne 500 si erreur globale', async () => {
    mockWorklogAppService.getConfiguredProjects.mockRejectedValueOnce(new Error('jira down'));
    const res = await request(app).post('/api/worklog/sync');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(mockEmitSyncProgress).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'error' })
    );
  });

  it('POST /api/worklog/support-snapshot retourne 400 sans sprintName', async () => {
    const res = await request(app).post('/api/worklog/support-snapshot').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/worklog/support-snapshot enregistre un snapshot', async () => {
    (SupportSprintSnapshot.create as jest.Mock).mockResolvedValue({
      _id: 'snap-1',
      sprintName: 'Sprint Support 42',
      savedAt: new Date('2026-04-29T10:00:00.000Z'),
      savedBy: { email: 'admin@test.com' }
    });
    mockWorklogAppService.getSupportBoardKPI.mockResolvedValue({
      statusCounts: { total: 10, resolved: 3 },
      ponderationByStatus: { total: 20, resolved: 8 },
      ponderationByType: {},
      ponderationByAssignee: {},
      ponderationByLevel: {},
      ponderationByLabel: {},
      ponderationByTeam: {},
      backlog: { ticketCount: 4 },
      avgResolutionTimeHours: 2,
      avgFirstResponseTimeHours: 1,
      avgResolutionTimeFromDatesHours: 2,
      highPondFastResolutionPercent: 50,
      veryHighPondFastResolutionPercent: 20
    });

    const res = await request(app)
      .post('/api/worklog/support-snapshot')
      .query({ from: '2026-04-01', to: '2026-04-15' })
      .send({ sprintName: 'Sprint Support 42', notes: 'OK' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(SupportSprintSnapshot.create).toHaveBeenCalled();
  });

  it('GET /api/worklog/support-snapshots retourne la liste mappée', async () => {
    const select = jest.fn().mockResolvedValue([
      {
        _id: 'snap-1',
        sprintName: 'Sprint 1',
        savedAt: '2026-04-29T10:00:00.000Z',
        savedBy: { email: 'admin@test.com' },
        dateRange: { from: '2026-04-01', to: '2026-04-15' },
        notes: 'note',
        kpiData: {
          statusCounts: { total: 10, resolved: 6 },
          ponderationByStatus: { total: 20, resolved: 12 }
        }
      }
    ]);
    const limit = jest.fn().mockReturnValue({ select });
    const sort = jest.fn().mockReturnValue({ limit });
    (SupportSprintSnapshot.find as jest.Mock).mockReturnValue({ sort });

    const res = await request(app).get('/api/worklog/support-snapshots').query({ limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(res.body.snapshots[0].summary.totalTickets).toBe(10);
  });

  it('GET /api/worklog/support-snapshots retourne 500 en erreur', async () => {
    (SupportSprintSnapshot.find as jest.Mock).mockImplementationOnce(() => {
      throw new Error('db down');
    });
    const res = await request(app).get('/api/worklog/support-snapshots');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/worklog/support-snapshot/:id retourne 404 si absent puis 200 si trouvé', async () => {
    (SupportSprintSnapshot.findById as jest.Mock).mockResolvedValueOnce(null);
    const notFound = await request(app).get('/api/worklog/support-snapshot/unknown');
    expect(notFound.status).toBe(404);

    (SupportSprintSnapshot.findById as jest.Mock).mockResolvedValueOnce({
      _id: 'snap-1',
      sprintName: 'Sprint 1',
      savedAt: '2026-04-29T10:00:00.000Z',
      savedBy: { email: 'admin@test.com' },
      dateRange: { from: '2026-04-01', to: '2026-04-15' },
      notes: '',
      kpiData: { statusCounts: { total: 1 } }
    });
    const ok = await request(app).get('/api/worklog/support-snapshot/snap-1');
    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);
  });

  it('GET /api/worklog/support-snapshot/:id retourne 500 en erreur', async () => {
    (SupportSprintSnapshot.findById as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/api/worklog/support-snapshot/snap-1');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('DELETE /api/worklog/support-snapshot/:id retourne 404 si absent puis 200 si supprimé', async () => {
    (SupportSprintSnapshot.findByIdAndDelete as jest.Mock).mockResolvedValueOnce(null);
    const notFound = await request(app).delete('/api/worklog/support-snapshot/unknown');
    expect(notFound.status).toBe(404);

    (SupportSprintSnapshot.findByIdAndDelete as jest.Mock).mockResolvedValueOnce({ sprintName: 'Sprint 1' });
    const ok = await request(app).delete('/api/worklog/support-snapshot/snap-1');
    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);
  });

  it('DELETE /api/worklog/support-snapshot/:id retourne 500 en erreur', async () => {
    (SupportSprintSnapshot.findByIdAndDelete as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).delete('/api/worklog/support-snapshot/snap-1');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
