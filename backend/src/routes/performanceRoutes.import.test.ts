/**
 * TI — POST /api/performance/import-okr (bouton UI, session courante).
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';

const mockUserFindById = jest.fn();
const mockUserFind = jest.fn();
const mockRoleFindById = jest.fn();
const mockTeamFind = jest.fn();
const mockCycleFindById = jest.fn();
const mockCycleFindOne = jest.fn();

jest.mock('../domain/performance/entities/PerformanceCycle', () => {
  const actual = jest.requireActual('../domain/performance/entities/PerformanceCycle');
  return {
    ...actual,
    PerformanceCycle: {
      findById: (...args: unknown[]) => mockCycleFindById(...args),
      findOne: (...args: unknown[]) => mockCycleFindOne(...args)
    }
  };
});

jest.mock('../domain/user/entities/User', () => ({
  User: {
    findById: (...args: unknown[]) => mockUserFindById(...args),
    find: (...args: unknown[]) => mockUserFind(...args)
  }
}));

jest.mock('../domain/user/entities/Role', () => ({
  Role: {
    findById: (...args: unknown[]) => mockRoleFindById(...args)
  }
}));

jest.mock('../domain/team/entities/Team', () => ({
  Team: {
    find: (...args: unknown[]) => mockTeamFind(...args)
  }
}));

jest.mock('../middleware/authMiddleware', () => {
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>('../test/mocks/authMiddleware');
  return { authenticate: auth.mockAuthenticate() };
});

jest.mock('../utils/logger', () => jest.requireActual('../test/mocks/logger').loggerMockFactory());

import { performanceRoutes } from './performanceRoutes';

describe('POST /api/performance/import-okr', () => {
  const app = createTestApp({ mountPath: '/api/performance', router: performanceRoutes });

  beforeEach(() => {
    jest.clearAllMocks();
    mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
    mockRoleFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ role: 'super_admin', roleId: null }) })
    });
  });

  it('400 sans fichier', async () => {
    const res = await request(app).post('/api/performance/import-okr').field('dryRun', 'true');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/fichier/i);
  });

  it('403 si l’acteur n’a pas d’accès global', async () => {
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ role: null, roleId: null }) })
    });
    const res = await request(app)
      .post('/api/performance/import-okr')
      .attach('files', Buffer.from('x'), 'Perf-Eval-H1-26-Adoria-Deguil-Robin-BDR.xlsx');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/performance/import-general-assessment', () => {
  const app = createTestApp({ mountPath: '/api/performance', router: performanceRoutes });

  beforeEach(() => {
    jest.clearAllMocks();
    mockTeamFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
    mockRoleFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ role: 'super_admin', roleId: null }) })
    });
  });

  it('400 sans fichier', async () => {
    const res = await request(app).post('/api/performance/import-general-assessment').field('dryRun', 'true');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/fichier/i);
  });

  it('403 si l’acteur n’a pas d’accès global', async () => {
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ role: null, roleId: null }) })
    });
    const res = await request(app)
      .post('/api/performance/import-general-assessment')
      .attach('files', Buffer.from('x'), 'deguil-robin.xlsx');
    expect(res.status).toBe(403);
  });
});
