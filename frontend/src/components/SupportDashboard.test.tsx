import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { TEST_SUPPORT_KPI_PAYLOAD } from '@/test/fixtures/supportKpi';
import { TEST_USER } from '@/test/fixtures/users';
import { resetStore } from '@/test/mocks/store';
import { useStore } from '../store/useStore';
import { SupportDashboard } from './SupportDashboard';

vi.mock('./DateRangePicker', () => ({
  DateRangePicker: ({
    onChange,
  }: {
    value: { from: string; to: string };
    onChange: (range: { from: string; to: string }) => void;
  }) => (
    <button type="button" onClick={() => onChange({ from: '2026-01-01', to: '2026-01-07' })}>
      Changer dates
    </button>
  ),
}));

vi.mock('../services/api', () => ({
  supportSnapshotApi: {
    getSnapshots: vi.fn(),
    saveSnapshot: vi.fn(),
    getSnapshot: vi.fn(),
    deleteSnapshot: vi.fn(),
  },
}));

import { supportSnapshotApi } from '../services/api';

const mockGetSnapshots = vi.mocked(supportSnapshotApi.getSnapshots);
const mockSaveSnapshot = vi.mocked(supportSnapshotApi.saveSnapshot);
const mockGetSnapshot = vi.mocked(supportSnapshotApi.getSnapshot);
const mockDeleteSnapshot = vi.mocked(supportSnapshotApi.deleteSnapshot);

function makeSupportFetchMock(delayMs = 0) {
  return vi.fn(async (input: RequestInfo | URL) => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const url = String(input);
    if (url.includes('/worklog/support-kpi')) {
      return {
        ok: true,
        json: async () => ({ success: true, ...TEST_SUPPORT_KPI_PAYLOAD }),
      };
    }
    return { ok: false, json: async () => ({ success: false }) };
  });
}

describe('SupportDashboard', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    mockGetSnapshots.mockResolvedValue({ success: true, snapshots: [] });
    mockSaveSnapshot.mockResolvedValue({ success: true, snapshot: { id: 'snap-support-1' } });
  });

  it('affiche un skeleton pendant le chargement initial', async () => {
    vi.stubGlobal('fetch', makeSupportFetchMock(50));

    const { container } = renderWithProviders(<SupportDashboard />, { user: TEST_USER });

    expect(screen.getByText('Support Board KPI')).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('Ratio support / build')).toBeInTheDocument();
    });
  });

  it('affiche les KPI support après fetch support-kpi', async () => {
    vi.stubGlobal('fetch', makeSupportFetchMock());

    renderWithProviders(<SupportDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText('Ratio support / build')).toBeInTheDocument();
      expect(screen.getAllByText('12.5 %').length).toBeGreaterThan(0);
    });
  });

  it('réutilise le cache filtersKey sans refetch', async () => {
    const fetchMock = makeSupportFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const dateRange = useStore.getState().dateRange;
    const filtersKey = `${dateRange.from}|${dateRange.to}|true`;
    useStore.setState({
      supportUseActiveSprint: true,
      supportLastFiltersKey: filtersKey,
      supportKpiPayload: TEST_SUPPORT_KPI_PAYLOAD,
    });

    renderWithProviders(<SupportDashboard />, { user: TEST_USER, resetStore: false });

    await waitFor(() => {
      expect(screen.getByText('Support Board KPI')).toBeInTheDocument();
    });

    const supportCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/worklog/support-kpi')
    );
    expect(supportCalls).toHaveLength(0);
  });

  it('bascule le mode sprint actif', async () => {
    vi.stubGlobal('fetch', makeSupportFetchMock());

    renderWithProviders(<SupportDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText(/Mode: Sprint actif/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Changer dates/i }));

    await waitFor(() => {
      expect(screen.getByText(/Mode: Période personnalisée/i)).toBeInTheDocument();
    });
  });

  it('ouvre la modale historique et affiche les snapshots support', async () => {
    vi.stubGlobal('fetch', makeSupportFetchMock());
    mockGetSnapshots.mockResolvedValue({
      success: true,
      snapshots: [
        {
          id: 'support-snap-1',
          sprintName: 'Support S12',
          savedAt: '2026-02-01T12:00:00.000Z',
          savedBy: { id: 'user-1', name: 'Support Admin', email: 'support@test.com' },
          dateRange: { from: '2026-01-01', to: '2026-01-07' },
          notes: 'Snapshot support',
          summary: {
            totalTickets: 8,
            resolvedTickets: 4,
            totalPonderation: 40,
            resolvedPonderation: 20,
          },
        },
      ],
    });

    renderWithProviders(<SupportDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Historique/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Historique/i }));

    await waitFor(() => {
      expect(screen.getByText('Historique des Sprints')).toBeInTheDocument();
      expect(screen.getByText('Support S12')).toBeInTheDocument();
    });

    expect(mockGetSnapshots).toHaveBeenCalled();
  });

  it('enregistre un snapshot support depuis la modale', async () => {
    vi.stubGlobal('fetch', makeSupportFetchMock());

    renderWithProviders(<SupportDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Sauvegarder$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Sauvegarder$/i }));
    expect(screen.getByText('Sauvegarder le Sprint')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Sprint 42/i), {
      target: { value: 'Support snapshot smoke' },
    });

    const saveButtons = screen.getAllByRole('button', { name: /^Sauvegarder$/i });
    fireEvent.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => {
      expect(mockSaveSnapshot).toHaveBeenCalledWith('Support snapshot smoke', undefined);
    });
  });

  it('ouvre la modale de détail des temps de résolution', async () => {
    vi.stubGlobal('fetch', makeSupportFetchMock());

    renderWithProviders(<SupportDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByTitle('Cliquez pour voir le détail des tickets')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Cliquez pour voir le détail des tickets'));

    await waitFor(() => {
      expect(screen.getByText('Détail des temps de résolution')).toBeInTheDocument();
      expect(screen.getByText('SUP-1')).toBeInTheDocument();
    });
  });

  it('ouvre la modale de détail de première prise en charge', async () => {
    vi.stubGlobal('fetch', makeSupportFetchMock());

    renderWithProviders(<SupportDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /1ère Prise/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /1ère Prise/i }));

    await waitFor(() => {
      expect(screen.getByText('Détail temps moyen de première prise en charge')).toBeInTheDocument();
      expect(screen.getByText('SUP-1')).toBeInTheDocument();
    });
  });

  it('affiche l’historique vide quand aucun snapshot n’existe', async () => {
    vi.stubGlobal('fetch', makeSupportFetchMock());
    mockGetSnapshots.mockResolvedValue({ success: true, snapshots: [] });

    renderWithProviders(<SupportDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Historique/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Historique/i }));

    await waitFor(() => {
      expect(screen.getByText('Aucun snapshot enregistré')).toBeInTheDocument();
    });
  });

  it('ouvre la vue détail d’un snapshot depuis l’historique', async () => {
    vi.stubGlobal('fetch', makeSupportFetchMock());
    mockGetSnapshots.mockResolvedValue({
      success: true,
      snapshots: [
        {
          id: 'support-snap-1',
          sprintName: 'Support S12',
          savedAt: '2026-02-01T12:00:00.000Z',
          savedBy: { id: 'user-1', name: 'Support Admin', email: 'support@test.com' },
          dateRange: { from: '2026-01-01', to: '2026-01-07' },
          summary: {
            totalTickets: 8,
            resolvedTickets: 4,
            totalPonderation: 40,
            resolvedPonderation: 20,
          },
        },
      ],
    });
    mockGetSnapshot.mockResolvedValue({
      success: true,
      snapshot: {
        id: 'support-snap-1',
        sprintName: 'Support S12',
        savedAt: '2026-02-01T12:00:00.000Z',
        savedBy: { id: 'user-1', name: 'Support Admin', email: 'support@test.com' },
        dateRange: { from: '2026-01-01', to: '2026-01-07' },
        ...TEST_SUPPORT_KPI_PAYLOAD,
      },
    });

    renderWithProviders(<SupportDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Historique/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Historique/i }));

    await waitFor(() => {
      expect(screen.getByText('Support S12')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Voir les détails'));

    await waitFor(() => {
      expect(mockGetSnapshot).toHaveBeenCalledWith('support-snap-1');
      expect(screen.getByText('Total tickets')).toBeInTheDocument();
    });
  });

  it('supprime un snapshot après confirmation', async () => {
    vi.stubGlobal('fetch', makeSupportFetchMock());
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockGetSnapshots
      .mockResolvedValueOnce({
        success: true,
        snapshots: [
          {
            id: 'support-snap-del',
            sprintName: 'Sprint à supprimer',
            savedAt: '2026-02-01T12:00:00.000Z',
            savedBy: { id: 'user-1', name: 'Admin', email: 'admin@test.com' },
            dateRange: { from: '2026-01-01', to: '2026-01-07' },
            summary: {
              totalTickets: 2,
              resolvedTickets: 1,
              totalPonderation: 10,
              resolvedPonderation: 5,
            },
          },
        ],
      })
      .mockResolvedValueOnce({ success: true, snapshots: [] });
    mockDeleteSnapshot.mockResolvedValue({ success: true });

    renderWithProviders(<SupportDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Historique/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Historique/i }));

    await waitFor(() => {
      expect(screen.getByText('Sprint à supprimer')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Supprimer'));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(mockDeleteSnapshot).toHaveBeenCalledWith('support-snap-del');
    });

    confirmSpy.mockRestore();
  });

  it('gère l’échec silencieux de l’enregistrement snapshot', async () => {
    vi.stubGlobal('fetch', makeSupportFetchMock());
    mockSaveSnapshot.mockRejectedValue(new Error('Save failed'));

    renderWithProviders(<SupportDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Sauvegarder$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Sauvegarder$/i }));
    fireEvent.change(screen.getByPlaceholderText(/Sprint 42/i), {
      target: { value: 'Snapshot erreur' },
    });

    const saveButtons = screen.getAllByRole('button', { name: /^Sauvegarder$/i });
    fireEvent.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => {
      expect(mockSaveSnapshot).toHaveBeenCalled();
    });

    expect(screen.getByText('Sauvegarder le Sprint')).toBeInTheDocument();
  });
});
