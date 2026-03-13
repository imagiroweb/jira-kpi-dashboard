import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import { logger } from '../../utils/logger';

/**
 * Jira API Client
 * Handles authentication and HTTP communication with Jira
 */
export class JiraClient {
  private readonly client: AxiosInstance;
  private readonly projectKeys: string[];
  private readonly boardIds: number[];
  
  constructor() {
    const baseURL = process.env.JIRA_URL;
    const email = process.env.JIRA_EMAIL;
    const apiToken = process.env.JIRA_API_TOKEN;

    if (!baseURL || !email || !apiToken) {
      throw new Error('Missing Jira configuration: JIRA_BASE_URL, JIRA_EMAIL, or JIRA_API_TOKEN');
    }

    this.projectKeys = process.env.JIRA_PROJECT_KEY?.split(',').map(k => k.trim()) || [];
    this.boardIds = process.env.JIRA_BOARD_ID?.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id)) || [];

    this.client = axios.create({
      baseURL,
      headers: {
        'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`Jira API: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response) {
          logger.error(`Jira API Error ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          logger.error('Jira API: No response received');
        } else {
          logger.error(`Jira API Error: ${error.message}`);
        }
        return Promise.reject(error);
      }
    );
  }

  get configuredProjectKeys(): string[] {
    return this.projectKeys;
  }

  get configuredBoardIds(): number[] {
    return this.boardIds;
  }

  /**
   * Get board details by ID
   */
  async getBoard(boardId: number): Promise<JiraBoard | null> {
    try {
      const response = await this.client.get<JiraBoard>(`/rest/agile/1.0/board/${boardId}`);
      return response.data;
    } catch (e) {
      logger.warn(`Could not fetch board ${boardId}`);
      return null;
    }
  }

  /**
   * Get board configuration (includes filter id used by the board to scope issues)
   */
  async getBoardConfiguration(boardId: number): Promise<{ filter?: { id: string } } | null> {
    try {
      const response = await this.client.get<{ filter?: { id: string }; id?: number; name?: string }>(
        `/rest/agile/1.0/board/${boardId}/configuration`
      );
      return { filter: response.data.filter };
    } catch (e) {
      logger.warn(`Could not fetch board configuration ${boardId}`);
      return null;
    }
  }

  /**
   * Get saved filter by ID (returns JQL so we can combine with resolution date)
   */
  async getFilterJql(filterId: string): Promise<string | null> {
    try {
      const response = await this.client.get<{ jql?: string }>(`/rest/api/3/filter/${filterId}`);
      return response.data.jql ?? null;
    } catch (e) {
      logger.warn(`Could not fetch filter ${filterId}`);
      return null;
    }
  }

  /**
   * Get configured projects from Jira
   */
  async getProjects(): Promise<JiraProject[]> {
    if (this.projectKeys.length === 0) {
      // Fetch all projects if none configured
      const response = await this.client.get<JiraProject[]>('/rest/api/3/project');
      return response.data;
    }

    // Fetch only configured projects
    const projects: JiraProject[] = [];
    for (const key of this.projectKeys) {
      try {
        const response = await this.client.get<JiraProject>(`/rest/api/3/project/${key}`);
        projects.push(response.data);
      } catch (e) {
        logger.warn(`Could not fetch project ${key}`);
      }
    }
    return projects;
  }

  /**
   * Get ALL projects from Jira (ignoring configured projects filter)
   */
  async getAllProjects(): Promise<JiraProject[]> {
    const response = await this.client.get<JiraProject[]>('/rest/api/3/project');
    return response.data;
  }

  /**
   * Search issues using JQL with automatic pagination
   * Uses parallel requests for better performance on large result sets
   */
  async searchIssuesWithPagination(
    jql: string,
    fields: string = 'key,summary,status,issuetype',
    pageSize: number = 100
  ): Promise<JiraSearchResponse> {
    // First request to get total count
    const firstResponse = await this.client.get<JiraSearchResponse>('/rest/api/3/search/jql', {
      params: { jql, fields, maxResults: pageSize, startAt: 0 }
    });

    const total = firstResponse.data.total || 0;
    const firstPageIssues = firstResponse.data.issues || [];
    
    // If all results fit in first page, return immediately
    if (firstPageIssues.length >= total || firstPageIssues.length < pageSize) {
      logger.info(`Fetched ${firstPageIssues.length}/${total} issues (single page) with JQL: ${jql.substring(0, 80)}...`);
      return {
        startAt: 0,
        maxResults: firstPageIssues.length,
        total,
        issues: firstPageIssues
      };
    }

    // Build parallel requests for remaining pages
    const remainingPages = Math.ceil((total - pageSize) / pageSize);
    const parallelBatchSize = 3; // Limit concurrent requests to avoid rate limiting
    const allIssues: JiraIssue[] = [...firstPageIssues];

    for (let batch = 0; batch < Math.ceil(remainingPages / parallelBatchSize); batch++) {
      const batchPromises: Promise<JiraSearchResponse>[] = [];
      
      for (let i = 0; i < parallelBatchSize; i++) {
        const pageIndex = batch * parallelBatchSize + i;
        const startAt = (pageIndex + 1) * pageSize;
        
        if (startAt >= total) break;
        
        batchPromises.push(
          this.client.get<JiraSearchResponse>('/rest/api/3/search/jql', {
            params: { jql, fields, maxResults: pageSize, startAt }
          }).then(r => r.data)
        );
      }

      if (batchPromises.length === 0) break;

      const batchResults = await Promise.all(batchPromises);
      for (const result of batchResults) {
        allIssues.push(...(result.issues || []));
      }

      // Small delay between batches to respect rate limits
      if (batch < Math.ceil(remainingPages / parallelBatchSize) - 1) {
        await this.delay(50);
      }
    }

    logger.info(`Fetched ${allIssues.length}/${total} issues (parallel) with JQL: ${jql.substring(0, 80)}...`);

    return {
      startAt: 0,
      maxResults: allIssues.length,
      total,
      issues: allIssues
    };
  }

  /**
   * Fetch ALL issues matching JQL by paginating with "id > lastId" to go beyond the
   * Jira search limit (often 1000). Use this when you need complete worklog coverage.
   * Appends " order by id ASC" to the JQL.
   */
  async searchAllIssuesByJql(jql: string, fields: string = 'key,summary,status,issuetype'): Promise<JiraIssue[]> {
    const pageSize = 1000;
    const baseJql = jql.trim().replace(/\s*order\s+by\s+id\s+(ASC|DESC)\s*$/i, '');
    const orderedJql = `${baseJql} order by id ASC`;
    const allIssues: JiraIssue[] = [];
    let lastId: string | null = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const jqlWithCursor: string = lastId ? `${baseJql} AND id > ${lastId} order by id ASC` : orderedJql;
      const response: AxiosResponse<JiraSearchResponse> = await this.client.get<JiraSearchResponse>('/rest/api/3/search/jql', {
        params: { jql: jqlWithCursor, fields, maxResults: pageSize, startAt: 0 }
      });
      const issues: JiraIssue[] = response.data.issues ?? [];
      allIssues.push(...issues);
      if (issues.length === 0) break;
      const last: JiraIssue = issues[issues.length - 1];
      lastId = typeof last.id === 'string' ? last.id : String(last.id);
      if (issues.length < pageSize) break;
      await this.delay(100);
    }

    logger.info(`Fetched ${allIssues.length} issues (id pagination) with JQL: ${jql.substring(0, 60)}...`);
    return allIssues;
  }

  /**
   * Search issues using JQL with a hard limit (no pagination, single request)
   * Use this for backlog queries to avoid timeout on large result sets
   */
  async searchIssuesLimited(
    jql: string,
    fields: string = 'key,summary,status,issuetype',
    maxResults: number = 100
  ): Promise<JiraSearchResponse> {
    const response = await this.client.get<JiraSearchResponse>('/rest/api/3/search/jql', {
      params: {
        jql,
        fields,
        maxResults,
        startAt: 0
      }
    });

    const issues = response.data.issues || [];
    const total = response.data.total || issues.length;
    
    logger.info(`Fetched ${issues.length}/${total} issues (limited) with JQL: ${jql.substring(0, 100)}...`);

    return {
      startAt: 0,
      maxResults: issues.length,
      total,
      issues
    };
  }

  /**
   * Fetch a single page of issues (for pagination). One request, no automatic follow-up.
   * Note: /rest/api/3/search/jql does NOT return "total"; use searchApproximateCount() for total.
   */
  async searchIssuesPage(
    jql: string,
    fields: string = 'key,summary,status,issuetype',
    maxResults: number = 20,
    startAt: number = 0
  ): Promise<JiraSearchResponse> {
    const response = await this.client.get<JiraSearchResponse>('/rest/api/3/search/jql', {
      params: { jql, fields, maxResults, startAt }
    });
    const data = response.data;
    const issues = data.issues || [];
    logger.info(`Fetched page startAt=${startAt} size=${issues.length} with JQL: ${jql.substring(0, 60)}...`);
    return {
      startAt: data.startAt ?? startAt,
      maxResults: data.maxResults ?? issues.length,
      total: 0,
      issues
    };
  }

  /**
   * Get approximate total count of issues matching JQL (for pagination).
   * POST /rest/api/3/search/approximate-count returns { count: number }.
   */
  async searchApproximateCount(jql: string): Promise<number> {
    const response = await this.client.post<{ count?: number }>('/rest/api/3/search/approximate-count', { jql });
    const count = response.data?.count;
    const total = typeof count === 'number' && count >= 0 ? count : 0;
    logger.info(`Approximate count for JQL: ${total}`);
    return total;
  }

  /**
   * Get all worklogs for a specific issue (paginated: Jira returns max 100 per page).
   * Fetches all pages so no hours are missing for issues with many worklogs.
   */
  async getIssueWorklogs(issueKey: string): Promise<JiraWorklog[]> {
    const pageSize = 100;
    const allWorklogs: JiraWorklog[] = [];
    let startAt = 0;
    let total = 0;

    do {
      const response = await this.client.get<{
        worklogs: JiraWorklog[];
        total: number;
        startAt: number;
        maxResults: number;
      }>(`/rest/api/3/issue/${issueKey}/worklog`, {
        params: { startAt, maxResults: pageSize }
      });
      const worklogs = response.data.worklogs || [];
      total = response.data.total ?? worklogs.length;
      startAt = (response.data.startAt ?? 0) + worklogs.length;
      allWorklogs.push(...worklogs);
      if (worklogs.length === 0) break;
    } while (allWorklogs.length < total);

    return allWorklogs;
  }

  /**
   * Get all boards
   */
  async getBoards(): Promise<JiraBoard[]> {
    const response = await this.client.get<{ values: JiraBoard[] }>('/rest/agile/1.0/board');
    return response.data.values || [];
  }

  /**
   * Get sprints for a board
   */
  async getBoardSprints(boardId: number, state?: 'active' | 'closed' | 'future'): Promise<JiraSprint[]> {
    const params: Record<string, string | number> = {};
    if (state) params.state = state;

    const response = await this.client.get<{ values: JiraSprint[] }>(
      `/rest/agile/1.0/board/${boardId}/sprint`,
      { params }
    );
    return response.data.values || [];
  }

  /**
   * Get issues in a sprint (all issues across all boards)
   */
  async getSprintIssues(sprintId: number, fields: string): Promise<JiraIssue[]> {
    const response = await this.client.get<{ issues: JiraIssue[] }>(
      `/rest/agile/1.0/sprint/${sprintId}/issue`,
      { params: { fields } }
    );
    return response.data.issues || [];
  }

  /**
   * Get issues in a sprint filtered by board (only issues visible on this board)
   */
  async getBoardSprintIssues(boardId: number, sprintId: number, fields: string): Promise<JiraIssue[]> {
    const allIssues: JiraIssue[] = [];
    let startAt = 0;
    const maxResults = 100;

    // Paginate through all issues
    do {
      const response = await this.client.get<{ issues: JiraIssue[]; total: number; startAt: number; maxResults: number }>(
        `/rest/agile/1.0/board/${boardId}/sprint/${sprintId}/issue`,
        { params: { fields, startAt, maxResults } }
      );
      
      const issues = response.data.issues || [];
      allIssues.push(...issues);
      
      if (issues.length < maxResults) break;
      startAt += maxResults;
      // eslint-disable-next-line no-constant-condition -- pagination loop
    } while (true);

    return allIssues;
  }

  /**
   * Raw GET request to Jira API
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const response = await this.client.get<T>(path, { params });
    return response.data;
  }

  /**
   * Get time tracking configuration (hours per day, days per week)
   */
  async getTimeTrackingConfig(): Promise<JiraTimeTrackingConfig> {
    try {
      // Try to get the configuration from Jira
      const response = await this.client.get<{
        workingHoursPerDay?: number;
        workingDaysPerWeek?: number;
      }>('/rest/api/3/configuration/timetracking/options');
      
      return {
        workingHoursPerDay: response.data.workingHoursPerDay || 8,
        workingDaysPerWeek: response.data.workingDaysPerWeek || 5
      };
    } catch (error) {
      // Fallback to environment variable or default
      const hoursPerDay = parseFloat(process.env.JIRA_HOURS_PER_DAY || '8');
      const daysPerWeek = parseFloat(process.env.JIRA_DAYS_PER_WEEK || '5');
      
      logger.info(`Using fallback time tracking config: ${hoursPerDay}h/day, ${daysPerWeek}d/week`);
      
      return {
        workingHoursPerDay: hoursPerDay,
        workingDaysPerWeek: daysPerWeek
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Jira API Types
export interface JiraSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: Record<string, unknown>;
}

export interface JiraWorklog {
  id: string;
  author: {
    accountId: string;
    displayName: string;
    avatarUrls?: Record<string, string>;
  };
  timeSpentSeconds: number;
  started: string;
  comment?: {
    content?: Array<{ content?: Array<{ text?: string }> }>;
  };
}

export interface JiraBoard {
  id: number;
  name: string;
  type: string;
  location?: {
    projectKey: string;
  };
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  goal?: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
  avatarUrls?: Record<string, string>;
}

export interface JiraTimeTrackingConfig {
  workingHoursPerDay: number;
  workingDaysPerWeek: number;
}
