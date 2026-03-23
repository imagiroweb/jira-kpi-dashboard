import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResetPasswordPage } from './ResetPasswordPage';

vi.mock('../services/authApi', () => ({
  authApi: {
    resetPassword: vi.fn()
  }
}));

import { authApi } from '../services/authApi';
const mockResetPassword = vi.mocked(authApi.resetPassword);

const VALID_PASSWORD = 'MonMotDePasse123!';

describe('ResetPasswordPage', () => {
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────
  // Rendu initial
  // ─────────────────────────────────────────────────────────

  it("affiche les champs mot de passe et confirmation", () => {
    render(<ResetPasswordPage token="test-token" onSuccess={onSuccess} />);

    expect(screen.getByPlaceholderText('Min. 12 caractères')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirmer le mot de passe')).toBeInTheDocument();
  });

  it("le bouton de soumission est desactive tant que les champs sont vides", () => {
    render(<ResetPasswordPage token="test-token" onSuccess={onSuccess} />);

    const btn = screen.getByRole('button', { name: /enregistrer/i });
    expect(btn).toBeDisabled();
  });

  // ─────────────────────────────────────────────────────────
  // Validation cote client
  // ─────────────────────────────────────────────────────────

  it("le bouton est desactive si le mot de passe ne respecte pas les criteres", () => {
    render(<ResetPasswordPage token="test-token" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText('Min. 12 caractères'), {
      target: { value: 'trop_court' }
    });
    fireEvent.change(screen.getByPlaceholderText('Confirmer le mot de passe'), {
      target: { value: 'trop_court' }
    });

    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
  });

  it("le bouton est desactive si les mots de passe ne correspondent pas", () => {
    render(<ResetPasswordPage token="test-token" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText('Min. 12 caractères'), {
      target: { value: VALID_PASSWORD }
    });
    fireEvent.change(screen.getByPlaceholderText('Confirmer le mot de passe'), {
      target: { value: 'AutreMotDePasse99!' }
    });

    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
  });

  it("affiche un message d'erreur inline si les mots de passe ne correspondent pas", () => {
    render(<ResetPasswordPage token="test-token" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText('Min. 12 caractères'), {
      target: { value: VALID_PASSWORD }
    });
    fireEvent.change(screen.getByPlaceholderText('Confirmer le mot de passe'), {
      target: { value: 'Diff3rent!Pass' }
    });

    expect(screen.getByText(/ne correspondent pas/i)).toBeInTheDocument();
  });

  it("le bouton est actif si le mot de passe est valide et correspond a la confirmation", () => {
    render(<ResetPasswordPage token="test-token" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText('Min. 12 caractères'), {
      target: { value: VALID_PASSWORD }
    });
    fireEvent.change(screen.getByPlaceholderText('Confirmer le mot de passe'), {
      target: { value: VALID_PASSWORD }
    });

    expect(screen.getByRole('button', { name: /enregistrer/i })).not.toBeDisabled();
  });

  it("affiche une erreur si le mot de passe ne respecte pas les criteres au submit", async () => {
    render(<ResetPasswordPage token="test-token" onSuccess={onSuccess} />);

    const passwordInput = screen.getByPlaceholderText('Min. 12 caractères');
    const confirmInput = screen.getByPlaceholderText('Confirmer le mot de passe');

    // Saisir un mot de passe invalide et soumettre le formulaire
    fireEvent.change(passwordInput, { target: { value: 'trop_court' } });
    fireEvent.change(confirmInput, { target: { value: 'trop_court' } });

    fireEvent.submit(passwordInput.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(/critères de sécurité/i)).toBeInTheDocument();
    });

    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────
  // Appel API et resultats
  // ─────────────────────────────────────────────────────────

  it("appelle authApi.resetPassword avec le token et le mot de passe au submit", async () => {
    mockResetPassword.mockResolvedValue({ success: true });

    render(<ResetPasswordPage token="my-reset-token" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText('Min. 12 caractères'), {
      target: { value: VALID_PASSWORD }
    });
    fireEvent.change(screen.getByPlaceholderText('Confirmer le mot de passe'), {
      target: { value: VALID_PASSWORD }
    });
    fireEvent.submit(
      screen.getByRole('button', { name: /enregistrer/i }).closest('form')!
    );

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith('my-reset-token', VALID_PASSWORD);
    });
  });

  it("affiche l'ecran de succes apres reset reussi", async () => {
    mockResetPassword.mockResolvedValue({ success: true });

    render(<ResetPasswordPage token="my-reset-token" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText('Min. 12 caractères'), {
      target: { value: VALID_PASSWORD }
    });
    fireEvent.change(screen.getByPlaceholderText('Confirmer le mot de passe'), {
      target: { value: VALID_PASSWORD }
    });
    fireEvent.submit(
      screen.getByRole('button', { name: /enregistrer/i }).closest('form')!
    );

    await waitFor(() => {
      expect(screen.getByText(/mot de passe mis à jour/i)).toBeInTheDocument();
    });
  });

  it("appelle onSuccess apres 3 secondes lors du reset reussi", async () => {
    vi.useFakeTimers();
    mockResetPassword.mockResolvedValue({ success: true });

    render(<ResetPasswordPage token="my-reset-token" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText('Min. 12 caractères'), {
      target: { value: VALID_PASSWORD }
    });
    fireEvent.change(screen.getByPlaceholderText('Confirmer le mot de passe'), {
      target: { value: VALID_PASSWORD }
    });
    fireEvent.submit(
      screen.getByRole('button', { name: /enregistrer/i }).closest('form')!
    );

    // Drainer les microtasks, les timers de waitFor ET le setTimeout de 3s
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText(/mot de passe mis à jour/i)).toBeInTheDocument();
    // Tous les timers ont été exécutés, onSuccess a donc été déclenché
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("appelle onSuccess immediatement sur Se connecter maintenant", async () => {
    mockResetPassword.mockResolvedValue({ success: true });

    render(<ResetPasswordPage token="my-reset-token" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText('Min. 12 caractères'), {
      target: { value: VALID_PASSWORD }
    });
    fireEvent.change(screen.getByPlaceholderText('Confirmer le mot de passe'), {
      target: { value: VALID_PASSWORD }
    });
    fireEvent.submit(
      screen.getByRole('button', { name: /enregistrer/i }).closest('form')!
    );

    await waitFor(() => screen.getByText(/mot de passe mis à jour/i));

    fireEvent.click(screen.getByRole('button', { name: /se connecter maintenant/i }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("affiche l'erreur retournee par le serveur (token invalide/expire)", async () => {
    mockResetPassword.mockResolvedValue({
      success: false,
      error: "Ce lien de réinitialisation est invalide ou a expiré."
    });

    render(<ResetPasswordPage token="expired-token" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText('Min. 12 caractères'), {
      target: { value: VALID_PASSWORD }
    });
    fireEvent.change(screen.getByPlaceholderText('Confirmer le mot de passe'), {
      target: { value: VALID_PASSWORD }
    });
    fireEvent.submit(
      screen.getByRole('button', { name: /enregistrer/i }).closest('form')!
    );

    await waitFor(() => {
      expect(screen.getByText(/invalide ou a expiré/i)).toBeInTheDocument();
    });
  });

  it("affiche un message generique en cas d'erreur reseau", async () => {
    mockResetPassword.mockRejectedValue(new Error('Network error'));

    render(<ResetPasswordPage token="my-token" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText('Min. 12 caractères'), {
      target: { value: VALID_PASSWORD }
    });
    fireEvent.change(screen.getByPlaceholderText('Confirmer le mot de passe'), {
      target: { value: VALID_PASSWORD }
    });
    fireEvent.submit(
      screen.getByRole('button', { name: /enregistrer/i }).closest('form')!
    );

    await waitFor(() => {
      expect(screen.getByText(/erreur de connexion au serveur/i)).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────
  // Visibilite du mot de passe
  // ─────────────────────────────────────────────────────────

  it("bascule la visibilite du champ mot de passe via le bouton oeil", () => {
    render(<ResetPasswordPage token="test-token" onSuccess={onSuccess} />);

    const passwordInput = screen.getByPlaceholderText('Min. 12 caractères');
    expect(passwordInput).toHaveAttribute('type', 'password');

    // Trouver le bouton toggle (premier bouton sans texte visible)
    const toggleBtns = screen.getAllByRole('button').filter((btn) => !btn.textContent?.trim());
    fireEvent.click(toggleBtns[0]);

    expect(passwordInput).toHaveAttribute('type', 'text');

    fireEvent.click(toggleBtns[0]);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
