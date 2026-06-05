import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import {
  TEST_MONDAY_COLUMNS,
  TEST_MONDAY_ITEMS,
  TEST_MONDAY_USER,
} from '@/test/fixtures/monday';
import { TEST_USER } from '@/test/fixtures/users';
import { resetStore } from '@/test/mocks/store';
import { invalidateMondayProduitCache } from '../services/mondayProduitCache';

vi.mock('../services/api', () => ({
  mondayApi: {
    getStatus: vi.fn(),
    getMe: vi.fn(),
    getWorkspaces: vi.fn(),
    getBoards: vi.fn(),
    getBoard: vi.fn(),
    getBoardViews: vi.fn(),
  },
}));

import { mondayApi } from '../services/api';
import { ProduitDashboard } from './ProduitDashboard';

const mockGetStatus = vi.mocked(mondayApi.getStatus);
const mockGetMe = vi.mocked(mondayApi.getMe);
const mockGetWorkspaces = vi.mocked(mondayApi.getWorkspaces);
const mockGetBoards = vi.mocked(mondayApi.getBoards);
const mockGetBoard = vi.mocked(mondayApi.getBoard);

const ROADMAP_BOARD_ID = '5191064770';
const SUIVI_BOARD_ID = '475358061';

function setupMondayMocks() {
  mockGetStatus.mockResolvedValue({ success: true, configured: true });
  mockGetMe.mockResolvedValue({ success: true, me: TEST_MONDAY_USER });
  mockGetWorkspaces.mockResolvedValue({
    success: true,
    workspaces: [{ id: 'ws-roadmap', name: 'Roadmap Adoria 2026', kind: 'open' }],
  });
  mockGetBoards.mockResolvedValue({
    success: true,
    boards: [{ id: ROADMAP_BOARD_ID, name: 'Roadmap Adoria 2026', state: 'active', boardKind: 'public', itemCount: 2, workspaceId: 'ws-roadmap' }],
  });
  mockGetBoard.mockImplementation(async (boardId: string) => ({
    success: true,
    columns: TEST_MONDAY_COLUMNS,
    items: TEST_MONDAY_ITEMS,
    board: { id: boardId, name: 'Board', state: 'active', boardKind: 'public', itemCount: 2 },
  }));
}

describe('ProduitDashboard', () => {
  beforeEach(() => {
    resetStore();
    invalidateMondayProduitCache();
    vi.clearAllMocks();
    setupMondayMocks();
  });

  it('bootstrap Monday et affiche la section Roadmap', async () => {
    renderWithProviders(<ProduitDashboard />, { user: TEST_USER });

    expect(screen.getByText(/Connexion à Monday.com/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Connecté à Monday.com')).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Roadmap Adoria 2026/i).length).toBeGreaterThan(0);
    expect(mockGetStatus).toHaveBeenCalled();
    expect(mockGetMe).toHaveBeenCalled();
    expect(mockGetWorkspaces).toHaveBeenCalled();
  });

  it('rafraîchit les données Monday au clic sur Actualiser', async () => {
    renderWithProviders(<ProduitDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByTitle(/Rafraîchir les données/i)).toBeInTheDocument();
    });

    mockGetStatus.mockClear();
    mockGetMe.mockClear();

    fireEvent.click(screen.getByTitle(/Rafraîchir les données/i));

    await waitFor(() => {
      expect(mockGetStatus).toHaveBeenCalled();
      expect(mockGetMe).toHaveBeenCalled();
    });
  });

  it('affiche Monday non configuré avec bouton Réessayer', async () => {
    mockGetStatus.mockResolvedValueOnce({ success: true, configured: false });
    mockGetMe.mockResolvedValueOnce({ success: true });

    renderWithProviders(<ProduitDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText('Monday.com non configuré')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Réessayer/i })).toBeInTheDocument();
  });

  it('charge le board suivi clients par défaut', async () => {
    renderWithProviders(<ProduitDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(mockGetBoard).toHaveBeenCalledWith(SUIVI_BOARD_ID, 500);
    });
  });
});
