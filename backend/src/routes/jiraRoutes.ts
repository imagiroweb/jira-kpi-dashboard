import { Router, Request, Response } from 'express';
import { worklogAppService } from '../application/services/WorklogApplicationService';
import { logger } from '../utils/logger';
import { DashboardSprintSnapshot } from '../domain/sprint/entities/DashboardSprintSnapshot';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

/**
 * Get configured projects with names
 * GET /api/jira/configured-projects
 */
router.get('/configured-projects', async (req: Request, res: Response) => {
  try {
    const configuredKeys = await worklogAppService.getConfiguredProjects();
    const allProjects = await worklogAppService.getProjects();
    
    // Map configured keys to project objects with names
    const projects = configuredKeys.map((key, _index) => {
      const projectInfo = allProjects.find(p => p.key === key);
      return {
        key,
        name: projectInfo?.name || key,
        id: projectInfo?.id || null
      };
    });
    
    res.json({
      success: true,
      projects
    });
  } catch (error) {
    logger.error('Error fetching configured projects:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch configured projects',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get configured boards with names
 * GET /api/jira/configured-boards
 */
router.get('/configured-boards', async (req: Request, res: Response) => {
  try {
    const boards = await worklogAppService.getConfiguredBoards();
    
    res.json({
      success: true,
      boards
    });
  } catch (error) {
    logger.error('Error fetching configured boards:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch configured boards',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get sprint issues for a specific board
 * GET /api/jira/board/:boardId/sprint-issues
 * Query: from, to (optional) - when provided, returns issues updated in that date range
 */
router.get('/board/:boardId/sprint-issues', async (req: Request, res: Response) => {
  try {
    const boardId = parseInt(req.params.boardId, 10);
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    
    if (isNaN(boardId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid board ID'
      });
    }
    
    const result = await worklogAppService.getSprintIssuesForBoard(boardId, from, to);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error(`Error fetching sprint issues for board:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sprint issues for board',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get resolved tickets per day by board (for ResolvedByDayChart)
 * GET /api/jira/resolved-by-day?from=YYYY-MM-DD&to=YYYY-MM-DD&issueType=all|Story
 * or  ?activeSprint=true&issueType=all|Story  (uses sprint actif / last closed sprint dates)
 */
router.get('/resolved-by-day', async (req: Request, res: Response) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const activeSprint = req.query.activeSprint === 'true';
    const issueType = (req.query.issueType as string) === 'Story' ? 'Story' as const : 'all' as const;

    let fromFinal = from;
    let toFinal = to;

    if (activeSprint) {
      const range = await worklogAppService.getActiveSprintDateRange();
      if (!range) {
        return res.status(400).json({
          success: false,
          message: 'Aucun sprint actif ou dernier sprint fermé trouvé pour les boards configurés'
        });
      }
      fromFinal = range.from;
      toFinal = range.to;
    }

    if (!fromFinal || !toFinal) {
      return res.status(400).json({
        success: false,
        message: 'Query params from and to (YYYY-MM-DD) are required, or activeSprint=true'
      });
    }

    const result = await worklogAppService.getResolvedByDay(fromFinal, toFinal, issueType);

    res.json({
      success: true,
      byDay: result.byDay,
      boards: result.boards,
      dateRange: { from: fromFinal, to: toFinal }
    });
  } catch (error) {
    logger.error('Error fetching resolved-by-day:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch resolved by day',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get all Jira projects (from entire Jira instance, not just .env)
 * GET /api/jira/projects
 */
router.get('/projects', async (req: Request, res: Response) => {
  try {
    // Get ALL projects from Jira, not just configured ones
    const projects = await worklogAppService.getAllProjects();
    const configuredProjects = await worklogAppService.getConfiguredProjects();
    
    res.json({
      success: true,
      data: projects,
      configuredProjects
    });
  } catch (error) {
    logger.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch projects',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get Epic/Legend progress by team
 * GET /api/jira/epic-progress?boardId=123&typeFilter=epic|legend|all
 */
router.get('/epic-progress', async (req: Request, res: Response) => {
  try {
    const boardId = parseInt(req.query.boardId as string, 10);
    if (Number.isNaN(boardId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid board ID'
      });
    }

    const typeFilter = (req.query.typeFilter as string) || 'all';
    const result = await worklogAppService.getEpicProgressByBoard(boardId, typeFilter);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error fetching epic progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch epic progress',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Search Epic/Legend by title (for autocomplete)
 * GET /api/jira/epic-search?boardId=123&query=xxx&typeFilter=epic|legend|all
 */
router.get('/epic-search', async (req: Request, res: Response) => {
  try {
    const boardId = parseInt(req.query.boardId as string, 10);
    if (Number.isNaN(boardId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid board ID'
      });
    }

    const query = (req.query.query as string) || '';
    const typeFilter = (req.query.typeFilter as string) || 'all';
    
    const result = await worklogAppService.searchEpicsByTitle(boardId, query, typeFilter);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error searching epics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search epics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get Epic/Legend detail with child issues
 * GET /api/jira/epic/:epicKey/details
 */
router.get('/epic/:epicKey/details', async (req: Request, res: Response) => {
  try {
    const { epicKey } = req.params;
    
    if (!epicKey) {
      return res.status(400).json({
        success: false,
        message: 'Epic key is required'
      });
    }

    const result = await worklogAppService.getEpicDetails(epicKey);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error(`Error fetching epic details for ${req.params.epicKey}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch epic details',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get time tracking configuration (hours per day, days per week)
 * GET /api/jira/time-config
 */
router.get('/time-config', async (req: Request, res: Response) => {
  try {
    const config = await worklogAppService.getTimeTrackingConfig();
    res.json({
      success: true,
      ...config
    });
  } catch (error) {
    logger.error('Error fetching time tracking config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch time tracking configuration',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Test Jira connection
 * GET /api/jira/test
 */
router.get('/test', async (req: Request, res: Response) => {
  try {
    const result = await worklogAppService.testConnection();
    res.json({
      success: result.success,
      message: result.success ? 'Jira connection successful' : 'Jira connection failed'
    });
  } catch (error) {
    logger.error('Jira test connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test Jira connection',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Save Dashboard Sprint Snapshot
 * POST /api/jira/dashboard-snapshot
 */
router.post('/dashboard-snapshot', authenticate, async (req: Request, res: Response) => {
  try {
    const { sprintName, projectsStats, totals, dateRange, notes } = req.body;
    
    if (!sprintName) {
      return res.status(400).json({
        success: false,
        message: 'Le nom du sprint est requis'
      });
    }

    if (!projectsStats || !Array.isArray(projectsStats)) {
      return res.status(400).json({
        success: false,
        message: 'Les statistiques des projets sont requises'
      });
    }

    // Normalize projectsStats: schema requires "key" (string); frontend may send boardId only
    const normalizedProjectsStats = projectsStats.map((p: { key?: string; boardId?: number; projectKey?: string; name?: string } & Record<string, unknown>) => ({
      ...p,
      key: p.key ?? String(p.boardId ?? p.projectKey ?? p.name ?? '')
    }));

    // Créer le snapshot
    const snapshot = await DashboardSprintSnapshot.create({
      sprintName,
      savedAt: new Date(),
      savedBy: {
        id: req.user!.userId,
        email: req.user!.email,
        name: req.user!.email.split('@')[0]
      },
      dateRange: dateRange || {
        from: new Date().toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
      },
      projectsStats: normalizedProjectsStats,
      totals: totals || {},
      notes
    });

    logger.info(`Dashboard snapshot saved: ${sprintName} by ${req.user!.email}`);

    res.status(201).json({
      success: true,
      message: 'Snapshot enregistré avec succès',
      snapshot: {
        id: snapshot._id,
        sprintName: snapshot.sprintName,
        savedAt: snapshot.savedAt,
        savedBy: snapshot.savedBy
      }
    });
  } catch (error: unknown) {
    const err = error as Error & { errors?: Record<string, { message?: string }> };
    logger.error('Error saving dashboard snapshot:', error);
    const message = err.message ?? 'Unknown error';
    const validationMessages = err.errors
      ? Object.values(err.errors).map((e) => e?.message).filter(Boolean).join('; ')
      : '';
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'enregistrement du snapshot',
      error: validationMessages || message
    });
  }
});

/**
 * Get all Dashboard Sprint Snapshots
 * GET /api/jira/dashboard-snapshots
 */
router.get('/dashboard-snapshots', async (req: Request, res: Response) => {
  try {
    const { limit = 50 } = req.query;
    
    const snapshots = await DashboardSprintSnapshot.find()
      .sort({ savedAt: -1 })
      .limit(Number(limit))
      .select('sprintName savedAt savedBy dateRange notes totals');

    res.json({
      success: true,
      count: snapshots.length,
      snapshots: snapshots.map(s => ({
        id: s._id,
        sprintName: s.sprintName,
        savedAt: s.savedAt,
        savedBy: s.savedBy,
        dateRange: s.dateRange,
        notes: s.notes,
        summary: {
          totalTickets: s.totals?.totalTickets || 0,
          resolvedTickets: s.totals?.resolvedTickets || 0,
          totalPoints: s.totals?.totalPoints || 0,
          resolvedPoints: s.totals?.resolvedPoints || 0,
          totalTimeHours: s.totals?.totalTimeHours || 0
        }
      }))
    });
  } catch (error) {
    logger.error('Error fetching dashboard snapshots:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des snapshots',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get a specific Dashboard Sprint Snapshot
 * GET /api/jira/dashboard-snapshot/:id
 */
router.get('/dashboard-snapshot/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const snapshot = await DashboardSprintSnapshot.findById(id);
    
    if (!snapshot) {
      return res.status(404).json({
        success: false,
        message: 'Snapshot non trouvé'
      });
    }

    res.json({
      success: true,
      snapshot: {
        id: snapshot._id,
        sprintName: snapshot.sprintName,
        savedAt: snapshot.savedAt,
        savedBy: snapshot.savedBy,
        dateRange: snapshot.dateRange,
        notes: snapshot.notes,
        projectsStats: snapshot.projectsStats,
        totals: snapshot.totals
      }
    });
  } catch (error) {
    logger.error('Error fetching dashboard snapshot:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du snapshot',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Delete a Dashboard Sprint Snapshot
 * DELETE /api/jira/dashboard-snapshot/:id
 */
router.delete('/dashboard-snapshot/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const snapshot = await DashboardSprintSnapshot.findByIdAndDelete(id);
    
    if (!snapshot) {
      return res.status(404).json({
        success: false,
        message: 'Snapshot non trouvé'
      });
    }

    logger.info(`Dashboard snapshot deleted: ${snapshot.sprintName} by ${req.user!.email}`);

    res.json({
      success: true,
      message: 'Snapshot supprimé avec succès'
    });
  } catch (error) {
    logger.error('Error deleting dashboard snapshot:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du snapshot',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as jiraRoutes };
