import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('affiche le squelette de chargement quand le rapport partagé est en cours', async () => {
    render(
      <UserWorkloadChart
        dateRange={TEST_DATE_RANGE}
        selectedProjects={['PROJ']}
        sharedReportPayload={null}
        isSharedReportLoading
      />
    );

    expect(document.querySelector('.animate-pulse')).toBeTruthy();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/worklog/saved-reports')
      );
    });
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

  it('affiche une erreur quand le rapport partagé échoue', async () => {
    render(
      <UserWorkloadChart
        dateRange={TEST_DATE_RANGE}
        selectedProjects={['PROJ']}
        sharedReportPayload={{ success: false, message: 'Erreur WorklogPro' }}
        isSharedReportLoading={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Erreur WorklogPro')).toBeInTheDocument();
    });
  });

  it('affiche l’état vide quand aucun worklog n’est trouvé', async () => {
    render(
      <UserWorkloadChart
        dateRange={TEST_DATE_RANGE}
        selectedProjects={['PROJ']}
        sharedReportPayload={{ success: true, data: [], summary: { totalHours: 0, worklogCount: 0, uniqueUsers: 0 } }}
        isSharedReportLoading={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Aucun worklog trouvé pour cette période')).toBeInTheDocument();
    });
  });

  it('bascule vers un rapport sauvegardé et affiche les données', async () => {
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/worklog/saved-reports/report-1/execute')) {
        return jsonResponse(TEST_REPORT_PAYLOAD);
      }
      if (url.includes('/worklog/saved-reports')) {
        return jsonResponse({
          success: true,
          reports: [{ id: 'report-1', name: 'Rapport hebdo', description: 'Temps équipe' }],
        });
      }
      return jsonResponse({ success: false });
    });

    render(
      <UserWorkloadChart
        dateRange={TEST_DATE_RANGE}
        selectedProjects={['PROJ']}
        sharedReportPayload={null}
        isSharedReportLoading={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Temps réel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Temps réel/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Rapport hebdo/i }));

    await waitFor(() => {
      expect(screen.getByText(/Alice/)).toBeInTheDocument();
      expect(screen.getByText(/Bob/)).toBeInTheDocument();
    });
  });

  it('affiche une erreur serveur lors de l’exécution d’un rapport sauvegardé', async () => {
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/worklog/saved-reports/report-1/execute')) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      }
      if (url.includes('/worklog/saved-reports')) {
        return jsonResponse({
          success: true,
          reports: [{ id: 'report-1', name: 'Rapport hebdo' }],
        });
      }
      return jsonResponse({ success: false });
    });

    render(
      <UserWorkloadChart
        dateRange={TEST_DATE_RANGE}
        selectedProjects={['PROJ']}
        sharedReportPayload={null}
        isSharedReportLoading={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Temps réel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Temps réel/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Rapport hebdo/i }));

    await waitFor(() => {
      expect(screen.getByText('Erreur serveur: 500')).toBeInTheDocument();
    });
  });
});
