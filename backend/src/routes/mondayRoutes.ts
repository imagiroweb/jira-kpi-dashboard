import { Router, Request, Response } from 'express';
import { getMondayClient } from '../infrastructure/monday/MondayClient';
import { logger } from '../utils/logger';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

/**
 * GET /api/monday/status
 * Check if Monday.com is configured (MONDAY_API_KEY).
 */
router.get('/status', authenticate, async (req: Request, res: Response) => {
  const client = getMondayClient();
  res.json({
    success: true,
    configured: client.isConfigured(),
  });
});

/**
 * GET /api/monday/me
 * Current Monday user (verify connection).
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const client = getMondayClient();
    if (!client.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Monday.com non configuré (MONDAY_API_KEY manquant)',
      });
    }
    const me = await client.getMe();
    if (!me) {
      return res.status(502).json({
        success: false,
        message: 'Impossible de récupérer le compte Monday (vérifiez la clé API)',
      });
    }
    res.json({ success: true, me });
  } catch (error) {
    logger.error('Error fetching Monday me:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du compte Monday',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/monday/workspaces
 * List workspaces (pour retrouver les boards partagés dans un espace).
 */
router.get('/workspaces', authenticate, async (req: Request, res: Response) => {
  try {
    const client = getMondayClient();
    if (!client.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Monday.com non configuré (MONDAY_API_KEY manquant)',
      });
    }
    const workspaces = await client.getWorkspaces();
    res.json({ success: true, workspaces });
  } catch (error) {
    logger.error('Error fetching Monday workspaces:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des workspaces Monday',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/monday/boards
 * List boards (actifs + archivés + partagés). Option : workspace_ids=id1,id2 pour filtrer par espace.
 */
router.get('/boards', authenticate, async (req: Request, res: Response) => {
  try {
    const client = getMondayClient();
    if (!client.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Monday.com non configuré (MONDAY_API_KEY manquant)',
      });
    }
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 100), 10) || 100));
    const workspaceIdsParam = typeof req.query.workspace_ids === 'string' ? req.query.workspace_ids : undefined;
    const workspaceIds = workspaceIdsParam ? workspaceIdsParam.split(',').map((id) => id.trim()).filter(Boolean) : undefined;
    const boards = await client.getBoards(limit, workspaceIds);
    res.json({ success: true, boards });
  } catch (error) {
    logger.error('Error fetching Monday boards:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des boards Monday',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/monday/boards/:boardId
 * Get one board with columns and items.
 */
router.get('/boards/:boardId', authenticate, async (req: Request, res: Response) => {
  try {
    const client = getMondayClient();
    if (!client.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Monday.com non configuré (MONDAY_API_KEY manquant)',
      });
    }
    const { boardId } = req.params;
    const itemsLimit = Math.min(500, Math.max(1, parseInt(String(req.query.itemsLimit || 100), 10) || 100));
    const data = await client.getBoardWithItems(boardId, itemsLimit);
    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Board non trouvé ou accès refusé',
      });
    }
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Error fetching Monday board:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du board Monday',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export const mondayRoutes = router;
