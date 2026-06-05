import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { resetStore } from '@/test/mocks/store';
import {
  TEST_USER,
  TEST_VISIBLE_PAGES_ALL,
  TEST_VISIBLE_PAGES_DASHBOARD_ONLY,
} from '@/test/fixtures/users';
import { useStore, type User } from '@/store/useStore';
const mockForceSync = vi.hoisted(() => vi.fn());
const socketCtx = vi.hoisted(() => ({
  isConnected: true,
  clientsCount: 1,
  lastPing: Date.now(),
  subscribeToProject: vi.fn(),
  unsubscribeFromProject: vi.fn(),
  requestSync: vi.fn(),
  ping: vi.fn(),
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../services/api', () => ({
  syncApi: { forceSync: mockForceSync },
}));

vi.mock('../hooks/useSocketContext', () => ({
  useSocketContext: () => socketCtx,
  useSocketOptional: () => socketCtx,
}));

import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  const onNavigate = vi.fn();

  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    mockForceSync.mockResolvedValue({ success: true, projectsSynced: 3 });
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('filtre les pages selon visiblePages de l’utilisateur', () => {
    const limitedUser: User = {
      ...TEST_USER,
      visiblePages: TEST_VISIBLE_PAGES_DASHBOARD_ONLY,
    };

    renderWithProviders(
      <Sidebar currentPage="dashboard" onNavigate={onNavigate} />,
      { user: limitedUser, socket: true }
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Support Board')).not.toBeInTheDocument();
    expect(screen.queryByText('Utilisateurs')).not.toBeInTheDocument();
    expect(screen.queryByText('Gestion des utilisateurs')).not.toBeInTheDocument();
  });

  it('affiche toutes les pages quand visiblePages autorise tout', () => {
    const fullUser: User = {
      ...TEST_USER,
      visiblePages: TEST_VISIBLE_PAGES_ALL,
    };

    renderWithProviders(
      <Sidebar currentPage="dashboard" onNavigate={onNavigate} />,
      { user: fullUser, socket: true }
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Support Board')).toBeInTheDocument();
    expect(screen.getByText('Utilisateurs')).toBeInTheDocument();
    expect(screen.getByText('Suivi epics')).toBeInTheDocument();
    expect(screen.getByText('Marketing')).toBeInTheDocument();
    expect(screen.getByText('Produit')).toBeInTheDocument();
    expect(screen.getByText('Gestion des utilisateurs')).toBeInTheDocument();
  });

  it('déclenche forceSync et notifie en cas de succès', async () => {
    const notifySuccess = socketCtx.notify.success;
    const initialTrigger = useStore.getState().kpiRefreshTrigger;

    renderWithProviders(
      <Sidebar currentPage="dashboard" onNavigate={onNavigate} />,
      { user: TEST_USER, socket: true }
    );

    fireEvent.click(screen.getByTitle('Synchroniser les données Jira'));

    await waitFor(() => {
      expect(mockForceSync).toHaveBeenCalled();
    });

    expect(notifySuccess).toHaveBeenCalledWith(
      'Synchronisation',
      '3 projet(s) synchronisé(s)'
    );
    expect(useStore.getState().kpiRefreshTrigger).toBeGreaterThan(initialTrigger);
  });

  it('déconnecte l’utilisateur après confirmation', () => {
    const confirmMock = vi.mocked(window.confirm);
    confirmMock.mockReturnValue(true);

    renderWithProviders(
      <Sidebar currentPage="dashboard" onNavigate={onNavigate} />,
      { user: TEST_USER, socket: true }
    );

    fireEvent.click(screen.getByTitle('Se déconnecter'));

    expect(confirmMock).toHaveBeenCalledWith('Êtes-vous sûr de vouloir vous déconnecter ?');
    expect(useStore.getState().isAuthenticated).toBe(false);
    expect(useStore.getState().user).toBeNull();
  });

  it('ne déconnecte pas si l’utilisateur annule la confirmation', () => {
    const confirmMock = vi.mocked(window.confirm);
    confirmMock.mockReturnValue(false);

    renderWithProviders(
      <Sidebar currentPage="dashboard" onNavigate={onNavigate} />,
      { user: TEST_USER, socket: true }
    );

    fireEvent.click(screen.getByTitle('Se déconnecter'));

    expect(useStore.getState().isAuthenticated).toBe(true);
    expect(useStore.getState().user?.email).toBe(TEST_USER.email);
  });
});
