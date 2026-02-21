import { container } from '../../infrastructure/Container';
import { DateRange } from '../../domain/worklog/value-objects/DateRange';
import { Worklog } from '../../domain/worklog/entities/Worklog';
import { SprintIssue } from '../../domain/sprint/entities/SprintIssue';
import { WorklogMetrics } from '../../domain/kpi/services/WorklogMetricsCalculator';
import { SprintMetrics } from '../../domain/kpi/services/SprintMetricsCalculator';
import { logger } from '../../utils/logger';

/**
 * Application Service for Worklogs
 * Provides a simplified API compatible with existing routes
 * Orchestrates domain services and repositories
 */
export class WorklogApplicationService {

  /**
   * Search worklogs with filters - compatible with existing API
   */
  async searchWorklogs(params: {
    from?: string;
    to?: string;
    projectKey?: string;
    issueKey?: string;
    accountId?: string;
    teamName?: string;
    openSprints?: boolean;
  }): Promise<Worklog[]> {
    const repo = container().worklogRepository;
    return repo.search(params);
  }

  /**
   * Calculate metrics from worklogs
   */
  calculateMetrics(worklogs: Worklog[]): LegacyWorklogMetrics {
    const calculator = container().worklogMetricsCalculator;
    const metrics = calculator.calculate(worklogs);
    
    // Convert to legacy format for backward compatibility
    return {
      totalTimeSpentHours: metrics.totalTimeSpentHours,
      billableHours: metrics.billableHours,
      worklogCount: metrics.worklogCount,
      uniqueUsers: metrics.uniqueUsers,
      uniqueIssues: metrics.uniqueIssues,
      byUser: metrics.byUser,
      byProject: metrics.byProject,
      byDay: metrics.byDay
    };
  }

  /**
   * Get worklogs for a specific issue
   */
  async getWorklogsForIssue(issueKey: string): Promise<Worklog[]> {
    const repo = container().worklogRepository;
    return repo.findByIssue(issueKey);
  }

  /**
   * Get worklogs for a user within a date range
   */
  async getWorklogsForUser(accountId: string, from: string, to: string): Promise<Worklog[]> {
    const repo = container().worklogRepository;
    const range = DateRange.create(from, to);
    return repo.findByUser(accountId, range);
  }

  /**
   * Get worklogs for a project within a date range
   */
  async getWorklogsForProject(projectKey: string, from: string, to: string): Promise<Worklog[]> {
    const repo = container().worklogRepository;
    const range = DateRange.create(from, to);
    return repo.findByProject(projectKey, range);
  }

  /**
   * Get sprint issues for a project (for SprintDashboard)
   */
  async getSprintIssuesForProject(projectKey: string): Promise<SprintIssuesResult> {
    const sprintRepo = container().sprintRepository;
    const calculator = container().sprintMetricsCalculator;

    // Fetch sprint issues and backlog in parallel for better performance
    const [issues, backlogIssues] = await Promise.all([
      sprintRepo.findOpenSprintIssues(projectKey),
      sprintRepo.findBacklogIssues(projectKey)
    ]);
    const metrics = calculator.calculate(issues);

    return {
      issues: issues.map(i => ({
        issueKey: i.issueKey,
        summary: i.summary,
        issueType: i.issueType,
        status: i.status,
        statusCategory: i.statusCategory,
        statusCategoryKey: i.statusCategoryKey,
        storyPoints: i.storyPoints,
        originalEstimateSeconds: i.originalEstimate?.toSeconds ?? null
      })),
      statusCounts: metrics.statusCounts,
      storyPointsByStatus: metrics.storyPointsByStatus,
      totalStoryPoints: metrics.totalStoryPoints,
      backlog: {
        ticketCount: backlogIssues.length,
        storyPoints: backlogIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0)
      }
    };
  }

  /**
   * Get velocity history for a project (for VelocityChart)
   */
  async getVelocityHistory(projectKey: string, sprintCount: number = 10): Promise<VelocityHistoryResult> {
    const useCase = container().getVelocityHistoryUseCase;
    const result = await useCase.execute(projectKey, sprintCount);
    
    return {
      sprints: result.sprints,
      averageVelocity: result.averageVelocity,
      trend: result.trend
    };
  }

  /**
   * Get support board KPI (for SupportDashboard)
   * Fetches issues from Support project and calculates ponderation-based metrics
   */
  async getSupportBoardKPI(from?: string, to?: string, activeSprint: boolean = true): Promise<SupportKPIResult> {
    const jiraClient = container().jiraClient;
    const ponderationField = process.env.JIRA_PONDERATION_FIELD || 'customfield_10535';
    const teamField = process.env.JIRA_TEAM_FIELD || 'customfield_10001';
    const beginDateField = process.env.JIRA_BEGIN_DATE_FIELD || 'customfield_10537';
    const endDateField = process.env.JIRA_END_DATE_FIELD || 'customfield_10538';
    const supportProjectKey = process.env.JIRA_SUPPORT_PROJECT_KEY || 'SB';
    
    // Build JQL query
    let jql: string;
    if (activeSprint) {
      jql = `project = "${supportProjectKey}" AND Sprint in openSprints()`;
    } else if (from && to) {
      jql = `project = "${supportProjectKey}" AND created >= "${from}" AND created <= "${to}"`;
    } else {
      jql = `project = "${supportProjectKey}" AND Sprint in openSprints()`;
    }
    
    const fields = `key,summary,issuetype,status,created,resolutiondate,assignee,labels,${ponderationField},${teamField},${beginDateField},${endDateField}`;
    
    logger.info(`Fetching ${supportProjectKey} issues with JQL: ${jql}`);
    
    const response = await jiraClient.searchIssuesWithPagination(jql, fields);
    const issues = response.issues;
    
    logger.info(`Found ${issues.length} ${supportProjectKey} issues`);
    
    // Also fetch backlog issues (outside of sprints)
    const backlogJql = `project = "${supportProjectKey}" AND Sprint is EMPTY AND statusCategory != Done ORDER BY created DESC`;
    const backlogResponse = await jiraClient.searchIssuesWithPagination(backlogJql, fields);
    const backlogIssues = backlogResponse.issues;
    
    // Transform issues to SupportIssue format
    const supportIssues: SupportIssue[] = issues.map(issue => {
      const fields = issue.fields as Record<string, any>;
      const status = fields.status as { name: string; statusCategory?: { key: string } } | undefined;
      const assignee = fields.assignee as { displayName: string } | null;
      const issueType = fields.issuetype as { name: string } | undefined;
      
      return {
        issueKey: issue.key,
        summary: (fields.summary as string) || '',
        issueType: issueType?.name || 'Unknown',
        status: status?.name || 'Unknown',
        statusCategory: status?.statusCategory?.key || 'undefined',
        ponderation: (fields[ponderationField] as number) || null,
        assignee: assignee?.displayName || null,
        created: (fields.created as string) || '',
        resolved: (fields.resolutiondate as string) || null,
        labels: (fields.labels as string[]) || [],
        team: (fields[teamField] as { name?: string })?.name || null,
        beginDate: (fields[beginDateField] as string) || null,
        endDate: (fields[endDateField] as string) || null
      };
    });
    
    // Calculate status counts
    const statusCounts = {
      total: supportIssues.length,
      todo: supportIssues.filter(i => i.statusCategory === 'new' || i.status.toLowerCase().includes('à faire') || i.status.toLowerCase().includes('todo')).length,
      inProgress: supportIssues.filter(i => i.statusCategory === 'indeterminate' || i.status.toLowerCase().includes('en cours') || i.status.toLowerCase().includes('progress')).length,
      qa: supportIssues.filter(i => i.status.toLowerCase().includes('qa') || i.status.toLowerCase().includes('test') || i.status.toLowerCase().includes('recette')).length,
      resolved: supportIssues.filter(i => i.statusCategory === 'done' || i.status.toLowerCase().includes('terminé') || i.status.toLowerCase().includes('done') || i.status.toLowerCase().includes('résolu')).length
    };
    
    // Calculate ponderation by status
    const ponderationByStatus = {
      total: supportIssues.reduce((sum, i) => sum + (i.ponderation || 0), 0),
      todo: supportIssues.filter(i => i.statusCategory === 'new' || i.status.toLowerCase().includes('à faire')).reduce((sum, i) => sum + (i.ponderation || 0), 0),
      inProgress: supportIssues.filter(i => i.statusCategory === 'indeterminate' || i.status.toLowerCase().includes('en cours')).reduce((sum, i) => sum + (i.ponderation || 0), 0),
      qa: supportIssues.filter(i => i.status.toLowerCase().includes('qa') || i.status.toLowerCase().includes('test')).reduce((sum, i) => sum + (i.ponderation || 0), 0),
      resolved: supportIssues.filter(i => i.statusCategory === 'done').reduce((sum, i) => sum + (i.ponderation || 0), 0)
    };
    
    // Calculate ponderation by issue type
    const ponderationByType: Record<string, number> = {};
    supportIssues.forEach(issue => {
      const type = issue.issueType;
      ponderationByType[type] = (ponderationByType[type] || 0) + (issue.ponderation || 0);
    });
    
    // Calculate ponderation by assignee
    const assigneeMap = new Map<string, { ponderation: number; ticketCount: number }>();
    supportIssues.forEach(issue => {
      const assignee = issue.assignee || 'Non assigné';
      const current = assigneeMap.get(assignee) || { ponderation: 0, ticketCount: 0 };
      current.ponderation += issue.ponderation || 0;
      current.ticketCount++;
      assigneeMap.set(assignee, current);
    });
    const ponderationByAssignee = Array.from(assigneeMap.entries())
      .map(([assignee, stats]) => ({ assignee, ...stats }))
      .sort((a, b) => b.ponderation - a.ponderation);
    
    // Calculate ponderation by level
    const ponderationByLevel = {
      low: { count: 0, total: 0 },      // 1-11
      medium: { count: 0, total: 0 },   // 12-15
      high: { count: 0, total: 0 },     // 16-20
      veryHigh: { count: 0, total: 0 }  // 21+
    };
    supportIssues.forEach(issue => {
      const pond = issue.ponderation || 0;
      if (pond >= 21) {
        ponderationByLevel.veryHigh.count++;
        ponderationByLevel.veryHigh.total += pond;
      } else if (pond >= 16) {
        ponderationByLevel.high.count++;
        ponderationByLevel.high.total += pond;
      } else if (pond >= 12) {
        ponderationByLevel.medium.count++;
        ponderationByLevel.medium.total += pond;
      } else if (pond >= 1) {
        ponderationByLevel.low.count++;
        ponderationByLevel.low.total += pond;
      }
    });
    
    // Calculate ponderation by label
    const labelMap = new Map<string, { ponderation: number; ticketCount: number }>();
    supportIssues.forEach(issue => {
      (issue.labels || []).forEach(label => {
        const current = labelMap.get(label) || { ponderation: 0, ticketCount: 0 };
        current.ponderation += issue.ponderation || 0;
        current.ticketCount++;
        labelMap.set(label, current);
      });
    });
    const ponderationByLabel = Array.from(labelMap.entries())
      .map(([label, stats]) => ({ label, ...stats }))
      .sort((a, b) => b.ponderation - a.ponderation);
    
    // Calculate ponderation by team
    const teamMap = new Map<string, { ponderation: number; ticketCount: number }>();
    supportIssues.forEach(issue => {
      const team = issue.team || 'Sans équipe';
      const current = teamMap.get(team) || { ponderation: 0, ticketCount: 0 };
      current.ponderation += issue.ponderation || 0;
      current.ticketCount++;
      teamMap.set(team, current);
    });
    const ponderationByTeam = Array.from(teamMap.entries())
      .map(([team, stats]) => ({ team, ...stats }))
      .sort((a, b) => b.ponderation - a.ponderation);
    
    // Helper function to calculate working days between two dates (excluding weekends)
    const calculateWorkingDays = (startDate: Date, endDate: Date): number => {
      let workingDays = 0;
      const current = new Date(startDate);
      current.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(0, 0, 0, 0);
      
      while (current <= end) {
        const dayOfWeek = current.getDay();
        // 0 = Sunday, 6 = Saturday - skip weekends
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          workingDays++;
        }
        current.setDate(current.getDate() + 1);
      }
      return workingDays;
    };
    
    // Calculate time metrics - ONLY tickets in "done" status with beginDate AND endDate
    const resolvedIssues = supportIssues.filter(i => 
      i.beginDate && 
      i.endDate &&
      i.statusCategory === 'done'
    );
    
    logger.info(`Resolution time: ${resolvedIssues.length} tickets in done status with beginDate AND endDate`);
    let totalWorkingDays = 0;
    let highPondFastCount = 0;
    let highPondTotal = 0;
    let veryHighPondFastCount = 0;
    let veryHighPondTotal = 0;
    
    // Build resolution details for each ticket
    const resolutionDetails: Array<{
      issueKey: string;
      summary: string;
      beginDate: string;
      endDate: string;
      workingDays: number;
      ponderation: number | null;
    }> = [];
    
    resolvedIssues.forEach(issue => {
      const beginDate = new Date(issue.beginDate!);
      const endDate = new Date(issue.endDate!);
      const workingDays = calculateWorkingDays(beginDate, endDate);
      totalWorkingDays += workingDays;
      
      resolutionDetails.push({
        issueKey: issue.issueKey,
        summary: issue.summary,
        beginDate: issue.beginDate!,
        endDate: issue.endDate!,
        workingDays,
        ponderation: issue.ponderation
      });
      
      logger.debug(`${issue.issueKey}: ${issue.beginDate} -> ${issue.endDate} = ${workingDays} working days`);
      
      const pond = issue.ponderation || 0;
      const resolutionHours = workingDays * 8; // Convert working days to hours for threshold comparison
      
      // High ponderation (16-20) resolved in < 72h (9 working days)
      if (pond >= 16 && pond <= 20) {
        highPondTotal++;
        if (resolutionHours < 72) highPondFastCount++;
      }
      // Very high ponderation (21+) resolved in < 24h (3 working days)
      if (pond >= 21) {
        veryHighPondTotal++;
        if (resolutionHours < 24) veryHighPondFastCount++;
      }
    });
    
    // Sort by workingDays descending (longest first)
    resolutionDetails.sort((a, b) => b.workingDays - a.workingDays);
    
    const avgWorkingDays = resolvedIssues.length > 0 
      ? totalWorkingDays / resolvedIssues.length 
      : 0;
    
    // Convert to hours for backward compatibility (8h per working day)
    const avgResolutionTimeFromDatesHours = avgWorkingDays * 8;
    
    logger.info(`Average resolution time: ${avgWorkingDays.toFixed(1)} working days (${avgResolutionTimeFromDatesHours.toFixed(1)}h) over ${resolvedIssues.length} tickets`);
    
    // Calculate first response time: difference between created and beginDate (in working days)
    // Only for tickets that have both created and beginDate
    const issuesWithFirstResponse = supportIssues.filter(i => 
      i.created && 
      i.beginDate
    );
    
    let totalFirstResponseWorkingDays = 0;
    issuesWithFirstResponse.forEach(issue => {
      const created = new Date(issue.created);
      const beginDate = new Date(issue.beginDate!);
      const workingDays = calculateWorkingDays(created, beginDate);
      totalFirstResponseWorkingDays += workingDays;
    });
    
    const avgFirstResponseWorkingDays = issuesWithFirstResponse.length > 0 
      ? totalFirstResponseWorkingDays / issuesWithFirstResponse.length 
      : 0;
    
    // Convert to hours (8h per working day)
    const avgFirstResponseTimeHours = avgFirstResponseWorkingDays * 8;
    
    logger.info(`Average first response time: ${avgFirstResponseWorkingDays.toFixed(1)} working days (${avgFirstResponseTimeHours.toFixed(1)}h) over ${issuesWithFirstResponse.length} tickets`);
    
    // Backlog stats
    const backlogStats = {
      ticketCount: backlogIssues.length,
      totalPonderation: backlogIssues.reduce((sum, issue) => {
        const fields = issue.fields as Record<string, any>;
        return sum + ((fields[ponderationField] as number) || 0);
      }, 0)
    };
    
    return {
      issues: supportIssues,
      statusCounts,
      ponderationByStatus,
      ponderationByType,
      ponderationByAssignee,
      ponderationByLevel,
      ponderationByLabel,
      ponderationByTeam,
      backlog: backlogStats,
      avgResolutionTimeHours: avgResolutionTimeFromDatesHours, // legacy
      avgFirstResponseTimeHours,
      avgResolutionTimeFromDatesHours,
      highPondFastResolutionPercent: highPondTotal > 0 ? Math.round((highPondFastCount / highPondTotal) * 100) : 0,
      veryHighPondFastResolutionPercent: veryHighPondTotal > 0 ? Math.round((veryHighPondFastCount / veryHighPondTotal) * 100) : 0,
      totalPonderation: ponderationByStatus.total,
      resolutionDetails
    };
  }

  /**
   * Test connection to Jira
   */
  async testConnection(): Promise<{ success: boolean; endpoint?: string; version?: string }> {
    try {
      const jiraClient = container().jiraClient;
      const projects = await jiraClient.getProjects();
      return {
        success: true,
        endpoint: 'Jira Cloud REST API',
        version: '3'
      };
    } catch (error) {
      logger.error('Jira connection test failed:', error);
      return { success: false };
    }
  }

  /**
   * Get time tracking configuration (hours per day, days per week)
   */
  async getTimeTrackingConfig(): Promise<{ workingHoursPerDay: number; workingDaysPerWeek: number }> {
    const jiraClient = container().jiraClient;
    return jiraClient.getTimeTrackingConfig();
  }

  /**
   * Get configured projects
   */
  async getConfiguredProjects(): Promise<string[]> {
    try {
      const jiraClient = container().jiraClient;
      return jiraClient.configuredProjectKeys;
    } catch (error) {
      logger.warn('Could not get configured projects - Jira not configured');
      return [];
    }
  }

  /**
   * Get configured boards with their details
   */
  async getConfiguredBoards(): Promise<Array<{ id: number; name: string; projectKey: string | null }>> {
    try {
      const jiraClient = container().jiraClient;
      const boardIds = jiraClient.configuredBoardIds;
      
      logger.info(`Configured board IDs from .env: [${boardIds.join(', ')}]`);
      
      const boards: Array<{ id: number; name: string; projectKey: string | null }> = [];
      
      for (const boardId of boardIds) {
        const board = await jiraClient.getBoard(boardId);
        if (board) {
          logger.info(`Board ${boardId}: "${board.name}" (Project: ${board.location?.projectKey || 'N/A'})`);
          boards.push({
            id: board.id,
            name: board.name,
            projectKey: board.location?.projectKey || null
          });
        } else {
          logger.warn(`Board ${boardId} not found or access denied`);
          // Fallback: board exists but couldn't be fetched with details
          boards.push({
            id: boardId,
            name: `Board ${boardId}`,
            projectKey: null
          });
        }
      }
      
      logger.info(`Total configured boards: ${boards.length}`);
      return boards;
    } catch (error) {
      logger.warn('Could not get configured boards - Jira not configured');
      return [];
    }
  }

  /**
   * Get active (or last closed) sprint date range for the first configured board.
   * Used when resolved-by-day is called with activeSprint=true to align with the page context.
   */
  async getActiveSprintDateRange(): Promise<{ from: string; to: string } | null> {
    const boards = await this.getConfiguredBoards();
    if (boards.length === 0) return null;
    const jiraClient = container().jiraClient;
    const boardId = boards[0].id;
    let sprints = await jiraClient.getBoardSprints(boardId, 'active');
    if (sprints.length === 0) {
      const closed = await jiraClient.getBoardSprints(boardId, 'closed');
      const withEnd = closed.filter((s: { endDate?: string }) => s.endDate).sort(
        (a: { endDate?: string }, b: { endDate?: string }) => new Date(b.endDate!).getTime() - new Date(a.endDate!).getTime()
      );
      if (withEnd.length > 0) sprints = [withEnd[0]];
    }
    const sprint = sprints[0] as { startDate?: string; endDate?: string } | undefined;
    if (!sprint?.startDate || !sprint?.endDate) return null;
    const from = sprint.startDate.split('T')[0];
    const to = sprint.endDate.split('T')[0];
    return { from, to };
  }

  /**
   * Get resolved tickets count per day per board (for ResolvedByDayChart).
   * Uses each board's filter (not project) so each team has distinct counts.
   * issueType: 'all' = all resolved issues, 'Story' = User Stories only.
   */
  async getResolvedByDay(
    from: string,
    to: string,
    issueType: 'all' | 'Story' = 'all'
  ): Promise<{ byDay: Array<Record<string, string | number>>; boards: Array<{ id: number; name: string; color?: string }> }> {
    const jiraClient = container().jiraClient;
    const boards = await this.getConfiguredBoards();
    if (boards.length === 0) {
      return { byDay: [], boards: [] };
    }

    const FALLBACK_COLORS = ['#8b5cf6', '#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#ec4899'];
    const OTHER_BOARD_ID = 0;
    const boardsWithColor = boards.map((b, i) => ({
      id: b.id,
      name: b.name,
      color: FALLBACK_COLORS[i % FALLBACK_COLORS.length]
    }));
    boardsWithColor.push({ id: OTHER_BOARD_ID, name: 'Autres', color: '#6b7280' });

    const dateCountByBoard: Record<string, Record<number, number>> = {};
    const allDates = new Set<string>();
    for (let d = new Date(from); d <= new Date(to); d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      allDates.add(dateStr);
      dateCountByBoard[dateStr] = {};
      boardsWithColor.forEach((b) => { dateCountByBoard[dateStr][b.id] = 0; });
    }

    // Tickets "résolus" : résolution par nom (JIRA_RESOLUTION_NAME), par ID (JIRA_RESOLUTION_ID), ou par statut (JIRA_RESOLVED_STATUS)
    const resolutionNameRaw = process.env.JIRA_RESOLUTION_NAME?.trim();
    const resolutionNames = resolutionNameRaw
      ? resolutionNameRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const resolutionId = process.env.JIRA_RESOLUTION_ID?.trim();
    const resolvedStatus = (process.env.JIRA_RESOLVED_STATUS || 'Terminé').trim();
    const storyIssueType = (process.env.JIRA_STORY_ISSUE_TYPE || 'US').trim();
    const storyClause = issueType === 'Story' ? ` AND issuetype = "${storyIssueType}"` : '';

    const resolutionClause =
      resolutionNames.length > 0
        ? `resolution in (${resolutionNames.map((n) => `"${n}"`).join(', ')})`
        : resolutionId
          ? `resolution = ${resolutionId}`
          : null;
    const resolvedAndDateClause =
      resolutionClause !== null
        ? `${resolutionClause} AND resolutiondate >= "${from}" AND resolutiondate <= "${to}"${storyClause}`
        : `status = "${resolvedStatus}" AND updated >= "${from}" AND updated <= "${to}"${storyClause}`;

    const teamField = process.env.JIRA_TEAM_FIELD || 'customfield_10001';
    const fields = `key,updated,resolutiondate,issuetype,${teamField}`;

    /** Strip ORDER BY from filter JQL so we can append our conditions before it (valid JQL) */
    const stripOrderBy = (jql: string): { base: string; orderBy: string } => {
      const orderByIdx = jql.toUpperCase().lastIndexOf(' ORDER BY ');
      if (orderByIdx === -1) return { base: jql.trim(), orderBy: '' };
      return {
        base: jql.substring(0, orderByIdx).trim(),
        orderBy: jql.substring(orderByIdx).trim()
      };
    };

    // Quand on utilise la résolution (nom ou ID) : les filtres board excluent souvent les résolus.
    // On fait une requête par projet et on répartit les comptes sur tous les boards de ce projet.
    const useProjectOnlyForResolved = resolutionNames.length > 0 || Boolean(resolutionId);

    if (useProjectOnlyForResolved) {
      const projectToBoards = new Map<string | null, typeof boards>();
      for (const b of boards) {
        const key = b.projectKey ?? `board_${b.id}`;
        if (!projectToBoards.has(key)) projectToBoards.set(key, []);
        projectToBoards.get(key)!.push(b);
      }
      const boardByName = new Map<string, (typeof boards)[0]>();
      for (const b of boards) {
        boardByName.set(b.name.trim().toLowerCase(), b);
      }
      const getTeamFromIssue = (fieldsData: Record<string, unknown>): string | null => {
        const raw = fieldsData[teamField];
        if (raw == null) return null;
        if (typeof raw === 'string') return raw.trim() || null;
        const obj = raw as { name?: string; value?: string };
        return (obj.name ?? obj.value ?? '').toString().trim() || null;
      };
      for (const [projectKey, boardList] of projectToBoards) {
        if (!projectKey || projectKey.startsWith('board_')) continue;
        const projectJql = `project = "${projectKey}" AND ${resolvedAndDateClause}`;
        try {
          const resolutionLabel = resolutionNames.length > 0 ? `resolution in (${resolutionNames.join(',')})` : `resolution=${resolutionId}`;
          logger.info(`getResolvedByDay: ${resolutionLabel} → query by project "${projectKey}", dispatch by Team field (${teamField})`);
          const response = await jiraClient.searchIssuesWithPagination(projectJql, fields, 100);
          for (const issue of response.issues) {
            const fieldsData = issue.fields as Record<string, unknown>;
            const resolutiondate = fieldsData.resolutiondate as string | undefined;
            const updated = fieldsData.updated as string | undefined;
            const dateStr = (resolutiondate || updated || '').split('T')[0];
            if (!dateStr || !dateCountByBoard[dateStr]) continue;
            const teamName = getTeamFromIssue(fieldsData);
            const board = teamName ? boardByName.get(teamName.trim().toLowerCase()) : null;
            if (board) {
              dateCountByBoard[dateStr][board.id] = (dateCountByBoard[dateStr][board.id] || 0) + 1;
            } else {
              dateCountByBoard[dateStr][OTHER_BOARD_ID] = (dateCountByBoard[dateStr][OTHER_BOARD_ID] || 0) + 1;
            }
          }
          logger.info(`getResolvedByDay: project "${projectKey}" → ${response.issues.length} issues (total ${response.total})`);
        } catch (err) {
          logger.warn(`getResolvedByDay: project "${projectKey}" failed: ${err}`);
        }
      }
    } else {
      for (const board of boards) {
        let jql: string | null = null;

        const config = await jiraClient.getBoardConfiguration(board.id);
        if (config?.filter?.id) {
          const rawFilterJql = await jiraClient.getFilterJql(config.filter.id);
          if (rawFilterJql && rawFilterJql.trim()) {
            const { base, orderBy } = stripOrderBy(rawFilterJql);
            jql = base ? `(${base}) AND ${resolvedAndDateClause}${orderBy ? ' ' + orderBy : ''}` : null;
            if (jql) logger.info(`getResolvedByDay: board ${board.id} using filter ${config.filter.id} (status="${resolvedStatus}")`);
          }
        }

        if (!jql && board.projectKey) {
          jql = `project = "${board.projectKey}" AND ${resolvedAndDateClause}`;
          logger.info(`getResolvedByDay: board ${board.id} fallback to project ${board.projectKey}`);
        }

        if (!jql) {
          logger.warn(`getResolvedByDay: board ${board.id} skipped (no filter and no projectKey)`);
          continue;
        }

        const runSearch = async (searchJql: string) => {
          const response = await jiraClient.searchIssuesWithPagination(searchJql, fields, 100);
          for (const issue of response.issues) {
            const fieldsData = issue.fields as Record<string, unknown>;
            const resolutiondate = fieldsData.resolutiondate as string | undefined;
            const updated = fieldsData.updated as string | undefined;
            const dateStr = (resolutiondate || updated || '').split('T')[0];
            if (dateStr && dateCountByBoard[dateStr] !== undefined) {
              dateCountByBoard[dateStr][board.id] = (dateCountByBoard[dateStr][board.id] || 0) + 1;
            }
          }
          return response.total;
        };

        try {
          const total = await runSearch(jql);
          if (total === 0 && board.projectKey) {
            const fallbackJql = `project = "${board.projectKey}" AND ${resolvedAndDateClause}`;
            logger.info(`getResolvedByDay: board ${board.id} filter returned 0, trying project-only`);
            await runSearch(fallbackJql);
          }
        } catch (err) {
          logger.warn(`getResolvedByDay: failed for board ${board.id}: ${err}. JQL: ${jql?.substring(0, 200)}`);
          if (board.projectKey) {
            try {
              await runSearch(`project = "${board.projectKey}" AND ${resolvedAndDateClause}`);
              logger.info(`getResolvedByDay: board ${board.id} used project fallback`);
            } catch (fallbackErr) {
              logger.warn(`getResolvedByDay: fallback failed for board ${board.id}: ${fallbackErr}`);
            }
          }
        }
      }
    }

    const sortedDates = Array.from(allDates).sort();
    const byDay: Array<Record<string, string | number>> = sortedDates.map((date) => {
      const row: Record<string, string | number> = { date };
      boardsWithColor.forEach((b) => { row[`board_${b.id}`] = dateCountByBoard[date][b.id] ?? 0; });
      return row;
    });

    return { byDay, boards: boardsWithColor };
  }

  /**
   * Get sprint issues for a specific board (for SprintDashboard by board).
   * Optional from/to: when provided, fetch issues updated in that date range (board filter or project).
   */
  async getSprintIssuesForBoard(boardId: number, from?: string, to?: string): Promise<SprintIssuesResult> {
    if (from && to) {
      return this.getSprintIssuesForBoardByDateRange(boardId, from, to);
    }
    return this.getSprintIssuesForBoardActiveOrLastClosed(boardId);
  }

  /**
   * Get issues for a board in a date range (board filter JQL + updated in range)
   */
  private async getSprintIssuesForBoardByDateRange(boardId: number, from: string, to: string): Promise<SprintIssuesResult> {
    const calculator = container().sprintMetricsCalculator;
    const jiraClient = container().jiraClient;
    const storyPointsField = process.env.JIRA_STORY_POINTS_FIELD || 'customfield_10535';
    const storyPointEstimateField = process.env.JIRA_STORY_POINT_ESTIMATE_FIELD || 'customfield_10016';
    const fields = `key,summary,issuetype,status,timeoriginalestimate,${storyPointsField},${storyPointEstimateField}`;

    let jql: string | null = null;
    const config = await jiraClient.getBoardConfiguration(boardId);
    if (config?.filter?.id) {
      const filterJql = await jiraClient.getFilterJql(config.filter.id);
      if (filterJql?.trim()) {
        jql = `(${filterJql.trim()}) AND updated >= "${from}" AND updated <= "${to}"`;
      }
    }
    const board = await jiraClient.getBoard(boardId);
    if (!jql && board?.location?.projectKey) {
      jql = `project = "${board.location.projectKey}" AND updated >= "${from}" AND updated <= "${to}"`;
    }
    if (!jql) {
      logger.warn(`[Board ${boardId}] No filter/project for date range`);
      return this.emptySprintIssuesResult();
    }

    try {
      const response = await jiraClient.searchIssuesWithPagination(jql, fields, 100);
      const allIssues = response.issues;
      const sprintIssues = allIssues.map((issue: any) => {
        const fieldsData = issue.fields as Record<string, any>;
        const status = fieldsData.status as { name?: string; statusCategory?: { key?: string; name?: string } } | undefined;
        const issueType = fieldsData.issuetype as { name?: string } | undefined;
        const storyPoints = (fieldsData[storyPointsField] as number) || (fieldsData[storyPointEstimateField] as number) || null;
        const statusName = (status?.name ?? (typeof status === 'string' ? status : '')) || 'Unknown';
        const { category, categoryKey } = this.normalizeJiraStatus(statusName, status?.statusCategory);
        return SprintIssue.create({
          issueKey: issue.key,
          summary: (fieldsData.summary as string) || '',
          issueType: issueType?.name || 'Unknown',
          status: statusName,
          statusCategory: category,
          statusCategoryKey: categoryKey,
          storyPoints,
          originalEstimateSeconds: fieldsData.timeoriginalestimate || null
        });
      });
      const metrics = calculator.calculate(sprintIssues);
      const totalTimeSeconds = 0; // not computed for date-range view
      return {
        issues: sprintIssues.map(i => ({
          issueKey: i.issueKey,
          summary: i.summary,
          issueType: i.issueType,
          status: i.status,
          statusCategory: i.statusCategory,
          statusCategoryKey: i.statusCategoryKey,
          storyPoints: i.storyPoints,
          originalEstimateSeconds: i.originalEstimate?.toSeconds ?? null
        })),
        statusCounts: metrics.statusCounts,
        storyPointsByStatus: metrics.storyPointsByStatus,
        totalStoryPoints: metrics.totalStoryPoints,
        totalTimeSeconds,
        backlog: { ticketCount: 0, storyPoints: 0 }
      };
    } catch (err) {
      logger.warn(`[Board ${boardId}] getSprintIssuesForBoardByDateRange failed: ${err}`);
      return this.emptySprintIssuesResult();
    }
  }

  private emptySprintIssuesResult(): SprintIssuesResult {
    return {
      issues: [],
      statusCounts: { total: 0, todo: 0, inProgress: 0, qa: 0, resolved: 0 },
      storyPointsByStatus: { total: 0, todo: 0, inProgress: 0, qa: 0, resolved: 0 },
      totalStoryPoints: 0,
      backlog: { ticketCount: 0, storyPoints: 0 }
    };
  }

  /** Normalize Jira status to our StatusCategory/Key (handles missing or custom Jira values) */
  private normalizeJiraStatus(
    statusName: string,
    statusCategory?: { key?: string; name?: string }
  ): { category: 'To Do' | 'In Progress' | 'Done' | 'Unknown'; categoryKey: 'new' | 'indeterminate' | 'done' | 'undefined' } {
    const key = (statusCategory?.key ?? '').toLowerCase();
    const name = (statusCategory?.name ?? '').toLowerCase();
    const s = (statusName ?? '').toLowerCase();
    if (key === 'done' || name === 'done' || ['done', 'résolu', 'resolved', 'closed', 'complete', 'terminé', 'livré'].some(k => s.includes(k))) {
      return { category: 'Done', categoryKey: 'done' };
    }
    if (key === 'indeterminate' || name === 'in progress' || ['in progress', 'en cours', 'wip'].some(k => s.includes(k))) {
      return { category: 'In Progress', categoryKey: 'indeterminate' };
    }
    if (key === 'new' || name === 'to do' || ['to do', 'à faire', 'open', 'backlog', 'nouveau'].some(k => s.includes(k))) {
      return { category: 'To Do', categoryKey: 'new' };
    }
    return { category: 'Unknown', categoryKey: 'undefined' };
  }

  /**
   * Get sprint issues from active sprints, or fallback to last closed sprint if none active
   */
  private async getSprintIssuesForBoardActiveOrLastClosed(boardId: number): Promise<SprintIssuesResult> {
    const sprintRepo = container().sprintRepository;
    const calculator = container().sprintMetricsCalculator;
    const jiraClient = container().jiraClient;

    logger.info(`[Board ${boardId}] Fetching active sprints...`);
    let sprintsToUse = await jiraClient.getBoardSprints(boardId, 'active');

    if (sprintsToUse.length === 0) {
      logger.info(`[Board ${boardId}] No active sprint, trying last closed sprint`);
      const closedSprints = await jiraClient.getBoardSprints(boardId, 'closed');
      const withEndDate = closedSprints.filter((s: { endDate?: string }) => s.endDate).sort(
        (a: { endDate?: string }, b: { endDate?: string }) => new Date(b.endDate!).getTime() - new Date(a.endDate!).getTime()
      );
      if (withEndDate.length > 0) {
        sprintsToUse = [withEndDate[0]];
        logger.info(`[Board ${boardId}] Using last closed sprint: ${sprintsToUse[0].name}`);
      }
    }

    logger.info(`[Board ${boardId}] Found ${sprintsToUse.length} sprint(s): ${sprintsToUse.map((s: { name: string }) => s.name).join(', ')}`);

    if (sprintsToUse.length === 0) {
      logger.warn(`[Board ${boardId}] No active or closed sprints found`);
      return {
        ...this.emptySprintIssuesResult(),
        totalTimeSeconds: 0
      };
    }

    // Get issues from selected sprints (include both story point fields)
    const storyPointsField = process.env.JIRA_STORY_POINTS_FIELD || 'customfield_10535';
    const storyPointEstimateField = process.env.JIRA_STORY_POINT_ESTIMATE_FIELD || 'customfield_10016';
    const fields = `key,summary,issuetype,status,timeoriginalestimate,${storyPointsField},${storyPointEstimateField}`;
    
    const issueMap = new Map<string, any>(); // Deduplicate by issue key
    for (const sprint of sprintsToUse) {
      logger.info(`[Board ${boardId}] Fetching issues for sprint "${sprint.name}" (ID: ${sprint.id}) filtered by board...`);
      let issues = await jiraClient.getBoardSprintIssues(boardId, sprint.id, fields);
      if (issues.length === 0) {
        logger.info(`[Board ${boardId}] Board-filtered returned 0 issues, trying sprint issues without board filter`);
        issues = await jiraClient.getSprintIssues(sprint.id, fields);
        logger.info(`[Board ${boardId}] Sprint "${sprint.name}": ${issues.length} issues (sprint-wide fallback)`);
      } else {
        logger.info(`[Board ${boardId}] Sprint "${sprint.name}": ${issues.length} issues found (board-filtered)`);
      }
      for (const issue of issues) {
        issueMap.set(issue.key, issue);
      }
    }
    
    const allIssues = Array.from(issueMap.values());
    logger.info(`[Board ${boardId}] Total unique issues for this board: ${allIssues.length}`);

    // Map issues to SprintIssue domain objects (normalize status from Jira category or status name)
    const sprintIssues = allIssues.map(issue => {
      const fieldsData = issue.fields as Record<string, any>;
      const status = fieldsData.status as { name?: string; statusCategory?: { key?: string; name?: string } } | undefined;
      const issueType = fieldsData.issuetype as { name?: string } | undefined;
      const statusName = (status?.name ?? (typeof status === 'string' ? status : '')) || 'Unknown';
      const { category, categoryKey } = this.normalizeJiraStatus(statusName, status?.statusCategory);
      const storyPoints = (fieldsData[storyPointsField] as number) || (fieldsData[storyPointEstimateField] as number) || null;
      return SprintIssue.create({
        issueKey: issue.key,
        summary: (fieldsData.summary as string) || '',
        issueType: issueType?.name || 'Unknown',
        status: statusName,
        statusCategory: category,
        statusCategoryKey: categoryKey,
        storyPoints,
        originalEstimateSeconds: fieldsData.timeoriginalestimate || null
      });
    });

    const metrics = calculator.calculate(sprintIssues);

    // Get backlog issues and calculate time spent for this board's issues in parallel
    let backlogIssues: any[] = [];
    let totalTimeSeconds = 0;
    
    const board = await jiraClient.getBoard(boardId);
    const issueKeys = allIssues.map(i => i.key);
    
    // Run backlog fetch and worklog calculation in parallel
    const [backlogResult, worklogResult] = await Promise.all([
      // Fetch backlog
      (async () => {
        try {
          if (board?.location?.projectKey) {
            logger.info(`[Board ${boardId}] Fetching backlog for project ${board.location.projectKey}...`);
            return await sprintRepo.findBacklogIssues(board.location.projectKey);
          }
        } catch (backlogError) {
          logger.warn(`[Board ${boardId}] Failed to fetch backlog: ${backlogError}`);
        }
        return [];
      })(),
      // Calculate time from worklogs for this board's issues only
      (async () => {
        if (issueKeys.length === 0) return 0;
        
        let timeSum = 0;
        // Process in batches to avoid overwhelming the API
        const batchSize = 10;
        for (let i = 0; i < issueKeys.length; i += batchSize) {
          const batch = issueKeys.slice(i, i + batchSize);
          const worklogPromises = batch.map(async (key) => {
            try {
              const worklogs = await jiraClient.getIssueWorklogs(key);
              return worklogs.reduce((sum, w) => sum + (w.timeSpentSeconds || 0), 0);
            } catch {
              return 0;
            }
          });
          const batchResults = await Promise.all(worklogPromises);
          timeSum += batchResults.reduce((a, b) => a + b, 0);
        }
        logger.info(`[Board ${boardId}] Total time from worklogs: ${(timeSum / 3600).toFixed(1)}h`);
        return timeSum;
      })()
    ]);
    
    backlogIssues = backlogResult;
    totalTimeSeconds = worklogResult;
    logger.info(`[Board ${boardId}] Backlog: ${backlogIssues.length} issues`);

    logger.info(`[Board ${boardId}] Returning response with ${sprintIssues.length} sprint issues`);
    
    return {
      issues: sprintIssues.map(i => ({
        issueKey: i.issueKey,
        summary: i.summary,
        issueType: i.issueType,
        status: i.status,
        statusCategory: i.statusCategory,
        statusCategoryKey: i.statusCategoryKey,
        storyPoints: i.storyPoints,
        originalEstimateSeconds: i.originalEstimate?.toSeconds ?? null
      })),
      statusCounts: metrics.statusCounts,
      storyPointsByStatus: metrics.storyPointsByStatus,
      totalStoryPoints: metrics.totalStoryPoints,
      totalTimeSeconds,
      backlog: {
        ticketCount: backlogIssues.length,
        storyPoints: backlogIssues.reduce((sum, issue) => sum + (issue.storyPoints || 0), 0)
      }
    };
  }

  /**
   * Get configured Jira projects
   */
  async getProjects(): Promise<Array<{ key: string; name: string; id: string }>> {
    try {
      const jiraClient = container().jiraClient;
      const projects = await jiraClient.getProjects();
      return projects.map(p => ({
        key: p.key,
        name: p.name,
        id: p.id
      }));
    } catch (error) {
      logger.warn('Could not get projects - Jira not configured');
      return [];
    }
  }

  /**
   * Get ALL Jira projects (ignoring .env configuration)
   */
  async getAllProjects(): Promise<Array<{ key: string; name: string; id: string }>> {
    try {
      const jiraClient = container().jiraClient;
      const projects = await jiraClient.getAllProjects();
      return projects.map(p => ({
        key: p.key,
        name: p.name,
        id: p.id
      }));
    } catch (error) {
      logger.warn('Could not get all projects - Jira not configured');
      return [];
    }
  }

  /**
   * Get progress for Epics/Legends filtered by board
   * @param typeFilter 'epic' | 'legend' | 'all' - filter by issue type
   */
  async getEpicProgressByBoard(boardId: number, typeFilter: string = 'all'): Promise<EpicProgressResult> {
    const jiraClient = container().jiraClient;
    const board = await jiraClient.getBoard(boardId);
    const projectKey = board?.location?.projectKey || null;

    if (!projectKey) {
      logger.warn(`Board ${boardId} has no associated project, cannot fetch epics`);
      return {
        boardId,
        boardName: board?.name || `Board ${boardId}`,
        projectKey: null,
        epicCount: 0,
        epics: []
      };
    }

    // Build issue type filter based on typeFilter parameter
    let issueTypes: string;
    if (typeFilter === 'epic') {
      issueTypes = '"Epic","Épic"';
    } else if (typeFilter === 'legend') {
      issueTypes = '"Legend","Légende"';
    } else {
      issueTypes = '"Epic","Épic","Legend","Légende","Feature","Initiative"';
    }

    // Exclude epics with status category "new" (À faire) - only show "in progress" or "done"
    const epicJql = `project = "${projectKey}" AND issuetype in (${issueTypes}) AND statusCategory in ("In Progress", "Done") ORDER BY key ASC`;
    const epicFields = 'key,summary,issuetype,status';

    logger.info(`Fetching Epics/Legends with JQL: ${epicJql}`);

    const epicResponse = await jiraClient.searchIssuesWithPagination(epicJql, epicFields);
    const epics = epicResponse.issues;
    
    // Log all epic keys with their types for debugging
    logger.info(`Found ${epics.length} epics: ${epics.map(e => {
      const fields = e.fields as Record<string, any>;
      const issueType = (fields?.issuetype as { name?: string })?.name || 'Unknown';
      const statusCat = (fields?.status as { statusCategory?: { key?: string } })?.statusCategory?.key || 'unknown';
      return `${e.key}(${issueType}, ${statusCat})`;
    }).join(', ')}`);
    

    const results: EpicProgressItem[] = [];
    const batchSize = 3;

    for (let i = 0; i < epics.length; i += batchSize) {
      const batch = epics.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(epic => this.fetchEpicProgress(epic))
      );
      results.push(...batchResults);
    }

    return {
      boardId,
      boardName: board?.name || `Board ${boardId}`,
      projectKey,
      epicCount: results.length,
      epics: results
    };
  }

  private async fetchEpicProgress(epic: { key: string; fields: Record<string, any> }): Promise<EpicProgressItem> {
    const epicFields = epic.fields as Record<string, any>;
    const issueType = epicFields?.issuetype as { name?: string } | undefined;
    const issueTypeName = issueType?.name || 'Epic';
    const isLegend = issueTypeName.toLowerCase().includes('legend') || issueTypeName.toLowerCase().includes('légende');

    let originalEstimateSeconds = 0;
    let timeSpentSeconds = 0;
    let childCount = 0;
    let totalStoryPoints = 0;

    if (isLegend) {
      // Legend: children are Epics, need to aggregate US from each Epic
      const { estimate, spent, epicCount, storyPoints } = await this.fetchLegendProgress(epic.key);
      originalEstimateSeconds = estimate;
      timeSpentSeconds = spent;
      childCount = epicCount;
      totalStoryPoints = storyPoints;
    } else {
      // Epic: children are US, aggregate directly
      const { estimate, spent, usCount, storyPoints } = await this.fetchEpicDirectProgress(epic.key);
      originalEstimateSeconds = estimate;
      timeSpentSeconds = spent;
      childCount = usCount;
      totalStoryPoints = storyPoints;
    }

    const status = epicFields?.status as { name?: string; statusCategory?: { key?: string } } | undefined;
    const summary = (epicFields?.summary as string) || '';

    const progressPercent = originalEstimateSeconds > 0
      ? Math.min(100, Math.round((timeSpentSeconds / originalEstimateSeconds) * 100))
      : 0;

    logger.info(`[${issueTypeName} ${epic.key}] ${childCount} ${isLegend ? 'épics' : 'US'}, estimate=${(originalEstimateSeconds/3600).toFixed(1)}h, spent=${(timeSpentSeconds/3600).toFixed(1)}h, storyPoints=${totalStoryPoints}, progress=${progressPercent}%`);

    return {
      epicKey: epic.key,
      summary,
      issueType: issueTypeName,
      status: status?.name || 'Unknown',
      statusCategoryKey: status?.statusCategory?.key || null,
      childIssueCount: childCount,
      originalEstimateSeconds,
      timeSpentSeconds,
      totalStoryPoints,
      progressPercent,
      isOverrun: originalEstimateSeconds > 0 && timeSpentSeconds > originalEstimateSeconds
    };
  }

  /**
   * Fetch progress for a Legend (children are Epics)
   * Aggregates estimates from all Epics and their US/subtasks
   */
  private async fetchLegendProgress(legendKey: string): Promise<{ estimate: number; spent: number; epicCount: number; storyPoints: number }> {
    const jiraClient = container().jiraClient;
    
    // Find all Epics that are children of this Legend
    const epicJql = `parent = "${legendKey}"`;
    const epicResponse = await jiraClient.searchIssuesWithPagination(epicJql, 'key,summary,issuetype');
    const childEpics = epicResponse.issues;

    logger.info(`[Legend ${legendKey}] Found ${childEpics.length} child Epics`);

    let totalEstimate = 0;
    let totalSpent = 0;
    let totalStoryPoints = 0;

    // For each child Epic, get their US and aggregate
    for (const childEpic of childEpics) {
      const { estimate, spent, storyPoints } = await this.fetchEpicDirectProgress(childEpic.key);
      totalEstimate += estimate;
      totalSpent += spent;
      totalStoryPoints += storyPoints;
    }

    return {
      estimate: totalEstimate,
      spent: totalSpent,
      epicCount: childEpics.length,
      storyPoints: totalStoryPoints
    };
  }

  /**
   * Fetch progress for an Epic (children are US/Stories)
   * Aggregates estimates from US and their subtasks
   */
  /**
   * Search Epics/Legends by title (for autocomplete)
   */
  async searchEpicsByTitle(boardId: number, query: string, typeFilter: string = 'all'): Promise<EpicSearchResult> {
    const jiraClient = container().jiraClient;
    const board = await jiraClient.getBoard(boardId);
    const projectKey = board?.location?.projectKey || null;

    if (!projectKey) {
      return {
        boardId,
        query,
        results: []
      };
    }

    // Build issue type filter
    let issueTypes: string;
    if (typeFilter === 'epic') {
      issueTypes = '"Epic","Épic"';
    } else if (typeFilter === 'legend') {
      issueTypes = '"Legend","Légende"';
    } else {
      issueTypes = '"Epic","Épic","Legend","Légende","Feature","Initiative"';
    }

    // Build JQL with text search
    let jql = `project = "${projectKey}" AND issuetype in (${issueTypes})`;
    if (query && query.trim().length > 0) {
      // Search in summary using text search
      jql += ` AND (summary ~ "${query}*" OR key = "${query.toUpperCase()}")`;
    }
    jql += ' ORDER BY updated DESC';

    logger.info(`Epic search JQL: ${jql}`);

    const response = await jiraClient.searchIssuesLimited(jql, 'key,summary,issuetype,status', 20);
    
    const results = response.issues.map(issue => {
      const fields = issue.fields as Record<string, any>;
      const status = fields.status as { name?: string; statusCategory?: { key?: string } } | undefined;
      const issueType = fields.issuetype as { name?: string } | undefined;
      
      return {
        epicKey: issue.key,
        summary: (fields.summary as string) || '',
        issueType: issueType?.name || 'Epic',
        status: status?.name || 'Unknown',
        statusCategoryKey: status?.statusCategory?.key || null
      };
    });

    return {
      boardId,
      query,
      results
    };
  }

  /**
   * Get Epic/Legend details with hierarchical children
   */
  async getEpicDetails(epicKey: string): Promise<EpicDetailsResult> {
    const jiraClient = container().jiraClient;
    
    // Fetch the epic itself
    const epicJql = `key = "${epicKey}"`;
    const epicResponse = await jiraClient.searchIssuesWithPagination(epicJql, 'key,summary,issuetype,status,timeoriginalestimate,timespent,aggregatetimeoriginalestimate,aggregatetimespent');
    
    if (epicResponse.issues.length === 0) {
      throw new Error(`Epic ${epicKey} not found`);
    }

    const epic = epicResponse.issues[0];
    const epicFields = epic.fields as Record<string, any>;
    const issueType = epicFields?.issuetype as { name?: string } | undefined;
    const issueTypeName = issueType?.name || 'Epic';
    const isLegend = issueTypeName.toLowerCase().includes('legend') || issueTypeName.toLowerCase().includes('légende');
    const status = epicFields?.status as { name?: string; statusCategory?: { key?: string } } | undefined;

    let children: EpicChildIssue[] = [];
    let totalEstimate = 0;
    let totalSpent = 0;

    if (isLegend) {
      // Legend: children are Epics, which contain US
      children = await this.fetchLegendChildren(epicKey);
    } else {
      // Epic: children are US/Stories
      children = await this.fetchEpicChildren(epicKey);
    }

    // Calculate totals from children (including story points)
    const calculateTotals = (items: EpicChildIssue[]): { estimate: number; spent: number; storyPoints: number } => {
      let est = 0;
      let sp = 0;
      let pts = 0;
      for (const item of items) {
        est += item.originalEstimateSeconds;
        sp += item.timeSpentSeconds;
        pts += item.storyPoints || 0;
        if (item.children && item.children.length > 0) {
          const childTotals = calculateTotals(item.children);
          est += childTotals.estimate;
          sp += childTotals.spent;
          pts += childTotals.storyPoints;
        }
      }
      return { estimate: est, spent: sp, storyPoints: pts };
    };

    const totals = calculateTotals(children);
    totalEstimate = totals.estimate;
    totalSpent = totals.spent;

    const progressPercent = totalEstimate > 0
      ? Math.min(100, Math.round((totalSpent / totalEstimate) * 100))
      : 0;

    return {
      epicKey: epic.key,
      summary: (epicFields?.summary as string) || '',
      issueType: issueTypeName,
      status: status?.name || 'Unknown',
      statusCategoryKey: status?.statusCategory?.key || null,
      originalEstimateSeconds: totalEstimate,
      timeSpentSeconds: totalSpent,
      totalStoryPoints: totals.storyPoints,
      progressPercent,
      isOverrun: totalEstimate > 0 && totalSpent > totalEstimate,
      children
    };
  }

  /**
   * Fetch children of a Legend (child Epics with their US)
   * Note: Each item stores ONLY its own values from Jira, not aggregated values.
   * The aggregation is done by calculateTotals() recursively.
   */
  private async fetchLegendChildren(legendKey: string): Promise<EpicChildIssue[]> {
    const jiraClient = container().jiraClient;
    const storyPointsField = process.env.JIRA_STORY_POINTS_FIELD || 'customfield_10535';
    const storyPointEstimateField = process.env.JIRA_STORY_POINT_ESTIMATE_FIELD || 'customfield_10016';
    
    // Find child Epics
    const epicJql = `parent = "${legendKey}"`;
    const fields = `key,summary,issuetype,status,timeoriginalestimate,timespent,${storyPointsField},${storyPointEstimateField}`;
    const epicResponse = await jiraClient.searchIssuesWithPagination(epicJql, fields);
    
    const children: EpicChildIssue[] = [];

    for (const childEpic of epicResponse.issues) {
      const epicFields = childEpic.fields as Record<string, any>;
      const status = epicFields?.status as { name?: string; statusCategory?: { key?: string } } | undefined;
      const issueType = epicFields?.issuetype as { name?: string } | undefined;

      // Fetch US children for this Epic
      const usChildren = await this.fetchEpicChildren(childEpic.key);

      // Epic's OWN values from Jira (not aggregated from children)
      // Epics typically don't have their own story points or time estimates - they're on US/subtasks
      const epicOwnEstimate = (epicFields.timeoriginalestimate as number) || 0;
      const epicOwnSpent = (epicFields.timespent as number) || 0;
      const epicOwnStoryPoints = (epicFields[storyPointsField] as number) || (epicFields[storyPointEstimateField] as number) || null;

      children.push({
        issueKey: childEpic.key,
        summary: (epicFields?.summary as string) || '',
        issueType: issueType?.name || 'Epic',
        status: status?.name || 'Unknown',
        statusCategoryKey: status?.statusCategory?.key || null,
        originalEstimateSeconds: epicOwnEstimate,  // Epic's own value (usually 0)
        timeSpentSeconds: epicOwnSpent,             // Epic's own value (usually 0)
        storyPoints: epicOwnStoryPoints,            // Epic's own value (usually null)
        parentKey: legendKey,
        hierarchyLevel: 1,
        children: usChildren
      });
    }

    return children;
  }

  /**
   * Fetch children of an Epic (US/Stories with their subtasks)
   */
  private async fetchEpicChildren(epicKey: string): Promise<EpicChildIssue[]> {
    const jiraClient = container().jiraClient;
    const storyPointsField = process.env.JIRA_STORY_POINTS_FIELD || 'customfield_10535';
    const storyPointEstimateField = process.env.JIRA_STORY_POINT_ESTIMATE_FIELD || 'customfield_10016';
    
    // Get US/Stories that are children of this Epic (include story point fields)
    const childFields = `key,summary,issuetype,status,timeoriginalestimate,timespent,aggregatetimeoriginalestimate,aggregatetimespent,subtasks,parent,${storyPointsField},${storyPointEstimateField}`;
    const childJql = `("Epic Link" = "${epicKey}" OR parent = "${epicKey}")`;

    const childResponse = await jiraClient.searchIssuesWithPagination(childJql, childFields);
    const children: EpicChildIssue[] = [];

    // Collect all subtask keys to fetch in batch
    const subtaskKeyMap = new Map<string, string>(); // subtaskKey -> parentKey
    
    for (const issue of childResponse.issues) {
      const fields = issue.fields as Record<string, any>;
      const subtasks = fields.subtasks as Array<{ key: string }> | undefined;
      if (subtasks) {
        for (const st of subtasks) {
          subtaskKeyMap.set(st.key, issue.key);
        }
      }
    }

    // Fetch subtask details in batch (include story point fields)
    const subtaskDetails = new Map<string, EpicChildIssue>();
    if (subtaskKeyMap.size > 0) {
      const subtaskKeys = Array.from(subtaskKeyMap.keys());
      const batchSize = 50;
      
      for (let i = 0; i < subtaskKeys.length; i += batchSize) {
        const batch = subtaskKeys.slice(i, i + batchSize);
        const subtaskJql = `key in (${batch.map(k => `"${k}"`).join(',')})`;
        const subtaskResponse = await jiraClient.searchIssuesWithPagination(
          subtaskJql, 
          `key,summary,issuetype,status,timeoriginalestimate,timespent,${storyPointsField},${storyPointEstimateField}`
        );
        
        for (const st of subtaskResponse.issues) {
          const stFields = st.fields as Record<string, any>;
          const stStatus = stFields?.status as { name?: string; statusCategory?: { key?: string } } | undefined;
          const stIssueType = stFields?.issuetype as { name?: string } | undefined;
          const parentKey = subtaskKeyMap.get(st.key) || null;
          // Story points: try both fields
          const stStoryPoints = (stFields[storyPointsField] as number) || (stFields[storyPointEstimateField] as number) || null;
          
          subtaskDetails.set(st.key, {
            issueKey: st.key,
            summary: (stFields?.summary as string) || '',
            issueType: stIssueType?.name || 'Sub-task',
            status: stStatus?.name || 'Unknown',
            statusCategoryKey: stStatus?.statusCategory?.key || null,
            originalEstimateSeconds: (stFields.timeoriginalestimate as number) || 0,
            timeSpentSeconds: (stFields.timespent as number) || 0,
            storyPoints: stStoryPoints,
            parentKey,
            hierarchyLevel: 2
          });
        }
      }
    }

    // Build child hierarchy
    // Note: Each item stores ONLY its own values, not aggregated.
    // calculateTotals() will do the recursive aggregation.
    for (const issue of childResponse.issues) {
      const fields = issue.fields as Record<string, any>;
      const status = fields?.status as { name?: string; statusCategory?: { key?: string } } | undefined;
      const issueType = fields?.issuetype as { name?: string } | undefined;
      const subtasks = fields.subtasks as Array<{ key: string }> | undefined;

      // Get subtask children for this issue
      const subtaskChildren: EpicChildIssue[] = [];
      if (subtasks) {
        for (const st of subtasks) {
          const stDetail = subtaskDetails.get(st.key);
          if (stDetail) {
            subtaskChildren.push(stDetail);
          }
        }
      }

      // Use OWN values only (not aggregate) to avoid double counting with subtasks
      // If this issue has subtasks, use its own values; subtasks have their own
      const hasSubtasks = subtaskChildren.length > 0;
      let estimate: number;
      let spent: number;
      
      if (hasSubtasks) {
        // Issue has subtasks: use only its own values (usually 0 as work is on subtasks)
        estimate = (fields.timeoriginalestimate as number) || 0;
        spent = (fields.timespent as number) || 0;
      } else {
        // No subtasks: use aggregate (which equals own value) or own value
        estimate = (fields.aggregatetimeoriginalestimate as number) || (fields.timeoriginalestimate as number) || 0;
        spent = (fields.aggregatetimespent as number) || (fields.timespent as number) || 0;
      }
      
      // Story points: always use the issue's own value
      const storyPoints = (fields[storyPointsField] as number) || (fields[storyPointEstimateField] as number) || null;

      children.push({
        issueKey: issue.key,
        summary: (fields?.summary as string) || '',
        issueType: issueType?.name || 'Story',
        status: status?.name || 'Unknown',
        statusCategoryKey: status?.statusCategory?.key || null,
        originalEstimateSeconds: estimate,
        timeSpentSeconds: spent,
        storyPoints,
        parentKey: epicKey,
        hierarchyLevel: 1,
        children: subtaskChildren.length > 0 ? subtaskChildren : undefined
      });
    }

    return children;
  }

  private async fetchEpicDirectProgress(epicKey: string): Promise<{ estimate: number; spent: number; usCount: number; storyPoints: number }> {
    const jiraClient = container().jiraClient;
    const storyPointsField = process.env.JIRA_STORY_POINTS_FIELD || 'customfield_10535';
    const storyPointEstimateField = process.env.JIRA_STORY_POINT_ESTIMATE_FIELD || 'customfield_10016';
    
    // Get all US/Stories that are children of this Epic (include story point fields)
    const childFields = `key,summary,issuetype,status,timeoriginalestimate,aggregatetimeoriginalestimate,timespent,aggregatetimespent,subtasks,${storyPointsField},${storyPointEstimateField}`;
    const childJql = `("Epic Link" = "${epicKey}" OR parent = "${epicKey}")`;

    const childResponse = await jiraClient.searchIssuesWithPagination(childJql, childFields);
    const childIssues = childResponse.issues;

    let originalEstimateSeconds = 0;
    let timeSpentSeconds = 0;
    let totalStoryPoints = 0;

    // Collect subtask keys from children
    const subtaskKeys: string[] = [];
    
    childIssues.forEach(issue => {
      const fields = issue.fields as Record<string, any>;
      
      // Collect subtask keys
      const subtasks = fields.subtasks as Array<{ key: string }> | undefined;
      if (subtasks && subtasks.length > 0) {
        subtasks.forEach(st => subtaskKeys.push(st.key));
      }
      
      // Sum up estimates from direct children (US level)
      const issueEstimate = (fields.aggregatetimeoriginalestimate as number) 
        || (fields.timeoriginalestimate as number) 
        || 0;
      const issueSpent = (fields.aggregatetimespent as number) 
        || (fields.timespent as number) 
        || 0;
      // Story points: try both fields
      const issueStoryPoints = (fields[storyPointsField] as number) || (fields[storyPointEstimateField] as number) || 0;
      
      originalEstimateSeconds += issueEstimate;
      timeSpentSeconds += issueSpent;
      totalStoryPoints += issueStoryPoints;
    });

    // Fetch subtasks to get their estimates and story points
    if (subtaskKeys.length > 0) {
      const batchSize = 50;
      let subtaskEstimateTotal = 0;
      let subtaskSpentTotal = 0;
      let subtaskStoryPointsTotal = 0;
      
      for (let i = 0; i < subtaskKeys.length; i += batchSize) {
        const batch = subtaskKeys.slice(i, i + batchSize);
        const subtaskJql = `key in (${batch.map(k => `"${k}"`).join(',')})`;
        const subtaskResponse = await jiraClient.searchIssuesWithPagination(subtaskJql, `key,timeoriginalestimate,timespent,${storyPointsField},${storyPointEstimateField}`);
        
        subtaskResponse.issues.forEach(st => {
          const stFields = st.fields as Record<string, any>;
          const stEstimate = (stFields.timeoriginalestimate as number) || 0;
          const stSpent = (stFields.timespent as number) || 0;
          const stStoryPoints = (stFields[storyPointsField] as number) || (stFields[storyPointEstimateField] as number) || 0;
          subtaskEstimateTotal += stEstimate;
          subtaskSpentTotal += stSpent;
          subtaskStoryPointsTotal += stStoryPoints;
        });
      }
      
      // Add subtask estimates to total (if not already counted in aggregate)
      if (originalEstimateSeconds === 0) {
        originalEstimateSeconds = subtaskEstimateTotal;
      }
      // Add subtask time spent if not already counted
      if (timeSpentSeconds === 0) {
        timeSpentSeconds = subtaskSpentTotal;
      }
      // Add subtask story points
      totalStoryPoints += subtaskStoryPointsTotal;
    }

    // If no time spent from fields, fetch worklogs for each child issue
    if (timeSpentSeconds === 0 && childIssues.length > 0) {
      const worklogPromises = childIssues.map(async (issue) => {
        try {
          const worklogs = await jiraClient.getIssueWorklogs(issue.key);
          return worklogs.reduce((sum, w) => sum + (w.timeSpentSeconds || 0), 0);
        } catch {
          return 0;
        }
      });
      const worklogTimes = await Promise.all(worklogPromises);
      timeSpentSeconds = worklogTimes.reduce((a, b) => a + b, 0);
    }

    return {
      estimate: originalEstimateSeconds,
      spent: timeSpentSeconds,
      usCount: childIssues.length,
      storyPoints: totalStoryPoints
    };
  }
}

// Types for backward compatibility
export interface LegacyWorklogMetrics {
  totalTimeSpentHours: number;
  billableHours: number;
  worklogCount: number;
  uniqueUsers: number;
  uniqueIssues: number;
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

export interface SprintIssuesResult {
  issues: Array<{
    issueKey: string;
    summary: string;
    issueType: string;
    status: string;
    statusCategory: string;
    statusCategoryKey: string;
    storyPoints: number | null;
    originalEstimateSeconds: number | null;
  }>;
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
  totalTimeSeconds?: number; // Time spent on board issues (in seconds)
  backlog: {
    ticketCount: number;
    storyPoints: number;
  };
}

export interface VelocityHistoryResult {
  sprints: Array<{
    id: number;
    name: string;
    startDate: string | null;
    endDate: string | null;
    committed: number;
    completed: number;
    completionRate: number;
  }>;
  averageVelocity: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

export interface SupportIssue {
  issueKey: string;
  summary: string;
  issueType: string;
  status: string;
  statusCategory: string;
  ponderation: number | null;
  assignee: string | null;
  created: string;
  resolved: string | null;
  labels: string[];
  team: string | null;
  beginDate: string | null;
  endDate: string | null;
}

export interface SupportKPIResult {
  issues: SupportIssue[];
  statusCounts: {
    total: number;
    todo: number;
    inProgress: number;
    qa: number;
    resolved: number;
  };
  ponderationByStatus: {
    total: number;
    todo: number;
    inProgress: number;
    qa: number;
    resolved: number;
  };
  ponderationByType: Record<string, number>;
  ponderationByAssignee: Array<{
    assignee: string;
    ponderation: number;
    ticketCount: number;
  }>;
  ponderationByLevel: {
    low: { count: number; total: number };
    medium: { count: number; total: number };
    high: { count: number; total: number };
    veryHigh: { count: number; total: number };
  };
  ponderationByLabel: Array<{
    label: string;
    ponderation: number;
    ticketCount: number;
  }>;
  ponderationByTeam: Array<{
    team: string;
    ponderation: number;
    ticketCount: number;
  }>;
  backlog: {
    ticketCount: number;
    totalPonderation: number;
  };
  avgResolutionTimeHours: number;
  avgFirstResponseTimeHours: number;
  avgResolutionTimeFromDatesHours: number;
  highPondFastResolutionPercent: number;
  veryHighPondFastResolutionPercent: number;
  totalPonderation: number;
  resolutionDetails: Array<{
    issueKey: string;
    summary: string;
    beginDate: string;
    endDate: string;
    workingDays: number;
    ponderation: number | null;
  }>;
}

export interface EpicProgressItem {
  epicKey: string;
  summary: string;
  issueType: string;
  status: string;
  statusCategoryKey: string | null;
  childIssueCount: number;
  originalEstimateSeconds: number;
  timeSpentSeconds: number;
  totalStoryPoints: number;
  progressPercent: number;
  isOverrun: boolean;
}

export interface EpicProgressResult {
  boardId: number;
  boardName: string;
  projectKey: string | null;
  epicCount: number;
  epics: EpicProgressItem[];
}

export interface EpicSearchResult {
  boardId: number;
  query: string;
  results: Array<{
    epicKey: string;
    summary: string;
    issueType: string;
    status: string;
    statusCategoryKey: string | null;
  }>;
}

export interface EpicChildIssue {
  issueKey: string;
  summary: string;
  issueType: string;
  status: string;
  statusCategoryKey: string | null;
  originalEstimateSeconds: number;
  timeSpentSeconds: number;
  storyPoints: number | null;
  parentKey: string | null;
  hierarchyLevel: number;
  children?: EpicChildIssue[];
}

export interface EpicDetailsResult {
  epicKey: string;
  summary: string;
  issueType: string;
  status: string;
  statusCategoryKey: string | null;
  originalEstimateSeconds: number;
  timeSpentSeconds: number;
  totalStoryPoints: number;
  progressPercent: number;
  isOverrun: boolean;
  children: EpicChildIssue[];
}

// Singleton instance
export const worklogAppService = new WorklogApplicationService();

