import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthApiMock } from '@/test/mocks/authApi';
import { TEST_USER } from '@/test/fixtures/users';
import { resetStore } from '@/test/mocks/store';

vi.mock('../services/authApi', () => ({ authApi: createAuthApiMock() }));

import { authApi } from '../services/authApi';
import { useStore } from '../store/useStore';
import { MicrosoftCallback } from './MicrosoftCallback';

const mockMicrosoftCallback = vi.mocked(authApi.microsoftCallback);

function stubLocation({
  pathname = '/auth/microsoft/callback',
  hash = '',
  search = '',
}: {
  pathname?: string;
  hash?: string;
  search?: string;
} = {}) {
  let href = `${pathname}${search}${hash}`;
  vi.stubGlobal('location', {
    pathname,
    search,
    hash,
    get href() {
      return href;
    },
    set href(value: string) {
      href = value;
    },
  });
  return {
    getHref: () => href,
  };
}

describe('MicrosoftCallback', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    stubLocation();
    vi.stubGlobal('history', {
      replaceState: vi.fn(),
    });
    sessionStorage.setItem('ms_oauth_state', 'st-1');
    sessionStorage.setItem('ms_oauth_nonce', 'nonce-1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('affiche le loader pendant la vérification Microsoft', () => {
    mockMicrosoftCallback.mockImplementation(() => new Promise(() => {}));
    stubLocation({ hash: '#state=st-1&id_token=pending-token' });

    render(<MicrosoftCallback />);

    expect(screen.getByText('Connexion en cours...')).toBeInTheDocument();
    expect(screen.getByText(/Vérification de votre compte Microsoft/i)).toBeInTheDocument();
  });

  it('affiche une erreur si Azure renvoie error dans le hash', async () => {
    stubLocation({ hash: '#error=access_denied&error_description=Connexion%20annulée' });

    render(<MicrosoftCallback />);

    await waitFor(() => {
      expect(screen.getByText('Erreur de connexion')).toBeInTheDocument();
      expect(screen.getByText('Connexion annulée')).toBeInTheDocument();
    });

    expect(mockMicrosoftCallback).not.toHaveBeenCalled();
  });

  it('affiche une erreur si Azure renvoie error dans la query string', async () => {
    stubLocation({ search: '?error=server_error&error_description=Erreur%20serveur' });

    render(<MicrosoftCallback />);

    await waitFor(() => {
      expect(screen.getByText('Erreur serveur')).toBeInTheDocument();
    });
  });

  it('affiche une erreur si l’id_token est absent', async () => {
    stubLocation({ hash: '#state=st-1' });

    render(<MicrosoftCallback />);

    await waitFor(() => {
      expect(screen.getByText(/Jeton d'identité manquant/i)).toBeInTheDocument();
    });
  });

  it('refuse un state qui ne correspond pas à la demande émise (anti-CSRF)', async () => {
    stubLocation({ hash: '#state=forge&id_token=a.b.c' });

    render(<MicrosoftCallback />);

    await waitFor(() => {
      expect(screen.getByText(/Session de connexion expirée ou invalide/i)).toBeInTheDocument();
    });
    expect(mockMicrosoftCallback).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('ms_oauth_nonce')).toBeNull();
  });

  it('affiche une erreur si le token du hash est corrompu (espace / accolade)', async () => {
    stubLocation({ hash: '#state=st-1&id_token=tok%20en' });

    render(<MicrosoftCallback />);

    await waitFor(() => {
      expect(screen.getByText(/Token Microsoft invalide ou corrompu/i)).toBeInTheDocument();
    });
    expect(mockMicrosoftCallback).not.toHaveBeenCalled();
  });

  it('préserve les + de l’id_token avant l’appel backend', async () => {
    stubLocation({ hash: '#state=st-1&id_token=abc%2Bdef' });
    mockMicrosoftCallback.mockResolvedValue({
      success: true,
      token: 'jwt-token',
      user: TEST_USER,
      firstLogin: false,
    });

    render(<MicrosoftCallback />);

    await waitFor(() => {
      expect(mockMicrosoftCallback).toHaveBeenCalledWith('abc+def', 'nonce-1');
    });
  });

  it('connecte l’utilisateur et redirige après succès', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const location = stubLocation({ hash: '#state=st-1&id_token=valid-ms-token' });

    mockMicrosoftCallback.mockResolvedValue({
      success: true,
      token: 'jwt-token',
      user: TEST_USER,
      firstLogin: false,
    });

    render(<MicrosoftCallback />);

    await waitFor(() => {
      expect(screen.getByText('Connexion réussie !')).toBeInTheDocument();
    });

    expect(mockMicrosoftCallback).toHaveBeenCalledWith('valid-ms-token', 'nonce-1');

    vi.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(useStore.getState().isAuthenticated).toBe(true);
      expect(useStore.getState().token).toBe('jwt-token');
      expect(location.getHref()).toBe('/');
    });
  });

  it('affiche une erreur si le backend refuse le token', async () => {
    stubLocation({ hash: '#state=st-1&id_token=bad-token' });
    mockMicrosoftCallback.mockResolvedValue({ success: false, error: 'Compte non autorisé' });

    render(<MicrosoftCallback />);

    await waitFor(() => {
      expect(screen.getByText('Compte non autorisé')).toBeInTheDocument();
    });
  });

  it('affiche une erreur réseau en cas d’exception', async () => {
    stubLocation({ hash: '#state=st-1&id_token=token' });
    mockMicrosoftCallback.mockRejectedValue(new Error('Network error'));

    render(<MicrosoftCallback />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('n’affiche pas une SyntaxError brute (message technique Safari)', async () => {
    stubLocation({ hash: '#state=st-1&id_token=token' });
    mockMicrosoftCallback.mockRejectedValue(
      new SyntaxError("Unexpected token '{'. Expected ')' to end a compound expression")
    );

    render(<MicrosoftCallback />);

    await waitFor(() => {
      expect(screen.getByText(/Erreur technique lors de la connexion Microsoft/i)).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/compound expression/i)
    ).not.toBeInTheDocument();
  });

  it('redirige vers la connexion depuis l’écran d’erreur', async () => {
    const location = stubLocation({ hash: '' });

    render(<MicrosoftCallback />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Retour à la connexion/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Retour à la connexion/i }));

    expect(location.getHref()).toBe('/');
  });
});
