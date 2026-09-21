import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStore } from '@/test/mocks/store';
import { TEST_USER } from '@/test/fixtures/users';
import { useStore } from '@/store/useStore';
import type { PerformanceCycle, PerformanceReview } from '../domain/performance';
import type { Team } from '../domain/team';

vi.mock('../services/api', () => ({
  performanceApi: {
    getCycles: vi.fn(),
    listReviews: vi.fn(),
    getReview: vi.fn(),
    defineObjectives: vi.fn(),
    updateManagerAssessment: vi.fn(),
    updateGeneralManagerAssessment: vi.fn(),
    getGeneralAssessmentReferential: vi.fn(),
    getTeamMembers: vi.fn(),
    importOkr: vi.fn()
  },
  teamApi: {
    list: vi.fn(),
    getRoster: vi.fn()
  }
}));

import { performanceApi, teamApi } from '../services/api';
import { TeamPerformancePage } from './TeamPerformancePage';

const mockGetCycles = vi.mocked(performanceApi.getCycles);
const mockListReviews = vi.mocked(performanceApi.listReviews);
const mockGetReview = vi.mocked(performanceApi.getReview);
const mockDefineObjectives = vi.mocked(performanceApi.defineObjectives);
const mockUpdateManagerAssessment = vi.mocked(performanceApi.updateManagerAssessment);
const mockUpdateGeneralManagerAssessment = vi.mocked(performanceApi.updateGeneralManagerAssessment);
const mockGetGeneralAssessmentReferential = vi.mocked(performanceApi.getGeneralAssessmentReferential);
const mockGetTeamMembers = vi.mocked(performanceApi.getTeamMembers);
const mockTeamList = vi.mocked(teamApi.list);

const ACTIVE_CYCLE: PerformanceCycle = {
  id: 'cycle-1',
  label: 'S2-2026',
  startDate: '2026-07-01',
  endDate: '2026-12-31',
  status: 'active',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z'
};

const TEAMS: Team[] = [
  { id: 'team-1', name: 'Choco', leadIds: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'team-2', name: 'Cook', leadIds: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' }
];

function makeReview(overrides: Partial<PerformanceReview> = {}): PerformanceReview {
  return {
    id: 'review-1',
    user: { _id: 'user-1', firstName: 'Alice', lastName: 'Martin', email: 'alice@test.com' },
    cycle: 'cycle-1',
    team: 'team-1',
    objectives: [
      {
        id: 'obj-1',
        title: 'Améliorer la fiabilité',
        weight: 1,
        krs: [{ id: 'kr-1', label: 'Réduire les incidents', weight: 1, progress: 50, progressHistory: [] }],
        selfAssessment: {},
        managerAssessment: {}
      }
    ],
    qualitative: { successes: {}, challenges: {}, growthAreas: {}, overallReview: {} },
    competencyScores: { technique: {}, impact: {}, collaboration: {}, leadership: {} },
    generalSelfAssessment: { technique: [], impact: [], collaboration: [], leadership: [] },
    generalManagerAssessment: { technique: [], impact: [], collaboration: [], leadership: [] },
    status: 'en_cours',
    createdBy: { id: 'user-1', name: 'alice' },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides
  };
}

function apiError(status: number, message: string) {
  return { response: { status, data: { message } } };
}

function seedUser(overrides: Partial<typeof TEST_USER> = {}) {
  resetStore();
  useStore.setState({
    isAuthenticated: true,
    user: { ...TEST_USER, ...overrides }
  });
}

describe('TeamPerformancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Par défaut, aucun collaborateur sans fiche : les tests existants (centrés sur les fiches
    // déjà ouvertes) n'ont pas à s'en soucier ; les tests dédiés le redéfinissent explicitement.
    mockGetTeamMembers.mockResolvedValue({ success: true, members: [] });
    vi.mocked(teamApi.getRoster).mockResolvedValue({ success: true, users: [] });
    mockGetGeneralAssessmentReferential.mockResolvedValue({ success: true, profiles: [] });
  });

  it("affiche l'équipe dont l'utilisateur est lead si teamId est vide", async () => {
    seedUser({ performanceGlobalAccess: true, leadTeamIds: [] });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({
      success: true,
      teams: [{ ...TEAMS[0], leadIds: ['user-1'] }]
    });
    mockListReviews.mockResolvedValue({
      success: true,
      reviews: [makeReview({ team: undefined, teamNameSnapshot: undefined })]
    });
    mockGetTeamMembers.mockResolvedValue({ success: true, members: [] });

    render(<TeamPerformancePage />);

    expect(await screen.findByText('Alice Martin')).toBeInTheDocument();
    const row = screen.getByText('Alice Martin').closest('tr');
    expect(row).toHaveTextContent('Choco');
  });

  it("affiche l'équipe courante si la fiche n'a pas de team snapshotée", async () => {
    seedUser({ performanceGlobalAccess: true, leadTeamIds: [] });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({
      success: true,
      reviews: [makeReview({ team: undefined, teamNameSnapshot: undefined })]
    });
    mockGetTeamMembers.mockResolvedValue({
      success: true,
      members: [{ id: 'user-1', firstName: 'Alice', lastName: 'Martin', email: 'alice@test.com', teamId: 'team-1' }]
    });

    render(<TeamPerformancePage />);

    expect(await screen.findByText('Alice Martin')).toBeInTheDocument();
    const row = screen.getByText('Alice Martin').closest('tr');
    expect(row).toHaveTextContent('Choco');
  });

  it("affiche la liste pour un CTO (accès global) avec le filtre 'toutes les équipes'", async () => {
    seedUser({ performanceGlobalAccess: true, leadTeamIds: [] });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({ success: true, reviews: [makeReview()] });

    render(<TeamPerformancePage />);

    expect(await screen.findByText('Alice Martin')).toBeInTheDocument();
    expect(screen.getAllByText('Choco').length).toBeGreaterThan(0);
    expect(screen.getByRole('option', { name: 'Toutes les équipes' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cook' })).toBeInTheDocument();
  });

  it("affiche le score d'auto-évaluation global sur 5 dans la liste de suivi", async () => {
    seedUser({ performanceGlobalAccess: true, leadTeamIds: [] });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({
      success: true,
      reviews: [
        makeReview({
          generalSelfAssessment: {
            technique: [
              { label: 'Qualité du code & revues', score: 5 },
              { label: 'Autonomie & résolution de bugs', score: 5 },
              { label: 'Conception & architecture', score: 5 }
            ],
            impact: [
              { label: 'Livraison (delivery)', score: 4 },
              { label: 'Contribution aux OKR', score: 4 },
              { label: "Périmètre d'influence", score: 4 }
            ],
            collaboration: [],
            leadership: []
          }
        })
      ]
    });

    render(<TeamPerformancePage />);

    expect(await screen.findByRole('columnheader', { name: 'Score auto-évaluation' })).toBeInTheDocument();
    const row = screen.getByText('Alice Martin').closest('tr');
    expect(row).toHaveTextContent('4.5 / 5');
  });

  it('limite le filtre équipe aux équipes dirigées pour un lead sans accès global', async () => {
    seedUser({ performanceGlobalAccess: false, leadTeamIds: ['team-1'] });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({ success: true, reviews: [makeReview()] });

    render(<TeamPerformancePage />);

    expect(await screen.findByText('Alice Martin')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Toutes mes équipes' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Choco' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Cook' })).not.toBeInTheDocument();
  });

  it("affiche un message si aucun cycle n'est actif", async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({
      success: true,
      cycles: [{ ...ACTIVE_CYCLE, status: 'draft' }]
    });
    mockTeamList.mockResolvedValue({ success: true, teams: [] });

    render(<TeamPerformancePage />);

    expect(await screen.findByText('Aucun cycle de performance actif pour le moment.')).toBeInTheDocument();
  });

  it("ouvre le détail d'un collaborateur et enregistre la définition des objectifs", async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({ success: true, reviews: [makeReview()] });
    mockGetReview.mockResolvedValue({ success: true, review: makeReview() });
    mockDefineObjectives.mockResolvedValue({ success: true, review: makeReview() });

    render(<TeamPerformancePage />);
    await screen.findByText('Alice Martin');

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await screen.findByPlaceholderText("Titre de l'objectif");

    fireEvent.click(screen.getByRole('button', { name: /Enregistrer les objectifs/i }));

    await waitFor(() => {
      expect(mockDefineObjectives).toHaveBeenCalledWith(
        'user-1',
        [
          {
            id: 'obj-1',
            title: 'Améliorer la fiabilité',
            description: undefined,
            weight: 1,
            competencyAxes: [],
            krs: [{ id: 'kr-1', label: 'Réduire les incidents', weight: 1 }]
          }
        ],
        'cycle-1'
      );
    });
  });

  it("suggère automatiquement des axes de compétence à la saisie du titre d'un nouvel objectif", async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({ success: true, reviews: [makeReview()] });
    mockGetReview.mockResolvedValue({ success: true, review: makeReview() });

    render(<TeamPerformancePage />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await screen.findByPlaceholderText("Titre de l'objectif");

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un objectif' }));

    const titleInputs = screen.getAllByPlaceholderText("Titre de l'objectif");
    const newTitleInput = titleInputs[titleInputs.length - 1];
    fireEvent.change(newTitleInput, { target: { value: "Refactoriser l'architecture technique" } });

    const newObjectiveCard = newTitleInput.closest('.border') as HTMLElement;
    expect(within(newObjectiveCard).getByRole('checkbox', { name: 'Technique' })).toBeChecked();
    expect(within(newObjectiveCard).getByRole('checkbox', { name: 'Impact' })).not.toBeChecked();
  });

  it('plafonne la sélection des axes de compétence à 2 par objectif et reste librement modifiable', async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({ success: true, reviews: [makeReview()] });
    mockGetReview.mockResolvedValue({ success: true, review: makeReview() });

    render(<TeamPerformancePage />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await screen.findByPlaceholderText("Titre de l'objectif");

    const objectiveCard = screen.getByPlaceholderText("Titre de l'objectif").closest('.border') as HTMLElement;
    const technique = within(objectiveCard).getByRole('checkbox', { name: 'Technique' });
    const impact = within(objectiveCard).getByRole('checkbox', { name: 'Impact' });
    const collaboration = within(objectiveCard).getByRole('checkbox', { name: 'Collaboration' });

    fireEvent.click(technique);
    fireEvent.click(impact);
    expect(technique).toBeChecked();
    expect(impact).toBeChecked();

    fireEvent.click(collaboration);
    expect(collaboration).not.toBeChecked();

    fireEvent.click(technique);
    expect(technique).not.toBeChecked();

    fireEvent.click(collaboration);
    expect(collaboration).toBeChecked();
  });

  it("désactive l'enregistrement des objectifs si les poids ne sont pas équilibrés", async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({ success: true, reviews: [makeReview()] });
    mockGetReview.mockResolvedValue({ success: true, review: makeReview() });

    render(<TeamPerformancePage />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await screen.findByPlaceholderText("Titre de l'objectif");

    const weightInputs = screen.getAllByPlaceholderText('Poids %');
    fireEvent.change(weightInputs[0], { target: { value: '40' } });

    expect(screen.getByRole('button', { name: /Enregistrer les objectifs/i })).toBeDisabled();
    expect(
      screen.getByText('La somme des poids des objectifs doit être égale à 1')
    ).toBeInTheDocument();
    expect(mockDefineObjectives).not.toHaveBeenCalled();
  });

  it("affiche une erreur si le chargement du détail échoue", async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({ success: true, reviews: [makeReview()] });
    mockGetReview.mockRejectedValue(apiError(403, "Vous n'avez pas accès à la fiche de ce collaborateur"));

    render(<TeamPerformancePage />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));

    expect(
      await screen.findByText("Vous n'avez pas accès à la fiche de ce collaborateur")
    ).toBeInTheDocument();
  });

  it("enregistre l'évaluation manager avec les champs saisis", async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({ success: true, reviews: [makeReview()] });
    mockGetReview.mockResolvedValue({ success: true, review: makeReview() });
    mockUpdateManagerAssessment.mockResolvedValue({ success: true, review: makeReview() });

    render(<TeamPerformancePage />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const objectiveEvaluationCard = (await screen.findByText('Évaluation manager', { selector: 'h3' })).closest(
      '.card-glass'
    ) as HTMLElement;

    fireEvent.change(within(objectiveEvaluationCard).getByRole('combobox'), { target: { value: 'atteint' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer l'évaluation/i }));

    await waitFor(() => {
      expect(mockUpdateManagerAssessment).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          objectives: [{ id: 'obj-1', status: 'atteint', comment: undefined }]
        })
      );
    });
  });

  const REFERENTIAL_PROFILE = {
    roleProfile: 'dev_back' as const,
    label: 'Développeur Back',
    axes: {
      technique: [
        {
          label: 'Qualité du code & revues',
          answers: [
            { text: 'Très faible', points: 1 },
            { text: 'Faible', points: 2 },
            { text: 'Correct', points: 3 },
            { text: 'Bon', points: 4 },
            { text: 'Excellent', points: 5 }
          ]
        }
      ],
      impact: [],
      collaboration: [],
      leadership: []
    },
    updatedAt: '2026-09-01T00:00:00.000Z'
  };

  it("enregistre la grille manager de la grille générale avec la réponse choisie", async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({ success: true, reviews: [makeReview()] });
    mockGetReview.mockResolvedValue({ success: true, review: makeReview() });
    mockGetGeneralAssessmentReferential.mockResolvedValue({ success: true, profiles: [REFERENTIAL_PROFILE] });
    mockUpdateGeneralManagerAssessment.mockResolvedValue({ success: true, review: makeReview() });

    render(<TeamPerformancePage />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await screen.findByText('Évaluation manager — grille détaillée');

    fireEvent.change(screen.getByLabelText('Profil de poste'), { target: { value: 'dev_back' } });
    fireEvent.change(await screen.findByLabelText('Qualité du code & revues'), { target: { value: 'Bon' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer la grille manager/i }));

    await waitFor(() => {
      expect(mockUpdateGeneralManagerAssessment).toHaveBeenCalledWith('user-1', {
        axes: expect.objectContaining({
          technique: expect.arrayContaining([{ label: 'Qualité du code & revues', answer: 'Bon' }])
        }),
        roleProfile: 'dev_back'
      });
    });
  });

  it("signale un désaccord quand la réponse manager choisie s'écarte d'au moins 2 points de l'auto-évaluation", async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockGetGeneralAssessmentReferential.mockResolvedValue({ success: true, profiles: [REFERENTIAL_PROFILE] });
    const reviewWithSelfScore = makeReview({
      generalSelfAssessment: {
        technique: [{ label: 'Qualité du code & revues', score: 5 }],
        impact: [],
        collaboration: [],
        leadership: []
      }
    });
    mockListReviews.mockResolvedValue({ success: true, reviews: [reviewWithSelfScore] });
    mockGetReview.mockResolvedValue({ success: true, review: reviewWithSelfScore });

    render(<TeamPerformancePage />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await screen.findByText('Évaluation manager — grille détaillée');

    fireEvent.change(screen.getByLabelText('Profil de poste'), { target: { value: 'dev_back' } });

    expect(screen.queryByText('Désaccord')).not.toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Qualité du code & revues'), { target: { value: 'Faible' } });
    expect(screen.getByText('Désaccord')).toBeInTheDocument();
  });

  it("affiche les badges d'axes de compétence associés à un objectif dans l'évaluation manager", async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    const reviewWithAxes = makeReview({
      objectives: [
        {
          id: 'obj-1',
          title: 'Améliorer la fiabilité',
          weight: 1,
          competencyAxes: ['leadership'],
          krs: [{ id: 'kr-1', label: 'Réduire les incidents', weight: 1, progress: 50, progressHistory: [] }],
          selfAssessment: {},
          managerAssessment: {}
        }
      ]
    });
    mockListReviews.mockResolvedValue({ success: true, reviews: [reviewWithAxes] });
    mockGetReview.mockResolvedValue({ success: true, review: reviewWithAxes });

    render(<TeamPerformancePage />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await screen.findByText('Évaluation manager');

    expect(screen.getAllByText('Leadership').length).toBeGreaterThan(0);
  });

  it('ne plante pas si qualitative / competencyScores arrivent vides depuis l’API (détail manager)', async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({ success: true, reviews: [makeReview()] });
    mockGetReview.mockResolvedValue({
      success: true,
      review: makeReview({
        qualitative: {} as PerformanceReview['qualitative'],
        competencyScores: {} as PerformanceReview['competencyScores']
      })
    });

    render(<TeamPerformancePage />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));

    expect(await screen.findByText('Évaluation manager')).toBeInTheDocument();
  });

  it("affiche les collaborateurs sans fiche encore ouverte avec le badge 'Dossier manquant' et ouvre une fiche vierge sans appeler l'API de détail", async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({ success: true, reviews: [makeReview()] });
    mockGetTeamMembers.mockResolvedValue({
      success: true,
      members: [
        { id: 'user-1', firstName: 'Alice', lastName: 'Martin', email: 'alice@test.com', teamId: 'team-1' },
        { id: 'user-2', firstName: 'Bob', lastName: 'Dupont', email: 'bob@test.com', teamId: 'team-1' }
      ]
    });

    render(<TeamPerformancePage />);

    expect(await screen.findByText('Alice Martin')).toBeInTheDocument();
    expect(screen.getByText('Bob Dupont')).toBeInTheDocument();
    expect(screen.getByText('Dossier manquant', { selector: 'span' })).toBeInTheDocument();

    const ouvrirButtons = screen.getAllByRole('button', { name: 'Ouvrir' });
    expect(ouvrirButtons).toHaveLength(2);
    fireEvent.click(ouvrirButtons[1]);

    await screen.findByText('Définition des objectifs');
    expect(mockGetReview).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("Titre de l'objectif")).not.toBeInTheDocument();
  });

  it("définit les objectifs d'un collaborateur sans fiche existante : la fiche créée remplace la ligne 'Dossier manquant'", async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({ success: true, reviews: [] });
    mockGetTeamMembers.mockResolvedValue({
      success: true,
      members: [{ id: 'user-2', firstName: 'Bob', lastName: 'Dupont', email: 'bob@test.com', teamId: 'team-1' }]
    });
    mockDefineObjectives.mockResolvedValue({
      success: true,
      review: makeReview({ id: 'review-2', user: 'user-2', status: 'en_cours' })
    });

    render(<TeamPerformancePage />);
    await screen.findByText('Bob Dupont');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await screen.findByText('Définition des objectifs');
    expect(mockGetReview).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Ajouter un objectif/i }));
    fireEvent.change(screen.getByPlaceholderText("Titre de l'objectif"), {
      target: { value: 'Nouvel objectif' }
    });
    fireEvent.change(screen.getByPlaceholderText('Poids %'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer les objectifs/i }));

    await waitFor(() => {
      expect(mockDefineObjectives).toHaveBeenCalledWith(
        'user-2',
        [expect.objectContaining({ title: 'Nouvel objectif', weight: 1 })],
        'cycle-1'
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retour à la liste' }));

    expect(await screen.findByText('Bob Dupont')).toBeInTheDocument();
    expect(screen.getByText('En cours', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText('Dossier manquant', { selector: 'span' })).not.toBeInTheDocument();
  });

  it("n'affiche pas l'onglet de gestion pour un lead sans accès global", async () => {
    seedUser({ performanceGlobalAccess: false, leadTeamIds: ['team-1'] });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({ success: true, reviews: [] });

    render(<TeamPerformancePage />);

    await screen.findByRole('option', { name: 'Toutes mes équipes' });
    expect(screen.queryByRole('button', { name: 'Gestion équipes & cycles' })).not.toBeInTheDocument();
  });

  it("affiche le panneau de gestion équipes & cycles pour un CTO qui bascule sur cet onglet", async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({ success: true, reviews: [] });
    vi.mocked(teamApi.getRoster).mockResolvedValue({ success: true, users: [] });

    render(<TeamPerformancePage />);

    await screen.findByRole('button', { name: 'Gestion équipes & cycles' });
    fireEvent.click(screen.getByRole('button', { name: 'Gestion équipes & cycles' }));

    expect(await screen.findByRole('heading', { name: 'Import des entretiens' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Équipes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cycles de performance' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Réaffecter un collaborateur' })).toBeInTheDocument();
    // Le suivi des fiches n'est plus affiché tant qu'on est sur l'onglet gestion.
    expect(screen.queryByText('Aucune fiche de performance dans votre périmètre pour ce cycle.')).not.toBeInTheDocument();
  });

  it("affiche dans la colonne Objectifs le décompte des statuts d'objectifs (manager prioritaire sur self)", async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    const reviewWithStatuses = makeReview({
      objectives: [
        {
          id: 'obj-1',
          title: 'Améliorer la fiabilité',
          weight: 1,
          krs: [],
          selfAssessment: { status: 'non_atteint' },
          managerAssessment: { status: 'atteint' }
        },
        {
          id: 'obj-2',
          title: 'Réduire la dette technique',
          weight: 1,
          krs: [],
          selfAssessment: { status: 'depasse' },
          managerAssessment: {}
        }
      ]
    });
    mockListReviews.mockResolvedValue({ success: true, reviews: [reviewWithStatuses] });

    render(<TeamPerformancePage />);

    await screen.findByText('Alice Martin');
    const row = screen.getByText('Alice Martin').closest('tr') as HTMLElement;
    // obj-1 : statut manager ('atteint') prioritaire sur le statut self ('non_atteint').
    expect(within(row).getByText('1 Atteint')).toBeInTheDocument();
    // obj-2 : pas de statut manager -> on retombe sur le statut self ('depasse').
    expect(within(row).getByText('1 Dépassé')).toBeInTheDocument();
  });

  it("affiche le score de la grille générale manager dans sa propre colonne, distincte du score auto-évaluation", async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    const reviewWithGeneralAssessments = makeReview({
      generalSelfAssessment: {
        technique: [{ label: 'Qualité du code & revues', score: 3 }],
        impact: [],
        collaboration: [],
        leadership: []
      },
      generalManagerAssessment: {
        technique: [{ label: 'Qualité du code & revues', score: 5, answer: 'Excellent' }],
        impact: [],
        collaboration: [],
        leadership: []
      }
    });
    mockListReviews.mockResolvedValue({ success: true, reviews: [reviewWithGeneralAssessments] });

    render(<TeamPerformancePage />);

    await screen.findByText('Alice Martin');
    const row = screen.getByText('Alice Martin').closest('tr') as HTMLElement;
    expect(within(row).getByText('3.0 / 5')).toBeInTheDocument();
    expect(within(row).getByText('5.0 / 5')).toBeInTheDocument();
  });

  it("affiche un tiret dans la colonne Objectifs quand aucun objectif n'est encore statué", async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    mockListReviews.mockResolvedValue({ success: true, reviews: [makeReview()] });

    render(<TeamPerformancePage />);

    await screen.findByText('Alice Martin');
    const row = screen.getByText('Alice Martin').closest('tr') as HTMLElement;
    const cells = within(row).getAllByRole('cell');
    // Colonne Objectifs = avant-dernière cellule (la dernière est l'action "Ouvrir").
    expect(cells[cells.length - 2]).toHaveTextContent('—');
  });

  it("affiche un badge de statut pour le bilan du cycle du collaborateur dans l'évaluation manager", async () => {
    seedUser({ performanceGlobalAccess: true });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockTeamList.mockResolvedValue({ success: true, teams: TEAMS });
    const reviewWithSelfStatus = makeReview({
      objectives: [
        {
          id: 'obj-1',
          title: 'Améliorer la fiabilité',
          weight: 1,
          krs: [],
          selfAssessment: { status: 'partiellement_atteint' },
          managerAssessment: {}
        }
      ]
    });
    mockListReviews.mockResolvedValue({ success: true, reviews: [reviewWithSelfStatus] });
    mockGetReview.mockResolvedValue({ success: true, review: reviewWithSelfStatus });

    render(<TeamPerformancePage />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));

    const bilanLine = (await screen.findByText('Bilan du cycle (collaborateur) :')).closest('p') as HTMLElement;
    expect(within(bilanLine).getByText('Partiellement atteint')).toHaveClass('badge-warning');
  });
});
