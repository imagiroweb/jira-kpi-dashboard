import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Get default date range (last 8 days)
function getDefaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0]
  };
}

// Page ids for permissions (must match backend PAGE_IDS)
export type PageId = 'dashboard' | 'users' | 'support' | 'epics' | 'marketing' | 'produit' | 'gestionUtilisateurs';

/** Order used for "first visible page" (dashboard first if visible, else first in list) */
const PAGE_ORDER: PageId[] = ['dashboard', 'users', 'support', 'epics', 'marketing', 'produit', 'gestionUtilisateurs'];

export interface VisiblePages {
  dashboard: boolean;
  users: boolean;
  support: boolean;
  epics: boolean;
  marketing: boolean;
  produit: boolean;
  gestionUtilisateurs: boolean;
}

/** First page the user is allowed to see; default 'dashboard' if none or no visiblePages */
export function getFirstVisiblePage(visiblePages: VisiblePages | null | undefined): PageId | null {
  if (!visiblePages) return null;
  const first = PAGE_ORDER.find((id) => visiblePages[id] === true);
  return first ?? null;
}

// User interface for authentication
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

// Dashboard board stats interface (now based on board ID)
export interface BoardStats {
  boardId: number;
  name: string;
  projectKey: string | null;
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

// Page type for navigation
type PageType = 'dashboard' | 'users' | 'support' | 'epics' | 'marketing' | 'produit' | 'gestionUtilisateurs';

interface AppState {
  // Authentication State
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  
  // Navigation & Shared State
  currentPage: PageType;
  
  // Shared date range across pages
  dateRange: { from: string; to: string };
  selectedProjects: string[];
  
  // Dashboard cache
  dashboardStats: BoardStats[];
  dashboardLastUpdate: Date | null;
  dashboardLoading: boolean;
  
  // Real-time update trigger
  kpiRefreshTrigger: number;
  
  // Auth Actions
  login: (token: string, user: User, firstLogin?: boolean) => void;
  logout: () => void;
  updateUser: (user: User) => void;
  pendingRoleSelection: boolean;
  setPendingRoleSelection: (value: boolean) => void;
  
  // Navigation Actions
  setCurrentPage: (page: PageType) => void;
  setDateRange: (range: { from: string; to: string }) => void;
  setSelectedProjects: (projects: string[]) => void;
  setDashboardStats: (stats: BoardStats[]) => void;
  setDashboardLastUpdate: (date: Date | null) => void;
  setDashboardLoading: (loading: boolean) => void;
  triggerKpiRefresh: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // Initial Auth State
      isAuthenticated: false,
      user: null,
      token: null,
      pendingRoleSelection: false,
      
      // Initial Navigation State
      currentPage: 'dashboard',
      dateRange: getDefaultDateRange(),
      selectedProjects: [],
      dashboardStats: [],
      dashboardLastUpdate: null,
      dashboardLoading: false,
      kpiRefreshTrigger: 0,
      
      // Auth Actions
      login: (token, user, firstLogin) => {
        localStorage.setItem('auth_token', token);
        const firstPage = getFirstVisiblePage(user?.visiblePages) ?? 'dashboard';
        set({ 
          isAuthenticated: true, 
          token, 
          user,
          pendingRoleSelection: firstLogin === true,
          currentPage: firstPage
        });
      },
      
      logout: () => {
        localStorage.removeItem('auth_token');
        set({ 
          isAuthenticated: false, 
          token: null, 
          user: null,
          pendingRoleSelection: false,
          dashboardStats: [],
          dashboardLastUpdate: null
        });
      },
      
      updateUser: (user) =>
        set((state) => {
          const firstPage = getFirstVisiblePage(user?.visiblePages) ?? 'dashboard';
          const currentStillVisible = user?.visiblePages && user.visiblePages[state.currentPage] === true;
          const nextPage = currentStillVisible ? state.currentPage : firstPage;
          return { user, currentPage: nextPage };
        }),
      setPendingRoleSelection: (value) => set({ pendingRoleSelection: value }),
      
      // Navigation Actions
      setCurrentPage: (page) => set({ currentPage: page }),
      setDateRange: (range) => set({ dateRange: range }),
      setSelectedProjects: (projects) => set({ selectedProjects: projects }),
      setDashboardStats: (stats) => set({ dashboardStats: stats }),
      setDashboardLastUpdate: (date) => set({ dashboardLastUpdate: date }),
      setDashboardLoading: (loading) => set({ dashboardLoading: loading }),
      triggerKpiRefresh: () => set((state) => ({ kpiRefreshTrigger: state.kpiRefreshTrigger + 1 })),
    }),
    {
      name: 'jira-kpi-auth',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        token: state.token
        // pendingRoleSelection not persisted so refresh doesn't trap on role screen
      })
    }
  )
);
