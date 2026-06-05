import { screen, waitFor } from '@testing-library/react';
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
});
