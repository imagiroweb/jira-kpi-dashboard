import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createAuthApiMock } from '@/test/mocks/authApi';
import { resetStore } from '@/test/mocks/store';
import { TEST_USER } from '@/test/fixtures/users';
import { useStore } from '@/store/useStore';

vi.mock('../services/authApi', () => ({ authApi: createAuthApiMock() }));

import { authApi } from '../services/authApi';
import { LoginPage } from './LoginPage';

const mockLogin = vi.mocked(authApi.login);
const mockGetMicrosoftConfig = vi.mocked(authApi.getMicrosoftConfig);
const mockGetRolesForSignup = vi.mocked(authApi.getRolesForSignup);

describe('LoginPage', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    mockGetMicrosoftConfig.mockResolvedValue({
      enabled: false,
      clientId: '',
      tenantId: '',
      redirectUri: '',
    });
    mockGetRolesForSignup.mockResolvedValue([]);
  });

  it('connecte l’utilisateur en cas de login réussi', async () => {
    mockLogin.mockResolvedValue({
      success: true,
      token: 'jwt-token',
      user: TEST_USER,
    });

    renderWithProviders(<LoginPage />, { user: null });

    fireEvent.change(screen.getByPlaceholderText('votre@email.com'), {
      target: { value: 'admin@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin@test.com', 'password123');
    });

    await waitFor(() => {
      expect(useStore.getState().isAuthenticated).toBe(true);
      expect(useStore.getState().user?.email).toBe('admin@test.com');
    });
  });

  it('affiche une erreur en cas d’échec de connexion', async () => {
    mockLogin.mockResolvedValue({
      success: false,
      error: 'Identifiants invalides',
    });

    renderWithProviders(<LoginPage />, { user: null });

    fireEvent.change(screen.getByPlaceholderText('votre@email.com'), {
      target: { value: 'wrong@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
      target: { value: 'wrongpass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => {
      expect(screen.getByText('Identifiants invalides')).toBeInTheDocument();
    });

    expect(useStore.getState().isAuthenticated).toBe(false);
  });

  it('bascule vers le mode inscription via le lien Créer un compte', async () => {
    mockGetRolesForSignup.mockResolvedValue([
      { id: 'role-1', name: 'Développeur' },
    ]);

    renderWithProviders(<LoginPage />, { user: null });

    await waitFor(() => {
      expect(screen.getByText(/connectez-vous à votre compte/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /créer un compte/i }));

    await waitFor(() => {
      expect(screen.getByText(/créez votre compte/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Jean')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Dupont')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /créer mon compte/i })).toBeInTheDocument();
    });
  });

  it('n’affiche pas le bouton Microsoft quand le SSO est désactivé', async () => {
    mockGetMicrosoftConfig.mockResolvedValue({
      enabled: false,
      clientId: '',
      tenantId: '',
      redirectUri: '',
    });

    renderWithProviders(<LoginPage />, { user: null });

    await waitFor(() => {
      expect(mockGetMicrosoftConfig).toHaveBeenCalled();
    });

    expect(screen.queryByRole('button', { name: /microsoft/i })).not.toBeInTheDocument();
  });

  it('affiche la page mot de passe oublié au clic sur le lien', async () => {
    renderWithProviders(<LoginPage />, { user: null });

    await waitFor(() => {
      expect(screen.getByText(/mot de passe oublié/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /mot de passe oublié/i }));

    expect(screen.getByRole('button', { name: /envoyer le lien/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /se connecter/i })).not.toBeInTheDocument();
  });
});
