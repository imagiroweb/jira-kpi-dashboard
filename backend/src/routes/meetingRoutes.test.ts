/**
 * TI — Routes point hebdo sprint : liste, dernier point, CRUD et reconduction.
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import { TEST_USER, TEST_USER_ID } from '../test/fixtures/users';

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

jest.mock('../websocket/socketHandler', () => ({
  emitMeetingUpdate: jest.fn(),
}));

import { emitMeetingUpdate } from '../websocket/socketHandler';

const mockEmitMeetingUpdate = emitMeetingUpdate as jest.MockedFunction<typeof emitMeetingUpdate>;

const mockWeeklySprintMeeting = {
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
};

// Le module exporte aussi les énumérations utilisées par la validation : on ne
// remplace que le modèle Mongoose.
jest.mock('../domain/meeting/entities/WeeklySprintMeeting', () => ({
  ...jest.requireActual('../domain/meeting/entities/WeeklySprintMeeting'),
  WeeklySprintMeeting: mockWeeklySprintMeeting,
}));

import { meetingRoutes } from './meetingRoutes';

const MEETING_ID = '507f1f77bcf86cd799439055';

function mockMeetingDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: MEETING_ID,
    sprint: { name: 'Sprint', number: '12', goal: 'Livrer la facturation', date: '2026-09-01' },
    teams: [
      {
        id: 't1',
        name: 'Équipe Dev',
        role: 'dev',
        metrics: [{ id: 'm1', label: 'Points engagés', value: '30', target: '35', source: 'jira' }],
      },
    ],
    blockers: [
      { id: 'b1', severity: 'Critique', text: 'Env. KO', need: 'Ops', owner: 'Léa', resolved: false },
      { id: 'b2', severity: 'Faible', text: 'Doc', need: '', owner: '', resolved: true },
    ],
    interactions: [
      { id: 'i1', from: 'Dev', to: 'QA', subject: 'Build', status: 'En cours' },
      { id: 'i2', from: 'QA', to: 'Dev', subject: 'Specs validées', status: 'OK' },
    ],
    retro: { keep: [], stop: [], try: [] },
    actions: [
      { id: 'a1', text: 'Automatiser', owner: 'Sam', due: '2026-09-15', status: 'En cours' },
      { id: 'a2', text: 'Documenter', owner: 'Léa', due: '', status: 'Fait' },
    ],
    createdBy: { id: TEST_USER_ID, email: TEST_USER.email, name: 'admin' },
    createdAt: new Date('2026-09-01T09:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    __v: 0,
    ...overrides,
  };
}

function mockFindChain(docs: unknown[]) {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(docs),
  };
  mockWeeklySprintMeeting.find.mockReturnValue(chain);
  return chain;
}

function mockFindOneChain(doc: unknown) {
  const chain = { sort: jest.fn().mockResolvedValue(doc) };
  mockWeeklySprintMeeting.findOne.mockReturnValue(chain);
  return chain;
}

describe('meetingRoutes — point hebdo (TI)', () => {
  const app = createTestApp({ mountPath: '/api/meetings', router: meetingRoutes });
  const appWithIo = createTestApp({
    mountPath: '/api/meetings',
    router: meetingRoutes,
    io: {} as never,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authMode = 'pass';

    mockWeeklySprintMeeting.create.mockResolvedValue(mockMeetingDoc());
    mockWeeklySprintMeeting.findById.mockResolvedValue(mockMeetingDoc());
    mockWeeklySprintMeeting.findByIdAndUpdate.mockResolvedValue(mockMeetingDoc());
    mockWeeklySprintMeeting.findOneAndUpdate.mockResolvedValue(mockMeetingDoc());
    mockWeeklySprintMeeting.findByIdAndDelete.mockResolvedValue(mockMeetingDoc());
    mockFindChain([mockMeetingDoc()]);
    mockFindOneChain(mockMeetingDoc());
  });

  describe('GET /api/meetings', () => {
    it('retourne la liste avec un résumé des blocages et actions ouverts', async () => {
      const res = await request(app).get('/api/meetings');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.meetings[0].summary).toEqual({
        teamCount: 1,
        openBlockerCount: 1,
        openActionCount: 1,
      });
    });

    it('borne la limite demandée à 100', async () => {
      const chain = mockFindChain([]);

      await request(app).get('/api/meetings?limit=5000');

      expect(chain.limit).toHaveBeenCalledWith(100);
    });

    it('retourne 401 sans authentification', async () => {
      authMode = 'deny';

      const res = await request(app).get('/api/meetings');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/meetings/latest', () => {
    it('retourne le dernier point existant', async () => {
      const res = await request(app).get('/api/meetings/latest');

      expect(res.status).toBe(200);
      expect(res.body.meeting.id).toBe(MEETING_ID);
      expect(mockWeeklySprintMeeting.create).not.toHaveBeenCalled();
    });

    it('crée un point vierge quand aucun n\'existe encore', async () => {
      mockFindOneChain(null);

      const res = await request(app).get('/api/meetings/latest');

      expect(res.status).toBe(201);
      expect(mockWeeklySprintMeeting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: expect.objectContaining({ email: TEST_USER.email }),
          teams: expect.arrayContaining([expect.objectContaining({ role: 'dev' })]),
        })
      );
    });
  });

  describe('GET /api/meetings/:id', () => {
    it('retourne le point demandé', async () => {
      const res = await request(app).get(`/api/meetings/${MEETING_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.meeting.sprint.number).toBe('12');
    });

    it('retourne 404 si le point n\'existe pas', async () => {
      mockWeeklySprintMeeting.findById.mockResolvedValue(null);

      const res = await request(app).get(`/api/meetings/${MEETING_ID}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/meetings', () => {
    it('crée un point vierge à la date du jour par défaut', async () => {
      const res = await request(app).post('/api/meetings').send({});

      expect(res.status).toBe(201);
      expect(mockWeeklySprintMeeting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sprint: expect.objectContaining({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
        })
      );
    });

    it('utilise la date fournie si elle est valide', async () => {
      await request(app).post('/api/meetings').send({ date: '2026-09-08' });

      expect(mockWeeklySprintMeeting.create).toHaveBeenCalledWith(
        expect.objectContaining({ sprint: expect.objectContaining({ date: '2026-09-08' }) })
      );
    });
  });

  describe('POST /api/meetings/:id/next', () => {
    it('reconduit la structure, les actions, blocages et interactions encore ouverts', async () => {
      const res = await request(app)
        .post(`/api/meetings/${MEETING_ID}/next`)
        .send({ date: '2026-09-08' });

      expect(res.status).toBe(201);
      const draft = mockWeeklySprintMeeting.create.mock.calls[0][0];
      expect(draft.sprint).toEqual(
        expect.objectContaining({ number: '13', goal: '', date: '2026-09-08' })
      );
      expect(draft.actions).toHaveLength(1);
      expect(draft.actions[0].text).toBe('Automatiser');
      expect(draft.blockers).toHaveLength(1);
      expect(draft.blockers[0]).toEqual(
        expect.objectContaining({
          text: 'Env. KO',
          need: 'Ops',
          owner: 'Léa',
          severity: 'Critique',
          resolved: false,
        })
      );
      expect(draft.interactions).toHaveLength(1);
      expect(draft.interactions[0]).toEqual(
        expect.objectContaining({
          from: 'Dev',
          to: 'QA',
          subject: 'Build',
          status: 'En cours',
        })
      );
    });

    it('retourne 404 si le point de départ n\'existe pas', async () => {
      mockWeeklySprintMeeting.findById.mockResolvedValue(null);

      const res = await request(app).post(`/api/meetings/${MEETING_ID}/next`).send({});

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/meetings/:id', () => {
    it('enregistre une mise à jour partielle et trace l\'auteur', async () => {
      const res = await request(app)
        .patch(`/api/meetings/${MEETING_ID}`)
        .send({ actions: [{ id: 'a1', text: 'Automatiser', owner: 'Sam', due: '', status: 'Fait' }] });

      expect(res.status).toBe(200);
      expect(mockWeeklySprintMeeting.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: MEETING_ID, __v: 0 },
        {
          $set: expect.objectContaining({
            actions: expect.arrayContaining([
              expect.objectContaining({
                id: 'a1',
                text: 'Automatiser',
                status: 'Fait',
                updatedBy: { id: TEST_USER_ID, name: 'admin' },
              }),
              expect.objectContaining({ id: 'a2', text: 'Documenter' }),
            ]),
            updatedBy: expect.objectContaining({ email: TEST_USER.email }),
          }),
          $inc: { __v: 1 },
        },
        { new: true, runValidators: true }
      );
    });

    it('fusionne un upsert sans effacer les autres lignes', async () => {
      await request(app)
        .patch(`/api/meetings/${MEETING_ID}`)
        .send({ blockers: { upsert: [{ id: 'b3', text: 'Nouveau blocage' }], remove: [] } });

      const set = mockWeeklySprintMeeting.findOneAndUpdate.mock.calls[0][1].$set;
      expect(set.blockers.map((row: { id: string }) => row.id)).toEqual(['b1', 'b2', 'b3']);
    });

    it('relit et refusionne si la version a changé', async () => {
      mockWeeklySprintMeeting.findOneAndUpdate
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockMeetingDoc({ __v: 2 }));
      mockWeeklySprintMeeting.findById
        .mockResolvedValueOnce(mockMeetingDoc({ __v: 0 }))
        .mockResolvedValueOnce(
          mockMeetingDoc({
            __v: 1,
            blockers: [
              { id: 'b1', severity: 'Critique', text: 'Env. KO', need: 'Ops', owner: 'Léa', resolved: false },
              { id: 'b3', severity: 'Moyen', text: 'Ajout Léa', need: '', owner: '', resolved: false },
            ],
          })
        );

      const res = await request(app)
        .patch(`/api/meetings/${MEETING_ID}`)
        .send({ blockers: { upsert: [{ id: 'b4', text: 'Ajout Sam' }], remove: [] } });

      expect(res.status).toBe(200);
      expect(mockWeeklySprintMeeting.findOneAndUpdate).toHaveBeenCalledTimes(2);
      const set = mockWeeklySprintMeeting.findOneAndUpdate.mock.calls[1][1].$set;
      expect(set.blockers.map((row: { id: string }) => row.id)).toEqual(['b1', 'b3', 'b4']);
    });

    it('retourne 400 sur un contenu invalide', async () => {
      const res = await request(app)
        .patch(`/api/meetings/${MEETING_ID}`)
        .send({ blockers: [{ id: 'b1', severity: 'Bloquant' }] });

      expect(res.status).toBe(400);
      expect(mockWeeklySprintMeeting.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('retourne 404 si le point n\'existe pas', async () => {
      mockWeeklySprintMeeting.findById.mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/meetings/${MEETING_ID}`)
        .send({ sprint: { name: 'Sprint', number: '13', goal: '', date: '2026-09-08' } });

      expect(res.status).toBe(404);
    });

    it('retourne 401 sans authentification', async () => {
      authMode = 'deny';

      const res = await request(app).patch(`/api/meetings/${MEETING_ID}`).send({ actions: [] });

      expect(res.status).toBe(401);
    });

    it('n\'émet rien quand io n\'est pas disponible (app sans socket)', async () => {
      await request(app)
        .patch(`/api/meetings/${MEETING_ID}`)
        .send({ actions: [] });

      expect(mockEmitMeetingUpdate).not.toHaveBeenCalled();
    });

    it('diffuse la mise à jour aux autres clients via meeting:<id>, avec l\'origine du client', async () => {
      const res = await request(appWithIo)
        .patch(`/api/meetings/${MEETING_ID}`)
        .set('X-Client-Origin', 'tab-abc123')
        .send({ actions: [{ id: 'a1', text: 'Automatiser', owner: 'Sam', due: '', status: 'Fait' }] });

      expect(res.status).toBe(200);
      expect(mockEmitMeetingUpdate).toHaveBeenCalledWith(
        {},
        MEETING_ID,
        expect.objectContaining({
          meetingId: MEETING_ID,
          patch: {
            actions: expect.arrayContaining([
              expect.objectContaining({ id: 'a1', status: 'Fait' }),
              expect.objectContaining({ id: 'a2' }),
            ]),
          },
          updatedBy: expect.objectContaining({ email: TEST_USER.email }),
          origin: 'tab-abc123',
        })
      );
    });

    it('émet une origine null quand le client n\'en fournit pas', async () => {
      await request(appWithIo)
        .patch(`/api/meetings/${MEETING_ID}`)
        .send({ actions: [] });

      expect(mockEmitMeetingUpdate).toHaveBeenCalledWith(
        {},
        MEETING_ID,
        expect.objectContaining({ origin: null })
      );
    });
  });

  describe('DELETE /api/meetings/:id', () => {
    it('supprime le point', async () => {
      const res = await request(app).delete(`/api/meetings/${MEETING_ID}`);

      expect(res.status).toBe(200);
      expect(mockWeeklySprintMeeting.findByIdAndDelete).toHaveBeenCalledWith(MEETING_ID);
    });

    it('retourne 404 si le point n\'existe pas', async () => {
      mockWeeklySprintMeeting.findByIdAndDelete.mockResolvedValue(null);

      const res = await request(app).delete(`/api/meetings/${MEETING_ID}`);

      expect(res.status).toBe(404);
    });
  });

  it('retourne 500 si la base est indisponible', async () => {
    mockWeeklySprintMeeting.findById.mockRejectedValue(new Error('Mongo down'));

    const res = await request(app).get(`/api/meetings/${MEETING_ID}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Mongo down');
  });
});
