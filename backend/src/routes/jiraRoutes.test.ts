import request from 'supertest';
import express, { Express, Request } from 'express';

const mockDashboardSnapshotModel = {
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndDelete: jest.fn()
};

function chainDashboardFind(result: unknown[]) {
  return {
    sort: () => ({
      limit: () => ({
        select: () => Promise.resolve(result)
      })
    })
  };
}

const mockWorklogAppService = {
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
  testConnection: jest.fn()
};

jest.mock('../application/services/WorklogApplicationService', () => ({
  worklogAppService: mockWorklogAppService
}));

jest.mock('../domain/sprint/entities/DashboardSprintSnapshot', () => ({
  DashboardSprintSnapshot: mockDashboardSnapshotModel
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

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

import { jiraRoutes } from './jiraRoutes';

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/jira', jiraRoutes);
  return app;
}

describe('jiraRoutes', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockWorklogAppService.getConfiguredProjects.mockResolvedValue(['ABC']);
    mockWorklogAppService.getProjects.mockResolvedValue([{ key: 'ABC', name: 'Projet ABC', id: '1' }]);
    mockWorklogAppService.getConfiguredBoards.mockResolvedValue([{ id: 12, name: 'Board A' }]);
    mockWorklogAppService.getSprintIssuesForAllConfiguredBoards.mockResolvedValue([]);
    mockWorklogAppService.getSprintIssuesForBoard.mockResolvedValue({ boardId: 12, issues: [] });
    mockWorklogAppService.getResolvedByDay.mockResolvedValue({ byDay: [], boards: [] });
    mockWorklogAppService.getActiveSprintDateRange.mockResolvedValue({ from: '2026-04-01', to: '2026-04-15' });
    mockWorklogAppService.getAllProjects.mockResolvedValue([{ key: 'ABC' }]);
    mockWorklogAppService.getEpicProgressByBoard.mockResolvedValue({ total: 0, epics: [] });
    mockWorklogAppService.searchEpicsByTitle.mockResolvedValue({ results: [] });
    mockWorklogAppService.getEpicDetails.mockResolvedValue({ epicKey: 'EPIC-1', children: [] });
    mockWorklogAppService.getTimeTrackingConfig.mockResolvedValue({ workingHoursPerDay: 8, workingDaysPerWeek: 5 });
    mockWorklogAppService.testConnection.mockResolvedValue({ success: true });
    mockDashboardSnapshotModel.find.mockReset();
    mockDashboardSnapshotModel.findById.mockReset();
    mockDashboardSnapshotModel.findByIdAndDelete.mockReset();
    mockDashboardSnapshotModel.create.mockReset();
    mockDashboardSnapshotModel.create.mockResolvedValue({
      _id: 'snap-default',
      sprintName: 'S',
      savedAt: new Date(),
      savedBy: { email: 'admin@test.com' }
    });
  });

  it('GET /api/jira/configured-projects mappe les clés configurées avec leurs noms', async () => {
    const res = await request(app).get('/api/jira/configured-projects');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      projects: [{ key: 'ABC', name: 'Projet ABC', id: '1' }]
    });
  });

  it('GET /api/jira/configured-projects retourne 500 si erreur', async () => {
    mockWorklogAppService.getConfiguredProjects.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/jira/configured-projects');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/jira/configured-boards retourne 500 si erreur', async () => {
    mockWorklogAppService.getConfiguredBoards.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/jira/configured-boards');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/jira/dashboard/sprint-issues-all retourne les boards', async () => {
    mockWorklogAppService.getSprintIssuesForAllConfiguredBoards.mockResolvedValue([{ boardId: 1 }]);
    const res = await request(app).get('/api/jira/dashboard/sprint-issues-all').query({ from: '2026-04-01', to: '2026-04-15' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockWorklogAppService.getSprintIssuesForAllConfiguredBoards).toHaveBeenCalledWith('2026-04-01', '2026-04-15');
  });

  it('GET /api/jira/dashboard/sprint-issues-all retourne 500 si erreur', async () => {
    mockWorklogAppService.getSprintIssuesForAllConfiguredBoards.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/jira/dashboard/sprint-issues-all');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/jira/configured-boards retourne la liste des boards', async () => {
    const res = await request(app).get('/api/jira/configured-boards');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, boards: [{ id: 12, name: 'Board A' }] });
  });

  it('GET /api/jira/projects retourne projets + configuredProjects', async () => {
    mockWorklogAppService.getAllProjects.mockResolvedValue([{ key: 'ABC', name: 'P1' }]);
    const res = await request(app).get('/api/jira/projects');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.configuredProjects).toEqual(['ABC']);
  });

  it('GET /api/jira/projects retourne 500 si erreur', async () => {
    mockWorklogAppService.getAllProjects.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/jira/projects');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/jira/board/:boardId/sprint-issues retourne 400 si boardId invalide', async () => {
    const res = await request(app).get('/api/jira/board/not-a-number/sprint-issues');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/jira/resolved-by-day retourne 400 si période absente et activeSprint=false', async () => {
    const res = await request(app).get('/api/jira/resolved-by-day');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockWorklogAppService.getResolvedByDay).not.toHaveBeenCalled();
  });

  it('GET /api/jira/board/:boardId/sprint-issues accepte from/to et retourne 500 en erreur', async () => {
    const ok = await request(app)
      .get('/api/jira/board/12/sprint-issues')
      .query({ from: '2026-04-01', to: '2026-04-10' });
    expect(ok.status).toBe(200);
    expect(mockWorklogAppService.getSprintIssuesForBoard).toHaveBeenCalledWith(12, '2026-04-01', '2026-04-10');

    mockWorklogAppService.getSprintIssuesForBoard.mockRejectedValueOnce(new Error('boom'));
    const err = await request(app).get('/api/jira/board/12/sprint-issues');
    expect(err.status).toBe(500);
    expect(err.body.success).toBe(false);
  });

  it('GET /api/jira/resolved-by-day utilise from/to et mode tickets par défaut', async () => {
    const res = await request(app)
      .get('/api/jira/resolved-by-day')
      .query({ from: '2026-04-01', to: '2026-04-15' });
    expect(res.status).toBe(200);
    expect(mockWorklogAppService.getResolvedByDay).toHaveBeenCalledWith('2026-04-01', '2026-04-15', 'tickets', false);
    expect(res.body.mode).toBe('tickets');
  });

  it('GET /api/jira/resolved-by-day retourne 500 si erreur service', async () => {
    mockWorklogAppService.getResolvedByDay.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app)
      .get('/api/jira/resolved-by-day')
      .query({ from: '2026-04-01', to: '2026-04-15' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/jira/resolved-by-day utilise activeSprint et mode=points', async () => {
    mockWorklogAppService.getResolvedByDay.mockResolvedValue({
      byDay: [{ date: '2026-04-01', BoardA: 3 }],
      boards: [{ id: 12, name: 'Board A' }]
    });

    const res = await request(app)
      .get('/api/jira/resolved-by-day')
      .query({ activeSprint: 'true', mode: 'points' });

    expect(res.status).toBe(200);
    expect(mockWorklogAppService.getResolvedByDay).toHaveBeenCalledWith('2026-04-01', '2026-04-15', 'points', true);
    expect(res.body.mode).toBe('points');
    expect(res.body.dateRange).toEqual({ from: '2026-04-01', to: '2026-04-15' });
  });

  it('GET /api/jira/resolved-by-day retourne 400 si activeSprint sans plage trouvée', async () => {
    mockWorklogAppService.getActiveSprintDateRange.mockResolvedValue(null);
    const res = await request(app).get('/api/jira/resolved-by-day').query({ activeSprint: 'true' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/jira/epic-progress retourne 400 si boardId absent/invalide', async () => {
    const res = await request(app).get('/api/jira/epic-progress');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/jira/epic-progress retourne 500 en erreur', async () => {
    mockWorklogAppService.getEpicProgressByBoard.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/jira/epic-progress').query({ boardId: '12' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/jira/epic-search retourne 400 si boardId invalide', async () => {
    const res = await request(app).get('/api/jira/epic-search').query({ query: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/jira/epic-search retourne 500 en erreur', async () => {
    mockWorklogAppService.searchEpicsByTitle.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/jira/epic-search').query({ boardId: '12', query: 'a' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/jira/epic-progress applique les defaults et borne pageSize', async () => {
    await request(app)
      .get('/api/jira/epic-progress')
      .query({ boardId: '12', pageSize: '999', typeFilter: 'legend', statusFilter: 'done' });

    expect(mockWorklogAppService.getEpicProgressByBoard).toHaveBeenCalledWith(12, 'legend', 'done', 1, 100, undefined);
  });

  it('GET /api/jira/epic-search appelle le service avec query + filtres', async () => {
    const res = await request(app)
      .get('/api/jira/epic-search')
      .query({ boardId: '12', query: 'feat', typeFilter: 'all', statusFilter: 'indeterminate' });

    expect(res.status).toBe(200);
    expect(mockWorklogAppService.searchEpicsByTitle).toHaveBeenCalledWith(12, 'feat', 'all', 'indeterminate');
  });

  it('GET /api/jira/epic/:epicKey/details remonte la réponse du service', async () => {
    mockWorklogAppService.getEpicDetails.mockResolvedValue({ epicKey: 'EPIC-42', summary: 'Feature', children: [] });
    const res = await request(app).get('/api/jira/epic/EPIC-42/details');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.epicKey).toBe('EPIC-42');
  });

  it('GET /api/jira/time-config retourne la configuration de temps', async () => {
    const res = await request(app).get('/api/jira/time-config');
    expect(res.status).toBe(200);
    expect(res.body.workingHoursPerDay).toBe(8);
  });

  it('GET /api/jira/time-config retourne 500 en erreur', async () => {
    mockWorklogAppService.getTimeTrackingConfig.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/jira/time-config');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/jira/epic/:epicKey/details retourne 500 en erreur', async () => {
    mockWorklogAppService.getEpicDetails.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/jira/epic/EPIC-1/details');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/jira/test retourne succès de connexion', async () => {
    mockWorklogAppService.testConnection.mockResolvedValue({ success: true });
    const res = await request(app).get('/api/jira/test');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/jira/test retourne message échec si connexion KO', async () => {
    mockWorklogAppService.testConnection.mockResolvedValue({ success: false });
    const res = await request(app).get('/api/jira/test');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('failed');
  });

  it('GET /api/jira/test retourne 500 si exception', async () => {
    mockWorklogAppService.testConnection.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/jira/test');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/jira/dashboard-snapshot retourne 400 si sprintName absent', async () => {
    const res = await request(app)
      .post('/api/jira/dashboard-snapshot')
      .send({ projectsStats: [] });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/jira/dashboard-snapshot normalise key depuis boardId', async () => {
    mockDashboardSnapshotModel.create.mockResolvedValue({
      _id: 'snap-1',
      sprintName: 'Sprint 42',
      savedAt: new Date('2026-04-29T10:00:00.000Z'),
      savedBy: { id: 'u1', email: 'admin@test.com' }
    });

    const res = await request(app)
      .post('/api/jira/dashboard-snapshot')
      .send({
        sprintName: 'Sprint 42',
        projectsStats: [{ boardId: 123, name: 'Board A', color: '#fff' }]
      });

    expect(res.status).toBe(201);
    expect(mockDashboardSnapshotModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectsStats: [expect.objectContaining({ key: '123', boardId: 123 })]
      })
    );
  });

  it('POST /api/jira/dashboard-snapshot retourne 400 si projectsStats absent', async () => {
    const res = await request(app).post('/api/jira/dashboard-snapshot').send({ sprintName: 'S1' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/jira/dashboard-snapshot retourne 500 avec message validation mongoose', async () => {
    const err = Object.assign(new Error('Validation failed'), {
      errors: { sprintName: { message: 'required' } }
    });
    mockDashboardSnapshotModel.create.mockRejectedValueOnce(err);
    const res = await request(app)
      .post('/api/jira/dashboard-snapshot')
      .send({ sprintName: 'S1', projectsStats: [{ key: 'A' }] });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/jira/dashboard-snapshots retourne la liste', async () => {
    mockDashboardSnapshotModel.find.mockReturnValue(
      chainDashboardFind([
        {
          _id: 'id1',
          sprintName: 'S1',
          savedAt: new Date(),
          savedBy: { email: 'a@test.com' },
          dateRange: { from: '2026-04-01', to: '2026-04-15' },
          notes: '',
          totals: { totalTickets: 5, resolvedTickets: 2, totalPoints: 10, resolvedPoints: 4, totalTimeHours: 1 }
        }
      ])
    );
    const res = await request(app).get('/api/jira/dashboard-snapshots').query({ limit: 10 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(res.body.snapshots[0].summary.totalTickets).toBe(5);
  });

  it('GET /api/jira/dashboard-snapshots retourne 500 en erreur', async () => {
    mockDashboardSnapshotModel.find.mockImplementationOnce(() => {
      throw new Error('db');
    });
    const res = await request(app).get('/api/jira/dashboard-snapshots');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/jira/dashboard-snapshot/:id retourne 500 en erreur', async () => {
    mockDashboardSnapshotModel.findById.mockRejectedValueOnce(new Error('db'));
    const res = await request(app).get('/api/jira/dashboard-snapshot/x');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('DELETE /api/jira/dashboard-snapshot/:id retourne 500 en erreur', async () => {
    mockDashboardSnapshotModel.findByIdAndDelete.mockRejectedValueOnce(new Error('db'));
    const res = await request(app).delete('/api/jira/dashboard-snapshot/x');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/jira/dashboard-snapshot/:id retourne 404 si snapshot absent', async () => {
    mockDashboardSnapshotModel.findById.mockResolvedValue(null);
    const res = await request(app).get('/api/jira/dashboard-snapshot/unknown');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('DELETE /api/jira/dashboard-snapshot/:id retourne 404 si snapshot absent', async () => {
    mockDashboardSnapshotModel.findByIdAndDelete.mockResolvedValue(null);
    const res = await request(app).delete('/api/jira/dashboard-snapshot/unknown');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
