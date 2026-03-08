import { Worklog } from '../../../domain/worklog/entities/Worklog';
import { TimeSpent } from '../../../domain/worklog/value-objects/TimeSpent';
import { Author } from '../../../domain/worklog/value-objects/Author';
import { JiraWorklog } from '../JiraClient';

/**
 * Mapper to convert Jira API responses to Domain entities
 */
export class WorklogMapper {
  
  /**
   * Map Jira worklog API response to domain Worklog entity
   * Uses JIRA_STORY_POINTS_FIELD (customfield_10127) for story points
   */
  static toDomain(
    jiraWorklog: JiraWorklog,
    issueKey: string,
    issueFields?: Record<string, unknown>,
    storyPointsField?: string,
    ponderationField?: string
  ): Worklog {
    const author = Author.create(
      jiraWorklog.author.accountId,
      jiraWorklog.author.displayName,
      jiraWorklog.author.avatarUrls?.['48x48']
    );

    const timeSpent = TimeSpent.fromSeconds(jiraWorklog.timeSpentSeconds);
    
    // Extract description from comment
    const description = this.extractDescription(jiraWorklog.comment);

    let storyPoints: number | null = null;
    if (storyPointsField && issueFields?.[storyPointsField] != null) {
      storyPoints = issueFields[storyPointsField] as number;
    }

    return Worklog.create({
      id: jiraWorklog.id,
      issueKey,
      author,
      timeSpent,
      workStart: new Date(jiraWorklog.started),
      description,
      billable: true, // Default to billable
      issueSummary: issueFields?.summary as string,
      issueType: (issueFields?.issuetype as { name?: string })?.name,
      status: (issueFields?.status as { name?: string })?.name,
      storyPoints,
      weight: ponderationField ? issueFields?.[ponderationField] as number | null : null,
      originalEstimateSeconds: issueFields?.timeoriginalestimate as number | null
    });
  }

  /**
   * Map multiple Jira worklogs
   */
  static toDomainList(
    jiraWorklogs: JiraWorklog[],
    issueKey: string,
    issueFields?: Record<string, unknown>,
    storyPointsField?: string,
    ponderationField?: string
  ): Worklog[] {
    return jiraWorklogs.map(w => 
      this.toDomain(w, issueKey, issueFields, storyPointsField, ponderationField)
    );
  }

  private static extractDescription(comment?: JiraWorklog['comment']): string {
    if (!comment?.content) return '';
    
    try {
      return comment.content
        .map(block => 
          block.content?.map(c => c.text || '').join('') || ''
        )
        .join('\n');
    } catch {
      return '';
    }
  }
}

