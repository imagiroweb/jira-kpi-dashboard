/**
 * Page « Suivi WIP » (plan docs/qa/plans/suivi-wip.md, CT-66 à CT-73). Recharts est stubé :
 * l'infobulle et le point de dépassement sont testés à part.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { TEST_USER } from '@/test/fixtures/users';
import { WIP_DATA } from '@/test/fixtures/wip';
import { useStore } from '../store/useStore';
import type { WipRow } from '../domain/wipChart';

vi.mock('../services/api', () => ({
  wipApi: {
    getWeekly: vi.fn(),
    saveSettings: vi.fn(),
  },
}));

import { wipApi } from '../services/api';
import { WipDot, WipPage, WipTooltipContent } from './WipPage';

const mockGetWeekly = vi.mocked(wipApi.getWeekly);
const mockSaveSettings = vi.mocked(wipApi.saveSettings);

describe('WipPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 21, 15, 0));
    mockGetWeekly.mockResolvedValue({ success: true, data: WIP_DATA, canEdit: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('CT-66 : charge les 12 dernières semaines, vue globale par défaut', async () => {
    renderWithProviders(<WipPage />, { user: TEST_USER });

    expect(screen.getByRole('heading', { name: 'Suivi WIP' })).toBeInTheDocument();
    await waitFor(() => expect(mockGetWeekly).toHaveBeenCalledWith('2026-08-03', '2026-10-25'));
    expect(await screen.findByRole('button', { name: 'Toutes' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('recharts-responsive-container')).toBeInTheDocument();
    expect(screen.getByText('Seuil global')).toBeInTheDocument();
    expect(screen.getByText('Seuil partiel : 21')).toBeInTheDocument();
  });

  it('CT-78 : affiche les boards qui délimitent les équipes, sinon les projets', async () => {
    mockGetWeekly.mockResolvedValue({ success: true, data: { ...WIP_DATA, boards: ['Supply', 'Brigade'], projectKeys: [] }, canEdit: false });
    renderWithProviders(<WipPage />, { user: TEST_USER });
    expect(await screen.findByText(/boards Supply, Brigade/)).toBeInTheDocument();
    expect(screen.queryByText(/projets/)).not.toBeInTheDocument();
  });

  it('CT-67 : période trop longue → message, aucune requête', async () => {
    renderWithProviders(<WipPage />, { user: TEST_USER });
    await waitFor(() => expect(mockGetWeekly).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2025-08-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    expect(screen.getByRole('alert')).toHaveTextContent('réduisez-la à 52 semaines maximum');
    expect(mockGetWeekly).toHaveBeenCalledTimes(1);
  });

  it('applique une période valide', async () => {
    renderWithProviders(<WipPage />, { user: TEST_USER });
    await waitFor(() => expect(mockGetWeekly).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2026-10-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() => expect(mockGetWeekly).toHaveBeenLastCalledWith('2026-09-01', '2026-10-20'));
  });

  it('CT-68 : seuil non défini par équipe et seuil partiel de la sélection', async () => {
    renderWithProviders(<WipPage />, { user: TEST_USER });
    const teams = await screen.findByRole('group', { name: 'Équipes' });

    fireEvent.click(within(teams).getByRole('button', { name: 'Team A' }));
    expect(screen.getByText('Seuil de la sélection')).toBeInTheDocument();
    expect(screen.getByText('Seuil : 12')).toBeInTheDocument();

    fireEvent.click(within(teams).getByRole('button', { name: 'Team C' }));
    expect(screen.getByText('Somme des seuils')).toBeInTheDocument();
    expect(screen.getByText('Somme partielle des seuils : 12')).toBeInTheDocument();
    expect(screen.getByText('Somme des équipes choisies')).toBeInTheDocument();

    const table = screen.getByRole('table');
    const rowC = within(table).getByText('Team C').closest('tr')!;
    expect(within(rowC).getByText('Seuil non défini')).toBeInTheDocument();
  });

  it('CT-70 : non super admin → lecture seule', async () => {
    renderWithProviders(<WipPage />, { user: TEST_USER });
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Modifier les réglages/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Seuls les super admins peuvent les modifier/)).toBeInTheDocument();
  });

  it('CT-71 : un super admin modifie les devs et enregistre ; saisie hors bornes bloquée', async () => {
    mockGetWeekly.mockResolvedValue({ success: true, data: WIP_DATA, canEdit: true });
    const saved = { ...WIP_DATA.settings, teams: [{ team: 'Team A', devCount: 5, maxPerDev: null }] };
    mockSaveSettings.mockResolvedValue({ success: true, settings: saved });
    renderWithProviders(<WipPage />, { user: { ...TEST_USER, role: 'super_admin' } });

    fireEvent.click(await screen.findByRole('button', { name: /Modifier les réglages/ }));
    fireEvent.change(screen.getByLabelText('Devs Team A'), { target: { value: '51' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Team A : le nombre de devs doit être un entier entre 0 et 50');
    expect(mockSaveSettings).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Devs Team A'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Devs Team B'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Devs Team C'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));

    await waitFor(() =>
      expect(mockSaveSettings).toHaveBeenCalledWith({
        startStatuses: ['In Progress'],
        endStatuses: ['Go Prod'],
        defaultMaxPerDev: 3,
        teams: [{ team: 'Team A', devCount: 5, maxPerDev: null }],
      })
    );
    // Seuil recalculé pour toutes les semaines, sans recharger Jira (statuts inchangés).
    expect(await screen.findByText('Seuil partiel : 15')).toBeInTheDocument();
    expect(mockGetWeekly).toHaveBeenCalledTimes(1);
  });

  it('affiche l\'erreur 400 de la route', async () => {
    mockGetWeekly.mockResolvedValue({ success: true, data: WIP_DATA, canEdit: true });
    mockSaveSettings.mockRejectedValue({ response: { data: { errors: ['Statuts de départ : au moins un statut est obligatoire'] } } });
    renderWithProviders(<WipPage />, { user: { ...TEST_USER, role: 'super_admin' } });

    fireEvent.click(await screen.findByRole('button', { name: /Modifier les réglages/ }));
    fireEvent.change(screen.getByLabelText('Statuts de départ'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('au moins un statut est obligatoire');
  });

  it('CT-72 : recharge après une synchronisation', async () => {
    renderWithProviders(<WipPage />, { user: TEST_USER });
    await waitFor(() => expect(mockGetWeekly).toHaveBeenCalledTimes(1));

    act(() => useStore.getState().triggerKpiRefresh());

    await waitFor(() => expect(mockGetWeekly).toHaveBeenCalledTimes(2));
  });

  it('CT-73 : erreur de chargement lisible avec Réessayer', async () => {
    mockGetWeekly.mockRejectedValue({ response: { data: { error: 'Impossible de calculer le WIP' } } });
    renderWithProviders(<WipPage />, { user: TEST_USER });

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de calculer le WIP');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('CT-73 : aucun ticket → 0 partout, pas d\'écran vide', async () => {
    mockGetWeekly.mockResolvedValue({ success: true, data: { ...WIP_DATA, weeks: [], teams: [], ticketCount: 0 }, canEdit: false });
    renderWithProviders(<WipPage />, { user: TEST_USER });

    const indicators = await screen.findByRole('region', { name: 'Indicateurs' });
    expect(within(indicators).getAllByText('0')).toHaveLength(2);
    expect(within(indicators).getByText('Seuil non défini')).toBeInTheDocument();
  });
});

describe('WipTooltipContent et WipDot (CT-42, CT-69)', () => {
  const row: WipRow = {
    weekStart: '2026-09-07',
    weekEnd: '2026-09-13',
    label: '07/09',
    measuredAt: '2026-09-11T12:00:00.000Z',
    wip: 13,
    done: 4,
    threshold: 12,
    over: true,
    gap: 1,
    workflowChange: false,
    teams: { 'Team A': 13 },
  };

  it('infobulle : dates, mesure, WIP, terminés, seuil, écart et dépassement', () => {
    render(<WipTooltipContent row={row} teams={['Team A']} />);
    expect(screen.getByText('Semaine du 07/09 – 13/09')).toBeInTheDocument();
    expect(screen.getByText('Mesure : vendredi 11/09 à 14:00')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('(écart +1)')).toBeInTheDocument();
    expect(screen.getByText('Seuil dépassé')).toBeInTheDocument();
  });

  it('CT-43 : seuil non défini, pas d\'écart ni de dépassement', () => {
    render(<WipTooltipContent row={{ ...row, threshold: null, gap: null, over: false }} teams={['A', 'B']} />);
    expect(screen.getByText('non défini')).toBeInTheDocument();
    expect(screen.queryByText(/écart/)).not.toBeInTheDocument();
    expect(screen.queryByText('Seuil dépassé')).not.toBeInTheDocument();
  });

  it('CT-69 : point marqué en dépassement', () => {
    const { container, rerender } = render(
      <svg>
        <WipDot cx={10} cy={10} payload={row} />
      </svg>
    );
    expect(container.querySelector('circle')).toHaveAttribute('data-over', 'true');
    rerender(
      <svg>
        <WipDot cx={10} cy={10} payload={{ ...row, over: false }} />
      </svg>
    );
    expect(container.querySelector('circle')).toHaveAttribute('data-over', 'false');
  });
});
