/**
 * TI — Routes « Suivi WIP » (issue #79) : WIP hebdomadaire et réglages partagés.
 * Plan de tests docs/qa/plans/suivi-wip.md, CT-50 à CT-59.
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import { TEST_USER_ID } from '../test/fixtures/users';

// Contrôle par page testé à part (middleware/requirePage.test.ts) : ici on vérifie la page demandée.
let mockPageAccess = 'allow' as 'allow' | 'deny';
const mockRequiredPages: string[][] = [];
jest.mock('../middleware/requirePage', () => ({
  requirePage: (...pages: string[]) => {
    mockRequiredPages.push(pages);
    return (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }, next: () => void) =>
      mockPageAccess === 'deny' ? res.status(403).json({ success: false, error: 'Accès non autorisé pour votre rôle' }) : next();
  },
}));

let mockAuthMode = 'pass' as 'pass' | 'deny';
let mockRole = 'super_admin' as string | null;
jest.mock('../middleware/authMiddleware', () => {
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>('../test/mocks/authMiddleware');
  const pass = auth.mockAuthenticate();
  type Mw = import('express').RequestHandler;
  return {
    authenticate: ((req, res, next) => (mockAuthMode === 'deny' ? auth.mockAuthDenied(req, res, next) : pass(req, res, next))) as Mw,
    requireSuperAdmin: ((_req, res, next) =>
      mockRole === 'super_admin' ? next() : res.status(403).json({ success: false, error: 'Accès réservé aux super administrateurs' })) as Mw,
  };
});

jest.mock('../domain/user/entities/User', () => ({
  User: { findById: () => ({ select: () => ({ lean: () => Promise.resolve(mockRole ? { role: mockRole } : null) }) }) },
}));

const mockGetWeekly = jest.fn();
const mockGetSettings = jest.fn();
const mockSaveSettings = jest.fn();
const mockFindUnknownStatuses = jest.fn();
jest.mock('../application/services/WipService', () => ({
  wipService: {
    getWeekly: (...args: unknown[]) => mockGetWeekly(...args),
    getSettings: (...args: unknown[]) => mockGetSettings(...args),
    saveSettings: (...args: unknown[]) => mockSaveSettings(...args),
    findUnknownStatuses: (...args: unknown[]) => mockFindUnknownStatuses(...args),
  },
}));

jest.mock('../utils/logger', () => jest.requireActual('../test/mocks/logger').loggerMockFactory());

import { wipRoutes } from './wipRoutes';

const SETTINGS = { startStatuses: ['In Progress'], endStatuses: ['Go Prod'], defaultMaxPerDev: 3, teams: [] };

describe('wipRoutes (TI)', () => {
  const app = createTestApp({ mountPath: '/api/wip', router: wipRoutes });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPageAccess = 'allow';
    mockAuthMode = 'pass';
    mockRole = 'super_admin';
    mockGetSettings.mockResolvedValue(SETTINGS);
    mockFindUnknownStatuses.mockResolvedValue([]);
  });

  it('protège la lecture par la page `wip`', () => {
    expect(mockRequiredPages).toEqual([['wip'], ['wip']]);
  });

  describe('GET /weekly', () => {
    it('CT-52 : 200 avec les semaines, les équipes et canEdit', async () => {
      const data = { from: '2026-09-01', to: '2026-10-20', weeks: [], teams: ['Team A', 'Sans équipe'], settings: SETTINGS };
      mockGetWeekly.mockResolvedValue(data);
      mockRole = 'user';

      const res = await request(app).get('/api/wip/weekly?from=2026-09-01&to=2026-10-20');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data, canEdit: false });
      expect(mockGetWeekly).toHaveBeenCalledWith('2026-09-01', '2026-10-20');
    });

    it('CT-50 : 403 sans la page', async () => {
      mockPageAccess = 'deny';
      const res = await request(app).get('/api/wip/weekly?from=2026-09-01&to=2026-10-20');
      expect(res.status).toBe(403);
      expect(mockGetWeekly).not.toHaveBeenCalled();
    });

    it('CT-51 : 401 sans jeton', async () => {
      mockAuthMode = 'deny';
      const res = await request(app).get('/api/wip/weekly?from=2026-09-01&to=2026-10-20');
      expect(res.status).toBe(401);
    });

    it.each([
      ['', 'Paramètres from et to obligatoires (YYYY-MM-DD)'],
      ['?from=2026-09-01', 'Paramètres from et to obligatoires (YYYY-MM-DD)'],
      ['?from=2026-02-30&to=2026-03-10', 'Paramètres from et to obligatoires (YYYY-MM-DD)'],
      ['?from=2026-10-20&to=2026-09-01', 'La date de début doit précéder la date de fin'],
      ['?from=2025-10-01&to=2026-10-20', 'Période trop longue : 52 semaines au maximum, réduisez la période'],
    ])('CT-53 : 400 pour %s', async (query, error) => {
      const res = await request(app).get(`/api/wip/weekly${query}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(error);
      expect(mockGetWeekly).not.toHaveBeenCalled();
    });

    it('accepte exactement 52 semaines', async () => {
      mockGetWeekly.mockResolvedValue({ weeks: [] });
      const res = await request(app).get('/api/wip/weekly?from=2025-10-27&to=2026-10-25');
      expect(res.status).toBe(200);
    });

    it('500 si Jira échoue', async () => {
      mockGetWeekly.mockRejectedValue(new Error('Jira down'));
      const res = await request(app).get('/api/wip/weekly?from=2026-09-01&to=2026-10-20');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Impossible de calculer le WIP');
    });
  });

  describe('GET /settings', () => {
    it('CT-55 : lisible par un non super admin, canEdit faux', async () => {
      mockRole = 'user';
      const res = await request(app).get('/api/wip/settings');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, settings: SETTINGS, canEdit: false });
    });

    it('canEdit vrai pour un super admin', async () => {
      const res = await request(app).get('/api/wip/settings');
      expect(res.body.canEdit).toBe(true);
    });

    it('CT-50 : 403 sans la page', async () => {
      mockPageAccess = 'deny';
      expect((await request(app).get('/api/wip/settings')).status).toBe(403);
    });

    it('500 si la base échoue', async () => {
      mockGetSettings.mockRejectedValue(new Error('mongo'));
      expect((await request(app).get('/api/wip/settings')).status).toBe(500);
    });
  });

  describe('PUT /settings', () => {
    it('CT-56 : un super admin enregistre des réglages partagés', async () => {
      const saved = { ...SETTINGS, teams: [{ team: 'Team A', devCount: 4, maxPerDev: null }] };
      mockSaveSettings.mockResolvedValue(saved);

      const res = await request(app).put('/api/wip/settings').send({ ...SETTINGS, teams: [{ team: 'Team A', devCount: 4 }] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, settings: saved });
      expect(mockSaveSettings).toHaveBeenCalledWith(saved, TEST_USER_ID);
    });

    it('CT-55 / CT-59 : 403 pour un non super admin', async () => {
      mockRole = 'user';
      const res = await request(app).put('/api/wip/settings').send({ ...SETTINGS, startStatuses: ['Dev'] });
      expect(res.status).toBe(403);
      expect(mockSaveSettings).not.toHaveBeenCalled();
    });

    it('CT-57 : 400 avec les erreurs en français, rien enregistré', async () => {
      const res = await request(app)
        .put('/api/wip/settings')
        .send({ ...SETTINGS, teams: [{ team: 'A', devCount: 51 }, { team: 'B', devCount: 2, maxPerDev: 21 }, { team: 'C', devCount: -1 }] });
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual([
        'A : le nombre de devs doit être un entier entre 0 et 50',
        'B : le maximum de tickets par dev doit être un entier entre 1 et 20',
        'C : le nombre de devs doit être un entier entre 0 et 50',
      ]);
      expect(mockSaveSettings).not.toHaveBeenCalled();
    });

    it('400 si un statut n\'existe pas dans Jira, rien enregistré', async () => {
      mockFindUnknownStatuses.mockResolvedValue(['Go-Prod']);
      const res = await request(app).put('/api/wip/settings').send({ ...SETTINGS, endStatuses: ['Go-Prod'] });
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(['Statut inconnu dans Jira : Go-Prod']);
      expect(mockFindUnknownStatuses).toHaveBeenCalledWith(['In Progress', 'Go-Prod']);
      expect(mockSaveSettings).not.toHaveBeenCalled();
    });

    it('500 si la base échoue', async () => {
      mockSaveSettings.mockRejectedValue(new Error('mongo'));
      expect((await request(app).put('/api/wip/settings').send(SETTINGS)).status).toBe(500);
    });
  });
});
