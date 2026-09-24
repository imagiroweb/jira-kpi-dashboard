import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { createAuthApiMock } from '@/test/mocks/authApi';

vi.mock('../services/authApi', () => ({ authApi: createAuthApiMock() }));

import { authApi } from '../services/authApi';
import { InviteLocalUserForm } from './InviteLocalUserForm';

const mockInvite = vi.mocked(authApi.inviteLocalUser);
const roles = [{ id: 'r1', name: 'Dev', pageVisibilities: {} }] as never;

describe('InviteLocalUserForm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('envoie l’invitation et confirme', async () => {
    mockInvite.mockResolvedValue({ success: true, userId: 'u1', emailSent: true });
    const onInvited = vi.fn();
    renderWithProviders(<InviteLocalUserForm roles={roles} onInvited={onInvited} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('email@entreprise.com'), { target: { value: 'marie@adoria.com' } });
    fireEvent.change(screen.getByPlaceholderText('Prénom'), { target: { value: 'Marie' } });
    fireEvent.change(screen.getByLabelText('Rôle'), { target: { value: 'r1' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer l’invitation/i }));

    await waitFor(() => expect(screen.getByText(/invitation envoyée à marie@adoria.com/i)).toBeInTheDocument());
    expect(mockInvite).toHaveBeenCalledWith({ email: 'marie@adoria.com', firstName: 'Marie', lastName: undefined, roleId: 'r1' });
    expect(onInvited).toHaveBeenCalled();
  });

  it('affiche l’erreur du serveur', async () => {
    mockInvite.mockResolvedValue({ success: false, error: 'Domaine d’email non autorisé pour cette organisation' });
    const onInvited = vi.fn();
    renderWithProviders(<InviteLocalUserForm roles={roles} onInvited={onInvited} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('email@entreprise.com'), { target: { value: 'x@gmail.com' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer l’invitation/i }));

    await waitFor(() => expect(screen.getByText(/domaine d’email non autorisé/i)).toBeInTheDocument());
    expect(onInvited).not.toHaveBeenCalled();
  });
});
