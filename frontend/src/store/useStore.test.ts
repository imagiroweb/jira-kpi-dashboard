import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    visiblePages: {
      dashboard: true,
      users: false,
      support: false,
      epics: false,
      marketing: false,
      produit: false,
      gestionUtilisateurs: false,
    },
  };

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    });
    useStore.setState({
      isAuthenticated: false,
      user: null,
      token: null,
      pendingRoleSelection: false,
      currentPage: 'dashboard',
    });
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
});
