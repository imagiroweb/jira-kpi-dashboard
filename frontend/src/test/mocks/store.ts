import { vi } from 'vitest';
import { useStore, type User } from '@/store/useStore';
import { TEST_USER } from '../fixtures/users';

export { TEST_USER } from '../fixtures/users';

const PERSIST_STORAGE_KEY = 'jira-kpi-auth';
const AUTH_TOKEN_KEY = 'auth_token';

function getDefaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

/** Stub localStorage en mémoire (persist Zustand + auth_token) */
export function stubLocalStorage(): void {
  const storage: Record<string, string> = {};

  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => (key in storage ? storage[key] : null)),
    setItem: vi.fn((key: string, value: string) => {
      storage[key] = String(value);
    }),
    removeItem: vi.fn((key: string) => {
      delete storage[key];
    }),
    clear: vi.fn(() => {
      for (const key of Object.keys(storage)) {
        delete storage[key];
      }
    }),
    get length() {
      return Object.keys(storage).length;
    },
    key: vi.fn((index: number) => Object.keys(storage)[index] ?? null),
  });
}

/** Réinitialise le store Zustand et le persist (à appeler dans beforeEach) */
export function resetStore(): void {
  stubLocalStorage();

  if (useStore.persist?.clearStorage) {
    useStore.persist.clearStorage();
  } else {
    localStorage.removeItem(PERSIST_STORAGE_KEY);
  }
  localStorage.removeItem(AUTH_TOKEN_KEY);

  useStore.setState({
    isAuthenticated: false,
    user: null,
    token: null,
    pendingRoleSelection: false,
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
  });
}

/** Connecte un utilisateur de test (défaut : TEST_USER) */
export function seedAuthenticatedUser(user: User = TEST_USER, token = 'test-jwt-token'): void {
  useStore.getState().login(token, user);
}
