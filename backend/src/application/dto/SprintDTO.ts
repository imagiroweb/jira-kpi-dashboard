import { Sprint } from '../../domain/sprint/entities/Sprint';
import { SprintIssue } from '../../domain/sprint/entities/SprintIssue';
import { SprintMetrics } from '../../domain/kpi/services/SprintMetricsCalculator';

/**
 * Data Transfer Objects for Sprint API responses
 */

export interface SprintResponseDTO {
  id: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  completeDate: string | null;
  goal: string | null;
  isActive: boolean;
  remainingDays: number | null;
  progressPercent: number | null;
}

export interface SprintIssueResponseDTO {
  issueKey: string;
  summary: string;
  issueType: string;
  status: string;
  statusCategory: string;
  storyPoints: number | null;
  originalEstimateSeconds: number | null;
  isTodo: boolean;
  isInProgress: boolean;
  isDone: boolean;
  isInQA: boolean;
}

export interface SprintIssuesResponseDTO {
  success: boolean;
  projectKey: string;
  issueCount: number;
  statusCounts: {
    total: number;
    todo: number;
    inProgress: number;
    qa: number;
    resolved: number;
  };
  storyPointsByStatus: {
    total: number;
    todo: number;
    inProgress: number;
    qa: number;
    resolved: number;
  };
  totalStoryPoints: number;
  backlog: {
    ticketCount: number;
    storyPoints: number;
  };
  issues: SprintIssueResponseDTO[];
}

export interface VelocityHistoryResponseDTO {
  success: boolean;
  projectKey: string;
  sprintCount: number;
  averageVelocity: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  sprints: Array<{
    id: number;
    name: string;
    startDate: string | null;
    endDate: string | null;
    committed: number;
    completed: number;
    completionRate: number;
  }>;
}

/**
 * Mapper functions
 */
export class SprintDTOMapper {
  static toDTO(sprint: Sprint): SprintResponseDTO {
    return {
      id: sprint.id,
      name: sprint.name,
      state: sprint.state,
      startDate: sprint.startDate?.toISOString() ?? null,
      endDate: sprint.endDate?.toISOString() ?? null,
      completeDate: sprint.completeDate?.toISOString() ?? null,
      goal: sprint.goal,
      isActive: sprint.isActive,
      remainingDays: sprint.remainingDays,
      progressPercent: sprint.progressPercent
    };
  }

  static issueToDTO(issue: SprintIssue): SprintIssueResponseDTO {
    return {
      issueKey: issue.issueKey,
      summary: issue.summary,
      issueType: issue.issueType,
      status: issue.status,
      statusCategory: issue.statusCategory,
      storyPoints: issue.storyPoints,
      originalEstimateSeconds: issue.originalEstimate?.toSeconds ?? null,
      isTodo: issue.isTodo,
      isInProgress: issue.isInProgress,
      isDone: issue.isDone,
      isInQA: issue.isInQA
    };
  }

  static issuesToDTO(issues: SprintIssue[]): SprintIssueResponseDTO[] {
    return issues.map(i => this.issueToDTO(i));
  }

  static toSprintIssuesResponse(
    projectKey: string,
    issues: SprintIssue[],
    metrics: SprintMetrics,
    backlog: { ticketCount: number; storyPoints: number }
  ): SprintIssuesResponseDTO {
    return {
      success: true,
      projectKey,
      issueCount: issues.length,
      statusCounts: metrics.statusCounts,
      storyPointsByStatus: metrics.storyPointsByStatus,
      totalStoryPoints: metrics.totalStoryPoints,
      backlog,
      issues: this.issuesToDTO(issues)
    };
  }
}

