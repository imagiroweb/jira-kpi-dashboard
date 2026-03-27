/**
 * TU — Routes Monday : /api/monday/status, /me, /workspaces, /boards, /boards/:id, /boards/:id/views
 */
import request from 'supertest';
import express, { Express, Request, Response } from 'express';
import { getMondayClient } from '../infrastructure/monday/MondayClient';

jest.mock('../middleware/authMiddleware', () => ({
  authenticate: (_req: Request, _res: Response, next: () => void) => {
    next();
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock('../infrastructure/monday/MondayClient', () => ({
  getMondayClient: jest.fn(),
}));

import { mondayRoutes } from './mondayRoutes';

const mockGetMondayClient = getMondayClient as jest.MockedFunction<typeof getMondayClient>;

function createMondayClientMock() {
  return {
    isConfigured: jest.fn().mockReturnValue(true),
    getMe: jest.fn(),
    getWorkspaces: jest.fn(),
    getBoards: jest.fn(),
    getBoardWithItems: jest.fn(),
    getBoardViews: jest.fn(),
  };
}

function createApp(): Express {
  const app = express();
  app.use('/api/monday', mondayRoutes);
  return app;
}

describe('mondayRoutes', () => {
  const app = createApp();
  let client: ReturnType<typeof createMondayClientMock>;

  beforeEach(() => {
    jest.clearAllMocks();
    client = createMondayClientMock();
    mockGetMondayClient.mockReturnValue(client as never);
    client.isConfigured.mockReturnValue(true);
  });

  describe('GET /api/monday/status', () => {
    it('retourne configured selon le client Monday', async () => {
      client.isConfigured.mockReturnValue(true);
      const res = await request(app).get('/api/monday/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, configured: true });
      expect(client.isConfigured).toHaveBeenCalled();
    });

    it('retourne configured: false si la clé Monday est absente', async () => {
      client.isConfigured.mockReturnValue(false);
      const res = await request(app).get('/api/monday/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, configured: false });
    });
  });

  describe('GET /api/monday/me', () => {
    it('retourne 503 si Monday non configuré', async () => {
      client.isConfigured.mockReturnValue(false);
      const res = await request(app).get('/api/monday/me');
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/MONDAY_API_KEY/);
      expect(client.getMe).not.toHaveBeenCalled();
    });

    it('retourne 502 si getMe ne renvoie pas de compte', async () => {
      client.getMe.mockResolvedValue(null);
      const res = await request(app).get('/api/monday/me');
      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
    });

    it('retourne 200 et le profil me', async () => {
      const me = { id: 1, name: 'Test', email: 't@example.com' };
      client.getMe.mockResolvedValue(me);
      const res = await request(app).get('/api/monday/me');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, me });
    });

    it('retourne 500 si getMe lève une erreur', async () => {
      client.getMe.mockRejectedValue(new Error('network'));
      const res = await request(app).get('/api/monday/me');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('network');
    });
  });

  describe('GET /api/monday/workspaces', () => {
    it('retourne 503 si non configuré', async () => {
      client.isConfigured.mockReturnValue(false);
      const res = await request(app).get('/api/monday/workspaces');
      expect(res.status).toBe(503);
      expect(client.getWorkspaces).not.toHaveBeenCalled();
    });

    it('retourne 200 et la liste des workspaces', async () => {
      const workspaces = [{ id: 'w1', name: 'WS' }];
      client.getWorkspaces.mockResolvedValue(workspaces);
      const res = await request(app).get('/api/monday/workspaces');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, workspaces });
    });

    it('retourne 500 en cas d’erreur', async () => {
      client.getWorkspaces.mockRejectedValue(new Error('fail'));
      const res = await request(app).get('/api/monday/workspaces');
      expect(res.status).toBe(500);
      expect(res.body.message).toMatch(/workspaces Monday/);
    });
  });

  describe('GET /api/monday/boards', () => {
    it('retourne 503 si non configuré', async () => {
      client.isConfigured.mockReturnValue(false);
      const res = await request(app).get('/api/monday/boards');
      expect(res.status).toBe(503);
      expect(client.getBoards).not.toHaveBeenCalled();
    });

    it('appelle getBoards avec la limite par défaut 100', async () => {
      client.getBoards.mockResolvedValue([]);
      const res = await request(app).get('/api/monday/boards');
      expect(res.status).toBe(200);
      expect(client.getBoards).toHaveBeenCalledWith(100, undefined);
      expect(res.body.boards).toEqual([]);
    });

    it('borne limit entre 1 et 100 (0 ou NaN retombent sur 100 via || 100)', async () => {
      client.getBoards.mockResolvedValue([]);
      await request(app).get('/api/monday/boards').query({ limit: '500' });
      expect(client.getBoards).toHaveBeenCalledWith(100, undefined);
      await request(app).get('/api/monday/boards').query({ limit: '0' });
      expect(client.getBoards).toHaveBeenCalledWith(100, undefined);
      await request(app).get('/api/monday/boards').query({ limit: '3' });
      expect(client.getBoards).toHaveBeenCalledWith(3, undefined);
    });

    it('parse workspace_ids en tableau d’ids', async () => {
      client.getBoards.mockResolvedValue([]);
      await request(app).get('/api/monday/boards').query({ workspace_ids: ' 1 , 2 , ' });
      expect(client.getBoards).toHaveBeenCalledWith(100, ['1', '2']);
    });

    it('retourne 500 en cas d’erreur', async () => {
      client.getBoards.mockRejectedValue(new Error('boom'));
      const res = await request(app).get('/api/monday/boards');
      expect(res.status).toBe(500);
      expect(res.body.message).toMatch(/boards Monday/);
    });
  });

  describe('GET /api/monday/boards/:boardId', () => {
    it('retourne 503 si non configuré', async () => {
      client.isConfigured.mockReturnValue(false);
      const res = await request(app).get('/api/monday/boards/b123');
      expect(res.status).toBe(503);
      expect(client.getBoardWithItems).not.toHaveBeenCalled();
    });

    it('retourne 404 si le board est introuvable', async () => {
      client.getBoardWithItems.mockResolvedValue(null);
      const res = await request(app).get('/api/monday/boards/unknown');
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/non trouvé/);
    });

    it('retourne 200 avec colonnes et items', async () => {
      const data = {
        board: { id: '1', name: 'B' },
        columns: [{ id: 'c1', title: 'Name', type: 'text' }],
        items: [],
      };
      client.getBoardWithItems.mockResolvedValue(data);
      const res = await request(app).get('/api/monday/boards/1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.board).toEqual(data.board);
      expect(res.body.columns).toEqual(data.columns);
      expect(client.getBoardWithItems).toHaveBeenCalledWith('1', 100);
    });

    it('passe itemsLimit dans les bornes 1–500', async () => {
      client.getBoardWithItems.mockResolvedValue({
        board: { id: '1', name: 'B' },
        columns: [],
        items: [],
      });
      await request(app).get('/api/monday/boards/1').query({ itemsLimit: '999' });
      expect(client.getBoardWithItems).toHaveBeenCalledWith('1', 500);
    });

    it('retourne 500 si erreur', async () => {
      client.getBoardWithItems.mockRejectedValue(new Error('err'));
      const res = await request(app).get('/api/monday/boards/1');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/monday/boards/:boardId/views', () => {
    it('retourne 503 si non configuré', async () => {
      client.isConfigured.mockReturnValue(false);
      const res = await request(app).get('/api/monday/boards/1/views');
      expect(res.status).toBe(503);
      expect(client.getBoardViews).not.toHaveBeenCalled();
    });

    it('retourne 200 et les vues', async () => {
      const views = [{ id: 'v1', name: 'Vue', type: 'table' }];
      client.getBoardViews.mockResolvedValue(views);
      const res = await request(app).get('/api/monday/boards/42/views');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, views });
      expect(client.getBoardViews).toHaveBeenCalledWith('42');
    });

    it('retourne 500 en cas d’erreur', async () => {
      client.getBoardViews.mockRejectedValue(new Error('x'));
      const res = await request(app).get('/api/monday/boards/1/views');
      expect(res.status).toBe(500);
    });
  });
});
