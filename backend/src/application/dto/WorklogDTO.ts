import { Worklog } from '../../domain/worklog/entities/Worklog';
import { WorklogMetrics } from '../../domain/kpi/services/WorklogMetricsCalculator';

/**
 * Data Transfer Objects for Worklog API responses
 */

export interface WorklogResponseDTO {
  id: string;
  issueKey: string;
  author: {
    accountId: string;
    displayName: string;
  };
  timeSpentSeconds: number;
  timeSpentHours: number;
  workStart: string;
  workDate: string;
  description: string;
  billable: boolean;
  issueSummary?: string;
  issueType?: string;
  status?: string;
  storyPoints?: number | null;
  weight?: number | null;
}

export interface WorklogSearchResponseDTO {
  success: boolean;
  filters: {
    from?: string;
    to?: string;
    projectKey?: string;
    issueKey?: string;
    accountId?: string;
    teamName?: string;
    openSprints?: boolean;
  };
  count: number;
  worklogs: WorklogResponseDTO[];
  metrics: WorklogMetricsDTO;
}

export interface WorklogMetricsDTO {
  totalTimeSpentHours: number;
  billableHours: number;
  nonBillableHours: number;
  worklogCount: number;
  uniqueUsers: number;
  uniqueIssues: number;
  uniqueProjects: number;
  byUser: Array<{
    accountId: string;
    displayName: string;
    totalHours: number;
    billableHours: number;
    worklogCount: number;
    issueCount: number;
  }>;
  byProject: Array<{
    projectKey: string;
    totalHours: number;
    worklogCount: number;
    issueCount: number;
    userCount: number;
  }>;
  byDay: Array<{
    date: string;
    totalHours: number;
    worklogCount: number;
    userCount: number;
  }>;
}

/**
 * Mapper functions to convert domain objects to DTOs
 */
export class WorklogDTOMapper {
  static toDTO(worklog: Worklog): WorklogResponseDTO {
    return {
      id: worklog.id,
      issueKey: worklog.issueKey,
      author: {
        accountId: worklog.author.accountId,
        displayName: worklog.author.displayName
      },
      timeSpentSeconds: worklog.timeSpent.toSeconds,
      timeSpentHours: worklog.timeSpent.toHours,
      workStart: worklog.workStart.toISOString(),
      workDate: worklog.workDate,
      description: worklog.description,
      billable: worklog.isBillable,
      issueSummary: worklog.issueSummary,
      issueType: worklog.issueType,
      status: worklog.status,
      storyPoints: worklog.storyPoints,
      weight: worklog.weight
    };
  }

  static toDTOList(worklogs: Worklog[]): WorklogResponseDTO[] {
    return worklogs.map(w => this.toDTO(w));
  }

  static metricsToDTO(metrics: WorklogMetrics): WorklogMetricsDTO {
    return {
      totalTimeSpentHours: metrics.totalTimeSpentHours,
      billableHours: metrics.billableHours,
      nonBillableHours: metrics.nonBillableHours,
      worklogCount: metrics.worklogCount,
      uniqueUsers: metrics.uniqueUsers,
      uniqueIssues: metrics.uniqueIssues,
      uniqueProjects: metrics.uniqueProjects,
      byUser: metrics.byUser,
      byProject: metrics.byProject,
      byDay: metrics.byDay
    };
  }
}

