import { IWorklogRepository } from '../domain/worklog/repositories/IWorklogRepository';
import { ISprintRepository } from '../domain/sprint/repositories/ISprintRepository';
import { WorklogMetricsCalculator } from '../domain/kpi/services/WorklogMetricsCalculator';
import { SprintMetricsCalculator } from '../domain/kpi/services/SprintMetricsCalculator';
import { SearchWorklogsUseCase } from '../application/use-cases/SearchWorklogs';
import { GetSprintIssuesUseCase } from '../application/use-cases/GetSprintIssues';
import { GetVelocityHistoryUseCase } from '../application/use-cases/GetVelocityHistory';
import { JiraClient } from './jira/JiraClient';
import { JiraWorklogRepository } from './jira/JiraWorklogRepository';
import { JiraSprintRepository } from './jira/JiraSprintRepository';
import { CachedWorklogRepository, CachedSprintRepository } from './cache/CacheDecorator';
import { logger } from '../utils/logger';

/**
 * Dependency Injection Container
 * Creates and wires all dependencies
 */
export class Container {
  private static instance: Container | null = null;
  
  private _jiraClient: JiraClient | null = null;
  private _worklogRepository: IWorklogRepository | null = null;
  private _sprintRepository: ISprintRepository | null = null;
  private _worklogMetricsCalculator: WorklogMetricsCalculator | null = null;
  private _sprintMetricsCalculator: SprintMetricsCalculator | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
      logger.info('DI Container initialized');
    }
    return Container.instance;
  }

  /**
   * Reset container (useful for testing)
   */
  static reset(): void {
    Container.instance = null;
  }

  // Infrastructure
  get jiraClient(): JiraClient {
    if (!this._jiraClient) {
      this._jiraClient = new JiraClient();
    }
    return this._jiraClient;
  }

  // Repositories
  get worklogRepository(): IWorklogRepository {
    if (!this._worklogRepository) {
      const jiraRepo = new JiraWorklogRepository(this.jiraClient);
      this._worklogRepository = new CachedWorklogRepository(jiraRepo);
    }
    return this._worklogRepository;
  }

  get sprintRepository(): ISprintRepository {
    if (!this._sprintRepository) {
      const jiraRepo = new JiraSprintRepository(this.jiraClient);
      this._sprintRepository = new CachedSprintRepository(jiraRepo);
    }
    return this._sprintRepository;
  }

  // Domain Services
  get worklogMetricsCalculator(): WorklogMetricsCalculator {
    if (!this._worklogMetricsCalculator) {
      this._worklogMetricsCalculator = new WorklogMetricsCalculator();
    }
    return this._worklogMetricsCalculator;
  }

  get sprintMetricsCalculator(): SprintMetricsCalculator {
    if (!this._sprintMetricsCalculator) {
      this._sprintMetricsCalculator = new SprintMetricsCalculator();
    }
    return this._sprintMetricsCalculator;
  }

  // Use Cases
  get searchWorklogsUseCase(): SearchWorklogsUseCase {
    return new SearchWorklogsUseCase(
      this.worklogRepository,
      this.worklogMetricsCalculator
    );
  }

  get getSprintIssuesUseCase(): GetSprintIssuesUseCase {
    return new GetSprintIssuesUseCase(
      this.sprintRepository,
      this.sprintMetricsCalculator
    );
  }

  get getVelocityHistoryUseCase(): GetVelocityHistoryUseCase {
    return new GetVelocityHistoryUseCase(
      this.sprintRepository,
      this.sprintMetricsCalculator
    );
  }
}

// Convenience function
export const container = () => Container.getInstance();

