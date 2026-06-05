/**
 * TI — Routes Worklog (Lot C) : snapshots Support MongoDB
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import { TEST_USER, TEST_USER_ID } from '../test/fixtures/users';
import { TEST_SUPPORT_KPI_RESULT } from '../test/fixtures/worklogs';
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

const mockSupportSprintSnapshot = {
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndDelete: jest.fn(),
};

jest.mock('../domain/support/entities/SupportSprintSnapshot', () => ({
  SupportSprintSnapshot: mockSupportSprintSnapshot,
}));

import { worklogRoutes } from './worklogRoutes';

const SNAPSHOT_ID = '507f1f77bcf86cd799439099';

function mockSnapshotDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: SNAPSHOT_ID,
    sprintName: 'Sprint 42',
    savedAt: new Date('2026-04-15T12:00:00.000Z'),
    savedBy: { id: TEST_USER_ID, email: TEST_USER.email, name: 'admin' },
    dateRange: { from: '2026-04-01', to: '2026-04-15' },
    notes: 'note test',
    kpiData: {
      ...TEST_SUPPORT_KPI_RESULT,
      totalPonderation: TEST_SUPPORT_KPI_RESULT.ponderationByStatus.total,
    },
    ...overrides,
  };
}

function mockFindChain(docs: unknown[]) {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue(docs),
  };
  mockSupportSprintSnapshot.find.mockReturnValue(chain);
  return chain;
}

describe('worklogRoutes — snapshots (TI)', () => {
  const app = createTestApp({ mountPath: '/api/worklog', router: worklogRoutes });

  beforeEach(() => {
    jest.clearAllMocks();
    authMode = 'pass';

    mockWorklogAppService.getSupportBoardKPI.mockResolvedValue(TEST_SUPPORT_KPI_RESULT);
    mockSupportSprintSnapshot.create.mockResolvedValue(mockSnapshotDoc());
    mockFindChain([mockSnapshotDoc()]);
    mockSupportSprintSnapshot.findById.mockResolvedValue(mockSnapshotDoc());
    mockSupportSprintSnapshot.findByIdAndDelete.mockResolvedValue(mockSnapshotDoc());
  });

  describe('POST /api/worklog/support-snapshot', () => {
    it('retourne 400 sans sprintName', async () => {
      const res = await request(app).post('/api/worklog/support-snapshot').send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/nom du sprint/);
      expect(mockSupportSprintSnapshot.create).not.toHaveBeenCalled();
    });

    it('retourne 401 sans authentification', async () => {
      authMode = 'deny';

      const res = await request(app)
        .post('/api/worklog/support-snapshot')
        .send({ sprintName: 'Sprint 42' });

      expect(res.status).toBe(401);
      expect(mockSupportSprintSnapshot.create).not.toHaveBeenCalled();
    });

    it('retourne 201 et enregistre le snapshot', async () => {
      const res = await request(app)
        .post('/api/worklog/support-snapshot')
        .send({ sprintName: 'Sprint 42', notes: 'note test' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.snapshot.sprintName).toBe('Sprint 42');
      expect(mockWorklogAppService.getSupportBoardKPI).toHaveBeenCalled();
      expect(mockSupportSprintSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sprintName: 'Sprint 42',
          savedBy: expect.objectContaining({ id: TEST_USER_ID, email: TEST_USER.email }),
          notes: 'note test',
        })
      );
    });

    it('retourne 500 si create échoue', async () => {
      mockSupportSprintSnapshot.create.mockRejectedValue(new Error('db'));

      const res = await request(app)
        .post('/api/worklog/support-snapshot')
        .send({ sprintName: 'Sprint 42' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/worklog/support-snapshots', () => {
    it('retourne la liste avec limite par défaut 50', async () => {
      const chain = mockFindChain([mockSnapshotDoc()]);

      const res = await request(app).get('/api/worklog/support-snapshots');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(res.body.snapshots[0].id).toBe(SNAPSHOT_ID);
      expect(res.body.snapshots[0].summary.totalTickets).toBe(5);
      expect(chain.sort).toHaveBeenCalledWith({ savedAt: -1 });
      expect(chain.limit).toHaveBeenCalledWith(50);
    });

    it('respecte le paramètre limit', async () => {
      const chain = mockFindChain([]);

      await request(app).get('/api/worklog/support-snapshots').query({ limit: '10' });

      expect(chain.limit).toHaveBeenCalledWith(10);
    });

    it('retourne 500 si find échoue', async () => {
      mockSupportSprintSnapshot.find.mockImplementation(() => {
        throw new Error('db down');
      });

      const res = await request(app).get('/api/worklog/support-snapshots');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/worklog/support-snapshot/:id', () => {
    it('retourne 404 si le snapshot est introuvable', async () => {
      mockSupportSprintSnapshot.findById.mockResolvedValue(null);

      const res = await request(app).get(`/api/worklog/support-snapshot/${SNAPSHOT_ID}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/non trouvé/);
    });

    it('retourne 200 avec le snapshot complet', async () => {
      const res = await request(app).get(`/api/worklog/support-snapshot/${SNAPSHOT_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.snapshot.id).toBe(SNAPSHOT_ID);
      expect(res.body.snapshot.sprintName).toBe('Sprint 42');
      expect(res.body.snapshot.statusCounts).toEqual(TEST_SUPPORT_KPI_RESULT.statusCounts);
      expect(mockSupportSprintSnapshot.findById).toHaveBeenCalledWith(SNAPSHOT_ID);
    });

    it('retourne 500 si findById échoue', async () => {
      mockSupportSprintSnapshot.findById.mockRejectedValue(new Error('db down'));

      const res = await request(app).get(`/api/worklog/support-snapshot/${SNAPSHOT_ID}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/worklog/support-snapshot/:id', () => {
    it('retourne 401 sans authentification', async () => {
      authMode = 'deny';

      const res = await request(app).delete(`/api/worklog/support-snapshot/${SNAPSHOT_ID}`);

      expect(res.status).toBe(401);
      expect(mockSupportSprintSnapshot.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it('retourne 404 si le snapshot est introuvable', async () => {
      mockSupportSprintSnapshot.findByIdAndDelete.mockResolvedValue(null);

      const res = await request(app).delete(`/api/worklog/support-snapshot/${SNAPSHOT_ID}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/non trouvé/);
    });

    it('retourne 200 si le snapshot est supprimé', async () => {
      const res = await request(app).delete(`/api/worklog/support-snapshot/${SNAPSHOT_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/supprimé/);
      expect(mockSupportSprintSnapshot.findByIdAndDelete).toHaveBeenCalledWith(SNAPSHOT_ID);
    });

    it('retourne 500 si findByIdAndDelete échoue', async () => {
      mockSupportSprintSnapshot.findByIdAndDelete.mockRejectedValue(new Error('db down'));

      const res = await request(app).delete(`/api/worklog/support-snapshot/${SNAPSHOT_ID}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });
});
