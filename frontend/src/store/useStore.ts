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
  /** Clés projet listées par GET /jira/projects (non persisté) — sélection vide = « tous » = ces clés */
  selectableProjectKeys: string[];

  // Dashboard cache
  dashboardStats: BoardStats[];
  dashboardLastUpdate: Date | null;
  dashboardLoading: boolean;
  /** Sprint actif vs période — persisted so navigation does not reset filters */
  dashboardUseActiveSprint: boolean;
  /** Last successful load key (boards + dates + mode) — skip HTTP when unchanged */
  dashboardLastFiltersKey: string | null;

  /** Support Board KPI cache (full API payload) */
  supportKpiPayload: unknown | null;
  supportKpiLastUpdate: Date | null;
  supportLastFiltersKey: string | null;
  supportUseActiveSprint: boolean;

  /** Suivi épics — cache liste + filtres (persistés) */
  epicsProgressPayload: unknown | null;
  epicsProgressLastUpdate: Date | null;
  epicsLastFiltersKey: string | null;
  epicsSelectedBoardId: number | null;
  epicsTypeFilter: 'all' | 'epic' | 'legend';
  epicsStatusFilter: 'all' | 'done' | 'new' | 'indeterminate';
  epicsPage: number;
  /** Préfixe résumé INT/FAC/… ou 'all' */
  epicsPrefixFilter: string;

  /** Page Détail utilisateurs — cache worklog/report partagé + mode sprint */
  usersPageUseActiveSprint: boolean;
  usersReportPayload: unknown | null;
  usersReportLastUpdate: Date | null;
  usersLastFiltersKey: string | null;
  
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
  setSelectableProjectKeys: (keys: string[]) => void;
  setDashboardStats: (stats: BoardStats[]) => void;
  setDashboardLastUpdate: (date: Date | null) => void;
  setDashboardLoading: (loading: boolean) => void;
  setDashboardUseActiveSprint: (value: boolean) => void;
  setDashboardLastFiltersKey: (key: string | null) => void;
  setSupportKpiPayload: (payload: unknown | null) => void;
  setSupportKpiLastUpdate: (date: Date | null) => void;
  setSupportLastFiltersKey: (key: string | null) => void;
  setSupportUseActiveSprint: (value: boolean) => void;
  setEpicsProgressPayload: (payload: unknown | null) => void;
  setEpicsProgressLastUpdate: (date: Date | null) => void;
  setEpicsLastFiltersKey: (key: string | null) => void;
  setEpicsSelectedBoardId: (id: number | null) => void;
  setEpicsTypeFilter: (v: 'all' | 'epic' | 'legend') => void;
  setEpicsStatusFilter: (v: 'all' | 'done' | 'new' | 'indeterminate') => void;
  setEpicsPage: (n: number) => void;
  setEpicsPrefixFilter: (v: string) => void;
  setUsersPageUseActiveSprint: (value: boolean) => void;
  setUsersReportPayload: (payload: unknown | null) => void;
  setUsersReportLastUpdate: (date: Date | null) => void;
  setUsersLastFiltersKey: (key: string | null) => void;
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
      selectableProjectKeys: [],
      dashboardStats: [],
      dashboardLastUpdate: null,
      dashboardLoading: false,
      dashboardUseActiveSprint: true,
      dashboardLastFiltersKey: null,
      supportKpiPayload: null,
      supportKpiLastUpdate: null,
      supportLastFiltersKey: null,
      supportUseActiveSprint: true,
      epicsProgressPayload: null,
      epicsProgressLastUpdate: null,
      epicsLastFiltersKey: null,
      epicsSelectedBoardId: null,
      epicsTypeFilter: 'all',
      epicsStatusFilter: 'all',
      epicsPage: 1,
      epicsPrefixFilter: 'all',
      usersPageUseActiveSprint: true,
      usersReportPayload: null,
      usersReportLastUpdate: null,
      usersLastFiltersKey: null,
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
          dashboardLastUpdate: null,
          dashboardLastFiltersKey: null,
          dashboardUseActiveSprint: true,
          supportKpiPayload: null,
          supportKpiLastUpdate: null,
          supportLastFiltersKey: null,
          supportUseActiveSprint: true,
          epicsProgressPayload: null,
          epicsProgressLastUpdate: null,
          epicsLastFiltersKey: null,
          epicsSelectedBoardId: null,
          epicsTypeFilter: 'all',
          epicsStatusFilter: 'all',
          epicsPage: 1,
          epicsPrefixFilter: 'all',
          usersPageUseActiveSprint: true,
          usersReportPayload: null,
          usersReportLastUpdate: null,
          usersLastFiltersKey: null,
          selectableProjectKeys: []
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
      setSelectableProjectKeys: (keys) => set({ selectableProjectKeys: keys }),
      setDashboardStats: (stats) => set({ dashboardStats: stats }),
      setDashboardLastUpdate: (date) => set({ dashboardLastUpdate: date }),
      setDashboardLoading: (loading) => set({ dashboardLoading: loading }),
      setDashboardUseActiveSprint: (value) => set({ dashboardUseActiveSprint: value }),
      setDashboardLastFiltersKey: (key) => set({ dashboardLastFiltersKey: key }),
      setSupportKpiPayload: (payload) => set({ supportKpiPayload: payload }),
      setSupportKpiLastUpdate: (date) => set({ supportKpiLastUpdate: date }),
      setSupportLastFiltersKey: (key) => set({ supportLastFiltersKey: key }),
      setSupportUseActiveSprint: (value) => set({ supportUseActiveSprint: value }),
      setEpicsProgressPayload: (payload) => set({ epicsProgressPayload: payload }),
      setEpicsProgressLastUpdate: (date) => set({ epicsProgressLastUpdate: date }),
      setEpicsLastFiltersKey: (key) => set({ epicsLastFiltersKey: key }),
      setEpicsSelectedBoardId: (id) => set({ epicsSelectedBoardId: id }),
      setEpicsTypeFilter: (v) => set({ epicsTypeFilter: v }),
      setEpicsStatusFilter: (v) => set({ epicsStatusFilter: v }),
      setEpicsPage: (n) => set({ epicsPage: n }),
      setEpicsPrefixFilter: (v) => set({ epicsPrefixFilter: v }),
      setUsersPageUseActiveSprint: (value) => set({ usersPageUseActiveSprint: value }),
      setUsersReportPayload: (payload) => set({ usersReportPayload: payload }),
      setUsersReportLastUpdate: (date) => set({ usersReportLastUpdate: date }),
      setUsersLastFiltersKey: (key) => set({ usersLastFiltersKey: key }),
      triggerKpiRefresh: () => set((state) => ({ kpiRefreshTrigger: state.kpiRefreshTrigger + 1 })),
    }),
    {
      name: 'jira-kpi-auth',
      merge: (persistedState, currentState) => {
        if (persistedState == null) return currentState as AppState;
        const p = persistedState as Partial<AppState> & {
          dashboardLastUpdate?: string | null;
          supportKpiLastUpdate?: string | null;
          epicsProgressLastUpdate?: string | null;
          usersReportLastUpdate?: string | null;
        };
        const merged = { ...currentState, ...p } as AppState;
        if (p.dashboardLastUpdate != null && typeof p.dashboardLastUpdate === 'string') {
          merged.dashboardLastUpdate = new Date(p.dashboardLastUpdate);
        }
        if (p.supportKpiLastUpdate != null && typeof p.supportKpiLastUpdate === 'string') {
          merged.supportKpiLastUpdate = new Date(p.supportKpiLastUpdate);
        }
        if (p.epicsProgressLastUpdate != null && typeof p.epicsProgressLastUpdate === 'string') {
          merged.epicsProgressLastUpdate = new Date(p.epicsProgressLastUpdate);
        }
        if (p.usersReportLastUpdate != null && typeof p.usersReportLastUpdate === 'string') {
          merged.usersReportLastUpdate = new Date(p.usersReportLastUpdate);
        }
        return merged;
      },
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        token: state.token,
        dateRange: state.dateRange,
        dashboardStats: state.dashboardStats,
        dashboardLastUpdate: state.dashboardLastUpdate?.toISOString() ?? null,
        dashboardLastFiltersKey: state.dashboardLastFiltersKey,
        dashboardUseActiveSprint: state.dashboardUseActiveSprint,
        supportKpiPayload: state.supportKpiPayload,
        supportKpiLastUpdate: state.supportKpiLastUpdate?.toISOString() ?? null,
        supportLastFiltersKey: state.supportLastFiltersKey,
        supportUseActiveSprint: state.supportUseActiveSprint,
        epicsProgressPayload: state.epicsProgressPayload,
        epicsProgressLastUpdate: state.epicsProgressLastUpdate?.toISOString() ?? null,
        epicsLastFiltersKey: state.epicsLastFiltersKey,
        epicsSelectedBoardId: state.epicsSelectedBoardId,
        epicsTypeFilter: state.epicsTypeFilter,
        epicsStatusFilter: state.epicsStatusFilter,
        epicsPage: state.epicsPage,
        epicsPrefixFilter: state.epicsPrefixFilter,
        usersPageUseActiveSprint: state.usersPageUseActiveSprint,
        selectedProjects: state.selectedProjects,
        usersReportPayload: state.usersReportPayload,
        usersReportLastUpdate: state.usersReportLastUpdate?.toISOString() ?? null,
        usersLastFiltersKey: state.usersLastFiltersKey
      })
    }
  )
);
