import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_VISIBLE_PAGES_DASHBOARD_ONLY } from '@/test/fixtures/users';
import { resetStore } from '@/test/mocks/store';
import { getFirstVisiblePage, useStore, type User, type VisiblePages } from './useStore';

describe('getFirstVisiblePage', () => {
  it('retourne null si visiblePages est null ou undefined', () => {
    expect(getFirstVisiblePage(null)).toBeNull();
    expect(getFirstVisiblePage(undefined)).toBeNull();
  });

  it('retourne la première page visible selon PAGE_ORDER (dashboard en premier)', () => {
    const visible: VisiblePages = {
      dashboard: true,
      users: true,
      support: false,
      epics: false,
      marketing: false,
      produit: false,
      gestionUtilisateurs: false,
    };
    expect(getFirstVisiblePage(visible)).toBe('dashboard');
  });

  it('retourne la première page visible quand dashboard est false', () => {
    const visible: VisiblePages = {
      dashboard: false,
      users: true,
      support: true,
      epics: false,
      marketing: false,
      produit: false,
      gestionUtilisateurs: false,
    };
    expect(getFirstVisiblePage(visible)).toBe('users');
  });

  it('retourne null si aucune page n’est visible', () => {
    const visible: VisiblePages = {
      dashboard: false,
      users: false,
      support: false,
      epics: false,
      marketing: false,
      produit: false,
      gestionUtilisateurs: false,
    };
    expect(getFirstVisiblePage(visible)).toBeNull();
  });

  it('retourne la première dans l’ordre (support avant marketing si les deux visibles)', () => {
    const visible: VisiblePages = {
      dashboard: false,
      users: false,
      support: true,
      epics: false,
      marketing: true,
      produit: false,
      gestionUtilisateurs: false,
    };
    expect(getFirstVisiblePage(visible)).toBe('support');
  });
});

describe('useStore (auth)', () => {
  const mockUser: User = {
    id: '1',
    email: 'u@test.com',
    provider: 'local',
    visiblePages: TEST_VISIBLE_PAGES_DASHBOARD_ONLY,
  };

  beforeEach(() => {
    resetStore();
  });

  it('login met à jour isAuthenticated, token, user et currentPage', () => {
    useStore.getState().login('jwt-token', mockUser);

    expect(useStore.getState().isAuthenticated).toBe(true);
    expect(useStore.getState().token).toBe('jwt-token');
    expect(useStore.getState().user).toEqual(mockUser);
    expect(useStore.getState().currentPage).toBe('dashboard');
  });

  it('login avec firstLogin met pendingRoleSelection à true', () => {
    useStore.getState().login('jwt-token', mockUser, true);

    expect(useStore.getState().pendingRoleSelection).toBe(true);
  });

  it('logout remet l’état auth à l’état initial', () => {
    useStore.getState().login('jwt-token', mockUser);
    useStore.getState().logout();

    expect(useStore.getState().isAuthenticated).toBe(false);
    expect(useStore.getState().token).toBeNull();
    expect(useStore.getState().user).toBeNull();
    expect(useStore.getState().pendingRoleSelection).toBe(false);
  });

  it('logout réinitialise les caches dashboard, support, epics et users', () => {
    useStore.getState().login('jwt-token', mockUser);
    useStore.setState({
      dashboardStats: [{ boardId: 1, name: 'B', projectKey: 'P', color: '#fff' } as never],
      dashboardLastUpdate: new Date('2025-01-01'),
      dashboardLastFiltersKey: 'filters-1',
      dashboardUseActiveSprint: false,
      supportKpiPayload: { tickets: 5 },
      supportKpiLastUpdate: new Date('2025-01-02'),
      supportLastFiltersKey: 'support-key',
      supportUseActiveSprint: false,
      epicsProgressPayload: { epics: [] },
      epicsProgressLastUpdate: new Date('2025-01-03'),
      epicsLastFiltersKey: 'epics-key',
      epicsSelectedBoardId: 42,
      epicsTypeFilter: 'epic',
      epicsStatusFilter: 'done',
      epicsPage: 3,
      epicsPrefixFilter: 'INT',
      usersPageUseActiveSprint: false,
      usersReportPayload: { rows: [] },
      usersReportLastUpdate: new Date('2025-01-04'),
      usersLastFiltersKey: 'users-key',
      selectableProjectKeys: ['PROJ'],
    });

    useStore.getState().logout();

    const state = useStore.getState();
    expect(state.dashboardStats).toEqual([]);
    expect(state.dashboardLastUpdate).toBeNull();
    expect(state.dashboardLastFiltersKey).toBeNull();
    expect(state.dashboardUseActiveSprint).toBe(true);
    expect(state.supportKpiPayload).toBeNull();
    expect(state.supportKpiLastUpdate).toBeNull();
    expect(state.supportLastFiltersKey).toBeNull();
    expect(state.supportUseActiveSprint).toBe(true);
    expect(state.epicsProgressPayload).toBeNull();
    expect(state.epicsProgressLastUpdate).toBeNull();
    expect(state.epicsLastFiltersKey).toBeNull();
    expect(state.epicsSelectedBoardId).toBeNull();
    expect(state.epicsTypeFilter).toBe('all');
    expect(state.epicsStatusFilter).toBe('all');
    expect(state.epicsPage).toBe(1);
    expect(state.epicsPrefixFilter).toBe('all');
    expect(state.usersPageUseActiveSprint).toBe(true);
    expect(state.usersReportPayload).toBeNull();
    expect(state.usersReportLastUpdate).toBeNull();
    expect(state.usersLastFiltersKey).toBeNull();
    expect(state.selectableProjectKeys).toEqual([]);
  });

  it('updateUser conserve currentPage si la page reste visible', () => {
    useStore.getState().login('jwt-token', mockUser);
    useStore.getState().setCurrentPage('dashboard');

    useStore.getState().updateUser({
      ...mockUser,
      firstName: 'Updated',
      visiblePages: TEST_VISIBLE_PAGES_DASHBOARD_ONLY,
    });

    expect(useStore.getState().user?.firstName).toBe('Updated');
    expect(useStore.getState().currentPage).toBe('dashboard');
  });

  it('updateUser redirige vers la première page visible si la page courante ne l’est plus', () => {
    useStore.getState().login('jwt-token', {
      ...mockUser,
      visiblePages: {
        dashboard: true,
        users: true,
        support: true,
        epics: false,
        marketing: false,
        produit: false,
        gestionUtilisateurs: false,
      },
    });
    useStore.getState().setCurrentPage('support');

    useStore.getState().updateUser({
      ...mockUser,
      visiblePages: {
        dashboard: false,
        users: true,
        support: false,
        epics: false,
        marketing: false,
        produit: false,
        gestionUtilisateurs: false,
      },
    });

    expect(useStore.getState().currentPage).toBe('users');
  });

  it('triggerKpiRefresh incrémente kpiRefreshTrigger', () => {
    expect(useStore.getState().kpiRefreshTrigger).toBe(0);

    useStore.getState().triggerKpiRefresh();
    expect(useStore.getState().kpiRefreshTrigger).toBe(1);

    useStore.getState().triggerKpiRefresh();
    expect(useStore.getState().kpiRefreshTrigger).toBe(2);
  });
});

describe('useStore (persist)', () => {
  beforeEach(() => {
    resetStore();
  });

  it('partialize sérialise les dates LastUpdate en ISO', () => {
    const partialize = useStore.persist.getOptions().partialize!;
    const iso = '2025-03-14T10:00:00.000Z';
    const state = {
      ...useStore.getState(),
      dashboardLastUpdate: new Date(iso),
      supportKpiLastUpdate: new Date(iso),
      epicsProgressLastUpdate: new Date(iso),
      usersReportLastUpdate: new Date(iso),
    };

    const persisted = partialize(state);

    expect(persisted.dashboardLastUpdate).toBe(iso);
    expect(persisted.supportKpiLastUpdate).toBe(iso);
    expect(persisted.epicsProgressLastUpdate).toBe(iso);
    expect(persisted.usersReportLastUpdate).toBe(iso);
  });

  it('merge reconvertit les dates ISO persistées en objets Date', () => {
    const merge = useStore.persist.getOptions().merge!;
    const current = useStore.getState();
    const iso = '2025-03-14T10:00:00.000Z';

    const merged = merge(
      {
        dashboardLastUpdate: iso,
        supportKpiLastUpdate: iso,
        epicsProgressLastUpdate: iso,
        usersReportLastUpdate: iso,
      },
      current
    );

    expect(merged.dashboardLastUpdate).toEqual(new Date(iso));
    expect(merged.supportKpiLastUpdate).toEqual(new Date(iso));
    expect(merged.epicsProgressLastUpdate).toEqual(new Date(iso));
    expect(merged.usersReportLastUpdate).toEqual(new Date(iso));
  });

  it('merge retourne currentState si persistedState est null', () => {
    const merge = useStore.persist.getOptions().merge!;
    const current = useStore.getState();

    expect(merge(null, current)).toBe(current);
  });
});
