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
    getSnapshots: vi.fn().mockResolvedValue({ success: true, snapshots: [] }),
    saveSnapshot: vi.fn(),
    getSnapshot: vi.fn(),
    deleteSnapshot: vi.fn(),
  },
}));

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
});
