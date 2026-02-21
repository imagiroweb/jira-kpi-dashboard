import { Sprint } from '../entities/Sprint';
import { SprintIssue } from '../entities/SprintIssue';

/**
 * Repository Interface for Sprints
 * Defines the contract for sprint data access
 */
export interface ISprintRepository {
  /**
   * Find all sprints for a board
   */
  findByBoard(boardId: number): Promise<Sprint[]>;

  /**
   * Find open sprints for a project
   */
  findOpenSprints(projectKey: string): Promise<Sprint[]>;

  /**
   * Find closed sprints for a project (for velocity history)
   */
  findClosedSprints(projectKey: string, limit?: number): Promise<Sprint[]>;

  /**
   * Find a specific sprint by ID
   */
  findById(sprintId: number): Promise<Sprint | null>;

  /**
   * Get all issues in a sprint
   */
  findSprintIssues(sprintId: number): Promise<SprintIssue[]>;

  /**
   * Get all issues in open sprints for a project
   */
  findOpenSprintIssues(projectKey: string): Promise<SprintIssue[]>;

  /**
   * Get backlog issues (not in any sprint)
   * @param projectKey - The project key
   * @param maxResults - Deprecated: all results are now fetched via pagination
   */
  findBacklogIssues(projectKey: string, maxResults?: number): Promise<SprintIssue[]>;
}

/**
 * Velocity data for a sprint
 */
export interface SprintVelocity {
  sprint: Sprint;
  committedPoints: number;
  completedPoints: number;
  completionRate: number;
}

