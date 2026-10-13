/**
 * TI — Routes organisation : paramètres et durées de conservation (super admin)
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';

let mockIsSuperAdmin = true;
const mockUserFindById = jest.fn();
const mockOrgFindById = jest.fn();
const mockOrgUpdate = jest.fn();

jest.mock('../middleware/authMiddleware', () => {
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>('../test/mocks/authMiddleware');
  return {
    authenticate: auth.mockAuthenticate(),
    requireSuperAdmin: (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) =>
      mockIsSuperAdmin ? next() : res.status(403).json({ success: false }),
  };
});
jest.mock('../domain/user/entities/User', () => ({
  User: { findById: () => ({ select: () => ({ lean: () => mockUserFindById() }) }) },
}));
jest.mock('../domain/organization/entities/Organization', () => {
  const actual = jest.requireActual('../domain/organization/entities/Organization');
  return {
    ...actual,
    Organization: {
      findById: () => ({ select: () => ({ lean: () => mockOrgFindById() }) }),
      findByIdAndUpdate: (...a: unknown[]) => ({ select: () => ({ lean: () => mockOrgUpdate(...a) }) }),
    },
  };
});
jest.mock('../utils/logger', () => jest.requireActual('../test/mocks/logger').loggerMockFactory());

import { organizationRoutes } from './organizationRoutes';

describe('organizationRoutes (TI)', () => {
  const app = createTestApp({ mountPath: '/api/organizations', router: organizationRoutes });
  const org = { name: 'Adoria', slug: 'adoria', allowedEmailDomains: ['adoria.com'], allowLocalAccounts: true };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSuperAdmin = true;
    mockUserFindById.mockResolvedValue({ organizationId: 'o1' });
  });

  it('GET /me renvoie les paramètres avec les durées par défaut', async () => {
    mockOrgFindById.mockResolvedValue(org);

    const res = await request(app).get('/api/organizations/me');

    expect(res.status).toBe(200);
    expect(res.body.organization.retention).toEqual({
      activityLogMonths: 12,
      performanceReviewYears: null,
      inactiveAccountMonths: null,
    });
  });

  it('PATCH /me/retention enregistre des durées valides', async () => {
    mockOrgUpdate.mockResolvedValue({ ...org, retention: { activityLogMonths: 6, performanceReviewYears: 5, inactiveAccountMonths: null } });

    const res = await request(app)
      .patch('/api/organizations/me/retention')
      .send({ activityLogMonths: 6, performanceReviewYears: 5 });

    expect(res.status).toBe(200);
    expect(mockOrgUpdate).toHaveBeenCalledWith(
      'o1',
      { $set: { 'retention.activityLogMonths': 6, 'retention.performanceReviewYears': 5 } },
      expect.objectContaining({ runValidators: true })
    );
    expect(res.body.organization.retention.performanceReviewYears).toBe(5);
  });

  it('PATCH /me/retention refuse des valeurs invalides', async () => {
    const res = await request(app).patch('/api/organizations/me/retention').send({ activityLogMonths: -1 });
    expect(res.status).toBe(400);
    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it('réservé au super admin', async () => {
    mockIsSuperAdmin = false;
    expect((await request(app).get('/api/organizations/me')).status).toBe(403);
  });
});
