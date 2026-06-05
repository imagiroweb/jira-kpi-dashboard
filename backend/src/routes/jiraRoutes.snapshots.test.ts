/**
 * TI — Routes Jira (snapshots) : CRUD dashboard-snapshot MongoDB
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import {
  TEST_DASHBOARD_SNAPSHOT_PROJECTS_STATS,
  TEST_DASHBOARD_SNAPSHOT_TOTALS,
} from '../test/fixtures/jira';
import { TEST_USER, TEST_USER_ID } from '../test/fixtures/users';
import { createWorklogAppServiceMock } from '../test/mocks/worklogAppService';

let authMode: 'pass' | 'deny' = 'pass';

jest.mock('../middleware/authMiddleware', () => {
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>(
    '../test/mocks/authMiddleware'
  );
  return {
    authenticate: (
      req: import('express').Request,
      res: import('express').Response,
      next: import('express').NextFunction
    ) => {
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

const mockDashboardSprintSnapshot = {
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndDelete: jest.fn(),
};

jest.mock('../domain/sprint/entities/DashboardSprintSnapshot', () => ({
  DashboardSprintSnapshot: mockDashboardSprintSnapshot,
}));

import { jiraRoutes } from './jiraRoutes';

const SNAPSHOT_ID = '507f1f77bcf86cd799439099';

function mockSnapshotDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: SNAPSHOT_ID,
    sprintName: 'Sprint 42',
    savedAt: new Date('2026-04-15T12:00:00.000Z'),
    savedBy: { id: TEST_USER_ID, email: TEST_USER.email, name: 'admin' },
    dateRange: { from: '2026-04-01', to: '2026-04-15' },
    notes: 'note test',
    projectsStats: TEST_DASHBOARD_SNAPSHOT_PROJECTS_STATS,
    totals: TEST_DASHBOARD_SNAPSHOT_TOTALS,
    ...overrides,
  };
}

function mockFindChain(docs: unknown[]) {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue(docs),
  };
  mockDashboardSprintSnapshot.find.mockReturnValue(chain);
  return chain;
}

describe('jiraRoutes — snapshots (TI)', () => {
  const app = createTestApp({ mountPath: '/api/jira', router: jiraRoutes });

  beforeEach(() => {
    jest.clearAllMocks();
    authMode = 'pass';

    mockDashboardSprintSnapshot.create.mockResolvedValue(mockSnapshotDoc());
    mockFindChain([mockSnapshotDoc()]);
    mockDashboardSprintSnapshot.findById.mockResolvedValue(mockSnapshotDoc());
    mockDashboardSprintSnapshot.findByIdAndDelete.mockResolvedValue(mockSnapshotDoc());
  });

  describe('POST /api/jira/dashboard-snapshot', () => {
    const validBody = {
      sprintName: 'Sprint 42',
      projectsStats: TEST_DASHBOARD_SNAPSHOT_PROJECTS_STATS,
      totals: TEST_DASHBOARD_SNAPSHOT_TOTALS,
      dateRange: { from: '2026-04-01', to: '2026-04-15' },
      notes: 'note test',
    };

    it('retourne 401 sans authentification', async () => {
      authMode = 'deny';

      const res = await request(app).post('/api/jira/dashboard-snapshot').send(validBody);

      expect(res.status).toBe(401);
      expect(mockDashboardSprintSnapshot.create).not.toHaveBeenCalled();
    });

    it('retourne 400 sans sprintName', async () => {
      const res = await request(app)
        .post('/api/jira/dashboard-snapshot')
        .send({ projectsStats: TEST_DASHBOARD_SNAPSHOT_PROJECTS_STATS });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/nom du sprint/);
      expect(mockDashboardSprintSnapshot.create).not.toHaveBeenCalled();
    });

    it('retourne 400 sans projectsStats', async () => {
      const res = await request(app)
        .post('/api/jira/dashboard-snapshot')
        .send({ sprintName: 'Sprint 42' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/statistiques des projets/);
      expect(mockDashboardSprintSnapshot.create).not.toHaveBeenCalled();
    });

    it('retourne 400 si projectsStats n’est pas un tableau', async () => {
      const res = await request(app)
        .post('/api/jira/dashboard-snapshot')
        .send({ sprintName: 'Sprint 42', projectsStats: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/statistiques des projets/);
    });

    it('retourne 201 et normalise key depuis boardId', async () => {
      const res = await request(app)
        .post('/api/jira/dashboard-snapshot')
        .send({
          sprintName: 'Sprint 42',
          projectsStats: [{ boardId: 1, name: 'Board 1', totalTickets: 5 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/enregistré/);
      expect(res.body.snapshot.sprintName).toBe('Sprint 42');
      expect(res.body.snapshot.id).toBe(SNAPSHOT_ID);
      expect(mockDashboardSprintSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sprintName: 'Sprint 42',
          savedBy: expect.objectContaining({ id: TEST_USER_ID, email: TEST_USER.email }),
          projectsStats: [expect.objectContaining({ key: '1', boardId: 1 })],
        })
      );
    });

    it('retourne 500 si create échoue', async () => {
      mockDashboardSprintSnapshot.create.mockRejectedValue(new Error('db'));

      const res = await request(app).post('/api/jira/dashboard-snapshot').send(validBody);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/jira/dashboard-snapshots', () => {
    it('retourne la liste avec limite par défaut 50', async () => {
      const chain = mockFindChain([mockSnapshotDoc()]);

      const res = await request(app).get('/api/jira/dashboard-snapshots');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(res.body.snapshots[0].id).toBe(SNAPSHOT_ID);
      expect(res.body.snapshots[0].summary).toEqual({
        totalTickets: 10,
        resolvedTickets: 5,
        totalPoints: 20,
        resolvedPoints: 12,
        totalTimeHours: 40,
      });
      expect(chain.sort).toHaveBeenCalledWith({ savedAt: -1 });
      expect(chain.limit).toHaveBeenCalledWith(50);
    });

    it('respecte le paramètre limit', async () => {
      const chain = mockFindChain([]);

      await request(app).get('/api/jira/dashboard-snapshots').query({ limit: '10' });

      expect(chain.limit).toHaveBeenCalledWith(10);
    });

    it('retourne 500 si find échoue', async () => {
      mockDashboardSprintSnapshot.find.mockImplementation(() => {
        throw new Error('db down');
      });

      const res = await request(app).get('/api/jira/dashboard-snapshots');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/jira/dashboard-snapshot/:id', () => {
    it('retourne 404 si le snapshot est introuvable', async () => {
      mockDashboardSprintSnapshot.findById.mockResolvedValue(null);

      const res = await request(app).get(`/api/jira/dashboard-snapshot/${SNAPSHOT_ID}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/non trouvé/);
    });

    it('retourne 200 avec le snapshot complet', async () => {
      const res = await request(app).get(`/api/jira/dashboard-snapshot/${SNAPSHOT_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.snapshot.id).toBe(SNAPSHOT_ID);
      expect(res.body.snapshot.sprintName).toBe('Sprint 42');
      expect(res.body.snapshot.projectsStats).toEqual(TEST_DASHBOARD_SNAPSHOT_PROJECTS_STATS);
      expect(res.body.snapshot.totals).toEqual(TEST_DASHBOARD_SNAPSHOT_TOTALS);
      expect(mockDashboardSprintSnapshot.findById).toHaveBeenCalledWith(SNAPSHOT_ID);
    });

    it('retourne 500 si findById échoue', async () => {
      mockDashboardSprintSnapshot.findById.mockRejectedValue(new Error('db down'));

      const res = await request(app).get(`/api/jira/dashboard-snapshot/${SNAPSHOT_ID}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/jira/dashboard-snapshot/:id', () => {
    it('retourne 401 sans authentification', async () => {
      authMode = 'deny';

      const res = await request(app).delete(`/api/jira/dashboard-snapshot/${SNAPSHOT_ID}`);

      expect(res.status).toBe(401);
      expect(mockDashboardSprintSnapshot.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it('retourne 404 si le snapshot est introuvable', async () => {
      mockDashboardSprintSnapshot.findByIdAndDelete.mockResolvedValue(null);

      const res = await request(app).delete(`/api/jira/dashboard-snapshot/${SNAPSHOT_ID}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/non trouvé/);
    });

    it('retourne 200 si le snapshot est supprimé', async () => {
      const res = await request(app).delete(`/api/jira/dashboard-snapshot/${SNAPSHOT_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/supprimé/);
      expect(mockDashboardSprintSnapshot.findByIdAndDelete).toHaveBeenCalledWith(SNAPSHOT_ID);
    });

    it('retourne 500 si findByIdAndDelete échoue', async () => {
      mockDashboardSprintSnapshot.findByIdAndDelete.mockRejectedValue(new Error('db down'));

      const res = await request(app).delete(`/api/jira/dashboard-snapshot/${SNAPSHOT_ID}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });
});
