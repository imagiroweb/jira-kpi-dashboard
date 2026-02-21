import axios, { AxiosInstance } from 'axios';
import { 
  ApiResponse, 
  JiraProject
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface TimeTrackingConfig {
  workingHoursPerDay: number;
  workingDaysPerWeek: number;
}

// Jira API - Only keeping what's used
export const jiraApi = {
  getProjects: async (): Promise<ApiResponse<JiraProject[]> & { configuredProjects?: string[] }> => {
    const { data } = await api.get('/jira/projects');
    return data;
  },
  getConfiguredBoards: async (): Promise<{ success: boolean; boards: JiraBoard[] }> => {
    const { data } = await api.get('/jira/configured-boards');
    return data;
  },
  getTimeConfig: async (): Promise<{ success: boolean } & TimeTrackingConfig> => {
    const { data } = await api.get('/jira/time-config');
    return data;
  }
};

export interface JiraBoard {
  id: number;
  name: string;
  projectKey: string | null;
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

export interface EpicProgressResponse {
  boardId: number;
  boardName: string;
  projectKey: string | null;
  epicCount: number;
  epics: EpicProgressItem[];
}

export type EpicTypeFilter = 'all' | 'epic' | 'legend';

export interface EpicSearchItem {
  epicKey: string;
  summary: string;
  issueType: string;
  status: string;
  statusCategoryKey: string | null;
}

export interface EpicSearchResponse {
  boardId: number;
  query: string;
  results: EpicSearchItem[];
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

export interface EpicDetailsResponse {
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

export const epicApi = {
  getProgress: async (boardId: number, typeFilter: EpicTypeFilter = 'all'): Promise<{ success: boolean } & EpicProgressResponse> => {
    const { data } = await api.get('/jira/epic-progress', {
      params: { boardId, typeFilter }
    });
    return data;
  },
  
  search: async (boardId: number, query: string, typeFilter: EpicTypeFilter = 'all'): Promise<{ success: boolean } & EpicSearchResponse> => {
    const { data } = await api.get('/jira/epic-search', {
      params: { boardId, query, typeFilter }
    });
    return data;
  },
  
  getDetails: async (epicKey: string): Promise<{ success: boolean } & EpicDetailsResponse> => {
    const { data } = await api.get(`/jira/epic/${epicKey}/details`);
    return data;
  }
};

// Sync API
export const syncApi = {
  // Force sync all data from Jira (with extended timeout)
  forceSync: async (): Promise<{ 
    success: boolean; 
    message: string; 
    projectsSynced?: number; 
    totalProjects?: number 
  }> => {
    const { data } = await api.post('/worklog/sync', {}, { timeout: 120000 }); // 2 minutes timeout
    return data;
  },

  // Clear cache
  clearCache: async (): Promise<{ success: boolean; message: string }> => {
    const { data } = await api.delete('/worklog/cache');
    return data;
  }
};

// Support Snapshot types
export interface SupportSnapshotSummary {
  id: string;
  sprintName: string;
  savedAt: string;
  savedBy: {
    id: string;
    email: string;
    name?: string;
  };
  dateRange: {
    from: string;
    to: string;
  };
  notes?: string;
  summary: {
    totalTickets: number;
    resolvedTickets: number;
    totalPonderation: number;
    resolvedPonderation: number;
  };
}

export interface SupportSnapshotFull extends Omit<SupportSnapshotSummary, 'summary'> {
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
}

// Support Snapshot API
export const supportSnapshotApi = {
  // Sauvegarder un snapshot
  saveSnapshot: async (sprintName: string, notes?: string): Promise<{ success: boolean; snapshot?: { id: string }; message?: string }> => {
    const { data } = await api.post('/worklog/support-snapshot?activeSprint=true', {
      sprintName,
      notes
    });
    return data;
  },

  // Lister tous les snapshots
  getSnapshots: async (limit = 50): Promise<{ success: boolean; snapshots: SupportSnapshotSummary[] }> => {
    const { data } = await api.get(`/worklog/support-snapshots?limit=${limit}`);
    return data;
  },

  // Récupérer un snapshot complet
  getSnapshot: async (id: string): Promise<{ success: boolean; snapshot: SupportSnapshotFull }> => {
    const { data } = await api.get(`/worklog/support-snapshot/${id}`);
    return data;
  },

  // Supprimer un snapshot
  deleteSnapshot: async (id: string): Promise<{ success: boolean; message?: string }> => {
    const { data } = await api.delete(`/worklog/support-snapshot/${id}`);
    return data;
  }
};

// Dashboard Snapshot types
export interface DashboardSnapshotSummary {
  id: string;
  sprintName: string;
  savedAt: string;
  savedBy: {
    id: string;
    email: string;
    name?: string;
  };
  dateRange: {
    from: string;
    to: string;
  };
  notes?: string;
  summary: {
    totalTickets: number;
    resolvedTickets: number;
    totalPoints: number;
    resolvedPoints: number;
    totalTimeHours: number;
  };
}

// Stats can be for project (legacy) or board (new)
export interface ProjectStats {
  key?: string; // Legacy project key
  boardId?: number; // New board ID
  name: string;
  projectKey?: string | null; // Project key associated with board
  color: string;
  totalPoints: number;
  todoPoints: number;
  inProgressPoints: number;
  qaPoints: number;
  resolvedPoints: number;
  estimatedPoints: number;
  totalTickets: number;
  todoTickets: number;
  inProgressTickets: number;
  qaTickets: number;
  resolvedTickets: number;
  totalTimeHours: number;
  backlogTickets: number;
  backlogPoints: number;
}

export interface DashboardTotals {
  totalPoints: number;
  todoPoints: number;
  inProgressPoints: number;
  qaPoints: number;
  resolvedPoints: number;
  estimatedPoints: number;
  totalTickets: number;
  todoTickets: number;
  inProgressTickets: number;
  qaTickets: number;
  resolvedTickets: number;
  totalTimeHours: number;
  backlogTickets: number;
  backlogPoints: number;
}

export interface DashboardSnapshotFull extends Omit<DashboardSnapshotSummary, 'summary'> {
  projectsStats: ProjectStats[];
  totals: DashboardTotals;
}

// Dashboard Snapshot API
export const dashboardSnapshotApi = {
  // Sauvegarder un snapshot - accepts both ProjectStats (legacy) and BoardStats (new)
  saveSnapshot: async (
    sprintName: string, 
    projectsStats: Array<Partial<ProjectStats> & { name: string; color: string }>, 
    totals: DashboardTotals,
    dateRange: { from: string; to: string },
    notes?: string
  ): Promise<{ success: boolean; snapshot?: { id: string }; message?: string }> => {
    // Backend schema requires "key" (string) per project; frontend may send boardId only
    const normalizedStats = projectsStats.map((p) => ({
      ...p,
      key: p.key ?? String((p as { boardId?: number }).boardId ?? (p as { projectKey?: string }).projectKey ?? p.name)
    }));
    const { data } = await api.post('/jira/dashboard-snapshot', {
      sprintName,
      projectsStats: normalizedStats,
      totals,
      dateRange,
      notes
    });
    return data;
  },

  // Lister tous les snapshots
  getSnapshots: async (limit = 50): Promise<{ success: boolean; snapshots: DashboardSnapshotSummary[] }> => {
    const { data } = await api.get(`/jira/dashboard-snapshots?limit=${limit}`);
    return data;
  },

  // Récupérer un snapshot complet
  getSnapshot: async (id: string): Promise<{ success: boolean; snapshot: DashboardSnapshotFull }> => {
    const { data } = await api.get(`/jira/dashboard-snapshot/${id}`);
    return data;
  },

  // Supprimer un snapshot
  deleteSnapshot: async (id: string): Promise<{ success: boolean; message?: string }> => {
    const { data } = await api.delete(`/jira/dashboard-snapshot/${id}`);
    return data;
  }
};

// Brevo (Marketing) API
export interface BrevoList {
  id: number;
  name: string;
  totalSubscribers: number;
  totalBlacklisted: number;
  uniqueSubscribers: number;
}

export interface BrevoCampaignStats {
  sent?: number;
  delivered?: number;
  opened?: number;
  clicked?: number;
  unsubscribed?: number;
  hardBounces?: number;
  softBounces?: number;
}

export interface BrevoCampaign {
  id: number;
  name: string;
  subject?: string;
  type: string;
  status: string;
  scheduledAt?: string;
  sentDate?: string;
  statistics?: BrevoCampaignStats;
}

export interface BrevoStats {
  contactsCount: number;
  listsCount: number;
  totalSubscribers: number;
  lists: BrevoList[];
  recentCampaigns: BrevoCampaign[];
  manualCampaigns?: BrevoCampaign[];
}

export type BrevoTransactionalEventType =
  | 'requests'
  | 'delivered'
  | 'hardBounces'
  | 'softBounces'
  | 'bounces'
  | 'opened'
  | 'clicks'
  | 'spam'
  | 'invalid'
  | 'deferred'
  | 'blocked'
  | 'unsubscribed'
  | 'error'
  | 'loadedByProxy';

export interface BrevoTransactionalEvent {
  date: string;
  email: string;
  event: BrevoTransactionalEventType;
  messageId: string;
  subject?: string;
  tag?: string;
  templateId?: number;
  from?: string;
  ip?: string;
  link?: string;
  reason?: string;
}

export const brevoApi = {
  getStatus: async (): Promise<{ success: boolean; configured: boolean }> => {
    const { data } = await api.get('/brevo/status');
    return data;
  },
  getAccount: async (): Promise<{ success: boolean; account?: Record<string, unknown> }> => {
    const { data } = await api.get('/brevo/account');
    return data;
  },
  getStats: async (): Promise<{ success: boolean; stats?: BrevoStats; brevoAuthFailed?: boolean }> => {
    const { data } = await api.get('/brevo/stats');
    return data;
  },
  getTransactionalEvents: async (params?: { days?: number; limit?: number; event?: string }): Promise<{ success: boolean; events?: BrevoTransactionalEvent[] }> => {
    const { data } = await api.get('/brevo/transactional/events', { params });
    return data;
  },
  /** Export liste des emails (ayant cliqué ou désinscrit) pour une campagne. Peut prendre 30–60 s. */
  getCampaignRecipients: async (
    campaignId: number,
    type: 'clickers' | 'unsubscribed'
  ): Promise<{ success: boolean; emails?: string[] }> => {
    const { data } = await api.get(`/brevo/campaigns/${campaignId}/recipients`, {
      params: { type },
      timeout: 90000
    });
    return data;
  }
};

// Monday.com (Produit) API
export interface MondayUser {
  id: number;
  name: string;
  email?: string;
}

export interface MondayBoard {
  id: string;
  name: string;
  state?: string;
  boardKind?: string;
  itemCount?: number;
  workspaceId?: string;
}

export interface MondayWorkspace {
  id: string;
  name: string;
  kind?: string;
}

export interface MondayColumn {
  id: string;
  title: string;
  type: string;
}

export interface MondayItem {
  id: string;
  name: string;
  column_values?: Array<{ id: string; text?: string; type: string; value?: string }>;
}

export const mondayApi = {
  getStatus: async (): Promise<{ success: boolean; configured: boolean }> => {
    const { data } = await api.get('/monday/status');
    return data;
  },
  getMe: async (): Promise<{ success: boolean; me?: MondayUser }> => {
    const { data } = await api.get('/monday/me');
    return data;
  },
  getWorkspaces: async (): Promise<{ success: boolean; workspaces?: MondayWorkspace[] }> => {
    const { data } = await api.get('/monday/workspaces');
    return data;
  },
  getBoards: async (
    limit = 100,
    workspaceIds?: string[]
  ): Promise<{ success: boolean; boards?: MondayBoard[] }> => {
    const params: { limit: number; workspace_ids?: string } = { limit };
    if (workspaceIds?.length) params.workspace_ids = workspaceIds.join(',');
    const { data } = await api.get('/monday/boards', { params });
    return data;
  },
  getBoard: async (
    boardId: string,
    itemsLimit = 100
  ): Promise<{
    success: boolean;
    board?: MondayBoard;
    columns?: MondayColumn[];
    items?: MondayItem[];
  }> => {
    const { data } = await api.get(`/monday/boards/${boardId}`, {
      params: { itemsLimit },
    });
    return data;
  },
};

export default api;
