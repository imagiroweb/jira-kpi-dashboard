import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  { id: 'cdc', title: 'CDC déployé', type: 'numbers' },
  {
    id: 'cmdcdc',
    title: 'KPI Adoria - Nombre de commandes générées via le CDC',
    type: 'numbers',
  },
  { id: 'caisse', title: 'Système de caisse actif', type: 'text' },
  { id: 'prod', title: 'Date mise en production', type: 'date' },
  { id: 'start', title: 'Project start date', type: 'date' },
  { id: 'rostart', title: 'Roll out start date (formation admin)', type: 'date' },
  { id: 'formstart', title: 'Premiere jour date de formation  sites', type: 'date' },
  { id: 'formend', title: 'Dernier jour de formation sites', type: 'date' },
  { id: 'rollout', title: 'Initial roll out', type: 'status' },
  { id: 'projets', title: 'Total projets', type: 'numbers' },
  { id: 'uactifs', title: "KPI Adoria - Nbre d'utilisateurs actifs", type: 'numbers' },
  { id: 'ubruts', title: "KPI Adoria - Nbre d'utilisateurs bruts", type: 'numbers' },
];

const SUIVI_ITEMS = [
  {
    id: 'suivi-1',
    name: 'Client Alpha',
    column_values: [
      { id: 'sites', text: '4', type: 'numbers' },
      { id: 'target', text: '10', type: 'numbers' },
      { id: 'cdc', text: '8', type: 'numbers' },
      { id: 'cmdcdc', text: '20', type: 'numbers' },
      { id: 'caisse', text: 'Caisse Pro', type: 'text' },
      { id: 'prod', text: '2026-05-01', type: 'date' },
      { id: 'start', text: '2026-04-01', type: 'date' },
      { id: 'rollout', text: 'Done', type: 'status' },
      { id: 'projets', text: '2', type: 'numbers' },
      { id: 'uactifs', text: '30', type: 'numbers' },
      { id: 'ubruts', text: '50', type: 'numbers' },
    ],
  },
  {
    id: 'suivi-2',
    name: 'Client Beta',
    column_values: [
      { id: 'sites', text: '1', type: 'numbers' },
      { id: 'target', text: '10', type: 'numbers' },
      { id: 'cdc', text: '2', type: 'numbers' },
      { id: 'cmdcdc', text: '6', type: 'numbers' },
      { id: 'caisse', text: '-', type: 'text' },
      { id: 'prod', text: '2026-06-10', type: 'date' },
      { id: 'start', text: '2026-05-01', type: 'date' },
      { id: 'rollout', text: 'Done', type: 'status' },
      { id: 'projets', text: '1', type: 'numbers' },
      { id: 'uactifs', text: '10', type: 'numbers' },
      { id: 'ubruts', text: '50', type: 'numbers' },
    ],
  },
  {
    id: 'suivi-3',
    name: 'Client WIP Stuck',
    column_values: [
      { id: 'sites', text: '0', type: 'numbers' },
      { id: 'target', text: '2', type: 'numbers' },
      { id: 'cdc', text: '0', type: 'numbers' },
      { id: 'cmdcdc', text: '0', type: 'numbers' },
      { id: 'caisse', text: 'Zelty', type: 'text' },
      { id: 'prod', text: '', type: 'date' },
      { id: 'start', text: '2026-03-01', type: 'date' },
      { id: 'rostart', text: '2026-04-15', type: 'date' },
      { id: 'formstart', text: '2026-04-20', type: 'date' },
      { id: 'formend', text: '2026-04-25', type: 'date' },
      { id: 'rollout', text: 'Stuck', type: 'status' },
      { id: 'projets', text: '1', type: 'numbers' },
      { id: 'uactifs', text: '0', type: 'numbers' },
      { id: 'ubruts', text: '0', type: 'numbers' },
    ],
  },
];

function modalRootFromHeading(heading: HTMLElement): HTMLElement {
  const root = heading.closest('.fixed') ?? heading.parentElement?.parentElement;
  if (!(root instanceof HTMLElement)) {
    throw new Error('Modale détail introuvable');
  }
  return root;
}

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
    mockGetDefaultFilters.mockResolvedValue({ trimestre: 'all', statut: [], team: [] });
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

    const sitesTile = await screen.findByRole('button', { name: /Sites actifs \/ target/i });
    expect(sitesTile).toHaveTextContent(/5\s*Sites actifs/);
    expect(sitesTile).toHaveTextContent(/22\s*Sites cible/);
    expect(sitesTile).toHaveTextContent(/23\s*%/); // round(5/22*100)
    expect(screen.getByLabelText('Progression sites actifs vs target')).toBeInTheDocument();

    fireEvent.click(sitesTile);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Détail — Sites actifs \/ target/i })).toBeInTheDocument();
    });

    const detailHeading = screen.getByRole('heading', { name: /Détail — Sites actifs \/ target/i });
    const detailModal = modalRootFromHeading(detailHeading);

    expect(within(detailModal).getByRole('columnheader', { name: /Sites actifs/i })).toBeInTheDocument();
    expect(within(detailModal).getByRole('columnheader', { name: /Sites cible/i })).toBeInTheDocument();
    expect(within(detailModal).getByText('Client Alpha')).toBeInTheDocument();
    expect(within(detailModal).getByText('Client Beta')).toBeInTheDocument();
    expect(within(detailModal).getByText('Total')).toBeInTheDocument();
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
      team: ['Team Cook'],
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

    const teamCheckbox = await screen.findByRole('checkbox', { name: /Team Cook/i });
    expect(teamCheckbox).toBeChecked();
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
        team: [],
      });
    });

    expect(notify.success).toHaveBeenCalledWith(
      'Filtres enregistrés',
      expect.stringContaining('filtres trimestre, statut et team')
    );
  });

  it('affiche les 13 encarts « Sans … » sur le périmètre filtré', async () => {
    renderWithProviders(<ProduitDashboard />, { user: TEST_USER });

    const solTile = await screen.findByTitle('Sans solution doc — voir le détail des lignes');

    for (const label of [
      'Sans CP référent',
      'Sans solution doc',
      'Sans wireframe',
      'Sans maquettes',
      'Sans macro chiffrage',
      'Sans estimation',
      'Sans devis',
      'Sans validation client',
      'Sans validation clients',
      'Sans validation opérationnelle',
      'Sans validation marketing',
      'Sans clients pilotes',
      'Sans Epic',
    ]) {
      expect(screen.getByTitle(`${label} — voir le détail des lignes`)).toBeInTheDocument();
    }

    // Feature B a une solution doc vide, Feature A est renseignée.
    expect(solTile).toHaveTextContent('1');
    // Colonne « Devis » absente du board de test.
    expect(screen.getByTitle('Sans devis — voir le détail des lignes')).toHaveTextContent('—');
  });

  it('ouvre le détail d’un encart « Sans … » et respecte la colonne « … requis ? »', async () => {
    renderWithProviders(<ProduitDashboard />, { user: TEST_USER });

    const solTile = await screen.findByTitle('Sans solution doc — voir le détail des lignes');
    fireEvent.click(solTile);

    const solHeading = await screen.findByRole('heading', {
      name: 'Sans solution doc — détail des lignes',
    });
    const solModal = modalRootFromHeading(solHeading);
    expect(within(solModal).getByText('Feature B')).toBeInTheDocument();
    expect(within(solModal).queryByText('Feature A')).not.toBeInTheDocument();

    fireEvent.click(within(solModal).getByRole('button', { name: '' }));

    // « Wireframe requis ? » = NON sur Feature B : seule Feature A est comptée.
    fireEvent.click(screen.getByTitle('Sans wireframe — voir le détail des lignes'));

    const wfHeading = await screen.findByRole('heading', {
      name: 'Sans wireframe — détail des lignes',
    });
    const wfModal = modalRootFromHeading(wfHeading);
    expect(within(wfModal).getByText(/Wireframe requis \?/)).toBeInTheDocument();
    expect(within(wfModal).getByText('Feature A')).toBeInTheDocument();
    expect(within(wfModal).queryByText('Feature B')).not.toBeInTheDocument();
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

  it('affiche la tuile CDC (sites, commandes, target) et ouvre la modale détail', async () => {
    renderWithProviders(<ProduitDashboard />, { user: TEST_USER });

    const cdcTile = await screen.findByRole('button', { name: /CDC déployé/i });

    // Alpha 8+Beta 2 = 10 sites CDC ; cmd 20+6 = 26 ; target CDC 10+10 = 20 ; 50 %
    expect(cdcTile).toHaveTextContent(/Sites déployés CDC/);
    expect(cdcTile).toHaveTextContent(/Commandes via CDC/);
    expect(cdcTile).toHaveTextContent(/Sites cible \(target\)/);
    expect(cdcTile).toHaveTextContent(/2 projets/);
    expect(cdcTile).toHaveTextContent(/10\s*Sites déployés CDC/);
    expect(cdcTile).toHaveTextContent(/26\s*Commandes via CDC/);
    expect(cdcTile).toHaveTextContent(/20\s*Sites cible/);
    expect(cdcTile).toHaveTextContent(/50\s*%/);
    expect(screen.getByLabelText('Progression déploiement CDC vs target')).toBeInTheDocument();

    fireEvent.click(cdcTile);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Détail — CDC déployé — sites, commandes et target/i })
      ).toBeInTheDocument();
    });

    const detailHeading = screen.getByRole('heading', {
      name: /Détail — CDC déployé — sites, commandes et target/i,
    });
    const detailModal = modalRootFromHeading(detailHeading);

    expect(within(detailModal).getByRole('columnheader', { name: /Sites CDC/i })).toBeInTheDocument();
    expect(within(detailModal).getByRole('columnheader', { name: /Commandes via CDC/i })).toBeInTheDocument();
    expect(within(detailModal).getByRole('columnheader', { name: /Sites cible/i })).toBeInTheDocument();
    expect(within(detailModal).getByText('Client Alpha')).toBeInTheDocument();
    expect(within(detailModal).getByText('Client Beta')).toBeInTheDocument();
    expect(within(detailModal).queryByText('Client WIP Stuck')).not.toBeInTheDocument();
    expect(within(detailModal).getByText('Total')).toBeInTheDocument();
  });

  it('affiche la tuile utilisateurs actifs / total et ouvre la modale détail', async () => {
    renderWithProviders(<ProduitDashboard />, { user: TEST_USER });

    const usersTile = await screen.findByRole('button', { name: /Utilisateurs actifs \/ total/i });
    // 30+10 = 40 actifs ; 50+50 = 100 bruts ; 40 %
    expect(usersTile).toHaveTextContent(/40\s*Utilisateurs actifs/);
    expect(usersTile).toHaveTextContent(/100\s*Total utilisateurs/);
    expect(usersTile).toHaveTextContent(/40\s*%/);
    expect(screen.getByLabelText('Progression utilisateurs actifs vs total')).toBeInTheDocument();

    fireEvent.click(usersTile);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Détail — Utilisateurs actifs \/ total/i })
      ).toBeInTheDocument();
    });

    const detailHeading = screen.getByRole('heading', {
      name: /Détail — Utilisateurs actifs \/ total/i,
    });
    const detailModal = modalRootFromHeading(detailHeading);

    expect(within(detailModal).getByRole('columnheader', { name: /Utilisateurs actifs/i })).toBeInTheDocument();
    expect(within(detailModal).getByRole('columnheader', { name: /Total utilisateurs/i })).toBeInTheDocument();
    expect(within(detailModal).getByText('Client Alpha')).toBeInTheDocument();
    expect(within(detailModal).getByText('Client Beta')).toBeInTheDocument();
    expect(within(detailModal).getByText('Total')).toBeInTheDocument();
  });
});
