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
    // Pages regroupées : visibles une fois le groupe ouvert.
    expect(screen.getByRole('button', { name: /Suivi performance/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Paramètres/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Gestion des utilisateurs')).not.toBeInTheDocument();
  });

  it('ouvre un groupe au clic et navigue vers une de ses pages', () => {
    renderWithProviders(
      <Sidebar currentPage="dashboard" onNavigate={onNavigate} />,
      { user: { ...TEST_USER, visiblePages: TEST_VISIBLE_PAGES_ALL }, socket: true }
    );

    fireEvent.click(screen.getByRole('button', { name: /Paramètres/ }));

    const group = screen.getByRole('group', { name: 'Paramètres' });
    expect(group).toHaveTextContent('Gestion des utilisateurs');
    expect(group).toHaveTextContent('Coûts horaires');
    fireEvent.click(screen.getByText('Coûts horaires'));
    expect(onNavigate).toHaveBeenCalledWith('couts');

    fireEvent.click(screen.getByRole('button', { name: /Paramètres/ }));
    expect(screen.queryByRole('group', { name: 'Paramètres' })).not.toBeInTheDocument();
  });

  it('ouvre d’office le groupe de la page courante', () => {
    renderWithProviders(
      <Sidebar currentPage="performanceDashboard" onNavigate={onNavigate} />,
      { user: { ...TEST_USER, visiblePages: TEST_VISIBLE_PAGES_ALL }, socket: true }
    );

    expect(screen.getByRole('button', { name: /Suivi performance/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Performance équipe/ })).toHaveAttribute('aria-current', 'page');
  });

  it('affiche directement la seule page visible d’un groupe', () => {
    renderWithProviders(
      <Sidebar currentPage="dashboard" onNavigate={onNavigate} />,
      {
        user: {
          ...TEST_USER,
          visiblePages: { ...TEST_VISIBLE_PAGES_DASHBOARD_ONLY, performance: true },
        },
        socket: true,
      }
    );

    expect(screen.getByText('Ma performance')).toBeInTheDocument();
    expect(screen.queryByText('Suivi performance')).not.toBeInTheDocument();
    expect(screen.queryByText('Paramètres')).not.toBeInTheDocument();
  });

  it('rend la navigation défilante, en-tête et pied fixes', () => {
    renderWithProviders(
      <Sidebar currentPage="dashboard" onNavigate={onNavigate} />,
      { user: TEST_USER, socket: true }
    );

    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(nav.className).toMatch(/overflow-y-auto/);
    expect(nav.className).toMatch(/min-h-0/);
    expect(screen.getByTitle('Se déconnecter').closest('div')?.className).not.toMatch(/absolute/);
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
