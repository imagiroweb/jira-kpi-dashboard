import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResolvedByDayChart } from './ResolvedByDayChart';

const mockFetch = vi.fn();

const TEST_BOARDS = [{ id: 1, name: 'Board Alpha', color: '#6366f1' }];

const TEST_DATE_RANGE = { from: '2026-01-01', to: '2026-01-07' };

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('ResolvedByDayChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ne rend rien quand la liste de boards est vide', () => {
    const { container } = render(
      <ResolvedByDayChart dateRange={TEST_DATE_RANGE} boards={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('affiche les données mockées après chargement', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        byDay: [
          { date: '2026-01-01', board_1: 3 },
          { date: '2026-01-02', board_1: 5 },
        ],
        boards: TEST_BOARDS,
        types: [],
        totalResolvedTickets: 8,
        totalsBySeries: [{ name: 'Board Alpha', total: 8 }],
        totalsBySeriesPoints: [],
        dateRange: TEST_DATE_RANGE,
      })
    );

    render(<ResolvedByDayChart dateRange={TEST_DATE_RANGE} boards={TEST_BOARDS} />);

    await waitFor(() => {
      expect(screen.getByText('Tickets résolus par jour')).toBeInTheDocument();
    });

    expect(screen.getByText(/Résultat de la requête/i)).toBeInTheDocument();
    expect(screen.getByTestId('recharts-responsive-container')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/jira/resolved-by-day?')
    );
  });

  it('affiche l’état vide quand aucun ticket n’est résolu', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        byDay: [],
        boards: TEST_BOARDS,
        types: [],
        totalResolvedTickets: 0,
        totalsBySeries: [],
        totalsBySeriesPoints: [],
        dateRange: TEST_DATE_RANGE,
      })
    );

    render(<ResolvedByDayChart dateRange={TEST_DATE_RANGE} boards={TEST_BOARDS} />);

    await waitFor(() => {
      expect(screen.getByText('Aucun ticket résolu sur cette période')).toBeInTheDocument();
    });
  });

  it('affiche une erreur quand l’API échoue', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: false, message: 'Erreur Jira' }, true, 200));

    render(<ResolvedByDayChart dateRange={TEST_DATE_RANGE} boards={TEST_BOARDS} />);

    await waitFor(() => {
      expect(screen.getByText('Impossible de charger les données')).toBeInTheDocument();
    });
  });
});
