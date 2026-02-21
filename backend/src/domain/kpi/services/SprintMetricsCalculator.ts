import { SprintIssue } from '../../sprint/entities/SprintIssue';

/**
 * Domain Service for calculating sprint metrics
 * Pure business logic, no infrastructure dependencies
 */
export class SprintMetricsCalculator {

  /**
   * Calculate sprint status counts and story points by status
   */
  calculate(issues: SprintIssue[]): SprintMetrics {
    const statusCounts: StatusCounts = {
      total: issues.length,
      todo: 0,
      inProgress: 0,
      qa: 0,
      resolved: 0
    };

    const storyPointsByStatus: StoryPointsByStatus = {
      total: 0,
      todo: 0,
      inProgress: 0,
      qa: 0,
      resolved: 0
    };

    for (const issue of issues) {
      const points = issue.storyPoints || 0;
      storyPointsByStatus.total += points;

      if (issue.isDone) {
        statusCounts.resolved++;
        storyPointsByStatus.resolved += points;
      } else if (issue.isInQA) {
        statusCounts.qa++;
        storyPointsByStatus.qa += points;
      } else if (issue.isInProgress) {
        statusCounts.inProgress++;
        storyPointsByStatus.inProgress += points;
      } else if (issue.isTodo) {
        statusCounts.todo++;
        storyPointsByStatus.todo += points;
      }
    }

    return {
      statusCounts,
      storyPointsByStatus,
      totalStoryPoints: storyPointsByStatus.total,
      completionRate: this.calculateCompletionRate(statusCounts),
      issuesByType: this.groupByType(issues)
    };
  }

  /**
   * Calculate velocity from committed and completed story points
   */
  calculateVelocity(committed: number, completed: number): VelocityMetrics {
    return {
      committed,
      completed,
      completionRate: committed > 0 ? Math.round((completed / committed) * 100) : 0,
      variance: completed - committed,
      variancePercent: committed > 0 ? Math.round(((completed - committed) / committed) * 100) : 0
    };
  }

  /**
   * Calculate average velocity from multiple sprints
   */
  calculateAverageVelocity(velocities: VelocityMetrics[]): number {
    if (velocities.length === 0) return 0;
    const sum = velocities.reduce((acc, v) => acc + v.completed, 0);
    return Math.round(sum / velocities.length * 10) / 10;
  }

  /**
   * Determine velocity trend based on recent sprints
   */
  calculateVelocityTrend(velocities: VelocityMetrics[]): 'increasing' | 'stable' | 'decreasing' {
    if (velocities.length < 3) return 'stable';

    const recent = velocities.slice(-3);
    const firstAvg = recent[0].completed;
    const lastAvg = recent[recent.length - 1].completed;
    
    const change = ((lastAvg - firstAvg) / firstAvg) * 100;
    
    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
  }

  private calculateCompletionRate(counts: StatusCounts): number {
    if (counts.total === 0) return 0;
    return Math.round((counts.resolved / counts.total) * 100);
  }

  private groupByType(issues: SprintIssue[]): IssuesByType[] {
    const typeMap = new Map<string, SprintIssue[]>();
    
    for (const issue of issues) {
      const type = issue.issueType;
      if (!typeMap.has(type)) {
        typeMap.set(type, []);
      }
      typeMap.get(type)!.push(issue);
    }

    return Array.from(typeMap.entries()).map(([type, typeIssues]) => ({
      type,
      count: typeIssues.length,
      storyPoints: typeIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0),
      doneCount: typeIssues.filter(i => i.isDone).length
    }));
  }
}

// Types
export interface StatusCounts {
  total: number;
  todo: number;
  inProgress: number;
  qa: number;
  resolved: number;
}

export interface StoryPointsByStatus {
  total: number;
  todo: number;
  inProgress: number;
  qa: number;
  resolved: number;
}

export interface SprintMetrics {
  statusCounts: StatusCounts;
  storyPointsByStatus: StoryPointsByStatus;
  totalStoryPoints: number;
  completionRate: number;
  issuesByType: IssuesByType[];
}

export interface VelocityMetrics {
  committed: number;
  completed: number;
  completionRate: number;
  variance: number;
  variancePercent: number;
}

export interface IssuesByType {
  type: string;
  count: number;
  storyPoints: number;
  doneCount: number;
}

