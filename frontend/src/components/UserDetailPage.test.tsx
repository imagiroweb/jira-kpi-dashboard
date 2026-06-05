import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStore } from '@/test/mocks/store';
import { useStore } from '@/store/useStore';
import { UserDetailPage } from './UserDetailPage';

const mockFetch = vi.fn();

const TEST_DATE_RANGE = { from: '2026-01-01', to: '2026-01-07' };

const TEST_REPORT_PAYLOAD = {
  success: true,
  data: [
    {
      accountId: 'user-1',
      displayName: 'Alice Martin',
      totalHours: 10,
      worklogCount: 5,
    },
  ],
  summary: {
    totalHours: 10,
    worklogCount: 5,
    uniqueUsers: 1,
  },
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

vi.mock('./ProjectSelector', () => ({
  ProjectSelector: ({
    value,
    onChange,
  }: {
    value: string[];
    onChange: (keys: string[]) => void;
  }) => (
    <button type="button" onClick={() => onChange(['PROJ'])}>
      Projets ({value.length})
    </button>
  ),
}));

vi.mock('./DateRangePicker', () => ({
  DateRangePicker: () => <div>Période mockée</div>,
}));

describe('UserDetailPage', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    useStore.setState({
      dateRange: TEST_DATE_RANGE,
      selectedProjects: ['PROJ'],
      usersPageUseActiveSprint: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('charge le rapport worklog et affiche les graphiques', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/worklog/saved-reports')) {
        return jsonResponse({ success: true, reports: [] });
      }
      if (url.includes('/worklog/report?')) {
        return jsonResponse(TEST_REPORT_PAYLOAD);
      }
      return jsonResponse({ success: true, worklogs: [] });
    });

    render(<UserDetailPage />);

    expect(screen.getByText('Détail Utilisateurs')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/worklog/report?'));
    });

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    });
  });

  it('affiche le chargement pendant la récupération du rapport', async () => {
    let resolveReport: (value: unknown) => void = () => {};
    const reportPromise = new Promise((resolve) => {
      resolveReport = resolve;
    });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/worklog/saved-reports')) {
        return jsonResponse({ success: true, reports: [] });
      }
      if (url.includes('/worklog/report?')) {
        return reportPromise.then(() => jsonResponse(TEST_REPORT_PAYLOAD));
      }
      return jsonResponse({ success: true, worklogs: [] });
    });

    render(<UserDetailPage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/worklog/report?'));
    });

    expect(document.querySelector('.animate-pulse')).toBeTruthy();

    resolveReport(undefined);

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    });
  });
});
