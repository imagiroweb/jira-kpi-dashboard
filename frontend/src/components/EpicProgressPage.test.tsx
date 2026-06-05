import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStore } from '@/test/mocks/store';
import {
  TEST_EPIC_DETAILS_RESPONSE,
  TEST_EPIC_PROGRESS_ITEM,
} from '@/test/fixtures/jira';
import { EpicProgressPage } from './EpicProgressPage';
import { useStore } from '../store/useStore';

vi.mock('../services/api', () => ({
  jiraApi: {
    getConfiguredBoards: vi.fn(),
  },
  epicApi: {
    getProgress: vi.fn(),
    search: vi.fn(),
    getDetails: vi.fn(),
  },
}));

import { epicApi, jiraApi } from '../services/api';

const mockGetConfiguredBoards = vi.mocked(jiraApi.getConfiguredBoards);
const mockGetProgress = vi.mocked(epicApi.getProgress);
const mockSearch = vi.mocked(epicApi.search);
const mockGetDetails = vi.mocked(epicApi.getDetails);

const BOARD_ID = 12;
const EPICS_PAGE_SIZE = 20;
const DEFAULT_FILTERS_KEY = `${BOARD_ID}|all|all|1|${EPICS_PAGE_SIZE}|all`;

function setupBoards() {
  mockGetConfiguredBoards.mockResolvedValue({
    success: true,
    boards: [{ id: BOARD_ID, name: 'Board A', projectKey: 'ABC' }],
  });
}

function makeEpic(overrides: Partial<typeof TEST_EPIC_PROGRESS_ITEM> = {}) {
  return { ...TEST_EPIC_PROGRESS_ITEM, ...overrides };
}

function makeProgressResponse(
  overrides: {
    epics?: ReturnType<typeof makeEpic>[];
    total?: number;
    page?: number;
  } = {}
) {
  const epics = overrides.epics ?? [
    makeEpic({ epicKey: 'EPIC-1', summary: 'Premier epic', progressPercent: 50 }),
    makeEpic({
      epicKey: 'EPIC-2',
      summary: 'Deuxieme epic',
      progressPercent: 83,
      statusCategoryKey: 'indeterminate',
      status: 'In Progress',
    }),
  ];
  return {
    success: true,
    boardId: BOARD_ID,
    boardName: 'Board A',
    projectKey: 'ABC',
    epicCount: epics.length,
    total: overrides.total ?? epics.length,
    page: overrides.page ?? 1,
    pageSize: EPICS_PAGE_SIZE,
    epics,
  };
}

describe('EpicProgressPage', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    setupBoards();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('charge les epics et les affiche tries par progression decroissante', async () => {
    mockGetProgress.mockResolvedValue(makeProgressResponse());

    render(<EpicProgressPage />);

    await waitFor(() => {
      expect(mockGetProgress).toHaveBeenCalledWith(BOARD_ID, 'all', 'all', 1, EPICS_PAGE_SIZE, undefined);
    });

    const cardEpic1 = await screen.findByRole('button', {
      name: (n) => typeof n === 'string' && n.includes('EPIC-1') && n.includes('Premier epic'),
    });
    const cardEpic2 = await screen.findByRole('button', {
      name: (n) => typeof n === 'string' && n.includes('EPIC-2') && n.includes('Deuxieme epic'),
    });
    expect(cardEpic1).toBeInTheDocument();
    expect(cardEpic2).toBeInTheDocument();
    expect(cardEpic2.compareDocumentPosition(cardEpic1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('recherche un epic puis ouvre la modale de detail', async () => {
    mockGetProgress.mockResolvedValue(makeProgressResponse({ epics: [], total: 0 }));
    mockSearch.mockResolvedValue({
      success: true,
      boardId: BOARD_ID,
      query: 'fa',
      results: [
        {
          epicKey: 'EPIC-42',
          summary: 'Feature analytics',
          issueType: 'Epic',
          status: 'In Progress',
          statusCategoryKey: 'indeterminate',
        },
      ],
    });
    mockGetDetails.mockResolvedValue({
      success: true,
      epicKey: 'EPIC-42',
      summary: 'Feature analytics',
      issueType: 'Epic',
      status: 'In Progress',
      statusCategoryKey: 'indeterminate',
      originalEstimateSeconds: 3600,
      timeSpentSeconds: 1200,
      macroChiffrageSeconds: null,
      totalStoryPoints: 3,
      progressPercent: 33,
      isOverrun: false,
      children: [],
    });

    render(<EpicProgressPage />);

    const searchInput = await screen.findByPlaceholderText(/rechercher un epic/i);
    fireEvent.change(searchInput, { target: { value: 'fa' } });

    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledWith(BOARD_ID, 'fa', 'all', 'all');
    });

    fireEvent.click(await screen.findByRole('button', { name: /EPIC-42/i }));

    await waitFor(() => {
      expect(mockGetDetails).toHaveBeenCalledWith('EPIC-42');
      expect(screen.getByText('Feature analytics')).toBeInTheDocument();
    });
  });

  it('applique le filtre de type et relance le chargement', async () => {
    mockGetProgress.mockResolvedValue(makeProgressResponse());

    render(<EpicProgressPage />);

    await waitFor(() => {
      expect(mockGetProgress).toHaveBeenCalled();
    });

    mockGetProgress.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Épics' }));

    await waitFor(() => {
      expect(mockGetProgress).toHaveBeenCalledWith(BOARD_ID, 'epic', 'all', 1, EPICS_PAGE_SIZE, undefined);
    });
  });

  it('applique le filtre de statut et remet la page à 1', async () => {
    mockGetProgress.mockResolvedValue(makeProgressResponse());

    render(<EpicProgressPage />);

    await waitFor(() => {
      expect(mockGetProgress).toHaveBeenCalled();
    });

    mockGetProgress.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Terminées' }));

    await waitFor(() => {
      expect(mockGetProgress).toHaveBeenCalledWith(BOARD_ID, 'all', 'done', 1, EPICS_PAGE_SIZE, undefined);
    });
    expect(useStore.getState().epicsPage).toBe(1);
  });

  it('applique le filtre de préfixe résumé', async () => {
    mockGetProgress.mockResolvedValue(makeProgressResponse());

    render(<EpicProgressPage />);

    await waitFor(() => {
      expect(mockGetProgress).toHaveBeenCalled();
    });

    mockGetProgress.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'CLI' }));

    await waitFor(() => {
      expect(mockGetProgress).toHaveBeenCalledWith(BOARD_ID, 'all', 'all', 1, EPICS_PAGE_SIZE, 'CLI');
    });
  });

  it('navigue vers la page suivante de pagination', async () => {
    mockGetProgress.mockResolvedValue(
      makeProgressResponse({
        epics: [makeEpic({ epicKey: 'EPIC-1', summary: 'Page 1 epic', progressPercent: 40 })],
        total: 25,
        page: 1,
      })
    );

    render(<EpicProgressPage />);

    await waitFor(() => {
      expect(screen.getByText(/Page 1 sur 2/)).toBeInTheDocument();
    });

    mockGetProgress.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /suivant/i }));

    await waitFor(() => {
      expect(mockGetProgress).toHaveBeenCalledWith(BOARD_ID, 'all', 'all', 2, EPICS_PAGE_SIZE, undefined);
    });
  });

  it('réutilise le cache quand filtersKey correspond', async () => {
    const cachedPayload = makeProgressResponse({
      epics: [makeEpic({ epicKey: 'EPIC-CACHED', summary: 'Epic en cache', progressPercent: 90 })],
    });

    useStore.setState({
      epicsSelectedBoardId: BOARD_ID,
      epicsLastFiltersKey: DEFAULT_FILTERS_KEY,
      epicsProgressPayload: cachedPayload,
      epicsProgressLastUpdate: new Date(),
    });

    render(<EpicProgressPage />);

    await waitFor(() => {
      expect(screen.getByText(/EPIC-CACHED/)).toBeInTheDocument();
    });

    expect(mockGetProgress).not.toHaveBeenCalled();
  });

  it('ouvre la modale de détail story points depuis la liste', async () => {
    mockGetProgress.mockResolvedValue(
      makeProgressResponse({
        epics: [makeEpic({ epicKey: 'EPIC-SP', summary: 'Epic story points', progressPercent: 60 })],
        total: 1,
      })
    );
    mockGetDetails.mockResolvedValue({ success: true, ...TEST_EPIC_DETAILS_RESPONSE });

    render(<EpicProgressPage />);

    await screen.findByText(/EPIC-SP/);

    fireEvent.click(
      screen.getByRole('button', { name: /story points par statut \(us \+ sous-tickets\)/i })
    );

    await waitFor(() => {
      expect(mockGetDetails).toHaveBeenCalledWith('EPIC-SP');
      expect(screen.getByText('Détail story points par ticket')).toBeInTheDocument();
    });

    expect(screen.getByText('PROJ-101')).toBeInTheDocument();
  });

  it('affiche une erreur quand le détail epic échoue', async () => {
    mockGetProgress.mockResolvedValue(
      makeProgressResponse({
        epics: [makeEpic({ epicKey: 'EPIC-ERR', summary: 'Epic erreur', progressPercent: 10 })],
        total: 1,
      })
    );
    mockGetDetails.mockResolvedValue({ success: false } as never);

    render(<EpicProgressPage />);

    await screen.findByText(/EPIC-ERR/);

    fireEvent.click(
      await screen.findByRole('button', {
        name: (n) => typeof n === 'string' && n.includes('EPIC-ERR'),
      })
    );

    await waitFor(() => {
      expect(screen.getByText('Erreur lors du chargement des détails')).toBeInTheDocument();
    });
  });
});
