import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import {
  TEST_MONDAY_COLUMNS,
  TEST_MONDAY_ITEMS,
  TEST_MONDAY_USER,
} from '@/test/fixtures/monday';
import { TEST_USER } from '@/test/fixtures/users';
import { createAuthApiMock } from '@/test/mocks/authApi';
import { createMockSocketContextValue } from '@/test/mocks/socket';
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

vi.mock('../services/authApi', () => ({ authApi: createAuthApiMock() }));

import { mondayApi } from '../services/api';
import { authApi } from '../services/authApi';
import { ProduitDashboard } from './ProduitDashboard';

const mockGetStatus = vi.mocked(mondayApi.getStatus);
const mockGetMe = vi.mocked(mondayApi.getMe);
const mockGetWorkspaces = vi.mocked(mondayApi.getWorkspaces);
const mockGetBoards = vi.mocked(mondayApi.getBoards);
const mockGetBoard = vi.mocked(mondayApi.getBoard);
const mockGetDefaultFilters = vi.mocked(authApi.getRoadmapAdoria2026DefaultFilters);
const mockSaveDefaultFilters = vi.mocked(authApi.saveRoadmapAdoria2026DefaultFilters);

const ROADMAP_BOARD_ID = '5191064770';
const SUIVI_BOARD_ID = '475358061';

const SUIVI_COLUMNS = [
  { id: 'sites', title: 'Sites actifs', type: 'numbers' },
  { id: 'target', title: 'Target', type: 'numbers' },
  { id: 'caisse', title: 'Système de caisse actif', type: 'text' },
  { id: 'prod', title: 'Date mise en production', type: 'date' },
  { id: 'start', title: 'Project start date', type: 'date' },
  { id: 'rostart', title: 'Roll out start date (formation admin)', type: 'date' },
  { id: 'formstart', title: 'Premiere jour date de formation  sites', type: 'date' },
  { id: 'formend', title: 'Dernier jour de formation sites', type: 'date' },
  { id: 'rollout', title: 'Initial roll out', type: 'status' },
  { id: 'projets', title: 'Total projets', type: 'numbers' },
];

const SUIVI_ITEMS = [
  {
    id: 'suivi-1',
    name: 'Client Alpha',
    column_values: [
      { id: 'sites', text: '4', type: 'numbers' },
      { id: 'target', text: '10', type: 'numbers' },
      { id: 'caisse', text: 'Caisse Pro', type: 'text' },
      { id: 'prod', text: '2026-05-01', type: 'date' },
      { id: 'start', text: '2026-04-01', type: 'date' },
      { id: 'rollout', text: 'Done', type: 'status' },
      { id: 'projets', text: '2', type: 'numbers' },
    ],
  },
  {
    id: 'suivi-2',
    name: 'Client Beta',
    column_values: [
      { id: 'sites', text: '1', type: 'numbers' },
      { id: 'target', text: '5', type: 'numbers' },
      { id: 'caisse', text: '-', type: 'text' },
      { id: 'prod', text: '2026-06-10', type: 'date' },
      { id: 'start', text: '2026-05-01', type: 'date' },
      { id: 'rollout', text: 'Done', type: 'status' },
      { id: 'projets', text: '1', type: 'numbers' },
    ],
  },
  {
    id: 'suivi-3',
    name: 'Client WIP Stuck',
    column_values: [
      { id: 'sites', text: '0', type: 'numbers' },
      { id: 'target', text: '2', type: 'numbers' },
      { id: 'caisse', text: 'Zelty', type: 'text' },
      { id: 'prod', text: '', type: 'date' },
      { id: 'start', text: '2026-03-01', type: 'date' },
      { id: 'rostart', text: '2026-04-15', type: 'date' },
      { id: 'formstart', text: '2026-04-20', type: 'date' },
      { id: 'formend', text: '2026-04-25', type: 'date' },
      { id: 'rollout', text: 'Stuck', type: 'status' },
      { id: 'projets', text: '1', type: 'numbers' },
    ],
  },
];

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
  mockGetBoard.mockImplementation(async (boardId: string) => {
    if (boardId === SUIVI_BOARD_ID) {
      return {
        success: true,
        columns: SUIVI_COLUMNS,
        items: SUIVI_ITEMS,
        board: { id: boardId, name: 'Suivi clients', state: 'active', boardKind: 'public', itemCount: 2 },
      };
    }
    return {
      success: true,
      columns: TEST_MONDAY_COLUMNS,
      items: TEST_MONDAY_ITEMS,
      board: { id: boardId, name: 'Board', state: 'active', boardKind: 'public', itemCount: 2 },
    };
  });
}

describe('ProduitDashboard', () => {
  beforeEach(() => {
    resetStore();
    invalidateMondayProduitCache();
    vi.clearAllMocks();
    setupMondayMocks();
    mockGetDefaultFilters.mockResolvedValue({ trimestre: 'all', statut: [] });
    mockSaveDefaultFilters.mockImplementation(async (filters) => filters);
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

  it('replie et déplie la section Suivi clients', async () => {
    renderWithProviders(<ProduitDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText('Sites actifs')).toBeInTheDocument();
    });

    const suiviHeading = screen.getByRole('heading', { name: 'Suivi clients par cp' });
    fireEvent.click(suiviHeading.closest('button')!);

    await waitFor(() => {
      expect(screen.queryByText('Sites actifs')).not.toBeInTheDocument();
    });

    fireEvent.click(suiviHeading.closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('Sites actifs')).toBeInTheDocument();
    });
  });

  it('replie la section Roadmap Adoria 2026', async () => {
    renderWithProviders(<ProduitDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText('Connecté à Monday.com')).toBeInTheDocument();
    });

    const roadmapHeadings = screen.getAllByRole('heading', { name: /Roadmap Adoria 2026/i });
    fireEvent.click(roadmapHeadings[0].closest('button')!);

    await waitFor(() => {
      expect(screen.queryByText(/Chargement du board Roadmap/i)).not.toBeInTheDocument();
    });
  });

  it('affiche une erreur réseau au bootstrap Monday', async () => {
    mockGetStatus.mockRejectedValueOnce(new Error('Réseau indisponible'));

    renderWithProviders(<ProduitDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText('Réseau indisponible')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Réessayer/i })).toBeInTheDocument();
  });

  it('ouvre la modale détail KPI sites actifs', async () => {
    renderWithProviders(<ProduitDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Sites actifs').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('Client Alpha')).toBeInTheDocument();
      expect(screen.getByText('Client Beta')).toBeInTheDocument();
    });
  });

  it('ouvre la modale délai moyen de mise en production', async () => {
    renderWithProviders(<ProduitDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText(/Délai moy\. mise en prod\./i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Délai moy\. mise en prod\./i).closest('button')!);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Délai mise en prod. par client' })).toBeInTheDocument();
      expect(screen.getByText('Client Alpha')).toBeInTheDocument();
    });
  });

  it('charge et applique les filtres par défaut Roadmap au montage', async () => {
    mockGetDefaultFilters.mockResolvedValue({
      trimestre: 'Q1',
      statut: ['En cours'],
    });

    renderWithProviders(<ProduitDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(mockGetDefaultFilters).toHaveBeenCalled();
    });

    await waitFor(() => {
      const q1 = screen.getByRole('button', { name: 'Q1' });
      expect(q1.className).toMatch(/bg-amber-500\/20/);
    });

    const statusCheckbox = await screen.findByRole('checkbox', { name: /En cours/i });
    expect(statusCheckbox).toBeChecked();
  });

  it('enregistre les filtres par défaut et notifie le succès', async () => {
    const notify = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    };
    const socket = createMockSocketContextValue({ notify });

    renderWithProviders(<ProduitDashboard />, { user: TEST_USER, socket });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Enregistrer comme filtres par défaut/i })
      ).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Q2' }));
    fireEvent.click(
      screen.getByRole('button', { name: /Enregistrer comme filtres par défaut/i })
    );

    await waitFor(() => {
      expect(mockSaveDefaultFilters).toHaveBeenCalledWith({
        trimestre: 'Q2',
        statut: [],
      });
    });

    expect(notify.success).toHaveBeenCalledWith(
      'Filtres enregistrés',
      expect.stringContaining('filtres trimestre et statut')
    );
  });

  it('affiche les intégrations en cours avec badge Stuck et ouvre la modale', async () => {
    renderWithProviders(<ProduitDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Intégrations en cours' })).toBeInTheDocument();
    });

    expect(screen.getByText('Client WIP Stuck')).toBeInTheDocument();
    expect(screen.getByLabelText('Liste des intégrations en cours')).toBeInTheDocument();
    expect(screen.getByLabelText('Liste des intégrations en cours')).toHaveTextContent(/Stuck/i);
    expect(screen.getByLabelText('Liste des intégrations en cours')).toHaveTextContent(/0\s*\/\s*2/);
    expect(screen.getByLabelText('Liste des intégrations en cours')).toHaveTextContent(/0\s*%/);
    expect(screen.getByLabelText('Liste des intégrations en cours')).toHaveTextContent(/roll-out/i);
    expect(screen.getByLabelText('Liste des intégrations en cours')).toHaveTextContent(/depuis début/i);
    expect(screen.getByLabelText('Liste des intégrations en cours')).toHaveTextContent(/formation/i);
    expect(screen.getByLabelText('Liste des intégrations en cours')).toHaveTextContent(/5 j/);

    const kpiTile = screen.getByRole('button', { name: /Intégrations en cours/i });
    fireEvent.click(kpiTile);

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'Intégrations en cours' }).length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('Client WIP Stuck').length).toBeGreaterThanOrEqual(2);
    });

    fireEvent.click(screen.getByLabelText('Liste des intégrations en cours').querySelector('button')!);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText('Timeline des événements')).toBeInTheDocument();
      expect(screen.getByLabelText('Progression des sites')).toHaveTextContent(/Sites actifs/);
      expect(screen.getByLabelText('Progression des sites')).toHaveTextContent(/0/);
      expect(screen.getByLabelText('Progression des sites')).toHaveTextContent(/target/);
      expect(screen.getByLabelText('Progression des sites')).toHaveTextContent(/2/);
      expect(screen.getByLabelText('Progression des sites')).toHaveTextContent(/0\s*%/);
      expect(screen.getByText('Début projet')).toBeInTheDocument();
      expect(screen.getByText('Aujourd’hui')).toBeInTheDocument();
      expect(screen.getByText('J+0')).toBeInTheDocument();
    });
  });
});
