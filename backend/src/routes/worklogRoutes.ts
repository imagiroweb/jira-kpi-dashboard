import { Router, Request, Response } from 'express';
import { worklogAppService } from '../application/services/WorklogApplicationService';
import { globalCache } from '../infrastructure/cache/CacheDecorator';
import { logger } from '../utils/logger';
import { SupportSprintSnapshot } from '../domain/support/entities/SupportSprintSnapshot';
import { authenticate } from '../middleware/authMiddleware';
import { Server } from 'socket.io';
import { emitKPIUpdate, emitSyncProgress, emitAlert } from '../websocket/socketHandler';

const router = Router();

// Helper to get Socket.io instance from request
const getIO = (req: Request): Server | null => {
  return req.app.get('io') as Server | null;
};

/**
 * Test connection
 * GET /api/worklog/test
 */
router.get('/test', async (req: Request, res: Response) => {
  try {
    const result = await worklogAppService.testConnection();
    res.json({
      success: result.success,
      message: result.success 
        ? `Connection successful via ${result.endpoint}` 
        : 'Connection failed',
      endpoint: result.endpoint,
      version: result.version
    });
  } catch (error) {
    logger.error('Connection test error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test connection',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get worklogs for a specific issue
 * GET /api/worklog/issue/:issueKey
 */
router.get('/issue/:issueKey', async (req: Request, res: Response) => {
  try {
    const { issueKey } = req.params;
    const worklogs = await worklogAppService.getWorklogsForIssue(issueKey);
    
    res.json({
      success: true,
      issueKey,
      count: worklogs.length,
      worklogs: worklogs.map(w => w.toJSON())
    });
  } catch (error) {
    logger.error('Error fetching worklogs for issue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worklogs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get worklogs for a user within a date range
 * GET /api/worklog/user/:accountId?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
router.get('/user/:accountId', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const { from, to } = req.query;
    
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: from and to dates (YYYY-MM-DD)'
      });
    }
    
    const worklogs = await worklogAppService.getWorklogsForUser(
      accountId,
      from as string,
      to as string
    );
    
    const metrics = worklogAppService.calculateMetrics(worklogs);
    
    res.json({
      success: true,
      accountId,
      period: { from, to },
      count: worklogs.length,
      totalHours: metrics.totalTimeSpentHours,
      worklogs: worklogs.map(w => w.toJSON()),
      metrics
    });
  } catch (error) {
    logger.error('Error fetching worklogs for user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worklogs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Search worklogs with filters
 * GET /api/worklog/search
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { from, to, projectKey, issueKey, accountId, teamName, openSprints } = req.query;
    
    const worklogs = await worklogAppService.searchWorklogs({
      from: from as string,
      to: to as string,
      projectKey: projectKey as string,
      issueKey: issueKey as string,
      accountId: accountId as string,
      teamName: teamName as string,
      openSprints: openSprints === 'true'
    });
    
    const metrics = worklogAppService.calculateMetrics(worklogs);
    
    res.json({
      success: true,
      filters: { from, to, projectKey, issueKey, accountId, teamName, openSprints },
      count: worklogs.length,
      worklogs: worklogs.map(w => w.toJSON()),
      metrics
    });
  } catch (error) {
    logger.error('Error searching worklogs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search worklogs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get worklogs for a project
 * GET /api/worklog/project/:projectKey?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
router.get('/project/:projectKey', async (req: Request, res: Response) => {
  try {
    const { projectKey } = req.params;
    const { from, to } = req.query;
    
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: from and to dates (YYYY-MM-DD)'
      });
    }
    
    const worklogs = await worklogAppService.getWorklogsForProject(
      projectKey,
      from as string,
      to as string
    );
    
    const metrics = worklogAppService.calculateMetrics(worklogs);
    
    res.json({
      success: true,
      projectKey,
      period: { from, to },
      count: worklogs.length,
      totalHours: metrics.totalTimeSpentHours,
      worklogs: worklogs.map(w => w.toJSON()),
      metrics
    });
  } catch (error) {
    logger.error('Error fetching worklogs for project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worklogs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get daily/weekly summary report
 * GET /api/worklog/report
 */
router.get('/report', async (req: Request, res: Response) => {
  try {
    const { from, to, projectKey, groupBy = 'day', activeSprint } = req.query;
    const useActiveSprint = activeSprint === 'true';
    
    // Si activeSprint est true, on n'a pas besoin des dates
    if (!useActiveSprint && (!from || !to)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: from and to dates (YYYY-MM-DD) or activeSprint=true'
      });
    }
    
    const worklogs = await worklogAppService.searchWorklogs({
      from: useActiveSprint ? undefined : from as string,
      to: useActiveSprint ? undefined : to as string,
      projectKey: projectKey as string,
      openSprints: useActiveSprint
    });
    
    const metrics = worklogAppService.calculateMetrics(worklogs);
    
    // Return grouped data based on groupBy parameter
    let groupedData: unknown;
    switch (groupBy) {
      case 'user':
        groupedData = metrics.byUser;
        break;
      case 'project':
        groupedData = metrics.byProject;
        break;
      case 'day':
      default:
        groupedData = metrics.byDay;
        break;
    }
    
    res.json({
      success: true,
      period: useActiveSprint ? { activeSprint: true } : { from, to },
      groupBy,
      activeSprint: useActiveSprint,
      summary: {
        totalHours: metrics.totalTimeSpentHours,
        billableHours: metrics.billableHours,
        worklogCount: metrics.worklogCount,
        uniqueUsers: metrics.uniqueUsers,
        uniqueIssues: metrics.uniqueIssues
      },
      data: groupedData
    });
  } catch (error) {
    logger.error('Error generating worklog report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate report',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get sprint issues for a project
 * GET /api/worklog/sprint-issues/:projectKey
 */
router.get('/sprint-issues/:projectKey', async (req: Request, res: Response) => {
  try {
    const { projectKey } = req.params;
    const result = await worklogAppService.getSprintIssuesForProject(projectKey);
    
    res.json({
      success: true,
      projectKey,
      issueCount: result.issues.length,
      statusCounts: result.statusCounts,
      storyPointsByStatus: result.storyPointsByStatus,
      totalStoryPoints: result.totalStoryPoints,
      backlog: result.backlog,
      issues: result.issues
    });
  } catch (error) {
    logger.error('Error fetching sprint issues:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sprint issues',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get velocity history for a project
 * GET /api/worklog/velocity-history/:projectKey
 */
router.get('/velocity-history/:projectKey', async (req: Request, res: Response) => {
  try {
    const { projectKey } = req.params;
    const sprintCount = parseInt(req.query.sprintCount as string) || 10;
    
    const result = await worklogAppService.getVelocityHistory(projectKey, sprintCount);
    
    res.json({
      success: true,
      projectKey,
      sprintCount: result.sprints.length,
      averageVelocity: result.averageVelocity,
      trend: result.trend,
      sprints: result.sprints
    });
  } catch (error) {
    logger.error('Error fetching velocity history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch velocity history',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get Support Board KPIs
 * GET /api/worklog/support-kpi
 */
router.get('/support-kpi', async (req: Request, res: Response) => {
  try {
    const { from, to, activeSprint } = req.query;
    const useActiveSprint = activeSprint === 'true' || (!from && !to);
    
    const result = await worklogAppService.getSupportBoardKPI(
      from as string,
      to as string,
      useActiveSprint
    );
    
    res.json({
      success: true,
      projectKey: process.env.JIRA_SUPPORT_PROJECT_KEY || 'SB',
      period: { from, to },
      activeSprint: useActiveSprint,
      ...result
    });
  } catch (error) {
    logger.error('Error fetching support KPIs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support KPIs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get cache statistics
 * GET /api/worklog/cache/stats
 */
router.get('/cache/stats', async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Cache is managed internally'
  });
});

/**
 * Clear cache
 * DELETE /api/worklog/cache
 */
router.delete('/cache', async (req: Request, res: Response) => {
  try {
    globalCache.clear();
    
    // Emit cache cleared event via WebSocket
    const io = getIO(req);
    if (io) {
      emitAlert(io, {
        level: 'info',
        message: 'Cache vidé - les données seront rechargées depuis Jira'
      });
    }
    
    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    logger.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache'
    });
  }
});

/**
 * Force sync all data
 * POST /api/worklog/sync
 */
router.post('/sync', authenticate, async (req: Request, res: Response) => {
  const io = getIO(req);
  
  try {
    // Emit sync started
    if (io) {
      emitSyncProgress(io, {
        status: 'started',
        progress: 0,
        message: 'Démarrage de la synchronisation...'
      });
    }

    // Clear cache first
    globalCache.clear();
    
    if (io) {
      emitSyncProgress(io, {
        status: 'in_progress',
        progress: 20,
        message: 'Cache vidé, récupération des données...'
      });
    }

    // Get configured projects
    const projects = await worklogAppService.getConfiguredProjects();
    const totalProjects = projects.length;
    let completedProjects = 0;

    // Refresh data for each project
    for (const projectKey of projects) {
      try {
        await worklogAppService.getSprintIssuesForProject(projectKey);
        completedProjects++;
        
        if (io) {
          const progress = 20 + Math.round((completedProjects / totalProjects) * 70);
          emitSyncProgress(io, {
            status: 'in_progress',
            progress,
            message: `Projet ${projectKey} synchronisé (${completedProjects}/${totalProjects})`
          });
        }
      } catch (projectError) {
        logger.warn(`Error syncing project ${projectKey}:`, projectError);
      }
    }

    // Emit completion
    if (io) {
      emitSyncProgress(io, {
        status: 'completed',
        progress: 100,
        message: 'Synchronisation terminée avec succès'
      });

      // Emit KPI update to trigger frontend refresh
      emitKPIUpdate(io, {
        type: 'sprint',
        data: { refreshed: true, projectsCount: projects.length },
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Synchronisation terminée',
      projectsSynced: completedProjects,
      totalProjects
    });
  } catch (error) {
    logger.error('Error during sync:', error);
    
    if (io) {
      emitSyncProgress(io, {
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Erreur de synchronisation'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la synchronisation',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Save Support Sprint Snapshot
 * POST /api/worklog/support-snapshot
 */
router.post('/support-snapshot', authenticate, async (req: Request, res: Response) => {
  try {
    const { sprintName, notes } = req.body;
    const { from, to, activeSprint } = req.query;
    const useActiveSprint = activeSprint === 'true' || (!from && !to);
    
    if (!sprintName) {
      return res.status(400).json({
        success: false,
        message: 'Le nom du sprint est requis'
      });
    }

    // Récupérer les KPI actuels
    const kpiResult = await worklogAppService.getSupportBoardKPI(
      from as string,
      to as string,
      useActiveSprint
    );

    // Créer le snapshot
    const snapshot = await SupportSprintSnapshot.create({
      sprintName,
      savedAt: new Date(),
      savedBy: {
        id: req.user!.userId,
        email: req.user!.email,
        name: req.user!.email.split('@')[0]
      },
      dateRange: {
        from: from as string || new Date().toISOString().split('T')[0],
        to: to as string || new Date().toISOString().split('T')[0]
      },
      kpiData: {
        statusCounts: kpiResult.statusCounts,
        ponderationByStatus: kpiResult.ponderationByStatus,
        ponderationByType: kpiResult.ponderationByType,
        ponderationByAssignee: kpiResult.ponderationByAssignee,
        ponderationByLevel: kpiResult.ponderationByLevel,
        ponderationByLabel: kpiResult.ponderationByLabel,
        ponderationByTeam: kpiResult.ponderationByTeam,
        backlog: kpiResult.backlog,
        avgResolutionTimeHours: kpiResult.avgResolutionTimeHours,
        avgFirstResponseTimeHours: kpiResult.avgFirstResponseTimeHours,
        avgResolutionTimeFromDatesHours: kpiResult.avgResolutionTimeFromDatesHours,
        highPondFastResolutionPercent: kpiResult.highPondFastResolutionPercent,
        veryHighPondFastResolutionPercent: kpiResult.veryHighPondFastResolutionPercent,
        totalPonderation: kpiResult.ponderationByStatus?.total || 0
      },
      notes
    });

    logger.info(`Support snapshot saved: ${sprintName} by ${req.user!.email}`);

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
  } catch (error) {
    logger.error('Error saving support snapshot:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'enregistrement du snapshot',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get all Support Sprint Snapshots
 * GET /api/worklog/support-snapshots
 */
router.get('/support-snapshots', async (req: Request, res: Response) => {
  try {
    const { limit = 50 } = req.query;
    
    const snapshots = await SupportSprintSnapshot.find()
      .sort({ savedAt: -1 })
      .limit(Number(limit))
      .select('sprintName savedAt savedBy dateRange notes kpiData.statusCounts kpiData.ponderationByStatus');

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
          totalTickets: s.kpiData.statusCounts.total,
          resolvedTickets: s.kpiData.statusCounts.resolved,
          totalPonderation: s.kpiData.ponderationByStatus.total,
          resolvedPonderation: s.kpiData.ponderationByStatus.resolved
        }
      }))
    });
  } catch (error) {
    logger.error('Error fetching support snapshots:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des snapshots',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get a specific Support Sprint Snapshot
 * GET /api/worklog/support-snapshot/:id
 */
router.get('/support-snapshot/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const snapshot = await SupportSprintSnapshot.findById(id);
    
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
        ...snapshot.kpiData
      }
    });
  } catch (error) {
    logger.error('Error fetching support snapshot:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du snapshot',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Delete a Support Sprint Snapshot
 * DELETE /api/worklog/support-snapshot/:id
 */
router.delete('/support-snapshot/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const snapshot = await SupportSprintSnapshot.findByIdAndDelete(id);
    
    if (!snapshot) {
      return res.status(404).json({
        success: false,
        message: 'Snapshot non trouvé'
      });
    }

    logger.info(`Support snapshot deleted: ${snapshot.sprintName} by ${req.user!.email}`);

    res.json({
      success: true,
      message: 'Snapshot supprimé avec succès'
    });
  } catch (error) {
    logger.error('Error deleting support snapshot:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du snapshot',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Stub endpoints for backward compatibility
 */
router.get('/discover', async (req: Request, res: Response) => {
  res.json({ success: true, availableEndpoints: ['Jira Cloud REST API v3'] });
});

router.get('/discover-reports', async (req: Request, res: Response) => {
  res.json({ success: true, availableEndpoints: [] });
});

router.get('/saved-reports', async (req: Request, res: Response) => {
  res.json({ success: true, count: 0, reports: [] });
});

router.get('/attributes', async (req: Request, res: Response) => {
  res.json({ success: true, attributes: [] });
});

export { router as worklogRoutes };
