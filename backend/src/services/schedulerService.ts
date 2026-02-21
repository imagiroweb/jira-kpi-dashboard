import { Server } from 'socket.io';
import { logger } from '../utils/logger';
import { emitKPIUpdate, emitSyncProgress, emitAlert } from '../websocket/socketHandler';
import { worklogAppService } from '../application/services/WorklogApplicationService';
import { globalCache } from '../infrastructure/cache/CacheDecorator';

interface SchedulerConfig {
  syncIntervalSeconds: number; // Interval in seconds
  enabled: boolean;
}

class SchedulerService {
  private io: Server | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private intervalSeconds = 10;

  /**
   * Initialize the scheduler with Socket.IO instance
   */
  initialize(io: Server, config?: Partial<SchedulerConfig>): void {
    this.io = io;
    
    const defaultConfig: SchedulerConfig = {
      syncIntervalSeconds: parseInt(process.env.SYNC_INTERVAL_SECONDS || '10', 10),
      enabled: process.env.SYNC_ENABLED !== 'false',
    };

    const finalConfig = { ...defaultConfig, ...config };
    this.intervalSeconds = finalConfig.syncIntervalSeconds;

    if (!finalConfig.enabled) {
      logger.info('Scheduled sync is disabled');
      return;
    }

    this.startSyncSchedule();
    logger.info(`Scheduler initialized with interval: ${this.intervalSeconds} seconds`);
  }

  /**
   * Start the sync schedule using setInterval
   */
  private startSyncSchedule(): void {
    // Run immediately on start
    setTimeout(() => this.runScheduledSync(), 2000);
    
    // Then schedule recurring syncs
    this.syncInterval = setInterval(async () => {
      await this.runScheduledSync();
    }, this.intervalSeconds * 1000);

    logger.info(`Scheduled sync task started (every ${this.intervalSeconds}s)`);
  }

  /**
   * Run the scheduled sync and emit WebSocket events
   */
  private async runScheduledSync(): Promise<void> {
    if (this.isRunning) {
      logger.debug('Scheduled sync skipped - previous sync still running');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    logger.info('Running scheduled Jira sync...');

    try {
      // Clear cache to force fresh data
      globalCache.clear();

      // Get configured projects (includes main project + support project)
      const projects = await worklogAppService.getConfiguredProjects();
      const supportProjectKey = process.env.JIRA_SUPPORT_PROJECT_KEY;
      
      const totalProjects = projects.length + (supportProjectKey ? 1 : 0);
      let completedProjects = 0;
      let errors: string[] = [];

      // Sync each main project
      for (const projectKey of projects) {
        try {
          await worklogAppService.getSprintIssuesForProject(projectKey);
          completedProjects++;
        } catch (projectError) {
          const errorMsg = projectError instanceof Error ? projectError.message : 'Unknown error';
          logger.warn(`Error syncing project ${projectKey}:`, projectError);
          errors.push(`${projectKey}: ${errorMsg}`);
        }
      }

      // Sync Support Board KPI if configured
      if (supportProjectKey) {
        try {
          await worklogAppService.getSupportBoardKPI();
          completedProjects++;
        } catch (supportError) {
          const errorMsg = supportError instanceof Error ? supportError.message : 'Unknown error';
          logger.warn(`Error syncing Support Board:`, supportError);
          errors.push(`Support (${supportProjectKey}): ${errorMsg}`);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      // Emit KPI update to trigger frontend refresh (silent - no progress notifications for frequent syncs)
      if (this.io) {
        emitKPIUpdate(this.io, {
          type: 'sprint',
          data: { 
            refreshed: true, 
            projectsCount: completedProjects,
            automatic: true,
            duration: parseFloat(duration)
          },
          timestamp: new Date()
        });

        // Only emit alert if there were errors
        if (errors.length > 0) {
          emitAlert(this.io, {
            level: 'warning',
            message: `Sync partiel: ${errors.length} erreur(s) sur ${totalProjects} projets`
          });
        }
      }

      logger.info(`Scheduled sync completed in ${duration}s - ${completedProjects}/${totalProjects} projects`);
    } catch (error) {
      logger.error('Scheduled sync failed:', error);
      
      if (this.io) {
        emitAlert(this.io, {
          level: 'critical',
          message: 'La synchronisation automatique a échoué'
        });
      }
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manually trigger a sync (useful for testing)
   */
  async triggerManualSync(): Promise<void> {
    await this.runScheduledSync();
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('Scheduler stopped');
    }
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.syncInterval !== null;
  }

  /**
   * Check if a sync is currently in progress
   */
  isSyncInProgress(): boolean {
    return this.isRunning;
  }

  /**
   * Get current interval in seconds
   */
  getIntervalSeconds(): number {
    return this.intervalSeconds;
  }
}

// Export singleton instance
export const schedulerService = new SchedulerService();
