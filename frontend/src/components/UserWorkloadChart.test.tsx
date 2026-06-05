import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserWorkloadChart } from './UserWorkloadChart';

const mockFetch = vi.fn();

const TEST_DATE_RANGE = { from: '2026-01-01', to: '2026-01-07' };

const TEST_REPORT_PAYLOAD = {
  success: true,
  data: [
    {
      accountId: 'user-1',
      displayName: 'Alice Martin',
      totalHours: 16,
      worklogCount: 8,
    },
    {
      accountId: 'user-2',
      displayName: 'Bob Dupont',
      totalHours: 8,
      worklogCount: 4,
    },
  ],
  summary: {
    totalHours: 24,
    worklogCount: 12,
    uniqueUsers: 2,
  },
};

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

describe('UserWorkloadChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue(jsonResponse({ success: true, reports: [] }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('affiche le squelette de chargement quand le rapport partagé est en cours', () => {
    render(
      <UserWorkloadChart
        dateRange={TEST_DATE_RANGE}
        selectedProjects={['PROJ']}
        sharedReportPayload={null}
        isSharedReportLoading
      />
    );

    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('affiche les utilisateurs quand le rapport partagé est disponible', async () => {
    render(
      <UserWorkloadChart
        dateRange={TEST_DATE_RANGE}
        selectedProjects={['PROJ']}
        sharedReportPayload={TEST_REPORT_PAYLOAD}
        isSharedReportLoading={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    });

    expect(screen.getByText('Bob Dupont')).toBeInTheDocument();
    expect(screen.getByText(/utilisateurs/)).toBeInTheDocument();
    expect(screen.getByText(/total/)).toBeInTheDocument();
  });
});
