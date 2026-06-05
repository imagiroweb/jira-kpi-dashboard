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
  TEST_RESOLVED_BY_DAY_POINTS,
  TEST_RESOLVED_BY_DAY_TICKETS,
  TEST_SPRINT_ISSUES_ALL_BOARDS,
  TEST_TIME_TRACKING_CONFIG,
} from '../test/fixtures/jira';
import { TEST_SPRINT_ISSUES_RESULT } from '../test/fixtures/worklogs';
import { createWorklogAppServiceMock } from '../test/mocks/worklogAppService';

jest.mock('../utils/logger', () =>
  jest.requireActual('../test/mocks/logger').loggerMockFactory()
);

const mockWorklogAppService = createWorklogAppServiceMock();
jest.mock('../application/services/WorklogApplicationService', () => ({
  worklogAppService: mockWorklogAppService,
}));

import { jiraRoutes } from './jiraRoutes';

describe('jiraRoutes — core (TI)', () => {
  const app = createTestApp({ mountPath: '/api/jira', router: jiraRoutes });

  beforeEach(() => {
    jest.clearAllMocks();

    mockWorklogAppService.getConfiguredProjects.mockResolvedValue(['PROJ', 'ABC', 'UNKNOWN']);
    mockWorklogAppService.getProjects.mockResolvedValue(TEST_JIRA_PROJECTS);
    mockWorklogAppService.getConfiguredBoards.mockResolvedValue(TEST_CONFIGURED_BOARDS);
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

    it('retourne 500 si getConfiguredBoards échoue', async () => {
      mockWorklogAppService.getConfiguredBoards.mockRejectedValue(new Error('boards fail'));

      const res = await request(app).get('/api/jira/configured-boards');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('boards fail');
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
        '2026-04-15'
      );
    });

    it('appelle le service sans dates si from/to absents', async () => {
      await request(app).get('/api/jira/dashboard/sprint-issues-all');

      expect(mockWorklogAppService.getSprintIssuesForAllConfiguredBoards).toHaveBeenCalledWith(
        undefined,
        undefined
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

  describe('GET /api/jira/test', () => {
    it('retourne 200 si la connexion Jira réussit', async () => {
      const res = await request(app).get('/api/jira/test');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Jira connection successful');
      expect(mockWorklogAppService.testConnection).toHaveBeenCalled();
    });

    it('retourne 200 avec success false si la connexion échoue', async () => {
      mockWorklogAppService.testConnection.mockResolvedValue({ success: false });

      const res = await request(app).get('/api/jira/test');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Jira connection failed');
    });

    it('retourne 500 si testConnection lève une erreur', async () => {
      mockWorklogAppService.testConnection.mockRejectedValue(new Error('network'));

      const res = await request(app).get('/api/jira/test');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('network');
    });
  });
});
