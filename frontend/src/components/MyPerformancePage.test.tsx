import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerformanceCycle, PerformanceReview } from '../domain/performance';

vi.mock('../services/api', () => ({
  performanceApi: {
    getCycles: vi.fn(),
    getMyReview: vi.fn(),
    updateKeyResultProgress: vi.fn(),
    updateSelfAssessment: vi.fn()
  }
}));

import { performanceApi } from '../services/api';
import { MyPerformancePage } from './MyPerformancePage';

const mockGetCycles = vi.mocked(performanceApi.getCycles);
const mockGetMyReview = vi.mocked(performanceApi.getMyReview);
const mockUpdateKeyResultProgress = vi.mocked(performanceApi.updateKeyResultProgress);
const mockUpdateSelfAssessment = vi.mocked(performanceApi.updateSelfAssessment);

const ACTIVE_CYCLE: PerformanceCycle = {
  id: 'cycle-1',
  label: 'S2-2026',
  startDate: '2026-07-01',
  endDate: '2026-12-31',
  status: 'active',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z'
};

function makeReview(overrides: Partial<PerformanceReview> = {}): PerformanceReview {
  return {
    id: 'review-1',
    user: 'user-1',
    cycle: 'cycle-1',
    team: 'team-1',
    objectives: [
      {
        id: 'obj-1',
        title: 'Améliorer la fiabilité du produit',
        description: 'Réduire les incidents en production',
        weight: 1,
        krs: [
          {
            id: 'kr-1',
            label: 'Réduire le taux d’incidents de 30%',
            weight: 1,
            progress: 40,
            progressHistory: [
              {
                value: 40,
                note: 'Premier jalon',
                updatedBy: { id: 'user-1', name: 'bruno', role: 'collaborateur' },
                updatedAt: '2026-08-01T10:00:00.000Z'
              }
            ]
          }
        ],
        selfAssessment: {},
        managerAssessment: {}
      }
    ],
    qualitative: {
      successes: {},
      challenges: {},
      growthAreas: {},
      overallReview: {}
    },
    competencyScores: {
      technique: {},
      impact: {},
      collaboration: {},
      leadership: {}
    },
    generalSelfAssessment: { technique: [], impact: [], collaboration: [], leadership: [] },
    generalManagerAssessment: { technique: [], impact: [], collaboration: [], leadership: [] },
    status: 'en_cours',
    createdBy: { id: 'user-1', name: 'bruno', role: 'collaborateur' },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides
  };
}

function apiError(status: number, message: string) {
  return { response: { status, data: { message } } };
}

describe('MyPerformancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche la fiche de performance une fois chargée', async () => {
    mockGetMyReview.mockResolvedValue({ success: true, review: makeReview() });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });

    render(<MyPerformancePage />);

    expect(
      await screen.findByRole('heading', { name: 'Améliorer la fiabilité du produit', level: 3 })
    ).toBeInTheDocument();
    expect(screen.getByText('S2-2026 — Actif')).toBeInTheDocument();
    expect(screen.getByText('En cours')).toBeInTheDocument();
    expect(screen.getByText('Réduire le taux d’incidents de 30%')).toBeInTheDocument();
  });

  it('affiche les badges d\'axes de compétence associés à un objectif', async () => {
    mockGetMyReview.mockResolvedValue({
      success: true,
      review: makeReview({
        objectives: [
          {
            id: 'obj-1',
            title: 'Améliorer la fiabilité du produit',
            weight: 1,
            competencyAxes: ['technique', 'impact'],
            krs: [],
            selfAssessment: {},
            managerAssessment: {}
          }
        ]
      })
    });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });

    render(<MyPerformancePage />);

    const heading = await screen.findByRole('heading', {
      name: 'Améliorer la fiabilité du produit',
      level: 3
    });
    const objectiveCard = heading.closest('.card-glass') as HTMLElement;
    expect(within(objectiveCard).getByText('Technique')).toBeInTheDocument();
    expect(within(objectiveCard).getByText('Impact')).toBeInTheDocument();
    expect(within(objectiveCard).queryByText('Collaboration')).not.toBeInTheDocument();
  });

  it('ne plante pas si qualitative / competencyScores arrivent vides depuis l’API', async () => {
    mockGetMyReview.mockResolvedValue({
      success: true,
      review: makeReview({
        qualitative: {} as PerformanceReview['qualitative'],
        competencyScores: {} as PerformanceReview['competencyScores']
      })
    });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });

    render(<MyPerformancePage />);

    expect(
      await screen.findByRole('heading', { name: 'Améliorer la fiabilité du produit', level: 3 })
    ).toBeInTheDocument();
    expect(screen.getByText('Bilan du cycle')).toBeInTheDocument();
  });

  it("affiche un message si aucun cycle de performance n'est actif", async () => {
    mockGetMyReview.mockRejectedValue(apiError(404, 'Aucun cycle de performance actif'));
    mockGetCycles.mockResolvedValue({ success: true, cycles: [] });

    render(<MyPerformancePage />);

    expect(await screen.findByText('Aucun cycle de performance actif')).toBeInTheDocument();
  });

  it('affiche un message si les objectifs ne sont pas encore définis', async () => {
    mockGetMyReview.mockResolvedValue({
      success: true,
      review: makeReview({ objectives: [], status: 'dossier_manquant' })
    });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });

    render(<MyPerformancePage />);

    expect(
      await screen.findByText(/n'ont pas encore été définis/)
    ).toBeInTheDocument();
  });

  it("ajoute un avancement de KR et affiche le résultat renvoyé par l'API", async () => {
    mockGetMyReview.mockResolvedValue({ success: true, review: makeReview() });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });

    const updatedReview = makeReview();
    updatedReview.objectives[0].krs[0].progress = 65;
    mockUpdateKeyResultProgress.mockResolvedValue({ success: true, review: updatedReview });

    render(<MyPerformancePage />);
    await screen.findByPlaceholderText('0-100');

    fireEvent.change(screen.getByPlaceholderText('0-100'), { target: { value: '65' } });
    fireEvent.change(screen.getByPlaceholderText('Note (optionnel)'), { target: { value: 'Bien avancé' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => {
      expect(mockUpdateKeyResultProgress).toHaveBeenCalledWith('obj-1', 'kr-1', {
        value: 65,
        note: 'Bien avancé',
        evidenceUrl: undefined
      });
    });
    expect(await screen.findAllByText('65%')).toHaveLength(2);
  });

  it('masque la saisie et affiche un badge lecture seule quand le cycle est clos', async () => {
    mockGetMyReview.mockResolvedValue({ success: true, review: makeReview() });
    mockGetCycles.mockResolvedValue({
      success: true,
      cycles: [{ ...ACTIVE_CYCLE, status: 'closed' }]
    });

    render(<MyPerformancePage />);
    await screen.findByText('Ce cycle est clos, lecture seule');

    expect(screen.getByText('Ce cycle est clos, lecture seule')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('0-100')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Enregistrer mon auto-évaluation/i })
    ).toBeDisabled();
  });

  it("enregistre l'auto-évaluation avec les champs saisis", async () => {
    mockGetMyReview.mockResolvedValue({ success: true, review: makeReview() });
    mockGetCycles.mockResolvedValue({ success: true, cycles: [ACTIVE_CYCLE] });
    mockUpdateSelfAssessment.mockResolvedValue({ success: true, review: makeReview() });

    render(<MyPerformancePage />);
    await screen.findByText('Bilan du cycle');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'atteint' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer mon auto-évaluation/i }));

    await waitFor(() => {
      expect(mockUpdateSelfAssessment).toHaveBeenCalledWith(
        expect.objectContaining({
          objectives: [{ id: 'obj-1', status: 'atteint', comment: undefined }]
        })
      );
    });
  });
});
