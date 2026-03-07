import { Sprint } from '../../../domain/sprint/entities/Sprint';
import { SprintIssue, StatusCategory, StatusCategoryKey } from '../../../domain/sprint/entities/SprintIssue';
import { JiraSprint, JiraIssue } from '../JiraClient';

/**
 * Mapper to convert Jira API responses to Sprint domain entities
 */
export class SprintMapper {

  /**
   * Map Jira sprint to domain Sprint entity
   */
  static toDomain(jiraSprint: JiraSprint, boardId: number): Sprint {
    return Sprint.create({
      id: jiraSprint.id,
      name: jiraSprint.name,
      state: jiraSprint.state,
      startDate: jiraSprint.startDate,
      endDate: jiraSprint.endDate,
      completeDate: jiraSprint.completeDate,
      goal: jiraSprint.goal,
      boardId
    });
  }

  /**
   * Map multiple sprints
   */
  static toDomainList(jiraSprints: JiraSprint[], boardId: number): Sprint[] {
    return jiraSprints.map(s => this.toDomain(s, boardId));
  }

  /**
   * Map Jira issue to SprintIssue entity
   * Uses JIRA_STORY_POINTS_FIELD (customfield_10127) for story points
   */
  static issueToDomin(jiraIssue: JiraIssue, storyPointsField: string): SprintIssue {
    const fields = jiraIssue.fields;
    const status = fields.status as { name?: string; statusCategory?: { name?: string; key?: string } } | undefined;
    const storyPoints = fields[storyPointsField] as number | null;
    
    return SprintIssue.create({
      issueKey: jiraIssue.key,
      summary: fields.summary as string || '',
      issueType: (fields.issuetype as { name?: string })?.name,
      status: status?.name,
      statusCategory: status?.statusCategory?.name as StatusCategory,
      statusCategoryKey: status?.statusCategory?.key as StatusCategoryKey,
      storyPoints,
      originalEstimateSeconds: fields.timeoriginalestimate as number | null
    });
  }

  /**
   * Map multiple issues
   */
  static issuesToDomain(jiraIssues: JiraIssue[], storyPointsField: string): SprintIssue[] {
    return jiraIssues.map(i => this.issueToDomin(i, storyPointsField));
  }
}

