import { IWorklogRepository, WorklogSearchParams } from '../../domain/worklog/repositories/IWorklogRepository';
import { Worklog } from '../../domain/worklog/entities/Worklog';
import { DateRange } from '../../domain/worklog/value-objects/DateRange';
import { JiraClient } from './JiraClient';
import { WorklogMapper } from './mappers/WorklogMapper';
import { logger } from '../../utils/logger';

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

  constructor(private readonly jiraClient: JiraClient) {
    this.storyPointsField = process.env.JIRA_STORY_POINTS_FIELD || 'customfield_10127';
    this.ponderationField = process.env.JIRA_PONDERATION_FIELD || 'customfield_10727';
    this.teamField = process.env.JIRA_TEAM_FIELD || 'customfield_10001';
    this.worklogTeamField = (process.env.JIRA_WORKLOG_TEAM_FIELD || this.teamField).trim();
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
    const jqlParts: string[] = [];

    if (params.projectKey) {
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
    const allWorklogs: Worklog[] = [];

    for (const issue of responseIssues) {
      try {
        const jiraWorklogs = await this.jiraClient.getIssueWorklogs(issue.key);
        
        const worklogs = WorklogMapper.toDomainList(
          jiraWorklogs,
          issue.key,
          issue.fields,
          this.storyPointsField,
          this.ponderationField
        );

        // Filter by date range if provided
        const filtered = worklogs.filter(w => {
          const dateMatch = !dateRange || w.isWithinRange(dateRange);
          const userMatch = !filterAccountId || w.isFromAuthor(filterAccountId);
          return dateMatch && userMatch;
        });

        allWorklogs.push(...filtered);
      } catch (e) {
        logger.debug(`Could not fetch worklogs for ${issue.key}`);
      }
    }

    logger.info(`Found ${allWorklogs.length} worklogs matching criteria`);
    return allWorklogs;
  }
}

