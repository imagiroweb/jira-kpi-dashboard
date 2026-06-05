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
});
