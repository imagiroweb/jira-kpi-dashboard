import { Router, Request, Response } from 'express';
import { worklogAppService } from '../application/services/WorklogApplicationService';
import { getConnectedClientsCount } from '../websocket/socketHandler';

const router = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check basique
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service en ligne
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * Detailed health check with dependencies
 */
router.get('/detailed', async (req: Request, res: Response) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      jira: {
        status: 'unknown',
        message: ''
      },
      websocket: {
        status: 'ok',
        connectedClients: getConnectedClientsCount()
      }
    },
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: 'MB'
    }
  };

  // Check Jira connection
  try {
    const result = await worklogAppService.testConnection();
    health.services.jira = {
      status: result.success ? 'ok' : 'error',
      message: result.success ? 'Connected' : 'Connection failed'
    };
    if (!result.success) {
      health.status = 'degraded';
    }
  } catch (error) {
    health.services.jira = {
      status: 'error',
      message: 'Connection check failed'
    };
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * Liveness probe for Kubernetes
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

/**
 * Readiness probe for Kubernetes
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const result = await worklogAppService.testConnection();
    if (result.success) {
      res.status(200).json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not ready', reason: 'Jira not connected' });
    }
  } catch {
    res.status(503).json({ status: 'not ready', reason: 'Health check failed' });
  }
});

export { router as healthRoutes };
