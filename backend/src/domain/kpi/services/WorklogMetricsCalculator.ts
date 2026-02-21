import { Worklog } from '../../worklog/entities/Worklog';
import { TimeSpent } from '../../worklog/value-objects/TimeSpent';

/**
 * Domain Service for calculating worklog metrics
 * Pure business logic, no infrastructure dependencies
 */
export class WorklogMetricsCalculator {
  
  /**
   * Calculate comprehensive metrics from a list of worklogs
   */
  calculate(worklogs: Worklog[]): WorklogMetrics {
    if (worklogs.length === 0) {
      return this.emptyMetrics();
    }

    const totalTimeSpent = this.sumTimeSpent(worklogs);
    const billableWorklogs = worklogs.filter(w => w.isBillable);
    const billableTime = this.sumTimeSpent(billableWorklogs);

    return {
      totalTimeSpent,
      totalTimeSpentHours: totalTimeSpent.toHours,
      billableHours: billableTime.toHours,
      nonBillableHours: totalTimeSpent.toHours - billableTime.toHours,
      worklogCount: worklogs.length,
      uniqueUsers: this.countUniqueUsers(worklogs),
      uniqueIssues: this.countUniqueIssues(worklogs),
      uniqueProjects: this.countUniqueProjects(worklogs),
      averageTimePerWorklog: TimeSpent.fromSeconds(totalTimeSpent.toSeconds / worklogs.length),
      byUser: this.groupByUser(worklogs),
      byProject: this.groupByProject(worklogs),
      byDay: this.groupByDay(worklogs),
      byIssueType: this.groupByIssueType(worklogs)
    };
  }

  private emptyMetrics(): WorklogMetrics {
    return {
      totalTimeSpent: TimeSpent.zero(),
      totalTimeSpentHours: 0,
      billableHours: 0,
      nonBillableHours: 0,
      worklogCount: 0,
      uniqueUsers: 0,
      uniqueIssues: 0,
      uniqueProjects: 0,
      averageTimePerWorklog: TimeSpent.zero(),
      byUser: [],
      byProject: [],
      byDay: [],
      byIssueType: []
    };
  }

  private sumTimeSpent(worklogs: Worklog[]): TimeSpent {
    return worklogs.reduce(
      (sum, w) => sum.add(w.timeSpent),
      TimeSpent.zero()
    );
  }

  private countUniqueUsers(worklogs: Worklog[]): number {
    const users = new Set(worklogs.map(w => w.author.accountId));
    return users.size;
  }

  private countUniqueIssues(worklogs: Worklog[]): number {
    const issues = new Set(worklogs.map(w => w.issueKey));
    return issues.size;
  }

  private countUniqueProjects(worklogs: Worklog[]): number {
    const projects = new Set(worklogs.map(w => w.projectKey));
    return projects.size;
  }

  private groupByUser(worklogs: Worklog[]): UserMetrics[] {
    const userMap = new Map<string, { name: string; worklogs: Worklog[] }>();
    
    for (const w of worklogs) {
      const key = w.author.accountId;
      if (!userMap.has(key)) {
        userMap.set(key, { name: w.author.displayName, worklogs: [] });
      }
      userMap.get(key)!.worklogs.push(w);
    }

    return Array.from(userMap.entries()).map(([accountId, data]) => {
      const timeSpent = this.sumTimeSpent(data.worklogs);
      const billableTime = this.sumTimeSpent(data.worklogs.filter(w => w.isBillable));
      
      return {
        accountId,
        displayName: data.name,
        totalHours: timeSpent.toHours,
        billableHours: billableTime.toHours,
        worklogCount: data.worklogs.length,
        issueCount: new Set(data.worklogs.map(w => w.issueKey)).size
      };
    }).sort((a, b) => b.totalHours - a.totalHours);
  }

  private groupByProject(worklogs: Worklog[]): ProjectMetrics[] {
    const projectMap = new Map<string, Worklog[]>();
    
    for (const w of worklogs) {
      const key = w.projectKey;
      if (!projectMap.has(key)) {
        projectMap.set(key, []);
      }
      projectMap.get(key)!.push(w);
    }

    return Array.from(projectMap.entries()).map(([projectKey, projectWorklogs]) => {
      const timeSpent = this.sumTimeSpent(projectWorklogs);
      
      return {
        projectKey,
        totalHours: timeSpent.toHours,
        worklogCount: projectWorklogs.length,
        issueCount: new Set(projectWorklogs.map(w => w.issueKey)).size,
        userCount: new Set(projectWorklogs.map(w => w.author.accountId)).size
      };
    }).sort((a, b) => b.totalHours - a.totalHours);
  }

  private groupByDay(worklogs: Worklog[]): DayMetrics[] {
    const dayMap = new Map<string, Worklog[]>();
    
    for (const w of worklogs) {
      const day = w.workDate;
      if (!dayMap.has(day)) {
        dayMap.set(day, []);
      }
      dayMap.get(day)!.push(w);
    }

    return Array.from(dayMap.entries())
      .map(([date, dayWorklogs]) => ({
        date,
        totalHours: this.sumTimeSpent(dayWorklogs).toHours,
        worklogCount: dayWorklogs.length,
        userCount: new Set(dayWorklogs.map(w => w.author.accountId)).size
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private groupByIssueType(worklogs: Worklog[]): IssueTypeMetrics[] {
    const typeMap = new Map<string, Worklog[]>();
    
    for (const w of worklogs) {
      const type = w.issueType || 'Unknown';
      if (!typeMap.has(type)) {
        typeMap.set(type, []);
      }
      typeMap.get(type)!.push(w);
    }

    return Array.from(typeMap.entries()).map(([issueType, typeWorklogs]) => ({
      issueType,
      totalHours: this.sumTimeSpent(typeWorklogs).toHours,
      worklogCount: typeWorklogs.length,
      issueCount: new Set(typeWorklogs.map(w => w.issueKey)).size
    })).sort((a, b) => b.totalHours - a.totalHours);
  }
}

// Types for metrics
export interface WorklogMetrics {
  totalTimeSpent: TimeSpent;
  totalTimeSpentHours: number;
  billableHours: number;
  nonBillableHours: number;
  worklogCount: number;
  uniqueUsers: number;
  uniqueIssues: number;
  uniqueProjects: number;
  averageTimePerWorklog: TimeSpent;
  byUser: UserMetrics[];
  byProject: ProjectMetrics[];
  byDay: DayMetrics[];
  byIssueType: IssueTypeMetrics[];
}

export interface UserMetrics {
  accountId: string;
  displayName: string;
  totalHours: number;
  billableHours: number;
  worklogCount: number;
  issueCount: number;
}

export interface ProjectMetrics {
  projectKey: string;
  totalHours: number;
  worklogCount: number;
  issueCount: number;
  userCount: number;
}

export interface DayMetrics {
  date: string;
  totalHours: number;
  worklogCount: number;
  userCount: number;
}

export interface IssueTypeMetrics {
  issueType: string;
  totalHours: number;
  worklogCount: number;
  issueCount: number;
}

