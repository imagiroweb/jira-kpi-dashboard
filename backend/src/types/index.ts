// Jira Types
export interface JiraIssue {
  issueKey: string;
  summary: string;
  status: string;
  statusCategory: 'To Do' | 'In Progress' | 'Done';
  priority: string;
  issueType: string;
  assignee: string | null;
  reporter: string | null;
  created: Date;
  updated: Date;
  resolved: Date | null;
  storyPoints: number | null;
  sprint: string | null;
  labels: string[];
  components: string[];
  customFields: Record<string, unknown>;
  project: string;
}

export interface JiraApiResponse {
  expand: string;
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraApiIssue[];
}

export interface JiraApiIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
      statusCategory: {
        name: string;
      };
    };
    priority: {
      name: string;
    };
    issuetype: {
      name: string;
    };
    assignee: {
      displayName: string;
    } | null;
    reporter: {
      displayName: string;
    } | null;
    created: string;
    updated: string;
    resolutiondate: string | null;
    labels: string[];
    components: Array<{ name: string }>;
    project: {
      key: string;
      name: string;
    };
    [key: string]: unknown;
  };
}

export interface JiraSprint {
  id: number;
  state: string;
  name: string;
  startDate: string;
  endDate: string;
  completeDate?: string;
  goal?: string;
}

// KPI Types
export interface KPIMetrics {
  velocity: number;
  completionRate: number;
  bugRate: number;
  leadTime: number;
  cycleTime: number;
  completedIssues: number;
  totalIssues: number;
  bugCount: number;
  avgLeadTime: number;
  avgCycleTime: number;
  inProgressCount: number;
  todoCount: number;
}

// Time in Status KPI Types
export interface TimeInStatusMetrics {
  /** Temps moyen passé dans chaque état (en heures) */
  averageTimeByStatus: Array<{
    status: string;
    averageHours: number;
    averageDays: number;
    issueCount: number;
    minHours: number;
    maxHours: number;
  }>;
  /** Temps moyen par état et par type de ticket */
  averageTimeByStatusAndType: Array<{
    issueType: string;
    statusBreakdown: Array<{
      status: string;
      averageHours: number;
      averageDays: number;
      issueCount: number;
    }>;
  }>;
  /** Statistiques globales */
  summary: {
    totalIssuesAnalyzed: number;
    averageTotalCycleTime: number;
    statusesFound: string[];
    issueTypesFound: string[];
  };
}

export interface StatusTransition {
  issueKey: string;
  issueType: string;
  fromStatus: string | null;
  toStatus: string;
  transitionDate: Date;
  author?: string;
}

export interface IssueStatusHistory {
  issueKey: string;
  issueType: string;
  created: Date;
  transitions: StatusTransition[];
  timeInEachStatus: Map<string, number>; // status -> milliseconds
}

export interface AIAnalysisResult {
  summary: string;
  kpis: Array<{
    name: string;
    value: number;
    interpretation: string;
    trend?: 'up' | 'down' | 'stable';
  }>;
  trends: string[];
  alerts: Array<{
    level: 'warning' | 'critical' | 'info';
    message: string;
  }>;
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    action: string;
    impact: string;
  }>;
}

export interface KPISnapshotData {
  timestamp: Date;
  period: string;
  metrics: {
    velocity: number;
    completionRate: number;
    bugRate: number;
    leadTime: number;
    cycleTime: number;
  };
  aiAnalysis: AIAnalysisResult;
  sourceData: {
    jiraIssues: number;
    excelRecords: number;
  };
}

// Excel Types
export interface ExcelData {
  headers: string[];
  rows: Record<string, unknown>[];
  metadata: {
    fileName: string;
    uploadedAt: Date;
    rowCount: number;
  };
}

export interface ExcelMapping {
  issueKey?: string;
  customField1?: string;
  customField2?: string;
  budgetField?: string;
  actualCostField?: string;
  [key: string]: string | undefined;
}

// WebSocket Events
export interface WebSocketEvents {
  'kpi:update': KPISnapshotData;
  'analysis:complete': AIAnalysisResult;
  'sync:progress': {
    status: 'started' | 'in_progress' | 'completed' | 'error';
    progress: number;
    message: string;
  };
  'alert:new': {
    level: 'warning' | 'critical' | 'info';
    message: string;
    timestamp: Date;
  };
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Configuration Types
export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey?: string;
  boardId?: number;
}

export interface AIConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  model: string;
  maxTokens: number;
}

// Alert Configuration
export interface AlertRule {
  id: string;
  name: string;
  metric: keyof KPIMetrics;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  level: 'warning' | 'critical' | 'info';
  enabled: boolean;
}

