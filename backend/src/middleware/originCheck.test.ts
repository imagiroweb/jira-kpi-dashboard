/**
 * TU — Contrôle d'origine (CSRF) des requêtes authentifiées par cookie
 */
import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({ logger: { warn: jest.fn() } }));

import { createOriginCheck } from './originCheck';

function app() {
  const a = express();
  a.use('/api', createOriginCheck(['https://jira-kpi.imagiro.fr', 'http://localhost:3000/']));
  a.all('/api/x', (_req, res) => res.json({ ok: true }));
  return a;
}

describe('originCheck', () => {
  const COOKIE = 'session=jwt';

  it('laisse passer les lectures (GET) sans vérifier l’origine', async () => {
    expect((await request(app()).get('/api/x').set('Cookie', COOKIE).set('Origin', 'https://evil.io')).status).toBe(200);
  });

  it('accepte une écriture avec cookie venant d’une origine autorisée', async () => {
    const res = await request(app()).post('/api/x').set('Cookie', COOKIE).set('Origin', 'https://jira-kpi.imagiro.fr');
    expect(res.status).toBe(200);
    const viaReferer = await request(app()).patch('/api/x').set('Cookie', COOKIE).set('Referer', 'http://localhost:3000/users');
    expect(viaReferer.status).toBe(200);
  });

  it('refuse une écriture avec cookie depuis une autre origine (403)', async () => {
    const res = await request(app()).delete('/api/x').set('Cookie', COOKIE).set('Origin', 'https://evil.io');
    expect(res.status).toBe(403);
  });

  it('refuse une écriture avec cookie sans Origin ni Referer', async () => {
    expect((await request(app()).post('/api/x').set('Cookie', COOKIE)).status).toBe(403);
  });

  it('ne concerne pas les clients sans cookie de session (scripts avec Bearer)', async () => {
    const res = await request(app()).post('/api/x').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });
});
