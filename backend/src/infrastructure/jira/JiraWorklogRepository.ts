import { IWorklogRepository, WorklogSearchParams } from '../../domain/worklog/repositories/IWorklogRepository';
import { Worklog } from '../../domain/worklog/entities/Worklog';
import { DateRange } from '../../domain/worklog/value-objects/DateRange';
import { JiraClient } from './JiraClient';
import { WorklogMapper } from './mappers/WorklogMapper';
import { logger } from '../../utils/logger';
import { getWorklogCalendarDate } from '../../utils/worklogDate';

/**
 * Jira implementation of Worklog Repository
 * Fetches worklogs from Jira API
 */
export class JiraWorklogRepository implements IWorklogRepository {
  private readonly storyPointsField: string;
  private readonly ponderationField: string;
  private readonly teamField: string;
  /** Champ équipe utilisé pour filtrer les worklogs (JIRA_WORKLOG_TEAM_FIELD ou JIRA_TEAM_FIELD) */
  private readonly worklogTeamField: string;
  /** Parallélisme pour GET worklogs par issue (JIRA_WORKLOG_FETCH_CONCURRENCY) */
  private readonly worklogFetchConcurrency: number;

  constructor(private readonly jiraClient: JiraClient) {
    this.storyPointsField = process.env.JIRA_STORY_POINTS_FIELD || 'customfield_10127';
    this.ponderationField = process.env.JIRA_PONDERATION_FIELD || 'customfield_10727';
    this.teamField = process.env.JIRA_TEAM_FIELD || 'customfield_10001';
    this.worklogTeamField = (process.env.JIRA_WORKLOG_TEAM_FIELD || this.teamField).trim();
    const c = parseInt(process.env.JIRA_WORKLOG_FETCH_CONCURRENCY || '10', 10);
    this.worklogFetchConcurrency = Number.isFinite(c) ? Math.max(1, Math.min(c, 30)) : 10;
  }

  async findByIssue(issueKey: string): Promise<Worklog[]> {
    const jiraWorklogs = await this.jiraClient.getIssueWorklogs(issueKey);
    return WorklogMapper.toDomainList(jiraWorklogs, issueKey);
  }

  async findByUser(accountId: string, range: DateRange): Promise<Worklog[]> {
    const jql = `worklogAuthor = "${accountId}" AND worklogDate >= "${range.fromISO}" AND worklogDate <= "${range.toISO}"`;
    return this.searchWithJql(jql, range);
  }

  async findByProject(projectKey: string, range: DateRange): Promise<Worklog[]> {
    const jql = `project = "${projectKey}" AND worklogDate >= "${range.fromISO}" AND worklogDate <= "${range.toISO}"`;
    return this.searchWithJql(jql, range);
  }

  async findByOpenSprints(projectKey?: string): Promise<Worklog[]> {
    let jql = 'Sprint in openSprints()';
    if (projectKey) {
      jql = `project = "${projectKey}" AND ${jql}`;
    }
    return this.searchWithJql(jql);
  }

  async search(params: WorklogSearchParams): Promise<Worklog[]> {
    // Plusieurs projets : une recherche JQL par projet puis fusion (somme = tous les worklogs).
    // Plus fiable que `project in (A,B)` seul (pagination / JQL selon instances Jira).
    if (params.projectKeys && params.projectKeys.length > 0) {
      const unique = [...new Set(params.projectKeys.map((k) => k.trim()).filter(Boolean))];
      if (unique.length > 1) {
        const parts = await Promise.all(
          unique.map((pk) =>
            this.search({
              ...params,
              projectKeys: undefined,
              projectKey: pk
            })
          )
        );
        const merged: Worklog[] = [];
        const seen = new Set<string>();
        for (const part of parts) {
          for (const w of part) {
            if (!seen.has(w.id)) {
              seen.add(w.id);
              merged.push(w);
            }
          }
        }
        return merged;
      }
    }

    const jqlParts: string[] = [];

    if (params.projectKeys && params.projectKeys.length > 0) {
      const unique = [...new Set(params.projectKeys.map((k) => k.trim()).filter(Boolean))];
      if (unique.length === 1) {
        jqlParts.push(`project = "${unique[0]}"`);
      }
    } else if (params.projectKey) {
      jqlParts.push(`project = "${params.projectKey}"`);
    }
    if (params.issueKey) {
      jqlParts.push(`key = "${params.issueKey}"`);
    }
    if (params.from) {
      jqlParts.push(`worklogDate >= "${params.from}"`);
    }
    if (params.to) {
      jqlParts.push(`worklogDate <= "${params.to}"`);
    }
    if (params.accountId) {
      jqlParts.push(`worklogAuthor = "${params.accountId}"`);
    }
    if (params.teamName) {
      jqlParts.push(`"${this.worklogTeamField}" = "${params.teamName}"`);
    }
    if (params.openSprints) {
      jqlParts.push('Sprint in openSprints()');
    }

    // Default: get issues updated in last 30 days if no date filter
    if (!params.from && !params.to) {
      jqlParts.push('updated >= -30d');
    }

    const jql = jqlParts.length > 0 ? jqlParts.join(' AND ') : 'updated >= -30d';
    
    const range = params.from && params.to 
      ? DateRange.create(params.from, params.to)
      : undefined;

    return this.searchWithJql(jql, range, params.accountId);
  }

  private async searchWithJql(
    jql: string,
    dateRange?: DateRange,
    filterAccountId?: string
  ): Promise<Worklog[]> {
    const fields = `key,summary,project,issuetype,status,timeoriginalestimate,${this.storyPointsField},${this.ponderationField},${this.teamField}`;
    // Use id-based pagination to fetch ALL issues (Jira search can cap at 1000 with startAt)
    const responseIssues = await this.jiraClient.searchAllIssuesByJql(jql, fields);
    const keys = [...new Set(responseIssues.map((iss) => iss.key))];

    const jiraWorklogsByIssue = await this.jiraClient.getIssueWorklogsForMany(
      keys,
      this.worklogFetchConcurrency
    );

    const allWorklogs: Worklog[] = [];

    for (const issue of responseIssues) {
      const jiraWorklogs = jiraWorklogsByIssue.get(issue.key) ?? [];
      try {
        const worklogs = WorklogMapper.toDomainList(
          jiraWorklogs,
          issue.key,
          issue.fields,
          this.storyPointsField,
          this.ponderationField
        );

        // Même jour calendaire que JQL worklogDate (fuseau JIRA_WORKLOG_DATE_TZ, défaut Europe/Paris).
        const filtered = worklogs.filter((w) => {
          const wd = getWorklogCalendarDate(w.workStart);
          const dateMatch =
            !dateRange || (wd >= dateRange.fromISO && wd <= dateRange.toISO);
          const userMatch = !filterAccountId || w.isFromAuthor(filterAccountId);
          return dateMatch && userMatch;
        });

        allWorklogs.push(...filtered);
      } catch (e) {
        logger.debug(`Could not map worklogs for ${issue.key}`);
      }
    }

    logger.info(`Found ${allWorklogs.length} worklogs matching criteria`);
    return allWorklogs;
  }
}

