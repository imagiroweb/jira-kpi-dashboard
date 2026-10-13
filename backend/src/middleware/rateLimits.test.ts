/**
 * TU — Limitations de débit des routes d'authentification
 */
import express, { Request, Response } from 'express';
import request from 'supertest';
import {
  createForgotPasswordLimiter,
  createInvitationLimiter,
  createLoginPerAccountLimiter,
  createLoginPerIpLimiter
} from './rateLimits';

// Les limiteurs sont désactivés pour les autres tests de routes ; on les active ici.
beforeAll(() => {
  process.env.RATE_LIMIT_IN_TESTS = 'true';
});
afterAll(() => {
  delete process.env.RATE_LIMIT_IN_TESTS;
});

/** /login factice : 200 si le mot de passe est « ok », 401 sinon. */
function loginApp(...limiters: express.RequestHandler[]) {
  const app = express();
  app.use(express.json());
  app.post('/login', ...limiters, (req: Request, res: Response) => {
    res.status(req.body.password === 'ok' ? 200 : 401).json({});
  });
  return app;
}

describe('rateLimits', () => {
  it('bloque le 6e échec de connexion sur un même compte (429)', async () => {
    const app = loginApp(createLoginPerAccountLimiter());
    for (let i = 0; i < 5; i++) {
      expect((await request(app).post('/login').send({ email: 'jean@adoria.com', password: 'x' })).status).toBe(401);
    }
    const blocked = await request(app).post('/login').send({ email: 'JEAN@adoria.com ', password: 'ok' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/Trop de tentatives/);
  });

  it('compte par compte : un autre email reste utilisable', async () => {
    const app = loginApp(createLoginPerAccountLimiter());
    for (let i = 0; i < 5; i++) await request(app).post('/login').send({ email: 'a@adoria.com', password: 'x' });
    expect((await request(app).post('/login').send({ email: 'b@adoria.com', password: 'ok' })).status).toBe(200);
  });

  it('les connexions réussies ne consomment pas le quota', async () => {
    const app = loginApp(createLoginPerAccountLimiter());
    for (let i = 0; i < 10; i++) {
      expect((await request(app).post('/login').send({ email: 'c@adoria.com', password: 'ok' })).status).toBe(200);
    }
  });

  it('limite les échecs par IP tous comptes confondus', async () => {
    const app = loginApp(createLoginPerIpLimiter({ max: 3 }));
    for (let i = 0; i < 3; i++) await request(app).post('/login').send({ email: `u${i}@adoria.com`, password: 'x' });
    expect((await request(app).post('/login').send({ email: 'autre@adoria.com', password: 'x' })).status).toBe(429);
  });

  it('limite les demandes de réinitialisation (5 par IP)', async () => {
    const app = express();
    app.post('/forgot', createForgotPasswordLimiter(), (_req, res) => res.json({ success: true }));
    for (let i = 0; i < 5; i++) expect((await request(app).post('/forgot')).status).toBe(200);
    expect((await request(app).post('/forgot')).status).toBe(429);
  });

  it('limite les invitations par administrateur', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.user = { userId: String(req.headers['x-user']), email: '', provider: 'local' };
      next();
    });
    app.post('/users', createInvitationLimiter({ max: 2 }), (_req, res) => res.status(201).json({}));
    const as = (u: string) => request(app).post('/users').set('x-user', u);
    expect((await as('admin1')).status).toBe(201);
    expect((await as('admin1')).status).toBe(201);
    expect((await as('admin1')).status).toBe(429);
    expect((await as('admin2')).status).toBe(201);
  });
});
