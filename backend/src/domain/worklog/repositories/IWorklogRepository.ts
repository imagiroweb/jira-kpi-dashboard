import { Worklog } from '../entities/Worklog';
import { DateRange } from '../value-objects/DateRange';

/**
 * Repository Interface for Worklogs
 * Defines the contract for worklog data access
 * Implementations can use Jira API, database, or mock data
 */
export interface IWorklogRepository {
  /**
   * Find worklogs for a specific issue
   */
  findByIssue(issueKey: string): Promise<Worklog[]>;

  /**
   * Find worklogs for a user within a date range
   */
  findByUser(accountId: string, range: DateRange): Promise<Worklog[]>;

  /**
   * Find worklogs for a project within a date range
   */
  findByProject(projectKey: string, range: DateRange): Promise<Worklog[]>;

  /**
   * Find worklogs for issues in open sprints
   */
  findByOpenSprints(projectKey?: string): Promise<Worklog[]>;

  /**
   * Search worklogs with multiple filters
   */
  search(params: WorklogSearchParams): Promise<Worklog[]>;
}

export interface WorklogSearchParams {
  from?: string;
  to?: string;
  projectKey?: string;
  issueKey?: string;
  accountId?: string;
  teamName?: string;
  openSprints?: boolean;
}

