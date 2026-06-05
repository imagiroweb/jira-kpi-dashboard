import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserTicketsChart } from './UserTicketsChart';

const mockFetch = vi.fn();

const TEST_DATE_RANGE = { from: '2026-01-01', to: '2026-01-07' };

const TEST_REPORT_PAYLOAD = {
  success: true,
  data: [
    {
      accountId: 'user-1',
      displayName: 'Alice Martin',
      totalHours: 12,
    },
  ],
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('UserTicketsChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('affiche le chargement des utilisateurs quand le rapport partagé est en cours', () => {
    render(
      <UserTicketsChart
        dateRange={TEST_DATE_RANGE}
        selectedProjects={['PROJ']}
        sharedReportPayload={null}
        isSharedReportLoading
      />
    );

    expect(screen.getByText('Chargement des utilisateurs...')).toBeInTheDocument();
  });

  it('affiche les tickets de l’utilisateur sélectionné', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        worklogs: [
          {
            issueKey: 'PROJ-42',
            issueSummary: 'Corriger le dashboard',
            issueType: 'Bug',
            status: 'Done',
            timeSpentSeconds: 7200,
            storyPoints: 3,
          },
        ],
      })
    );

    render(
      <UserTicketsChart
        dateRange={TEST_DATE_RANGE}
        selectedProjects={['PROJ']}
        sharedReportPayload={TEST_REPORT_PAYLOAD}
        isSharedReportLoading={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/1 utilisateurs disponibles/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /choisir un utilisateur/i }));

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Alice Martin'));

    await waitFor(() => {
      expect(screen.getByText('PROJ-42')).toBeInTheDocument();
    });

    expect(screen.getByText('Corriger le dashboard')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/worklog/search?'));
  });
});
