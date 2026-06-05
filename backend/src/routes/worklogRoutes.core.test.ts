/**
 * TI — Routes Worklog (Lot A, B, D) : lecture Jira, cache/sync, stubs
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import {
  mockWorklogEntity,
  TEST_SPRINT_ISSUES_RESULT,
  TEST_SUPPORT_KPI_RESULT,
  TEST_VELOCITY_HISTORY_RESULT,
  TEST_WORKLOG_METRICS,
  TEST_WORKLOG_PAYLOAD,
} from '../test/fixtures/worklogs';
import { createWorklogAppServiceMock } from '../test/mocks/worklogAppService';

let authMode: 'pass' | 'deny' = 'pass';

jest.mock('../middleware/authMiddleware', () => {
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>(
    '../test/mocks/authMiddleware'
  );
  return {
    authenticate: (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
      if (authMode === 'deny') {
        return auth.mockAuthDenied(req, res, next);
      }
      return auth.mockAuthenticate()(req, res, next);
    },
    requireSuperAdmin: auth.mockRequireSuperAdmin,
  };
});

jest.mock('../utils/logger', () =>
  jest.requireActual('../test/mocks/logger').loggerMockFactory()
);

const mockWorklogAppService = createWorklogAppServiceMock();
jest.mock('../application/services/WorklogApplicationService', () => ({
  worklogAppService: mockWorklogAppService,
}));

const mockGlobalCache = { clear: jest.fn() };
jest.mock('../infrastructure/cache/CacheDecorator', () => ({
  globalCache: mockGlobalCache,
}));

jest.mock('../websocket/socketHandler', () => ({
  emitKPIUpdate: jest.fn(),
  emitSyncProgress: jest.fn(),
  emitAlert: jest.fn(),
}));

import { emitAlert, emitKPIUpdate, emitSyncProgress } from '../websocket/socketHandler';
import { worklogRoutes } from './worklogRoutes';

const mockEmitAlert = emitAlert as jest.MockedFunction<typeof emitAlert>;
const mockEmitKPIUpdate = emitKPIUpdate as jest.MockedFunction<typeof emitKPIUpdate>;
const mockEmitSyncProgress = emitSyncProgress as jest.MockedFunction<typeof emitSyncProgress>;

describe('worklogRoutes — core (TI)', () => {
  const app = createTestApp({ mountPath: '/api/worklog', router: worklogRoutes });
  const appWithIo = createTestApp({
    mountPath: '/api/worklog',
    router: worklogRoutes,
    io: {} as never,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authMode = 'pass';
    mockGlobalCache.clear.mockReset().mockImplementation(() => undefined);

    mockWorklogAppService.testConnection.mockResolvedValue({
      success: true,
      endpoint: 'https://jira.example.com',
      version: '3',
    });
    mockWorklogAppService.getWorklogsForIssue.mockResolvedValue([mockWorklogEntity()]);
    mockWorklogAppService.getWorklogsForUser.mockResolvedValue([mockWorklogEntity()]);
    mockWorklogAppService.getWorklogsForProject.mockResolvedValue([mockWorklogEntity()]);
    mockWorklogAppService.searchWorklogs.mockResolvedValue([mockWorklogEntity()]);
    mockWorklogAppService.calculateMetrics.mockReturnValue(TEST_WORKLOG_METRICS);
    mockWorklogAppService.getConfiguredProjects.mockResolvedValue(['PROJ', 'ABC']);
    mockWorklogAppService.getActiveSprintDateRange.mockResolvedValue({
      from: '2026-04-01',
      to: '2026-04-15',
    });
    mockWorklogAppService.getSprintIssuesForProject.mockResolvedValue(TEST_SPRINT_ISSUES_RESULT);
    mockWorklogAppService.getVelocityHistory.mockResolvedValue(TEST_VELOCITY_HISTORY_RESULT);
    mockWorklogAppService.getSupportBoardKPI.mockResolvedValue(TEST_SUPPORT_KPI_RESULT);
  });

  describe('GET /api/worklog/test', () => {
    it('retourne 200 en cas de connexion réussie', async () => {
      const res = await request(app).get('/api/worklog/test');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/Connection successful/);
      expect(res.body.endpoint).toBe('https://jira.example.com');
      expect(mockWorklogAppService.testConnection).toHaveBeenCalled();
    });

    it('retourne 200 avec success false si la connexion échoue', async () => {
      mockWorklogAppService.testConnection.mockResolvedValue({
        success: false,
        endpoint: 'https://jira.example.com',
      });

      const res = await request(app).get('/api/worklog/test');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Connection failed');
    });

    it('retourne 500 si testConnection lève une erreur', async () => {
      mockWorklogAppService.testConnection.mockRejectedValue(new Error('network'));

      const res = await request(app).get('/api/worklog/test');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('network');
    });
  });

  describe('GET /api/worklog/issue/:issueKey', () => {
    it('retourne 200 avec les worklogs de l’issue', async () => {
      const res = await request(app).get('/api/worklog/issue/PROJ-42');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.issueKey).toBe('PROJ-42');
      expect(res.body.count).toBe(1);
      expect(res.body.worklogs).toEqual([TEST_WORKLOG_PAYLOAD]);
      expect(mockWorklogAppService.getWorklogsForIssue).toHaveBeenCalledWith('PROJ-42');
    });

    it('retourne 500 si getWorklogsForIssue échoue', async () => {
      mockWorklogAppService.getWorklogsForIssue.mockRejectedValue(new Error('jira down'));

      const res = await request(app).get('/api/worklog/issue/PROJ-42');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Failed to fetch worklogs/);
    });
  });

  describe('GET /api/worklog/user/:accountId', () => {
    it('retourne 400 sans paramètres from/to', async () => {
      const res = await request(app).get('/api/worklog/user/acc-1');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/from and to/);
      expect(mockWorklogAppService.getWorklogsForUser).not.toHaveBeenCalled();
    });

    it('retourne 200 avec worklogs et métriques', async () => {
      const res = await request(app)
        .get('/api/worklog/user/acc-1')
        .query({ from: '2026-04-01', to: '2026-04-15' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.accountId).toBe('acc-1');
      expect(res.body.totalHours).toBe(TEST_WORKLOG_METRICS.totalTimeSpentHours);
      expect(res.body.metrics).toEqual(TEST_WORKLOG_METRICS);
      expect(mockWorklogAppService.getWorklogsForUser).toHaveBeenCalledWith(
        'acc-1',
        '2026-04-01',
        '2026-04-15'
      );
    });

    it('retourne 500 si getWorklogsForUser échoue', async () => {
      mockWorklogAppService.getWorklogsForUser.mockRejectedValue(new Error('boom'));

      const res = await request(app)
        .get('/api/worklog/user/acc-1')
        .query({ from: '2026-04-01', to: '2026-04-15' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/worklog/search', () => {
    it('résout activeSprint via getActiveSprintDateRange', async () => {
      const res = await request(app).get('/api/worklog/search').query({ activeSprint: 'true' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.filters.activeSprint).toBe(true);
      expect(res.body.filters.from).toBe('2026-04-01');
      expect(res.body.filters.to).toBe('2026-04-15');
      expect(mockWorklogAppService.getActiveSprintDateRange).toHaveBeenCalled();
      expect(mockWorklogAppService.searchWorklogs).toHaveBeenCalledWith(
        expect.objectContaining({ from: '2026-04-01', to: '2026-04-15', openSprints: false })
      );
    });

    it('active openSprints quand from/to sont fournis', async () => {
      const res = await request(app)
        .get('/api/worklog/search')
        .query({ openSprints: 'true', from: '2026-04-01', to: '2026-04-15' });

      expect(res.status).toBe(200);
      expect(res.body.filters.openSprints).toBe(true);
      expect(mockWorklogAppService.searchWorklogs).toHaveBeenCalledWith(
        expect.objectContaining({ openSprints: true })
      );
    });

    it('complète openSprints sans dates via le sprint actif', async () => {
      const res = await request(app).get('/api/worklog/search').query({ openSprints: 'true' });

      expect(res.status).toBe(200);
      expect(mockWorklogAppService.getActiveSprintDateRange).toHaveBeenCalled();
      expect(mockWorklogAppService.searchWorklogs).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '2026-04-01',
          to: '2026-04-15',
          openSprints: true,
        })
      );
    });

    it('force openSprints=false quand activeSprint=true', async () => {
      await request(app)
        .get('/api/worklog/search')
        .query({ activeSprint: 'true', openSprints: 'true' });

      expect(mockWorklogAppService.searchWorklogs).toHaveBeenCalledWith(
        expect.objectContaining({ openSprints: false })
      );
    });

    it('parse projectKeys CSV et appelle searchWorklogs avec projectKeys', async () => {
      await request(app)
        .get('/api/worklog/search')
        .query({ from: '2026-04-01', to: '2026-04-15', projectKeys: ' PROJ , ABC ' });

      expect(mockWorklogAppService.searchWorklogs).toHaveBeenCalledWith(
        expect.objectContaining({ projectKeys: ['PROJ', 'ABC'] })
      );
      expect(mockWorklogAppService.getConfiguredProjects).not.toHaveBeenCalled();
    });

    it('résout le projet configuré si aucun projectKey ni projectKeys', async () => {
      mockWorklogAppService.getConfiguredProjects.mockResolvedValue(['ONLY']);

      await request(app)
        .get('/api/worklog/search')
        .query({ from: '2026-04-01', to: '2026-04-15' });

      expect(mockWorklogAppService.searchWorklogs).toHaveBeenCalledWith(
        expect.objectContaining({ projectKey: 'ONLY' })
      );
    });

    it('retourne 500 si searchWorklogs échoue', async () => {
      mockWorklogAppService.searchWorklogs.mockRejectedValue(new Error('search fail'));

      const res = await request(app)
        .get('/api/worklog/search')
        .query({ from: '2026-04-01', to: '2026-04-15' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/worklog/project/:projectKey', () => {
    it('retourne 400 sans paramètres from/to', async () => {
      const res = await request(app).get('/api/worklog/project/PROJ');

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/from and to/);
      expect(mockWorklogAppService.getWorklogsForProject).not.toHaveBeenCalled();
    });

    it('retourne 200 avec worklogs et métriques', async () => {
      const res = await request(app)
        .get('/api/worklog/project/PROJ')
        .query({ from: '2026-04-01', to: '2026-04-15' });

      expect(res.status).toBe(200);
      expect(res.body.projectKey).toBe('PROJ');
      expect(res.body.metrics).toEqual(TEST_WORKLOG_METRICS);
    });

    it('retourne 500 si getWorklogsForProject échoue', async () => {
      mockWorklogAppService.getWorklogsForProject.mockRejectedValue(new Error('boom'));

      const res = await request(app)
        .get('/api/worklog/project/PROJ')
        .query({ from: '2026-04-01', to: '2026-04-15' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/worklog/report', () => {
    it('retourne 400 sans dates ni activeSprint', async () => {
      const res = await request(app).get('/api/worklog/report');

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/from and to/);
    });

    it('groupe par user quand groupBy=user', async () => {
      const res = await request(app)
        .get('/api/worklog/report')
        .query({ from: '2026-04-01', to: '2026-04-15', groupBy: 'user' });

      expect(res.status).toBe(200);
      expect(res.body.groupBy).toBe('user');
      expect(res.body.data).toEqual(TEST_WORKLOG_METRICS.byUser);
    });

    it('groupe par project quand groupBy=project', async () => {
      const res = await request(app)
        .get('/api/worklog/report')
        .query({ from: '2026-04-01', to: '2026-04-15', groupBy: 'project' });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(TEST_WORKLOG_METRICS.byProject);
    });

    it('groupe par day par défaut', async () => {
      const res = await request(app)
        .get('/api/worklog/report')
        .query({ from: '2026-04-01', to: '2026-04-15' });

      expect(res.status).toBe(200);
      expect(res.body.groupBy).toBe('day');
      expect(res.body.data).toEqual(TEST_WORKLOG_METRICS.byDay);
    });

    it('résout activeSprint via getActiveSprintDateRange', async () => {
      const res = await request(app).get('/api/worklog/report').query({ activeSprint: 'true' });

      expect(res.status).toBe(200);
      expect(res.body.activeSprint).toBe(true);
      expect(res.body.period).toEqual(
        expect.objectContaining({ activeSprint: true, from: '2026-04-01', to: '2026-04-15' })
      );
    });

    it('retourne 500 si searchWorklogs échoue', async () => {
      mockWorklogAppService.searchWorklogs.mockRejectedValue(new Error('boom'));

      const res = await request(app)
        .get('/api/worklog/report')
        .query({ from: '2026-04-01', to: '2026-04-15' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/worklog/sprint-issues/:projectKey', () => {
    it('retourne 200 avec la forme attendue', async () => {
      const res = await request(app).get('/api/worklog/sprint-issues/PROJ');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.projectKey).toBe('PROJ');
      expect(res.body.issueCount).toBe(1);
      expect(res.body.statusCounts).toEqual(TEST_SPRINT_ISSUES_RESULT.statusCounts);
      expect(res.body.storyPointsByStatus).toEqual(TEST_SPRINT_ISSUES_RESULT.storyPointsByStatus);
      expect(res.body.totalStoryPoints).toBe(3);
      expect(res.body.backlog).toEqual(TEST_SPRINT_ISSUES_RESULT.backlog);
      expect(res.body.issues).toEqual(TEST_SPRINT_ISSUES_RESULT.issues);
    });

    it('retourne 500 si getSprintIssuesForProject échoue', async () => {
      mockWorklogAppService.getSprintIssuesForProject.mockRejectedValue(new Error('boom'));

      const res = await request(app).get('/api/worklog/sprint-issues/PROJ');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/worklog/velocity-history/:projectKey', () => {
    it('utilise sprintCount=10 par défaut', async () => {
      const res = await request(app).get('/api/worklog/velocity-history/PROJ');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.averageVelocity).toBe(21);
      expect(res.body.trend).toBe('stable');
      expect(mockWorklogAppService.getVelocityHistory).toHaveBeenCalledWith('PROJ', 10);
    });

    it('passe sprintCount personnalisé', async () => {
      await request(app).get('/api/worklog/velocity-history/PROJ').query({ sprintCount: '5' });

      expect(mockWorklogAppService.getVelocityHistory).toHaveBeenCalledWith('PROJ', 5);
    });

    it('retourne 500 si getVelocityHistory échoue', async () => {
      mockWorklogAppService.getVelocityHistory.mockRejectedValue(new Error('boom'));

      const res = await request(app).get('/api/worklog/velocity-history/PROJ');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/worklog/support-kpi', () => {
    it('utilise activeSprint par défaut sans dates', async () => {
      const res = await request(app).get('/api/worklog/support-kpi');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.activeSprint).toBe(true);
      expect(mockWorklogAppService.getSupportBoardKPI).toHaveBeenCalledWith(
        undefined,
        undefined,
        true
      );
      expect(res.body.statusCounts).toEqual(TEST_SUPPORT_KPI_RESULT.statusCounts);
    });

    it('respecte activeSprint=false si from/to fournis', async () => {
      await request(app)
        .get('/api/worklog/support-kpi')
        .query({ from: '2026-04-01', to: '2026-04-15' });

      expect(mockWorklogAppService.getSupportBoardKPI).toHaveBeenCalledWith(
        '2026-04-01',
        '2026-04-15',
        false
      );
    });

    it('retourne 500 si getSupportBoardKPI échoue', async () => {
      mockWorklogAppService.getSupportBoardKPI.mockRejectedValue(new Error('boom'));

      const res = await request(app).get('/api/worklog/support-kpi');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/worklog/cache/stats', () => {
    it('retourne 200 avec message statique', async () => {
      const res = await request(app).get('/api/worklog/cache/stats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: 'Cache is managed internally',
      });
    });
  });

  describe('DELETE /api/worklog/cache', () => {
    it('appelle globalCache.clear() et retourne 200', async () => {
      const res = await request(app).delete('/api/worklog/cache');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockGlobalCache.clear).toHaveBeenCalled();
      expect(mockEmitAlert).not.toHaveBeenCalled();
    });

    it('émet emitAlert si io est présent', async () => {
      const res = await request(appWithIo).delete('/api/worklog/cache');

      expect(res.status).toBe(200);
      expect(mockGlobalCache.clear).toHaveBeenCalled();
      expect(mockEmitAlert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ level: 'info', message: expect.stringMatching(/Cache vidé/) })
      );
    });

    it('retourne 500 si globalCache.clear échoue', async () => {
      mockGlobalCache.clear.mockImplementation(() => {
        throw new Error('cache down');
      });

      const res = await request(app).delete('/api/worklog/cache');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/worklog/sync', () => {
    it('retourne 401 sans authentification', async () => {
      authMode = 'deny';

      const res = await request(appWithIo).post('/api/worklog/sync');

      expect(res.status).toBe(401);
      expect(mockWorklogAppService.getConfiguredProjects).not.toHaveBeenCalled();
    });

    it('synchronise les projets et émet la progression WebSocket', async () => {
      const res = await request(appWithIo).post('/api/worklog/sync');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.projectsSynced).toBe(2);
      expect(res.body.totalProjects).toBe(2);
      expect(mockGlobalCache.clear).toHaveBeenCalled();
      expect(mockWorklogAppService.getSprintIssuesForProject).toHaveBeenCalledTimes(2);
      expect(mockEmitSyncProgress).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'started' })
      );
      expect(mockEmitSyncProgress).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'completed', progress: 100 })
      );
      expect(mockEmitKPIUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: 'sprint' })
      );
    });

    it('retourne 500 et émet une erreur WebSocket si getConfiguredProjects échoue', async () => {
      mockWorklogAppService.getConfiguredProjects.mockRejectedValue(new Error('config fail'));

      const res = await request(appWithIo).post('/api/worklog/sync');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(mockEmitSyncProgress).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'error' })
      );
    });
  });

  describe('stubs de compatibilité', () => {
    it('GET /discover retourne 200 minimal', async () => {
      const res = await request(app).get('/api/worklog/discover');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.availableEndpoints).toContain('Jira Cloud REST API v3');
    });

    it('GET /discover-reports retourne 200 minimal', async () => {
      const res = await request(app).get('/api/worklog/discover-reports');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, availableEndpoints: [] });
    });

    it('GET /saved-reports retourne 200 minimal', async () => {
      const res = await request(app).get('/api/worklog/saved-reports');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, count: 0, reports: [] });
    });

    it('GET /attributes retourne 200 minimal', async () => {
      const res = await request(app).get('/api/worklog/attributes');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, attributes: [] });
    });
  });
});
