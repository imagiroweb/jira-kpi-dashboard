import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthApiMock } from '@/test/mocks/authApi';
import { resetStore, seedAuthenticatedUser } from '@/test/mocks/store';
import { TEST_USER } from '@/test/fixtures/users';
import { useStore } from '@/store/useStore';

vi.mock('./services/authApi', () => ({ authApi: createAuthApiMock() }));

vi.mock('./components/MicrosoftCallback', () => ({
  MicrosoftCallback: () => <div data-testid="microsoft-callback">Callback Microsoft</div>,
}));

vi.mock('./components/SprintDashboard', () => ({
  SprintDashboard: () => <div data-testid="sprint-dashboard">Dashboard</div>,
}));
vi.mock('./components/SupportDashboard', () => ({
  SupportDashboard: () => null,
}));
vi.mock('./components/UserDetailPage', () => ({
  UserDetailPage: () => null,
}));
vi.mock('./components/EpicProgressPage', () => ({
  EpicProgressPage: () => null,
}));
vi.mock('./components/MarketingDashboard', () => ({
  MarketingDashboard: () => null,
}));
vi.mock('./components/ProduitDashboard', () => ({
  ProduitDashboard: () => null,
}));
vi.mock('./components/UserManagementPage', () => ({
  UserManagementPage: () => null,
}));
vi.mock('./components/Sidebar', () => ({
  Sidebar: () => <nav data-testid="sidebar">Sidebar</nav>,
}));

vi.mock('./contexts/SocketContext', () => ({
  SocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { authApi } from './services/authApi';
import App from './App';

const mockVerifyToken = vi.mocked(authApi.verifyToken);
const mockGetCurrentUser = vi.mocked(authApi.getCurrentUser);
const mockGetMicrosoftConfig = vi.mocked(authApi.getMicrosoftConfig);
const mockGetRolesForSignup = vi.mocked(authApi.getRolesForSignup);

function stubWindowLocation(pathname: string, search = '') {
  vi.stubGlobal('location', {
    ...window.location,
    pathname,
    search,
    hash: '',
    href: `${pathname}${search}`,
  });
}

describe('App', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    stubWindowLocation('/');
    mockGetMicrosoftConfig.mockResolvedValue({
      enabled: false,
      clientId: '',
      tenantId: '',
      redirectUri: '',
    });
    mockGetRolesForSignup.mockResolvedValue([]);
    mockVerifyToken.mockResolvedValue(true);
    mockGetCurrentUser.mockResolvedValue(TEST_USER);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('affiche la page callback Microsoft sur /auth/microsoft/callback', () => {
    stubWindowLocation('/auth/microsoft/callback');

    render(<App />);

    expect(screen.getByTestId('microsoft-callback')).toBeInTheDocument();
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it('affiche ResetPasswordPage sur /reset-password?token=', async () => {
    stubWindowLocation('/reset-password', '?token=reset-token-abc');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Min. 12 caractères')).toBeInTheDocument();
    });

    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it('affiche le loader pendant la vérification du token', async () => {
    seedAuthenticatedUser();
    let resolveVerify!: (value: boolean) => void;
    mockVerifyToken.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveVerify = resolve;
        })
    );

    render(<App />);

    expect(screen.getByText('Chargement...')).toBeInTheDocument();

    await act(async () => {
      resolveVerify(true);
    });

    await waitFor(() => {
      expect(screen.queryByText('Chargement...')).not.toBeInTheDocument();
    });
  });

  it('redirige vers LoginPage si l’utilisateur n’est pas authentifié', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/connectez-vous à votre compte/i)).toBeInTheDocument();
    });

    expect(useStore.getState().isAuthenticated).toBe(false);
  });

  it('déconnecte l’utilisateur si verifyToken échoue', async () => {
    seedAuthenticatedUser(undefined, 'expired-token');
    mockVerifyToken.mockResolvedValue(false);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/connectez-vous à votre compte/i)).toBeInTheDocument();
    });

    expect(useStore.getState().isAuthenticated).toBe(false);
    expect(useStore.getState().token).toBeNull();
  });

  it('affiche RoleSelectionScreen quand pendingRoleSelection est actif', async () => {
    seedAuthenticatedUser();
    useStore.getState().setPendingRoleSelection(true);
    mockGetRolesForSignup.mockResolvedValue([{ id: 'role-1', name: 'Développeur' }]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Première connexion')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
  });

  it('affiche l’application authentifiée après vérification réussie', async () => {
    seedAuthenticatedUser();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('sidebar')).toBeInTheDocument();
      expect(screen.getByTestId('sprint-dashboard')).toBeInTheDocument();
    });

    expect(mockVerifyToken).toHaveBeenCalled();
    expect(mockGetCurrentUser).toHaveBeenCalled();
  });
});
