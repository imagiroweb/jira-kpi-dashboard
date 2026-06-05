import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { TEST_USER, TEST_VISIBLE_PAGES_ALL } from '@/test/fixtures/users';
import { createAuthApiMock } from '@/test/mocks/authApi';
import { resetStore } from '@/test/mocks/store';
import type { User } from '../store/useStore';

vi.mock('../services/authApi', () => ({ authApi: createAuthApiMock() }));

import { authApi } from '../services/authApi';
import { UserManagementPage } from './UserManagementPage';

const mockGetUsersAndRoles = vi.mocked(authApi.getUsersAndRoles);
const mockUpdateUserRole = vi.mocked(authApi.updateUserRole);
const mockGetUserLogs = vi.mocked(authApi.getUserLogs);
const mockGetUserPageStats = vi.mocked(authApi.getUserPageStats);
const mockUpdateRole = vi.mocked(authApi.updateRole);
const mockCreateRole = vi.mocked(authApi.createRole);

const SUPER_ADMIN: User = {
  ...TEST_USER,
  role: 'super_admin',
};

const REGULAR_USER: User = {
  ...TEST_USER,
  role: null,
  visiblePages: {
    ...TEST_VISIBLE_PAGES_ALL,
    gestionUtilisateurs: false,
  },
};

describe('UserManagementPage', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    mockGetUsersAndRoles.mockResolvedValue({
      users: [
        {
          id: 'u1',
          email: 'alice@test.com',
          firstName: 'Alice',
          lastName: 'Martin',
          provider: 'local',
          isActive: true,
          role: null,
          roleId: 'role-1',
          roleName: 'Utilisateur',
        },
        {
          id: 'u2',
          email: 'bob@test.com',
          firstName: 'Bob',
          lastName: 'Durand',
          provider: 'microsoft',
          isActive: true,
          role: 'super_admin',
          roleId: null,
          roleName: 'Super admin',
        },
      ],
      roles: [
        {
          id: 'role-1',
          name: 'Utilisateur',
          pageVisibilities: TEST_VISIBLE_PAGES_ALL,
        },
      ],
    });
    mockUpdateUserRole.mockResolvedValue({ ...TEST_USER, id: 'u1', role: null, roleName: 'Utilisateur' });
    mockGetUserLogs.mockResolvedValue([]);
    mockGetUserPageStats.mockResolvedValue({ pages: {}, total: 0, percentages: {}, daily: [] });
    mockUpdateRole.mockResolvedValue({
      id: 'role-1',
      name: 'Utilisateur',
      pageVisibilities: TEST_VISIBLE_PAGES_ALL,
    });
    mockCreateRole.mockResolvedValue({
      id: 'role-2',
      name: 'Éditeur',
      pageVisibilities: TEST_VISIBLE_PAGES_ALL,
    });
  });

  it('bloque l’accès aux utilisateurs non super admin', () => {
    renderWithProviders(<UserManagementPage />, { user: REGULAR_USER });

    expect(screen.getByText('Accès réservé')).toBeInTheDocument();
    expect(screen.getByText(/super administrateurs/i)).toBeInTheDocument();
    expect(mockGetUsersAndRoles).not.toHaveBeenCalled();
  });

  it('affiche la liste des utilisateurs pour un super admin', async () => {
    renderWithProviders(<UserManagementPage />, { user: SUPER_ADMIN });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Gestion des utilisateurs' })).toBeInTheDocument();
    });

    expect(mockGetUsersAndRoles).toHaveBeenCalled();
    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    expect(screen.getByText('bob@test.com')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Utilisateurs' })).toBeInTheDocument();
  });

  it('autorise l’accès via visiblePages.gestionUtilisateurs', async () => {
    const delegatedAdmin: User = {
      ...TEST_USER,
      role: null,
      visiblePages: {
        ...TEST_VISIBLE_PAGES_ALL,
        gestionUtilisateurs: true,
      },
    };

    renderWithProviders(<UserManagementPage />, { user: delegatedAdmin });

    await waitFor(() => {
      expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    });
  });

  it('affiche une erreur si le chargement des utilisateurs échoue', async () => {
    mockGetUsersAndRoles.mockRejectedValueOnce({
      response: { data: { error: 'Serveur indisponible' } },
    });

    renderWithProviders(<UserManagementPage />, { user: SUPER_ADMIN });

    await waitFor(() => {
      expect(screen.getByText('Serveur indisponible')).toBeInTheDocument();
    });
  });

  it('met à jour le rôle d’un utilisateur via le sélecteur', async () => {
    mockUpdateUserRole.mockResolvedValueOnce({
      ...TEST_USER,
      id: 'u1',
      role: 'super_admin',
      roleName: 'Super admin',
    });

    renderWithProviders(<UserManagementPage />, { user: SUPER_ADMIN });

    await waitFor(() => {
      expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    });

    const aliceRow = screen.getByText('alice@test.com').closest('tr')!;
    const select = within(aliceRow).getByRole('combobox');
    fireEvent.change(select, { target: { value: 'super_admin' } });

    await waitFor(() => {
      expect(mockUpdateUserRole).toHaveBeenCalledWith('u1', 'super_admin', null);
    });
  });

  it('affiche une erreur si la mise à jour du rôle échoue', async () => {
    mockUpdateUserRole.mockRejectedValueOnce({ message: 'Mise à jour refusée' });

    renderWithProviders(<UserManagementPage />, { user: SUPER_ADMIN });

    await waitFor(() => {
      expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    });

    const aliceRow = screen.getByText('alice@test.com').closest('tr')!;
    fireEvent.change(within(aliceRow).getByRole('combobox'), { target: { value: 'super_admin' } });

    await waitFor(() => {
      expect(screen.getByText('Mise à jour refusée')).toBeInTheDocument();
    });
  });

  it('ouvre le drawer activité avec logs de connexion et stats de navigation', async () => {
    mockGetUserLogs.mockResolvedValueOnce([
      { id: 'log-1', type: 'login', timestamp: '2026-03-15T10:00:00.000Z' },
    ]);
    mockGetUserPageStats.mockResolvedValueOnce({
      pages: { dashboard: 6, support: 4 },
      total: 10,
      percentages: { dashboard: 60, support: 40 },
      daily: [],
    });

    renderWithProviders(<UserManagementPage />, { user: SUPER_ADMIN });

    await waitFor(() => {
      expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('alice@test.com'));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Activité utilisateur' })).toBeInTheDocument();
    });

    expect(mockGetUserLogs).toHaveBeenCalledWith('u1', 10);
    expect(mockGetUserPageStats).toHaveBeenCalledWith('u1', 30);
    expect(screen.getByText(/Connexion —/)).toBeInTheDocument();

    const drawer = screen.getByRole('heading', { name: 'Activité utilisateur' }).closest('[aria-modal="true"]')!;
    expect(within(drawer as HTMLElement).getByText('60%')).toBeInTheDocument();
    expect(within(drawer as HTMLElement).getByText('Logs de navigation')).toBeInTheDocument();
  });

  it('ouvre la modale de toutes les connexions depuis le drawer', async () => {
    mockGetUserLogs
      .mockResolvedValueOnce([{ id: 'log-1', type: 'login', timestamp: '2026-03-15T10:00:00.000Z' }])
      .mockResolvedValueOnce([
        { id: 'log-1', type: 'login', timestamp: '2026-03-15T10:00:00.000Z' },
        { id: 'log-2', type: 'login', timestamp: '2026-03-16T11:00:00.000Z' },
      ]);

    renderWithProviders(<UserManagementPage />, { user: SUPER_ADMIN });

    await waitFor(() => {
      expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('alice@test.com'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Voir toutes les connexions/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Voir toutes les connexions/i }));

    await waitFor(() => {
      expect(mockGetUserLogs).toHaveBeenCalledWith('u1', 500);
      expect(screen.getByRole('heading', { name: 'Toutes les connexions' })).toBeInTheDocument();
    });
  });

  it('permet de modifier un rôle existant', async () => {
    renderWithProviders(<UserManagementPage />, { user: SUPER_ADMIN });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Modifier/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Modifier/i }));
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/i }));

    await waitFor(() => {
      expect(mockUpdateRole).toHaveBeenCalledWith('role-1', {
        name: 'Utilisateur',
        pageVisibilities: TEST_VISIBLE_PAGES_ALL,
      });
    });
  });

  it('crée un nouveau rôle', async () => {
    renderWithProviders(<UserManagementPage />, { user: SUPER_ADMIN });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ajouter un rôle/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Ajouter un rôle/i }));
    fireEvent.change(screen.getByPlaceholderText('Nom du rôle'), { target: { value: 'Éditeur' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer/i }));

    await waitFor(() => {
      expect(mockCreateRole).toHaveBeenCalledWith('Éditeur', expect.objectContaining({ dashboard: true }));
    });
  });
});
