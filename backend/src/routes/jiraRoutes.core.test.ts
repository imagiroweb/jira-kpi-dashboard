/**
 * TI — Routes Jira (core) : projets, boards, sprint issues, resolved-by-day, epics, time-config, test
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import {
  TEST_CONFIGURED_BOARDS,
  TEST_EPIC_DETAILS_RESULT,
  TEST_EPIC_PROGRESS_RESULT,
  TEST_EPIC_SEARCH_RESULT,
  TEST_JIRA_PROJECTS,
  TEST_QA_BOARDS,
  TEST_RESOLVED_BY_DAY_POINTS,
  TEST_RESOLVED_BY_DAY_TICKETS,
  TEST_SPRINT_ISSUES_ALL_BOARDS,
  TEST_TIME_TRACKING_CONFIG,
} from '../test/fixtures/jira';
import { TEST_SPRINT_ISSUES_RESULT } from '../test/fixtures/worklogs';
import { TEST_USER } from '../test/fixtures/users';
import { createWorklogAppServiceMock } from '../test/mocks/worklogAppService';

jest.mock('../utils/logger', () =>
  jest.requireActual('../test/mocks/logger').loggerMockFactory()
);

const mockWorklogAppService = createWorklogAppServiceMock();
jest.mock('../application/services/WorklogApplicationService', () => ({
  worklogAppService: mockWorklogAppService,
}));

const mockUserHasCostAccess = jest.fn();
jest.mock('../application/services/appUserDirectory', () => ({
  userHasCostAccess: (...args: unknown[]) => mockUserHasCostAccess(...args),
}));

// Contrôle par page testé à part (middleware/requirePage.test.ts) : ici, laisse passer
// sauf si mockPageAccess = 'deny'.
let mockPageAccess = 'allow' as 'allow' | 'deny';
jest.mock('../middleware/requirePage', () => ({
  requirePage: () => (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }, next: () => void) =>
    mockPageAccess === 'deny' ? res.status(403).json({ success: false, error: 'Accès non autorisé pour votre rôle' }) : next(),
}));

let mockAuthMode = 'pass' as 'pass' | 'deny';
jest.mock('../middleware/authMiddleware', () => {
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>('../test/mocks/authMiddleware');
  return {
    authenticate: (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) =>
      mockAuthMode === 'deny' ? auth.mockAuthDenied(req, res, next) : auth.mockAuthenticate()(req, res, next),
  };
});

import { jiraRoutes } from './jiraRoutes';

describe('jiraRoutes — core (TI)', () => {
  const app = createTestApp({ mountPath: '/api/jira', router: jiraRoutes });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMode = 'pass';
    mockPageAccess = 'allow';

    mockWorklogAppService.getConfiguredProjects.mockResolvedValue(['PROJ', 'ABC', 'UNKNOWN']);
    mockWorklogAppService.getProjects.mockResolvedValue(TEST_JIRA_PROJECTS);
    mockWorklogAppService.getConfiguredBoards.mockResolvedValue(TEST_CONFIGURED_BOARDS);
    mockWorklogAppService.getQaBoards.mockResolvedValue(TEST_QA_BOARDS);
    mockWorklogAppService.getSprintIssuesForAllConfiguredBoards.mockResolvedValue(
      TEST_SPRINT_ISSUES_ALL_BOARDS
    );
    mockWorklogAppService.getSprintIssuesForBoard.mockResolvedValue(TEST_SPRINT_ISSUES_RESULT);
    mockWorklogAppService.getActiveSprintDateRange.mockResolvedValue({
      from: '2026-04-01',
      to: '2026-04-15',
    });
    mockWorklogAppService.getResolvedByDay.mockResolvedValue(TEST_RESOLVED_BY_DAY_TICKETS);
    mockWorklogAppService.getAllProjects.mockResolvedValue([
      { key: 'ALL', name: 'All Projects', id: '300' },
      ...TEST_JIRA_PROJECTS,
    ]);
    mockWorklogAppService.getEpicProgressByBoard.mockResolvedValue(TEST_EPIC_PROGRESS_RESULT);
    mockWorklogAppService.searchEpicsByTitle.mockResolvedValue(TEST_EPIC_SEARCH_RESULT);
    mockWorklogAppService.getEpicDetails.mockResolvedValue(TEST_EPIC_DETAILS_RESULT);
    mockWorklogAppService.getTimeTrackingConfig.mockResolvedValue(TEST_TIME_TRACKING_CONFIG);
    mockWorklogAppService.testConnection.mockResolvedValue({ success: true });
  });

  describe('GET /api/jira/configured-projects', () => {
    it('mappe les clés configurées vers les noms de projet', async () => {
      const res = await request(app).get('/api/jira/configured-projects');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.projects).toEqual([
        { key: 'PROJ', name: 'Project One', id: '100' },
        { key: 'ABC', name: 'Alpha Beta', id: '200' },
        { key: 'UNKNOWN', name: 'UNKNOWN', id: null },
      ]);
      expect(mockWorklogAppService.getConfiguredProjects).toHaveBeenCalled();
      expect(mockWorklogAppService.getProjects).toHaveBeenCalled();
    });

    it('retourne 500 si getConfiguredProjects échoue', async () => {
      mockWorklogAppService.getConfiguredProjects.mockRejectedValue(new Error('jira down'));

      const res = await request(app).get('/api/jira/configured-projects');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/configured projects/);
    });
  });

  describe('GET /api/jira/configured-boards', () => {
    it('retourne 200 avec les boards configurés', async () => {
      const res = await request(app).get('/api/jira/configured-boards');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.boards).toEqual(TEST_CONFIGURED_BOARDS);
      expect(mockWorklogAppService.getConfiguredBoards).toHaveBeenCalled();
    });

    it('expose les boards QA dans une liste distincte', async () => {
      const res = await request(app).get('/api/jira/configured-boards');

      expect(res.body.qaBoards).toEqual(TEST_QA_BOARDS);
      expect(res.body.boards).not.toContainEqual(TEST_QA_BOARDS[0]);
    });

    it('retourne 500 si getConfiguredBoards échoue', async () => {
      mockWorklogAppService.getConfiguredBoards.mockRejectedValue(new Error('boards fail'));

      const res = await request(app).get('/api/jira/configured-boards');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('boards fail');
    });
  });

  describe('GET /api/jira/sprint-burndown', () => {
    it('propage includeQa=true au service', async () => {
      mockWorklogAppService.getSprintBurndowns.mockResolvedValue([{ boardId: 810, unit: 'points' }]);

      const res = await request(app).get('/api/jira/sprint-burndown').query({ includeQa: 'true' });

      expect(res.status).toBe(200);
      expect(res.body.boards).toEqual([{ boardId: 810, unit: 'points' }]);
      expect(mockWorklogAppService.getSprintBurndowns).toHaveBeenCalledWith({ includeQa: true });
    });

    it('retourne 500 si getSprintBurndowns échoue', async () => {
      mockWorklogAppService.getSprintBurndowns.mockRejectedValue(new Error('burn fail'));

      const res = await request(app).get('/api/jira/sprint-burndown');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/jira/dashboard/sprint-issues-all', () => {
    it('passe les paramètres from/to au service', async () => {
      const res = await request(app)
        .get('/api/jira/dashboard/sprint-issues-all')
        .query({ from: '2026-04-01', to: '2026-04-15' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.boards).toEqual(TEST_SPRINT_ISSUES_ALL_BOARDS);
      expect(mockWorklogAppService.getSprintIssuesForAllConfiguredBoards).toHaveBeenCalledWith(
        '2026-04-01',
        '2026-04-15',
        { includeQa: false }
      );
    });

    it('appelle le service sans dates si from/to absents', async () => {
      await request(app).get('/api/jira/dashboard/sprint-issues-all');

      expect(mockWorklogAppService.getSprintIssuesForAllConfiguredBoards).toHaveBeenCalledWith(
        undefined,
        undefined,
        { includeQa: false }
      );
    });

    it('propage includeQa=true au service', async () => {
      await request(app).get('/api/jira/dashboard/sprint-issues-all').query({ includeQa: 'true' });

      expect(mockWorklogAppService.getSprintIssuesForAllConfiguredBoards).toHaveBeenCalledWith(
        undefined,
        undefined,
        { includeQa: true }
      );
    });

    it('retourne 500 si getSprintIssuesForAllConfiguredBoards échoue', async () => {
      mockWorklogAppService.getSprintIssuesForAllConfiguredBoards.mockRejectedValue(
        new Error('batch fail')
      );

      const res = await request(app).get('/api/jira/dashboard/sprint-issues-all');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/jira/board/:boardId/sprint-issues', () => {
    it('retourne 400 si boardId est NaN', async () => {
      const res = await request(app).get('/api/jira/board/abc/sprint-issues');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid board ID');
      expect(mockWorklogAppService.getSprintIssuesForBoard).not.toHaveBeenCalled();
    });

    it('retourne 200 avec les issues du board', async () => {
      const res = await request(app)
        .get('/api/jira/board/1/sprint-issues')
        .query({ from: '2026-04-01', to: '2026-04-15' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.issues).toEqual(TEST_SPRINT_ISSUES_RESULT.issues);
      expect(res.body.statusCounts).toEqual(TEST_SPRINT_ISSUES_RESULT.statusCounts);
      expect(mockWorklogAppService.getSprintIssuesForBoard).toHaveBeenCalledWith(
        1,
        '2026-04-01',
        '2026-04-15'
      );
    });

    it('retourne 500 si getSprintIssuesForBoard échoue', async () => {
      mockWorklogAppService.getSprintIssuesForBoard.mockRejectedValue(new Error('board fail'));

      const res = await request(app).get('/api/jira/board/1/sprint-issues');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/jira/resolved-by-day', () => {
    it('retourne 400 sans dates ni activeSprint', async () => {
      const res = await request(app).get('/api/jira/resolved-by-day');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/from and to/);
      expect(mockWorklogAppService.getResolvedByDay).not.toHaveBeenCalled();
    });

    it('retourne 400 si activeSprint=true sans sprint disponible', async () => {
      mockWorklogAppService.getActiveSprintDateRange.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/jira/resolved-by-day')
        .query({ activeSprint: 'true' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/sprint actif/);
      expect(mockWorklogAppService.getResolvedByDay).not.toHaveBeenCalled();
    });

    it('résout activeSprint via getActiveSprintDateRange', async () => {
      const res = await request(app)
        .get('/api/jira/resolved-by-day')
        .query({ activeSprint: 'true', mode: 'tickets' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.mode).toBe('tickets');
      expect(res.body.dateRange).toEqual({ from: '2026-04-01', to: '2026-04-15' });
      expect(mockWorklogAppService.getActiveSprintDateRange).toHaveBeenCalled();
      expect(mockWorklogAppService.getResolvedByDay).toHaveBeenCalledWith(
        '2026-04-01',
        '2026-04-15',
        'tickets',
        true
      );
    });

    it('utilise le mode points quand mode=points', async () => {
      mockWorklogAppService.getResolvedByDay.mockResolvedValue(TEST_RESOLVED_BY_DAY_POINTS);

      const res = await request(app)
        .get('/api/jira/resolved-by-day')
        .query({ from: '2026-04-10', to: '2026-04-10', mode: 'points' });

      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('points');
      expect(res.body.totalsBySeriesPoints).toEqual(TEST_RESOLVED_BY_DAY_POINTS.totalsBySeriesPoints);
      expect(mockWorklogAppService.getResolvedByDay).toHaveBeenCalledWith(
        '2026-04-10',
        '2026-04-10',
        'points',
        false
      );
    });

    it('retourne 200 en mode tickets avec from/to', async () => {
      const res = await request(app)
        .get('/api/jira/resolved-by-day')
        .query({ from: '2026-04-10', to: '2026-04-10' });

      expect(res.status).toBe(200);
      expect(res.body.byDay).toEqual(TEST_RESOLVED_BY_DAY_TICKETS.byDay);
      expect(res.body.totalResolvedTickets).toBe(3);
      expect(res.body.mode).toBe('tickets');
    });

    it('retourne 500 si getResolvedByDay échoue', async () => {
      mockWorklogAppService.getResolvedByDay.mockRejectedValue(new Error('resolved fail'));

      const res = await request(app)
        .get('/api/jira/resolved-by-day')
        .query({ from: '2026-04-01', to: '2026-04-15' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/jira/projects', () => {
    it('retourne data et configuredProjects', async () => {
      const res = await request(app).get('/api/jira/projects');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.configuredProjects).toEqual(['PROJ', 'ABC', 'UNKNOWN']);
      expect(mockWorklogAppService.getAllProjects).toHaveBeenCalled();
      expect(mockWorklogAppService.getConfiguredProjects).toHaveBeenCalled();
    });

    it('retourne 500 si getAllProjects échoue', async () => {
      mockWorklogAppService.getAllProjects.mockRejectedValue(new Error('projects fail'));

      const res = await request(app).get('/api/jira/projects');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/jira/epic-progress', () => {
    it('retourne 400 si boardId est invalide', async () => {
      const res = await request(app).get('/api/jira/epic-progress');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid board ID');
      expect(mockWorklogAppService.getEpicProgressByBoard).not.toHaveBeenCalled();
    });

    it('passe la pagination et les filtres au service', async () => {
      const res = await request(app).get('/api/jira/epic-progress').query({
        boardId: '1',
        typeFilter: 'epic',
        statusFilter: 'new',
        page: '2',
        pageSize: '10',
        summaryPrefix: 'CLI',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.items).toEqual(TEST_EPIC_PROGRESS_RESULT.items);
      expect(mockWorklogAppService.getEpicProgressByBoard).toHaveBeenCalledWith(
        1,
        'epic',
        'new',
        2,
        10,
        'CLI'
      );
    });

    it('utilise page=1 et pageSize=20 par défaut', async () => {
      await request(app).get('/api/jira/epic-progress').query({ boardId: '1' });

      expect(mockWorklogAppService.getEpicProgressByBoard).toHaveBeenCalledWith(
        1,
        'all',
        'all',
        1,
        20,
        undefined
      );
    });

    it('retourne 500 si getEpicProgressByBoard échoue', async () => {
      mockWorklogAppService.getEpicProgressByBoard.mockRejectedValue(new Error('epic fail'));

      const res = await request(app).get('/api/jira/epic-progress').query({ boardId: '1' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/jira/epic-search', () => {
    it('accepte une query vide', async () => {
      const res = await request(app).get('/api/jira/epic-search').query({ boardId: '1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.items).toEqual(TEST_EPIC_SEARCH_RESULT.items);
      expect(mockWorklogAppService.searchEpicsByTitle).toHaveBeenCalledWith(1, '', 'all', 'all');
    });

    it('retourne 400 si boardId est invalide', async () => {
      const res = await request(app).get('/api/jira/epic-search').query({ query: 'CLI' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid board ID');
    });

    it('passe query et filtres au service', async () => {
      await request(app).get('/api/jira/epic-search').query({
        boardId: '1',
        query: 'CLI',
        typeFilter: 'legend',
        statusFilter: 'done',
      });

      expect(mockWorklogAppService.searchEpicsByTitle).toHaveBeenCalledWith(
        1,
        'CLI',
        'legend',
        'done'
      );
    });

    it('retourne 500 si searchEpicsByTitle échoue', async () => {
      mockWorklogAppService.searchEpicsByTitle.mockRejectedValue(new Error('search fail'));

      const res = await request(app).get('/api/jira/epic-search').query({ boardId: '1' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/jira/epic/:epicKey/time-by-user', () => {
    const RESULT = { epicKey: 'PROJ-100', issueCount: 3, totalSeconds: 7200, people: [], byRole: [] };

    it('retourne 401 sans utilisateur authentifié (temps passé par personne)', async () => {
      mockAuthMode = 'deny';

      const res = await request(app).get('/api/jira/epic/PROJ-100/time-by-user');

      expect(res.status).toBe(401);
      expect(mockWorklogAppService.getEpicTimeByUser).not.toHaveBeenCalled();
    });

    it('retourne 403 si le rôle n’a pas la page Suivi épics', async () => {
      mockPageAccess = 'deny';

      const res = await request(app).get('/api/jira/epic/PROJ-100/time-by-user');

      expect(res.status).toBe(403);
      expect(mockWorklogAppService.getEpicTimeByUser).not.toHaveBeenCalled();
    });

    it("demande les coûts si l'utilisateur y a accès (super admin / rôle finance)", async () => {
      mockUserHasCostAccess.mockResolvedValue(true);
      mockWorklogAppService.getEpicTimeByUser.mockResolvedValue({ ...RESULT, totalCost: 525 });

      const res = await request(app).get('/api/jira/epic/PROJ-100/time-by-user').set('Authorization', 'Bearer t');

      expect(res.body.totalCost).toBe(525);
      expect(mockUserHasCostAccess).toHaveBeenCalledWith(TEST_USER.userId);
      expect(mockWorklogAppService.getEpicTimeByUser).toHaveBeenCalledWith('PROJ-100', { withCosts: true });
    });

    it("ne demande pas les coûts si le rôle de l'utilisateur n'y a pas accès", async () => {
      mockUserHasCostAccess.mockResolvedValue(false);
      mockWorklogAppService.getEpicTimeByUser.mockResolvedValue(RESULT);

      await request(app).get('/api/jira/epic/PROJ-100/time-by-user').set('Authorization', 'Bearer t');

      expect(mockWorklogAppService.getEpicTimeByUser).toHaveBeenCalledWith('PROJ-100', { withCosts: false });
    });

    it('retourne 500 si le service échoue', async () => {
      mockWorklogAppService.getEpicTimeByUser.mockRejectedValue(new Error('Epic PROJ-404 not found'));

      const res = await request(app).get('/api/jira/epic/PROJ-404/time-by-user');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Epic PROJ-404 not found');
    });
  });

  describe('GET /api/jira/epic/:epicKey/details', () => {
    it('retourne 200 avec les détails de l’epic', async () => {
      const res = await request(app).get('/api/jira/epic/PROJ-100/details');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.epicKey).toBe('PROJ-100');
      expect(res.body.children).toEqual(TEST_EPIC_DETAILS_RESULT.children);
      expect(mockWorklogAppService.getEpicDetails).toHaveBeenCalledWith('PROJ-100');
    });

    it('retourne 500 si getEpicDetails échoue', async () => {
      mockWorklogAppService.getEpicDetails.mockRejectedValue(new Error('details fail'));

      const res = await request(app).get('/api/jira/epic/PROJ-100/details');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/jira/time-config', () => {
    it('retourne 200 avec la configuration time tracking', async () => {
      const res = await request(app).get('/api/jira/time-config');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.workingHoursPerDay).toBe(8);
      expect(res.body.workingDaysPerWeek).toBe(5);
      expect(mockWorklogAppService.getTimeTrackingConfig).toHaveBeenCalled();
    });

    it('retourne 500 si getTimeTrackingConfig échoue', async () => {
      mockWorklogAppService.getTimeTrackingConfig.mockRejectedValue(new Error('config fail'));

      const res = await request(app).get('/api/jira/time-config');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/jira/claude-us-stats', () => {
    it('retourne 200 avec les compteurs Claude / non Claude', async () => {
      mockWorklogAppService.getClaudeUsStats.mockResolvedValue({
        year: 2026,
        quarter: 'Q3',
        done: { claudeCount: 4, nonClaudeCount: 6, totalCount: 10, claudePercent: 40, byTeam: [] },
        created: { claudeCount: 2, nonClaudeCount: 8, totalCount: 10, claudePercent: 20, byTeam: [] },
      });

      const res = await request(app).get('/api/jira/claude-us-stats').query({ quarter: 'q3', year: '2026' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.done.claudeCount).toBe(4);
      expect(res.body.created.claudePercent).toBe(20);
      expect(mockWorklogAppService.getClaudeUsStats).toHaveBeenCalledWith(2026, 'Q3');
    });

    it("utilise l'année en cours et 'all' par défaut", async () => {
      mockWorklogAppService.getClaudeUsStats.mockResolvedValue({ done: {}, created: {} });

      await request(app).get('/api/jira/claude-us-stats');

      expect(mockWorklogAppService.getClaudeUsStats).toHaveBeenCalledWith(new Date().getFullYear(), 'all');
    });

    it('retourne 400 pour un trimestre invalide', async () => {
      const res = await request(app).get('/api/jira/claude-us-stats').query({ quarter: 'Q5' });

      expect(res.status).toBe(400);
      expect(mockWorklogAppService.getClaudeUsStats).not.toHaveBeenCalled();
    });

    it('retourne 500 si getClaudeUsStats échoue', async () => {
      mockWorklogAppService.getClaudeUsStats.mockRejectedValue(new Error('jira fail'));

      const res = await request(app).get('/api/jira/claude-us-stats').query({ quarter: 'Q4' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/jira/claude-us-issues', () => {
    it('transmet les paramètres au service et renvoie les tickets', async () => {
      mockWorklogAppService.getClaudeUsIssues.mockResolvedValue({
        jql: 'x',
        label: 'claude-us',
        issues: [{ key: 'AD-1', created: '2026-01-15', resolved: null, labelAddedAt: '2026-07-10' }],
      });

      const res = await request(app)
        .get('/api/jira/claude-us-issues')
        .query({ quarter: 'Q1', year: '2026', basis: 'created', boardId: '810' });

      expect(res.status).toBe(200);
      expect(res.body.issues[0].labelAddedAt).toBe('2026-07-10');
      expect(mockWorklogAppService.getClaudeUsIssues).toHaveBeenCalledWith({
        year: 2026,
        quarter: 'Q1',
        basis: 'created',
        boardId: 810,
      });
    });

    it('retourne 400 pour un paramètre invalide', async () => {
      const res = await request(app).get('/api/jira/claude-us-issues').query({ basis: 'autre' });

      expect(res.status).toBe(400);
      expect(mockWorklogAppService.getClaudeUsIssues).not.toHaveBeenCalled();
    });

    it('retourne 500 si le service échoue', async () => {
      mockWorklogAppService.getClaudeUsIssues.mockRejectedValue(new Error('jira fail'));

      const res = await request(app).get('/api/jira/claude-us-issues');

      expect(res.status).toBe(500);
    });
  });

  describe('Authentification obligatoire (toutes les routes)', () => {
    it.each([
      '/api/jira/configured-projects',
      '/api/jira/configured-boards',
      '/api/jira/projects',
      '/api/jira/time-config',
      '/api/jira/dashboard/sprint-issues-all',
      '/api/jira/resolved-by-day',
      '/api/jira/sprint-burndown',
      '/api/jira/epic-progress?boardId=1',
      '/api/jira/claude-us-stats',
      '/api/jira/dashboard-snapshots',
    ])('GET %s → 401 sans session', async (url) => {
      mockAuthMode = 'deny';

      const res = await request(app).get(url);

      expect(res.status).toBe(401);
    });

    it('la route de diagnostic /test a été supprimée', async () => {
      const res = await request(app).get('/api/jira/test');

      expect(res.status).toBe(404);
    });
  });
});
