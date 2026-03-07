import { ISprintRepository } from '../../domain/sprint/repositories/ISprintRepository';
import { Sprint } from '../../domain/sprint/entities/Sprint';
import { SprintIssue } from '../../domain/sprint/entities/SprintIssue';
import { JiraClient } from './JiraClient';
import { SprintMapper } from './mappers/SprintMapper';
import { logger } from '../../utils/logger';

/**
 * Jira implementation of Sprint Repository
 * Fetches sprints and sprint issues from Jira API
 */
export class JiraSprintRepository implements ISprintRepository {
  private readonly storyPointsField: string;
  private readonly storyPointEstimateField: string;
  private boardIdCache: Map<string, number> = new Map();
  private readonly projectBoardMapping: Map<string, number> = new Map();

  constructor(private readonly jiraClient: JiraClient) {
    // Story Points field (classic Jira)
    this.storyPointsField = process.env.JIRA_STORY_POINTS_FIELD || 'customfield_10535';
    // Story Point Estimate field (next-gen/team-managed projects like Adoria26)
    this.storyPointEstimateField = process.env.JIRA_STORY_POINT_ESTIMATE_FIELD || 'customfield_10016';
    
    logger.info(`Using story points fields: ${this.storyPointsField}, ${this.storyPointEstimateField}`);
    
    // Build project → board mapping from environment variables
    const projectKeys = process.env.JIRA_PROJECT_KEY?.split(',').map(k => k.trim()) || [];
    const boardIds = process.env.JIRA_BOARD_ID?.split(',').map(id => parseInt(id.trim(), 10)) || [];
    
    projectKeys.forEach((key, index) => {
      if (boardIds[index]) {
        this.projectBoardMapping.set(key, boardIds[index]);
        logger.debug(`Mapped project ${key} to board ${boardIds[index]}`);
      }
    });
  }

  async findByBoard(boardId: number): Promise<Sprint[]> {
    const jiraSprints = await this.jiraClient.getBoardSprints(boardId);
    return SprintMapper.toDomainList(jiraSprints, boardId);
  }

  async findOpenSprints(projectKey: string): Promise<Sprint[]> {
    const boardId = await this.getBoardIdForProject(projectKey);
    if (!boardId) {
      logger.warn(`No board found for project ${projectKey}`);
      return [];
    }

    const jiraSprints = await this.jiraClient.getBoardSprints(boardId, 'active');
    return SprintMapper.toDomainList(jiraSprints, boardId);
  }

  async findClosedSprints(projectKey: string, limit: number = 10): Promise<Sprint[]> {
    const boardId = await this.getBoardIdForProject(projectKey);
    if (!boardId) {
      return [];
    }

    const jiraSprints = await this.jiraClient.getBoardSprints(boardId, 'closed');
    // Sort by end date descending and limit
    const sorted = jiraSprints
      .filter(s => s.endDate)
      .sort((a, b) => new Date(b.endDate!).getTime() - new Date(a.endDate!).getTime())
      .slice(0, limit);

    return SprintMapper.toDomainList(sorted, boardId);
  }

  async findById(sprintId: number): Promise<Sprint | null> {
    // Would need a specific API call - for now, search in boards
    const boards = await this.jiraClient.getBoards();
    
    for (const board of boards) {
      const sprints = await this.jiraClient.getBoardSprints(board.id);
      const found = sprints.find(s => s.id === sprintId);
      if (found) {
        return SprintMapper.toDomain(found, board.id);
      }
    }
    
    return null;
  }

  async findSprintIssues(sprintId: number): Promise<SprintIssue[]> {
    const fields = `key,summary,issuetype,status,timeoriginalestimate,${this.storyPointsField},${this.storyPointEstimateField}`;
    const jiraIssues = await this.jiraClient.getSprintIssues(sprintId, fields);
    return SprintMapper.issuesToDomain(jiraIssues, this.storyPointsField, this.storyPointEstimateField);
  }

  async findOpenSprintIssues(projectKey: string): Promise<SprintIssue[]> {
    const jql = `project = "${projectKey}" AND Sprint in openSprints()`;
    const fields = `key,summary,issuetype,status,timeoriginalestimate,${this.storyPointsField},${this.storyPointEstimateField}`;
    
    const response = await this.jiraClient.searchIssuesWithPagination(jql, fields);
    return SprintMapper.issuesToDomain(response.issues, this.storyPointsField, this.storyPointEstimateField);
  }

  async findBacklogIssues(projectKey: string, _maxResults: number = 1000): Promise<SprintIssue[]> {
    const jql = `project = "${projectKey}" AND Sprint is EMPTY AND statusCategory != Done ORDER BY created DESC`;
    const fields = `key,summary,issuetype,status,${this.storyPointsField},${this.storyPointEstimateField}`;
    
    // Use paginated search to fetch all backlog issues
    const response = await this.jiraClient.searchIssuesWithPagination(jql, fields);
    return SprintMapper.issuesToDomain(response.issues, this.storyPointsField, this.storyPointEstimateField);
  }

  private async getBoardIdForProject(projectKey: string): Promise<number | null> {
    // Check configured mapping first (from JIRA_PROJECT_KEY and JIRA_BOARD_ID)
    if (this.projectBoardMapping.has(projectKey)) {
      const boardId = this.projectBoardMapping.get(projectKey)!;
      logger.debug(`Using configured board ${boardId} for project ${projectKey}`);
      return boardId;
    }
    
    // Check cache
    if (this.boardIdCache.has(projectKey)) {
      return this.boardIdCache.get(projectKey)!;
    }

    // Fallback: search for a board by project key
    const boards = await this.jiraClient.getBoards();
    const projectBoard = boards.find(b => 
      b.location?.projectKey === projectKey ||
      b.name.toLowerCase().includes(projectKey.toLowerCase())
    );

    if (projectBoard) {
      this.boardIdCache.set(projectKey, projectBoard.id);
      return projectBoard.id;
    }

    logger.warn(`No board found for project ${projectKey}`);
    return null;
  }
}

