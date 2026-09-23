import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { TEST_USER, TEST_VISIBLE_PAGES_ALL } from '@/test/fixtures/users';
import type { User } from '../store/useStore';

vi.mock('../services/api', () => ({
  costsApi: {
    getUsers: vi.fn(),
    updateHourlyRates: vi.fn(),
    getCandidates: vi.fn(),
    addUser: vi.fn(),
    removeUser: vi.fn(),
  },
}));

import { costsApi } from '../services/api';
import { CostsPage } from './CostsPage';

const mockGetUsers = vi.mocked(costsApi.getUsers);
const mockUpdateHourlyRates = vi.mocked(costsApi.updateHourlyRates);
const mockGetCandidates = vi.mocked(costsApi.getCandidates);
const mockAddUser = vi.mocked(costsApi.addUser);
const mockRemoveUser = vi.mocked(costsApi.removeUser);

const SUPER_ADMIN: User = { ...TEST_USER, role: 'super_admin' };
const FINANCE: User = { ...TEST_USER, role: 'role-finance', visiblePages: { ...TEST_VISIBLE_PAGES_ALL, couts: true } };
const NO_ACCESS: User = { ...TEST_USER, role: 'role-dev', visiblePages: { ...TEST_VISIBLE_PAGES_ALL, couts: false } };

const SSO_USER = {
  id: 'u-sso',
  email: 'ana@adoria.com',
  firstName: 'Ana',
  lastName: 'Bernard',
  provider: 'microsoft',
  isActive: true,
  roleName: 'Dev',
  hourlyRates: [
    { startDate: null, rate: 55 },
    { startDate: '2026-07-01', rate: 60 },
  ],
  manual: false,
};
const MANUAL_USER = {
  id: 'u-local',
  email: 'zoe@adoria.com',
  firstName: 'Zoé',
  lastName: 'Zola',
  provider: 'local',
  isActive: true,
  roleName: null,
  hourlyRates: [],
  manual: true,
};
const CANDIDATE = { ...MANUAL_USER, id: 'u-cand', email: 'paul@adoria.com', firstName: 'Paul', lastName: 'Durand' };

describe('CostsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUsers.mockResolvedValue({ success: true, users: [SSO_USER, MANUAL_USER], canManage: true });
    mockGetCandidates.mockResolvedValue({ success: true, users: [CANDIDATE] });
  });

  it("bloque l'accès sans la page Coûts", () => {
    renderWithProviders(<CostsPage />, { user: NO_ACCESS });

    expect(screen.getByText('Accès réservé')).toBeInTheDocument();
    expect(mockGetUsers).not.toHaveBeenCalled();
  });

  it('liste les utilisateurs SSO et ajoutés avec leurs coûts horaires', async () => {
    renderWithProviders(<CostsPage />, { user: SUPER_ADMIN });

    const rates = await screen.findByRole('list', { name: 'Coûts horaires de Ana Bernard' });
    expect(rates).toHaveTextContent('55 €/h(initial)');
    expect(rates).toHaveTextContent('60 €/hdès le 01/07/2026');
    expect(screen.getByText('Non renseigné')).toBeInTheDocument();
    expect(screen.getByText('SSO Microsoft')).toBeInTheDocument();
    expect(screen.getByText('Ajouté manuellement')).toBeInTheDocument();
    expect(screen.getByText(/2 utilisateur\(s\) · 1 sans coût horaire/)).toBeInTheDocument();
  });

  it('saisit un coût initial (virgule acceptée)', async () => {
    mockUpdateHourlyRates.mockResolvedValue({ success: true, hourlyRates: [{ startDate: null, rate: 42.5 }] });
    renderWithProviders(<CostsPage />, { user: SUPER_ADMIN });

    fireEvent.click(await screen.findByRole('button', { name: 'Modifier les coûts de Zoé Zola' }));
    fireEvent.change(screen.getByLabelText('Coût initial de Zoé Zola'), { target: { value: '42,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(mockUpdateHourlyRates).toHaveBeenCalledWith('u-local', [{ startDate: null, rate: 42.5 }]));
    expect(await screen.findByRole('list', { name: 'Coûts horaires de Zoé Zola' })).toHaveTextContent('42.5 €/h');
    expect(screen.queryByRole('group', { name: 'Édition des coûts de Zoé Zola' })).not.toBeInTheDocument();
  });

  it('ajoute une période sans toucher au coût initial, limitée à 3 coûts', async () => {
    const updated = [
      { startDate: null, rate: 55 },
      { startDate: '2026-07-01', rate: 60 },
      { startDate: '2026-10-01', rate: 65 },
    ];
    mockUpdateHourlyRates.mockResolvedValue({ success: true, hourlyRates: updated });
    renderWithProviders(<CostsPage />, { user: SUPER_ADMIN });

    fireEvent.click(await screen.findByRole('button', { name: 'Modifier les coûts de Ana Bernard' }));
    fireEvent.click(screen.getByRole('button', { name: /Ajouter une période/ }));
    expect(screen.queryByRole('button', { name: /Ajouter une période/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Date de début de la période 2'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Coût de la période 2'), { target: { value: '65' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(mockUpdateHourlyRates).toHaveBeenCalledWith('u-sso', updated));
  });

  it('refuse une période sans date ou antérieure à la précédente, sans appeler le serveur', async () => {
    renderWithProviders(<CostsPage />, { user: SUPER_ADMIN });

    fireEvent.click(await screen.findByRole('button', { name: 'Modifier les coûts de Ana Bernard' }));
    fireEvent.click(screen.getByRole('button', { name: /Ajouter une période/ }));
    fireEvent.change(screen.getByLabelText('Coût de la période 2'), { target: { value: '65' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Date de début de la période 2 manquante');

    fireEvent.change(screen.getByLabelText('Date de début de la période 2'), { target: { value: '2026-03-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/croissantes/);
    expect(mockUpdateHourlyRates).not.toHaveBeenCalled();
  });

  it('supprime une période, efface tous les coûts en vidant le coût initial, annule sans enregistrer', async () => {
    mockUpdateHourlyRates.mockResolvedValue({ success: true, hourlyRates: [] });
    renderWithProviders(<CostsPage />, { user: SUPER_ADMIN });

    fireEvent.click(await screen.findByRole('button', { name: 'Modifier les coûts de Ana Bernard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(mockUpdateHourlyRates).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Modifier les coûts de Ana Bernard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la période 1' }));
    fireEvent.change(screen.getByLabelText('Coût initial de Ana Bernard'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(mockUpdateHourlyRates).toHaveBeenCalledWith('u-sso', []));
  });

  it("garde l'édition ouverte si le serveur refuse", async () => {
    mockUpdateHourlyRates.mockRejectedValue({ response: { data: { errors: ['3 coûts horaires maximum par utilisateur'] } } });
    renderWithProviders(<CostsPage />, { user: SUPER_ADMIN });

    fireEvent.click(await screen.findByRole('button', { name: 'Modifier les coûts de Zoé Zola' }));
    fireEvent.change(screen.getByLabelText('Coût initial de Zoé Zola'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('3 coûts horaires maximum par utilisateur')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Édition des coûts de Zoé Zola' })).toBeInTheDocument();
  });

  it('filtre la liste par nom, email ou rôle', async () => {
    renderWithProviders(<CostsPage />, { user: SUPER_ADMIN });

    await screen.findByRole('button', { name: 'Modifier les coûts de Ana Bernard' });
    fireEvent.change(screen.getByLabelText('Rechercher un utilisateur'), { target: { value: 'zola' } });

    expect(screen.queryByRole('button', { name: 'Modifier les coûts de Ana Bernard' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier les coûts de Zoé Zola' })).toBeInTheDocument();
  });

  it('permet au super admin d’ajouter un compte non SSO', async () => {
    mockAddUser.mockResolvedValue({ success: true });
    renderWithProviders(<CostsPage />, { user: SUPER_ADMIN });

    const select = await screen.findByLabelText('Compte non SSO à ajouter');
    fireEvent.change(select, { target: { value: 'u-cand' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));

    await waitFor(() => expect(mockAddUser).toHaveBeenCalledWith('u-cand'));
    await waitFor(() => expect(mockGetUsers).toHaveBeenCalledTimes(2));
  });

  it('permet au super admin de retirer un compte ajouté (pas un compte SSO)', async () => {
    mockRemoveUser.mockResolvedValue({ success: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProviders(<CostsPage />, { user: SUPER_ADMIN });

    await screen.findByRole('button', { name: 'Modifier les coûts de Ana Bernard' });
    expect(screen.queryByRole('button', { name: 'Retirer Ana Bernard' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer Zoé Zola' }));

    await waitFor(() => expect(mockRemoveUser).toHaveBeenCalledWith('u-local'));
  });

  it('laisse un rôle Finance saisir les coûts sans gérer la liste', async () => {
    mockGetUsers.mockResolvedValue({ success: true, users: [SSO_USER], canManage: false });
    renderWithProviders(<CostsPage />, { user: FINANCE });

    const table = await screen.findByRole('table');
    expect(within(table).getByRole('button', { name: 'Modifier les coûts de Ana Bernard' })).toBeEnabled();
    expect(screen.queryByLabelText('Compte non SSO à ajouter')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument();
    expect(mockGetCandidates).not.toHaveBeenCalled();
  });

  it("affiche l'erreur renvoyée par le serveur", async () => {
    mockGetUsers.mockRejectedValue({ response: { data: { error: 'Accès réservé aux utilisateurs ayant accès aux coûts' } } });
    renderWithProviders(<CostsPage />, { user: FINANCE });

    expect(await screen.findByRole('alert')).toHaveTextContent('Accès réservé aux utilisateurs ayant accès aux coûts');
  });
});
