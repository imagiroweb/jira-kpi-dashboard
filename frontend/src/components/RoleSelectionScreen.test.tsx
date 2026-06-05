import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createAuthApiMock } from '@/test/mocks/authApi';
import { resetStore } from '@/test/mocks/store';
import { TEST_USER } from '@/test/fixtures/users';
import { useStore } from '@/store/useStore';

vi.mock('../services/authApi', () => ({ authApi: createAuthApiMock() }));

import { authApi } from '../services/authApi';
import { RoleSelectionScreen } from './RoleSelectionScreen';

const mockGetRolesForSignup = vi.mocked(authApi.getRolesForSignup);
const mockUpdateMyRole = vi.mocked(authApi.updateMyRole);

const TEST_ROLES = [
  { id: 'role-dev', name: 'Développeur' },
  { id: 'role-pm', name: 'Chef de projet' },
];

describe('RoleSelectionScreen', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    mockGetRolesForSignup.mockResolvedValue(TEST_ROLES);
  });

  it('charge les rôles et pré-sélectionne le premier', async () => {
    renderWithProviders(<RoleSelectionScreen />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText('Première connexion')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('role-dev');
    expect(screen.getByText('Développeur')).toBeInTheDocument();
    expect(screen.getByText('Chef de projet')).toBeInTheDocument();
  });

  it('permet de changer de rôle et de valider', async () => {
    const updatedUser = { ...TEST_USER, roleName: 'Chef de projet' };
    mockUpdateMyRole.mockResolvedValue(updatedUser);

    useStore.getState().setPendingRoleSelection(true);

    renderWithProviders(<RoleSelectionScreen />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'role-pm' },
    });
    fireEvent.click(screen.getByRole('button', { name: /valider et continuer/i }));

    await waitFor(() => {
      expect(mockUpdateMyRole).toHaveBeenCalledWith('role-pm');
    });

    expect(useStore.getState().user?.roleName).toBe('Chef de projet');
    expect(useStore.getState().pendingRoleSelection).toBe(false);
  });

  it('affiche une erreur si le chargement des rôles échoue', async () => {
    mockGetRolesForSignup.mockRejectedValue(new Error('Network error'));

    renderWithProviders(<RoleSelectionScreen />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText(/impossible de charger les rôles/i)).toBeInTheDocument();
    });
  });
});
