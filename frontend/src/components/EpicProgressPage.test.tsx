import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EpicProgressPage } from './EpicProgressPage';
import { useStore } from '../store/useStore';

vi.mock('../services/api', () => ({
  jiraApi: {
    getConfiguredBoards: vi.fn()
  },
  epicApi: {
    getProgress: vi.fn(),
    search: vi.fn(),
    getDetails: vi.fn()
  }
}));

import { epicApi, jiraApi } from '../services/api';

const mockGetConfiguredBoards = vi.mocked(jiraApi.getConfiguredBoards);
const mockGetProgress = vi.mocked(epicApi.getProgress);
const mockSearch = vi.mocked(epicApi.search);
const mockGetDetails = vi.mocked(epicApi.getDetails);

describe('EpicProgressPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      kpiRefreshTrigger: 0,
      epicsProgressPayload: null,
      epicsProgressLastUpdate: null,
      epicsLastFiltersKey: null,
      epicsSelectedBoardId: null,
      epicsTypeFilter: 'all',
      epicsStatusFilter: 'all',
      epicsPage: 1,
      epicsPrefixFilter: 'all'
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('charge les epics et les affiche tries par progression decroissante', async () => {
    mockGetConfiguredBoards.mockResolvedValue({
      success: true,
      boards: [{ id: 12, name: 'Board A', projectKey: 'ABC' }]
    });
    mockGetProgress.mockResolvedValue({
      success: true,
      boardId: 12,
      boardName: 'Board A',
      projectKey: 'ABC',
      epicCount: 2,
      total: 2,
      page: 1,
      pageSize: 20,
      epics: [
        {
          epicKey: 'EPIC-1',
          summary: 'Premier epic',
          issueType: 'Epic',
          status: 'To Do',
          statusCategoryKey: 'new',
          childIssueCount: 2,
          originalEstimateSeconds: 3600,
          timeSpentSeconds: 1800,
          macroChiffrageSeconds: null,
          totalStoryPoints: 5,
          progressPercent: 50,
          isOverrun: false,
          teams: []
        },
        {
          epicKey: 'EPIC-2',
          summary: 'Deuxieme epic',
          issueType: 'Epic',
          status: 'In Progress',
          statusCategoryKey: 'indeterminate',
          childIssueCount: 3,
          originalEstimateSeconds: 3600,
          timeSpentSeconds: 3000,
          macroChiffrageSeconds: null,
          totalStoryPoints: 8,
          progressPercent: 83,
          isOverrun: false,
          teams: []
        }
      ]
    });

    render(<EpicProgressPage />);

    await waitFor(() => {
      expect(mockGetProgress).toHaveBeenCalledWith(12, 'all', 'all', 1, 20, undefined);
    });

    const cardEpic1 = screen.getByText(/EPIC-1/).closest('button');
    const cardEpic2 = screen.getByText(/EPIC-2/).closest('button');
    expect(cardEpic1).toBeInTheDocument();
    expect(cardEpic2).toBeInTheDocument();
    expect(cardEpic2!.compareDocumentPosition(cardEpic1!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('recherche un epic puis ouvre la modale de detail', async () => {
    mockGetConfiguredBoards.mockResolvedValue({
      success: true,
      boards: [{ id: 12, name: 'Board A', projectKey: 'ABC' }]
    });
    mockGetProgress.mockResolvedValue({
      success: true,
      boardId: 12,
      boardName: 'Board A',
      projectKey: 'ABC',
      epicCount: 0,
      total: 0,
      page: 1,
      pageSize: 20,
      epics: []
    });
    mockSearch.mockResolvedValue({
      success: true,
      boardId: 12,
      query: 'fa',
      results: [
        {
          epicKey: 'EPIC-42',
          summary: 'Feature analytics',
          issueType: 'Epic',
          status: 'In Progress',
          statusCategoryKey: 'indeterminate'
        }
      ]
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
      children: []
    });

    render(<EpicProgressPage />);

    const searchInput = await screen.findByPlaceholderText(/rechercher un epic/i);
    fireEvent.change(searchInput, { target: { value: 'fa' } });

    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledWith(12, 'fa', 'all', 'all');
    });

    fireEvent.click(await screen.findByRole('button', { name: /EPIC-42/i }));

    await waitFor(() => {
      expect(mockGetDetails).toHaveBeenCalledWith('EPIC-42');
      expect(screen.getByText('Feature analytics')).toBeInTheDocument();
    });
  });
});
