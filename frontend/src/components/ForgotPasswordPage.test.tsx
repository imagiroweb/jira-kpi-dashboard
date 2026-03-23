import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForgotPasswordPage } from './ForgotPasswordPage';

vi.mock('../services/authApi', () => ({
  authApi: {
    forgotPassword: vi.fn()
  }
}));

import { authApi } from '../services/authApi';
const mockForgotPassword = vi.mocked(authApi.forgotPassword);

describe('ForgotPasswordPage', () => {
  const onBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche le formulaire avec un champ email et le bouton d'envoi", () => {
    render(<ForgotPasswordPage onBack={onBack} />);

    expect(screen.getByPlaceholderText('votre@email.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /envoyer le lien/i })).toBeInTheDocument();
  });

  it("le bouton d'envoi est desactive si le champ email est vide", () => {
    render(<ForgotPasswordPage onBack={onBack} />);

    const btn = screen.getByRole('button', { name: /envoyer le lien/i });
    expect(btn).toBeDisabled();
  });

  it("le bouton d'envoi est actif quand l'email est renseigne", () => {
    render(<ForgotPasswordPage onBack={onBack} />);

    fireEvent.change(screen.getByPlaceholderText('votre@email.com'), {
      target: { value: 'user@test.com' }
    });

    const btn = screen.getByRole('button', { name: /envoyer le lien/i });
    expect(btn).not.toBeDisabled();
  });

  it("appelle authApi.forgotPassword avec l'email saisi lors du submit", async () => {
    mockForgotPassword.mockResolvedValue({ success: true });

    render(<ForgotPasswordPage onBack={onBack} />);

    fireEvent.change(screen.getByPlaceholderText('votre@email.com'), {
      target: { value: 'user@test.com' }
    });
    fireEvent.submit(screen.getByRole('button', { name: /envoyer le lien/i }).closest('form')!);

    await waitFor(() => {
      expect(mockForgotPassword).toHaveBeenCalledWith('user@test.com');
    });
  });

  it("affiche le message de confirmation apres envoi reussi", async () => {
    mockForgotPassword.mockResolvedValue({ success: true });

    render(<ForgotPasswordPage onBack={onBack} />);

    fireEvent.change(screen.getByPlaceholderText('votre@email.com'), {
      target: { value: 'user@test.com' }
    });
    fireEvent.submit(screen.getByRole('button', { name: /envoyer le lien/i }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(/email envoyé/i)).toBeInTheDocument();
    });

    expect(screen.getByText('user@test.com')).toBeInTheDocument();
    expect(screen.getByText(/1 heure/i)).toBeInTheDocument();
  });

  it("le formulaire disparait apres l'envoi reussi", async () => {
    mockForgotPassword.mockResolvedValue({ success: true });

    render(<ForgotPasswordPage onBack={onBack} />);

    fireEvent.change(screen.getByPlaceholderText('votre@email.com'), {
      target: { value: 'user@test.com' }
    });
    fireEvent.submit(screen.getByRole('button', { name: /envoyer le lien/i }).closest('form')!);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('votre@email.com')).not.toBeInTheDocument();
    });
  });

  it("affiche une erreur si le service echoue (ex: SMTP)", async () => {
    mockForgotPassword.mockResolvedValue({
      success: false,
      error: "Impossible d'envoyer l'email. Verifiez la configuration SMTP."
    });

    render(<ForgotPasswordPage onBack={onBack} />);

    fireEvent.change(screen.getByPlaceholderText('votre@email.com'), {
      target: { value: 'user@test.com' }
    });
    fireEvent.submit(screen.getByRole('button', { name: /envoyer le lien/i }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(/SMTP/)).toBeInTheDocument();
    });
  });

  it("affiche un message d'erreur generique en cas d'exception reseau", async () => {
    mockForgotPassword.mockRejectedValue(new Error('Network error'));

    render(<ForgotPasswordPage onBack={onBack} />);

    fireEvent.change(screen.getByPlaceholderText('votre@email.com'), {
      target: { value: 'user@test.com' }
    });
    fireEvent.submit(screen.getByRole('button', { name: /envoyer le lien/i }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(/erreur de connexion au serveur/i)).toBeInTheDocument();
    });
  });

  it("appelle onBack quand on clique sur Retour a la connexion (formulaire)", () => {
    render(<ForgotPasswordPage onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: /retour à la connexion/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("appelle onBack depuis l'ecran de confirmation", async () => {
    mockForgotPassword.mockResolvedValue({ success: true });

    render(<ForgotPasswordPage onBack={onBack} />);

    fireEvent.change(screen.getByPlaceholderText('votre@email.com'), {
      target: { value: 'user@test.com' }
    });
    fireEvent.submit(screen.getByRole('button', { name: /envoyer le lien/i }).closest('form')!);

    await waitFor(() => screen.getByText(/email envoyé/i));

    fireEvent.click(screen.getByRole('button', { name: /retour à la connexion/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
