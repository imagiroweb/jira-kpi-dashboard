import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { TEST_USER } from '@/test/fixtures/users';
import { resetStore } from '@/test/mocks/store';
import { useStore } from '../store/useStore';

vi.mock('./ResolvedByDayChart', () => ({
  ResolvedByDayChart: () => null,
}));

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
  dashboardSnapshotApi: {
    getSnapshots: vi.fn(),
    saveSnapshot: vi.fn(),
    getSnapshot: vi.fn(),
    deleteSnapshot: vi.fn(),
  },
}));

import { dashboardSnapshotApi } from '../services/api';
import { SprintDashboard } from './SprintDashboard';

const mockGetSnapshots = vi.mocked(dashboardSnapshotApi.getSnapshots);
const mockSaveSnapshot = vi.mocked(dashboardSnapshotApi.saveSnapshot);
const mockGetSnapshot = vi.mocked(dashboardSnapshotApi.getSnapshot);

const BOARD_ID = 10;

function makeSprintFetchMock() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/jira/configured-boards')) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          boards: [{ id: BOARD_ID, name: 'Board Sprint', projectKey: 'SPR' }],
        }),
      };
    }
    if (url.includes('/jira/dashboard/sprint-issues-all')) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          boards: [
            {
              boardId: BOARD_ID,
              sprint: {
                statusCounts: { total: 8, todo: 2, inProgress: 2, qa: 1, resolved: 3 },
                storyPointsByStatus: { total: 20, todo: 5, inProgress: 5, qa: 3, resolved: 7 },
                totalTimeSeconds: 28800,
                backlog: { ticketCount: 1, storyPoints: 2 },
                issues: [],
              },
            },
          ],
        }),
      };
    }
    return { ok: false, json: async () => ({ success: false }) };
  });
}

describe('SprintDashboard', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    mockGetSnapshots.mockResolvedValue({ success: true, snapshots: [] });
    mockSaveSnapshot.mockResolvedValue({ success: true, snapshot: { id: 'snap-1' } });
    vi.stubGlobal('fetch', makeSprintFetchMock());
  });

  it('affiche les KPI après chargement des boards sprint', async () => {
    renderWithProviders(<SprintDashboard />, { user: TEST_USER });

    expect(screen.getByText('Dashboard Sprint')).toBeInTheDocument();

    await waitFor(() => {
      const label = screen.getByText(/SP À faire/i);
      expect(label.closest('div')?.parentElement?.textContent).toContain('5');
    });
  });

  it('bascule entre sprint actif et période personnalisée', async () => {
    renderWithProviders(<SprintDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText(/Mode: Sprint actif/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Changer dates/i }));

    await waitFor(() => {
      expect(screen.getByText(/Mode: Période personnalisée/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Sprint actif/i }));

    await waitFor(() => {
      expect(screen.getByText(/Mode: Sprint actif/i)).toBeInTheDocument();
    });
  });

  it('ouvre la modale et enregistre un snapshot', async () => {
    renderWithProviders(<SprintDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Sauvegarder/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Sauvegarder/i }));
    expect(screen.getByText('Sauvegarder le Sprint')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Sprint 42/i), {
      target: { value: 'Sprint test smoke' },
    });

    const saveButtons = screen.getAllByRole('button', { name: /^Sauvegarder$/i });
    fireEvent.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => {
      expect(mockSaveSnapshot).toHaveBeenCalled();
    });
  });

  it('utilise le cache filtersKey sans refetch si les stats correspondent', async () => {
    const fetchMock = makeSprintFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const dateRange = useStore.getState().dateRange;
    useStore.setState({
      dashboardUseActiveSprint: true,
      dashboardLastFiltersKey: `${BOARD_ID}|${dateRange.from}|${dateRange.to}|true`,
      dashboardStats: [
        {
          boardId: BOARD_ID,
          name: 'Board Sprint',
          projectKey: 'SPR',
          color: '#8b5cf6',
          totalPoints: 20,
          todoPoints: 5,
          inProgressPoints: 5,
          qaPoints: 3,
          resolvedPoints: 7,
          estimatedPoints: 0,
          totalTickets: 8,
          todoTickets: 2,
          inProgressTickets: 2,
          qaTickets: 1,
          resolvedTickets: 3,
          totalTimeHours: 8,
          backlogTickets: 1,
          backlogPoints: 2,
        },
      ],
    });

    renderWithProviders(<SprintDashboard />, { user: TEST_USER, resetStore: false });

    await waitFor(() => {
      expect(screen.getByText('Dashboard Sprint')).toBeInTheDocument();
    });

    const sprintCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/jira/dashboard/sprint-issues-all')
    );
    expect(sprintCalls).toHaveLength(0);
  });

  it('ouvre la modale historique et liste les snapshots enregistrés', async () => {
    mockGetSnapshots.mockResolvedValue({
      success: true,
      snapshots: [
        {
          id: 'snap-1',
          sprintName: 'Sprint 42',
          savedAt: '2026-01-15T10:00:00.000Z',
          savedBy: { id: 'user-1', name: 'Admin Test', email: 'admin@test.com' },
          dateRange: { from: '2026-01-01', to: '2026-01-07' },
          notes: 'Note smoke test',
          summary: {
            totalTickets: 10,
            resolvedTickets: 5,
            totalPoints: 20,
            resolvedPoints: 12,
            totalTimeHours: 8,
          },
        },
      ],
    });

    renderWithProviders(<SprintDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Historique/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Historique/i }));

    await waitFor(() => {
      expect(screen.getByText('Historique des Sprints')).toBeInTheDocument();
      expect(screen.getByText('Sprint 42')).toBeInTheDocument();
      expect(screen.getByText(/Note smoke test/i)).toBeInTheDocument();
    });

    expect(mockGetSnapshots).toHaveBeenCalled();
  });

  it('affiche un état vide dans la modale historique sans snapshot', async () => {
    mockGetSnapshots.mockResolvedValue({ success: true, snapshots: [] });

    renderWithProviders(<SprintDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Historique/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Historique/i }));

    await waitFor(() => {
      expect(screen.getByText(/Aucun snapshot enregistré/i)).toBeInTheDocument();
    });
  });

  it('charge un snapshot depuis la modale historique', async () => {
    mockGetSnapshots.mockResolvedValue({
      success: true,
      snapshots: [
        {
          id: 'snap-view',
          sprintName: 'Sprint archivé',
          savedAt: '2026-01-10T08:00:00.000Z',
          savedBy: { id: 'user-1', name: 'Admin', email: 'admin@test.com' },
          dateRange: { from: '2026-01-01', to: '2026-01-07' },
          summary: {
            totalTickets: 4,
            resolvedTickets: 2,
            totalPoints: 12,
            resolvedPoints: 12,
            totalTimeHours: 0,
          },
        },
      ],
    });
    mockGetSnapshot.mockResolvedValue({
      success: true,
      snapshot: {
        id: 'snap-view',
        sprintName: 'Sprint archivé',
        savedAt: '2026-01-10T08:00:00.000Z',
        savedBy: { id: 'user-1', name: 'Admin', email: 'admin@test.com' },
        projectsStats: [],
        totals: {
          totalPoints: 12,
          todoPoints: 0,
          inProgressPoints: 0,
          qaPoints: 0,
          resolvedPoints: 12,
          estimatedPoints: 0,
          totalTickets: 4,
          todoTickets: 0,
          inProgressTickets: 0,
          qaTickets: 0,
          resolvedTickets: 4,
          totalTimeHours: 0,
          backlogTickets: 0,
          backlogPoints: 0,
        },
        dateRange: { from: '2026-01-01', to: '2026-01-07' },
      },
    });

    renderWithProviders(<SprintDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Historique/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Historique/i }));

    await waitFor(() => {
      expect(screen.getByText('Sprint archivé')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Voir les détails'));

    await waitFor(() => {
      expect(mockGetSnapshot).toHaveBeenCalledWith('snap-view');
    });
  });
});
