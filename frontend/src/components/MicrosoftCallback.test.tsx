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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('affiche le loader pendant la vérification Microsoft', () => {
    mockMicrosoftCallback.mockImplementation(() => new Promise(() => {}));
    stubLocation({ hash: '#access_token=pending-token' });

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

  it('affiche une erreur si le token est absent', async () => {
    stubLocation({ hash: '' });

    render(<MicrosoftCallback />);

    await waitFor(() => {
      expect(screen.getByText(/Token d'accès manquant/i)).toBeInTheDocument();
    });
  });

  it('affiche une erreur si le token du hash est corrompu (espace / accolade)', async () => {
    stubLocation({ hash: '#access_token=tok%20en' });

    render(<MicrosoftCallback />);

    await waitFor(() => {
      expect(screen.getByText(/Token Microsoft invalide ou corrompu/i)).toBeInTheDocument();
    });
    expect(mockMicrosoftCallback).not.toHaveBeenCalled();
  });

  it('préserve les + du access_token avant l’appel backend', async () => {
    stubLocation({ hash: '#access_token=abc%2Bdef' });
    mockMicrosoftCallback.mockResolvedValue({
      success: true,
      token: 'jwt-token',
      user: TEST_USER,
      firstLogin: false,
    });

    render(<MicrosoftCallback />);

    await waitFor(() => {
      expect(mockMicrosoftCallback).toHaveBeenCalledWith('abc+def');
    });
  });

  it('connecte l’utilisateur et redirige après succès', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const location = stubLocation({ hash: '#access_token=valid-ms-token' });

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

    expect(mockMicrosoftCallback).toHaveBeenCalledWith('valid-ms-token');

    vi.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(useStore.getState().isAuthenticated).toBe(true);
      expect(useStore.getState().token).toBe('jwt-token');
      expect(location.getHref()).toBe('/');
    });
  });

  it('affiche une erreur si le backend refuse le token', async () => {
    stubLocation({ hash: '#access_token=bad-token' });
    mockMicrosoftCallback.mockResolvedValue({ success: false, error: 'Compte non autorisé' });

    render(<MicrosoftCallback />);

    await waitFor(() => {
      expect(screen.getByText('Compte non autorisé')).toBeInTheDocument();
    });
  });

  it('affiche une erreur réseau en cas d’exception', async () => {
    stubLocation({ hash: '#access_token=token' });
    mockMicrosoftCallback.mockRejectedValue(new Error('Network error'));

    render(<MicrosoftCallback />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
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
