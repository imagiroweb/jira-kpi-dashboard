import request from 'supertest';
import express, { Express, Request } from 'express';

const mockDashboardSnapshotModel = {
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndDelete: jest.fn()
};

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
  });

  it('GET /api/jira/configured-projects mappe les clés configurées avec leurs noms', async () => {
    const res = await request(app).get('/api/jira/configured-projects');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      projects: [{ key: 'ABC', name: 'Projet ABC', id: '1' }]
    });
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

  it('GET /api/jira/epic-progress retourne 400 si boardId absent/invalide', async () => {
    const res = await request(app).get('/api/jira/epic-progress');
    expect(res.status).toBe(400);
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
});
