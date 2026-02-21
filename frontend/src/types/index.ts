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

// Jira Project Type
export interface JiraProject {
  key: string;
  name: string;
  id: string;
  isConfigured?: boolean;
}
