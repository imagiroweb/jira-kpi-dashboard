import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerformanceCycle } from '../domain/performance';
import type { Team } from '../domain/team';

vi.mock('../services/api', () => ({
  teamApi: {
    create: vi.fn(),
    update: vi.fn(),
    assignMember: vi.fn(),
    getRoster: vi.fn()
  },
  performanceApi: {
    createCycle: vi.fn(),
    updateCycle: vi.fn(),
    importOkr: vi.fn()
  }
}));

import { performanceApi, teamApi } from '../services/api';
import { TeamsCyclesAdminPanel } from './TeamsCyclesAdminPanel';

const mockTeamCreate = vi.mocked(teamApi.create);
const mockTeamUpdate = vi.mocked(teamApi.update);
const mockAssignMember = vi.mocked(teamApi.assignMember);
const mockGetRoster = vi.mocked(teamApi.getRoster);
const mockCreateCycle = vi.mocked(performanceApi.createCycle);
const mockUpdateCycle = vi.mocked(performanceApi.updateCycle);
const mockImportOkr = vi.mocked(performanceApi.importOkr);

const TEAMS: Team[] = [
  { id: 'team-1', name: 'Choco', leadIds: ['user-1'], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'team-2', name: 'Cook', leadIds: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' }
];

const CYCLES: PerformanceCycle[] = [
  {
    id: 'cycle-1',
    label: 'S2-2026',
    startDate: '2026-07-01',
    endDate: '2026-12-31',
    status: 'active',
    createdAt: '2026-07-01',
    updatedAt: '2026-07-01'
  },
  {
    id: 'cycle-2',
    label: 'S1-2027',
    startDate: '2027-01-01',
    endDate: '2027-06-30',
    status: 'draft',
    createdAt: '2027-01-01',
    updatedAt: '2027-01-01'
  }
];

function apiError(status: number, message: string) {
  return { response: { status, data: { message } } };
}

function teamsCard() {
  return screen.getByRole('heading', { name: 'Équipes' }).closest('.card-glass') as HTMLElement;
}

function cyclesCard() {
  return screen.getByRole('heading', { name: 'Cycles de performance' }).closest('.card-glass') as HTMLElement;
}

/** Attend que le roster soit chargé (le sélecteur de réaffectation n'apparaît qu'une fois prêt). */
async function waitForRosterLoaded() {
  await screen.findByLabelText('Collaborateur');
}

describe('TeamsCyclesAdminPanel', () => {
  const onChanged = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRoster.mockResolvedValue({
      success: true,
      users: [
        { id: 'user-1', firstName: 'Alice', lastName: 'Martin', email: 'alice@test.com', teamId: 'team-1' },
        { id: 'user-2', firstName: 'Bob', lastName: 'Dupont', email: 'bob@test.com', teamId: null }
      ]
    });
  });

  it('affiche les équipes, les cycles et le formulaire de réaffectation une fois le roster chargé', async () => {
    render(<TeamsCyclesAdminPanel teams={TEAMS} cycles={CYCLES} onChanged={onChanged} />);
    await waitForRosterLoaded();

    expect(within(teamsCard()).getByText('Choco')).toBeInTheDocument();
    expect(within(teamsCard()).getByText('Cook')).toBeInTheDocument();
    expect(within(teamsCard()).getByText(/1 collaborateur\(s\) : Alice Martin/)).toBeInTheDocument();
    expect(within(teamsCard()).getByText('Aucun collaborateur rattaché')).toBeInTheDocument();
    expect(within(cyclesCard()).getByText('S2-2026')).toBeInTheDocument();
    expect(within(cyclesCard()).getByText('S1-2027')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Réaffecter un collaborateur' })).toBeInTheDocument();
  });

  it('crée une équipe avec les leads cochés', async () => {
    mockTeamCreate.mockResolvedValue({ success: true, team: { ...TEAMS[0], id: 'team-3', name: 'QA', leadIds: [] } });
    render(<TeamsCyclesAdminPanel teams={TEAMS} cycles={CYCLES} onChanged={onChanged} />);
    await waitForRosterLoaded();

    fireEvent.click(within(teamsCard()).getByRole('button', { name: /Créer une équipe/i }));
    fireEvent.change(screen.getByPlaceholderText("Nom de l'équipe"), { target: { value: 'QA' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alice Martin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));

    await waitFor(() => {
      expect(mockTeamCreate).toHaveBeenCalledWith({ name: 'QA', leadIds: ['user-1'] });
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('renomme une équipe existante et conserve ses leads', async () => {
    mockTeamUpdate.mockResolvedValue({ success: true, team: { ...TEAMS[0], name: 'Choco 2.0' } });
    render(<TeamsCyclesAdminPanel teams={TEAMS} cycles={CYCLES} onChanged={onChanged} />);
    await waitForRosterLoaded();

    fireEvent.click(within(teamsCard()).getAllByRole('button', { name: 'Modifier' })[0]);
    const nameInput = within(teamsCard()).getByDisplayValue('Choco');
    fireEvent.change(nameInput, { target: { value: 'Choco 2.0' } });
    fireEvent.click(within(teamsCard()).getByRole('button', { name: /Enregistrer/i }));

    await waitFor(() => {
      expect(mockTeamUpdate).toHaveBeenCalledWith('team-1', { name: 'Choco 2.0', leadIds: ['user-1'] });
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it("affiche une erreur si la création d'équipe échoue", async () => {
    mockTeamCreate.mockRejectedValue(apiError(400, 'Une équipe avec ce nom existe déjà'));
    render(<TeamsCyclesAdminPanel teams={TEAMS} cycles={CYCLES} onChanged={onChanged} />);
    await waitForRosterLoaded();

    fireEvent.click(within(teamsCard()).getByRole('button', { name: /Créer une équipe/i }));
    fireEvent.change(screen.getByPlaceholderText("Nom de l'équipe"), { target: { value: 'Choco' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));

    expect(await screen.findByText('Une équipe avec ce nom existe déjà')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('crée un cycle de performance', async () => {
    mockCreateCycle.mockResolvedValue({ success: true, cycle: CYCLES[0] });
    render(<TeamsCyclesAdminPanel teams={TEAMS} cycles={CYCLES} onChanged={onChanged} />);
    await waitForRosterLoaded();

    fireEvent.click(within(cyclesCard()).getByRole('button', { name: /Créer un cycle/i }));
    fireEvent.change(screen.getByPlaceholderText('Libellé (ex. S2-2026)'), { target: { value: 'S1-2027' } });
    fireEvent.change(screen.getByLabelText('Date de début'), { target: { value: '2027-01-01' } });
    fireEvent.change(screen.getByLabelText('Date de fin'), { target: { value: '2027-06-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));

    await waitFor(() => {
      expect(mockCreateCycle).toHaveBeenCalledWith({
        label: 'S1-2027',
        startDate: '2027-01-01',
        endDate: '2027-06-30'
      });
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('active un cycle non actif', async () => {
    mockUpdateCycle.mockResolvedValue({ success: true, cycle: { ...CYCLES[1], status: 'active' } });
    render(<TeamsCyclesAdminPanel teams={TEAMS} cycles={CYCLES} onChanged={onChanged} />);
    await waitForRosterLoaded();

    const draftRow = within(cyclesCard()).getByText('S1-2027').closest('div.border') as HTMLElement;
    fireEvent.click(within(draftRow).getByRole('button', { name: 'Activer' }));

    await waitFor(() => {
      expect(mockUpdateCycle).toHaveBeenCalledWith('cycle-2', { status: 'active' });
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('clôture le cycle actif', async () => {
    mockUpdateCycle.mockResolvedValue({ success: true, cycle: { ...CYCLES[0], status: 'closed' } });
    render(<TeamsCyclesAdminPanel teams={TEAMS} cycles={CYCLES} onChanged={onChanged} />);
    await waitForRosterLoaded();

    const activeRow = within(cyclesCard()).getByText('S2-2026').closest('div.border') as HTMLElement;
    fireEvent.click(within(activeRow).getByRole('button', { name: 'Clôturer' }));

    await waitFor(() => {
      expect(mockUpdateCycle).toHaveBeenCalledWith('cycle-1', { status: 'closed' });
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('réaffecte un collaborateur à une équipe puis recharge le roster', async () => {
    mockAssignMember.mockResolvedValue({ success: true, user: { id: 'user-2', teamId: 'team-2' } });
    render(<TeamsCyclesAdminPanel teams={TEAMS} cycles={CYCLES} onChanged={onChanged} />);
    await waitForRosterLoaded();

    expect(mockGetRoster).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Collaborateur'), { target: { value: 'user-2' } });
    fireEvent.change(screen.getByLabelText('Équipe'), { target: { value: 'team-2' } });
    fireEvent.click(screen.getByRole('button', { name: /Réaffecter/i }));

    await waitFor(() => {
      expect(mockAssignMember).toHaveBeenCalledWith('user-2', 'team-2');
    });
    expect(await screen.findByText('Le collaborateur a été réaffecté.')).toBeInTheDocument();
    expect(mockGetRoster).toHaveBeenCalledTimes(2);
  });

  it('affiche une erreur si le chargement du roster échoue', async () => {
    mockGetRoster.mockRejectedValue(apiError(403, 'Accès réservé au CTO ou aux administrateurs'));
    render(<TeamsCyclesAdminPanel teams={TEAMS} cycles={CYCLES} onChanged={onChanged} />);

    expect(await screen.findByText('Accès réservé au CTO ou aux administrateurs')).toBeInTheDocument();
  });

  it('prévisualise l’import des fichiers d’entretien avec la session courante', async () => {
    mockImportOkr.mockResolvedValue({
      success: true,
      dryRun: true,
      cycle: { id: 'cycle-1', label: 'S2-2026', status: 'active' },
      entries: [
        {
          name: 'Bruno Deguil-Robin',
          team: '—',
          relativePath: 'Perf-Eval-H1-26-Adoria-Deguil-Robin-BDR.xlsx',
          outcome: 'ready',
          email: 'bdeguil-robin@adoria.com',
          warnings: [],
          errors: [],
          objectiveTitles: ['Delivery']
        }
      ],
      writes: []
    });
    render(<TeamsCyclesAdminPanel teams={TEAMS} cycles={CYCLES} onChanged={onChanged} />);
    await waitForRosterLoaded();

    const file = new File(['x'], 'Perf-Eval-H1-26-Adoria-Deguil-Robin-BDR.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    expect(screen.getByText('Sélectionner des fichiers')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fichiers d’entretien'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser' }));

    await waitFor(() => {
      expect(mockImportOkr).toHaveBeenCalledWith(
        expect.objectContaining({ cycleId: 'cycle-1', dryRun: true })
      );
    });
    expect(await screen.findByText(/Prévisualisation — S2-2026/)).toBeInTheDocument();
  });
});
