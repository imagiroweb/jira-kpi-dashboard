import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface VisiblePages {
  dashboard: boolean;
  users: boolean;
  support: boolean;
  epics: boolean;
  marketing: boolean;
  produit: boolean;
  gestionUtilisateurs: boolean;
}

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  provider: 'local' | 'microsoft';
  role?: 'super_admin' | string | null;
  roleName?: string;
  visiblePages?: VisiblePages;
}

export interface RoleDto {
  id: string;
  name: string;
  pageVisibilities: VisiblePages;
}

export interface UserWithRoleDto {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  provider: string;
  isActive: boolean;
  role: 'super_admin' | string | null;
  roleId: string | null;
  roleName: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: User;
  /** True when user was just created and must choose a role (e.g. first Microsoft login) */
  firstLogin?: boolean;
  error?: string;
  errors?: string[];
}

export interface RoleForSignup {
  id: string;
  name: string;
}

export interface MicrosoftConfig {
  enabled: boolean;
  clientId: string;
  tenantId: string;
  redirectUri: string;
}

export interface PasswordValidation {
  isValid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong' | 'very-strong';
  score: number;
}

export const authApi = {
  /**
   * List roles for signup / first-login role selection (no auth)
   */
  async getRolesForSignup(): Promise<RoleForSignup[]> {
    const response = await api.get<{ success: boolean; roles: RoleForSignup[] }>('/api/auth/roles/for-signup');
    if (!response.data.success) throw new Error((response.data as { error?: string }).error);
    return response.data.roles;
  },

  /**
   * Register a new user (roleId required for first-time signup)
   */
  async register(
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
    roleId?: string
  ): Promise<AuthResponse> {
    try {
      const response = await api.post<AuthResponse>('/api/auth/register', {
        email,
        password,
        firstName,
        lastName,
        roleId
      });
      return response.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string; errors?: string[] } } };
      if (err.response?.data) {
        const msg = err.response.data.error || err.response.data.errors?.join('. ');
        if (msg) return { success: false, error: msg };
      }
      return { success: false, error: 'Erreur de connexion au serveur' };
    }
  },

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await api.post<AuthResponse>('/api/auth/login', {
        email,
        password
      });
      return response.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      if (err.response?.data?.error) {
        return { success: false, error: err.response.data.error };
      }
      return { success: false, error: 'Erreur de connexion au serveur' };
    }
  },

  /**
   * Validate password strength (server-side)
   */
  async validatePassword(password: string): Promise<PasswordValidation | null> {
    try {
      const response = await api.post<{ success: boolean; validation: PasswordValidation }>(
        '/api/auth/validate-password',
        { password }
      );
      return response.data.validation;
    } catch (error) {
      console.error('Password validation error:', error);
      return null;
    }
  },

  /**
   * Get Microsoft SSO configuration
   */
  async getMicrosoftConfig(): Promise<MicrosoftConfig> {
    try {
      const response = await api.get<{ success: boolean } & MicrosoftConfig>(
        '/api/auth/microsoft/config'
      );
      return response.data;
    } catch (error) {
      return { enabled: false, clientId: '', tenantId: '', redirectUri: '' };
    }
  },

  /**
   * Handle Microsoft SSO callback
   */
  async microsoftCallback(accessToken: string): Promise<AuthResponse> {
    try {
      const response = await api.post<AuthResponse>('/api/auth/microsoft/callback', {
        accessToken
      });
      return response.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      if (err.response?.data?.error) {
        return { success: false, error: err.response.data.error };
      }
      return { success: false, error: 'Erreur de connexion Microsoft' };
    }
  },

  /**
   * Verify current token validity
   */
  async verifyToken(): Promise<boolean> {
    try {
      const response = await api.get<{ success: boolean; valid: boolean }>('/api/auth/verify');
      return response.data.valid;
    } catch (error) {
      return false;
    }
  },

  /**
   * Get current user info (with role and visiblePages)
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      const response = await api.get<{ success: boolean; user: User }>('/api/auth/me');
      return response.data.user;
    } catch (error) {
      return null;
    }
  },

  /**
   * List users and roles (super_admin only)
   */
  async getUsersAndRoles(): Promise<{ users: UserWithRoleDto[]; roles: RoleDto[] }> {
    const response = await api.get<{ success: boolean; users: UserWithRoleDto[]; roles: RoleDto[] }>('/api/auth/users');
    if (!response.data.success) throw new Error((response.data as { error?: string }).error);
    return { users: response.data.users, roles: response.data.roles };
  },

  /**
   * Update user role (super_admin only)
   */
  async updateUserRole(userId: string, role: 'super_admin' | null, roleId: string | null): Promise<User> {
    const body: { role?: 'super_admin'; roleId?: string | null } = {};
    if (role === 'super_admin') body.role = 'super_admin';
    else body.roleId = roleId;
    const response = await api.patch<{ success: boolean; user: User }>(`/api/auth/users/${userId}`, body);
    if (!response.data.success) throw new Error((response.data as { error?: string }).error);
    return response.data.user;
  },

  /**
   * List roles (super_admin only)
   */
  async getRoles(): Promise<RoleDto[]> {
    const response = await api.get<{ success: boolean; roles: RoleDto[] }>('/api/auth/roles');
    if (!response.data.success) throw new Error((response.data as { error?: string }).error);
    return response.data.roles;
  },

  /**
   * Create role (super_admin only)
   */
  async createRole(name: string, pageVisibilities: VisiblePages): Promise<RoleDto> {
    const response = await api.post<{ success: boolean; role: RoleDto }>('/api/auth/roles', { name, pageVisibilities });
    if (!response.data.success) throw new Error((response.data as { error?: string }).error);
    return response.data.role;
  },

  /**
   * Update role (super_admin only)
   */
  async updateRole(roleId: string, data: { name?: string; pageVisibilities?: VisiblePages }): Promise<RoleDto> {
    const response = await api.patch<{ success: boolean; role: RoleDto }>(`/api/auth/roles/${roleId}`, data);
    if (!response.data.success) throw new Error((response.data as { error?: string }).error);
    return response.data.role;
  },

  /**
   * Set current user's role (first-login selection)
   */
  async updateMyRole(roleId: string): Promise<User> {
    const response = await api.patch<{ success: boolean; user: User }>('/api/auth/me/role', { roleId });
    if (!response.data.success) throw new Error((response.data as { error?: string }).error);
    return response.data.user;
  }
};

