import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { TEST_USER } from '@/test/fixtures/users';
import type { WeeklyMeeting } from '../domain/pointHebdoSprint';

vi.mock('../services/api', () => ({
  meetingApi: {
    list: vi.fn(),
    getLatest: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    createNext: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

import { meetingApi } from '../services/api';
import { PointHebdoPage } from './PointHebdoPage';

const mockGetLatest = vi.mocked(meetingApi.getLatest);
const mockList = vi.mocked(meetingApi.list);
const mockGetById = vi.mocked(meetingApi.getById);
const mockCreateNext = vi.mocked(meetingApi.createNext);
const mockUpdate = vi.mocked(meetingApi.update);

function buildMeeting(overrides: Partial<WeeklyMeeting> = {}): WeeklyMeeting {
  return {
    id: 'meeting-1',
    sprint: { name: 'Sprint', number: '12', goal: 'Livrer la facturation', date: '2026-09-08' },
    teams: [
      {
        id: 't1',
        name: 'Équipe Dev',
        role: 'dev',
        boardId: 7,
        metrics: [
          { id: 'm1', label: 'Points engagés', value: '30', target: '40', source: 'manual' },
        ],
      },
    ],
    blockers: [],
    interactions: [],
    retro: { keep: [], stop: [], try: [] },
    actions: [],
    ...overrides,
  };
}

function mockFetch(handlers: Record<string, unknown>) {
  const fetchMock = vi.fn((url: string) => {
    const match = Object.keys(handlers).find((key) => url.includes(key));
    if (!match) return Promise.resolve({ ok: false, status: 404 });
    return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers[match]) });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderPage() {
  renderWithProviders(<PointHebdoPage />, { user: TEST_USER });
  await waitFor(() => expect(screen.getByLabelText('Nom du sprint')).toBeInTheDocument());
}

describe('PointHebdoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLatest.mockResolvedValue({ success: true, meeting: buildMeeting() });
    mockUpdate.mockImplementation(async (_id, patch) => ({
      success: true,
      meeting: { ...buildMeeting(), ...patch } as WeeklyMeeting,
    }));
    mockFetch({
      'configured-boards': { success: true, boards: [{ id: 7, name: 'Board Dev' }] },
    });
  });

  describe('affichage', () => {
    it('charge le dernier point et affiche son en-tête', async () => {
      await renderPage();

      expect(screen.getByLabelText('Nom du sprint')).toHaveValue('Sprint');
      expect(screen.getByLabelText('Numéro du sprint')).toHaveValue('12');
      expect(screen.getByLabelText('Objectif du sprint')).toHaveValue('Livrer la facturation');
    });

    it('affiche les quatre phases de la séance et leurs budgets', async () => {
      await renderPage();

      expect(screen.getByRole('button', { name: /Phase 1.*Avancée du sprint/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Phase 2.*Points bloquants/ })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Phase 3.*Interactions entre équipes/ })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Phase 4.*Amélioration continue/ })
      ).toBeInTheDocument();
      expect(screen.getAllByText('20 min').length).toBeGreaterThan(0);
    });

    it('démarre le minuteur sur le budget de la première phase', async () => {
      await renderPage();

      expect(screen.getByLabelText('Temps restant sur la phase')).toHaveTextContent('20:00');
    });

    it('affiche les indicateurs de l\'équipe et son avancement', async () => {
      await renderPage();

      expect(screen.getByLabelText('Indicateur')).toHaveValue('Points engagés');
      expect(screen.getByLabelText('Valeur — Points engagés')).toHaveValue('30');
      expect(screen.getByLabelText('Cible — Points engagés')).toHaveValue('40');
    });

    it('invite à remplir les sections vides', async () => {
      await renderPage();

      expect(screen.getByText(/Aucun blocage listé/)).toBeInTheDocument();
      expect(screen.getByText(/Aucune interaction notée/)).toBeInTheDocument();
    });

    it('affiche un message d\'erreur si le point est introuvable', async () => {
      mockGetLatest.mockRejectedValue(new Error('Serveur indisponible'));

      renderWithProviders(<PointHebdoPage />, { user: TEST_USER });

      expect(await screen.findByText('Serveur indisponible')).toBeInTheDocument();
    });
  });

  describe('sauvegarde automatique', () => {
    it('enregistre la saisie d\'un indicateur', async () => {
      await renderPage();

      fireEvent.change(screen.getByLabelText('Valeur — Points engagés'), {
        target: { value: '33' },
      });

      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith(
          'meeting-1',
          expect.objectContaining({
            teams: [expect.objectContaining({ metrics: [expect.objectContaining({ value: '33' })] })],
          })
        )
      );
    });

    it('enregistre la modification de l\'objectif du sprint', async () => {
      await renderPage();

      fireEvent.change(screen.getByLabelText('Objectif du sprint'), {
        target: { value: 'Stabiliser la recette' },
      });

      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith(
          'meeting-1',
          expect.objectContaining({
            sprint: expect.objectContaining({ goal: 'Stabiliser la recette' }),
          })
        )
      );
    });

    it('signale une sauvegarde impossible', async () => {
      mockUpdate.mockRejectedValue(new Error('offline'));
      await renderPage();

      fireEvent.change(screen.getByLabelText('Valeur — Points engagés'), {
        target: { value: '31' },
      });

      expect(await screen.findByText('Enregistrement impossible')).toBeInTheDocument();
    });
  });

  describe('édition des sections', () => {
    it('ajoute un blocage', async () => {
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: /Ajouter un blocage/ }));

      expect(screen.getByLabelText('Sévérité')).toHaveValue('Moyen');
      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith(
          'meeting-1',
          expect.objectContaining({ blockers: [expect.objectContaining({ severity: 'Moyen' })] })
        )
      );
    });

    it('ajoute une interaction entre équipes', async () => {
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: /Ajouter une interaction/ }));

      expect(screen.getByLabelText('Statut')).toHaveValue('À traiter');
    });

    it('ajoute une action de suivi', async () => {
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: /Ajouter une action/ }));

      expect(screen.getByLabelText('Action décidée')).toBeInTheDocument();
      expect(screen.getByLabelText('Statut de l\'action')).toHaveValue('À faire');
    });

    it('ajoute une équipe avec ses indicateurs par défaut', async () => {
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: /Ajouter une équipe/ }));

      expect(screen.getAllByLabelText('Nom de l\'équipe')).toHaveLength(2);
      expect(screen.getByLabelText('Valeur — Bugs ouverts')).toBeInTheDocument();
    });

    it('ajoute un élément de rétrospective', async () => {
      await renderPage();

      const columns = screen.getAllByRole('button', { name: '+ ajouter' });
      fireEvent.click(columns[0]);

      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith(
          'meeting-1',
          expect.objectContaining({ retro: expect.objectContaining({ keep: [expect.anything()] }) })
        )
      );
    });

    it('supprime un indicateur', async () => {
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Supprimer Points engagés' }));

      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith(
          'meeting-1',
          expect.objectContaining({ teams: [expect.objectContaining({ metrics: [] })] })
        )
      );
    });
  });

  describe('minuteur', () => {
    it('passe à la phase suivante et recale le budget', async () => {
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Passer à la phase suivante' }));

      expect(screen.getByLabelText('Temps restant sur la phase')).toHaveTextContent('15:00');
    });

    it('bascule entre démarrage et pause', async () => {
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Démarrer le minuteur' }));

      expect(
        screen.getByRole('button', { name: 'Mettre en pause le minuteur' })
      ).toBeInTheDocument();
    });
  });

  describe('préremplissage Jira', () => {
    const JIRA_BOARDS = {
      'configured-boards': { success: true, boards: [{ id: 7, name: 'Board Dev' }] },
      'sprint-issues-all': {
        success: true,
        boards: [
          {
            boardId: 7,
            name: 'Board Dev',
            sprint: {
              statusCounts: { total: 10, todo: 2, inProgress: 3, qa: 1, resolved: 4 },
              storyPointsByStatus: { total: 45, todo: 5, inProgress: 15, qa: 5, resolved: 20 },
              issues: [],
            },
          },
        ],
      },
    };

    function emptyMeeting() {
      const base = buildMeeting();
      return {
        ...base,
        teams: [
          {
            ...base.teams[0],
            metrics: [{ ...base.teams[0].metrics[0], value: '' }],
          },
        ],
      };
    }

    it('remplit les chiffres à l\'ouverture d\'un point encore vierge', async () => {
      mockGetLatest.mockResolvedValue({ success: true, meeting: emptyMeeting() });
      mockFetch(JIRA_BOARDS);

      await renderPage();

      await waitFor(() =>
        expect(screen.getByLabelText('Valeur — Points engagés')).toHaveValue('45')
      );
    });

    it('reprend les chiffres du sprint à la demande', async () => {
      mockGetLatest.mockResolvedValue({ success: true, meeting: emptyMeeting() });
      mockFetch(JIRA_BOARDS);
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: /Préremplir depuis Jira/ }));

      await waitFor(() =>
        expect(screen.getByLabelText('Valeur — Points engagés')).toHaveValue('45')
      );
    });

    it('conserve les valeurs déjà saisies à la main', async () => {
      mockFetch(JIRA_BOARDS);
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: /Préremplir depuis Jira/ }));

      await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
      expect(screen.getByLabelText('Valeur — Points engagés')).toHaveValue('30');
    });

    it('avertit quand Jira est indisponible', async () => {
      mockFetch({
        'configured-boards': { success: true, boards: [{ id: 7, name: 'Board Dev' }] },
      });
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: /Préremplir depuis Jira/ }));

      expect(
        await screen.findByText(/Préremplissage impossible/)
      ).toBeInTheDocument();
    });
  });

  describe('compte-rendu et historique', () => {
    it('copie le compte-rendu dans le presse-papier', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: /Copier le compte-rendu/ }));

      await waitFor(() => expect(writeText).toHaveBeenCalled());
      expect(writeText.mock.calls[0][0]).toContain('# Sprint n°12 — point du 2026-09-08');
    });

    it('affiche le compte-rendu si la copie est refusée', async () => {
      vi.stubGlobal('navigator', {
        ...navigator,
        clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      });
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: /Copier le compte-rendu/ }));

      expect(await screen.findByText('Compte-rendu')).toBeInTheDocument();
    });

    it('liste les points précédents et en ouvre un', async () => {
      mockList.mockResolvedValue({
        success: true,
        count: 1,
        meetings: [
          {
            id: 'meeting-0',
            sprint: { name: 'Sprint', number: '11', goal: '', date: '2026-09-01' },
            summary: { teamCount: 2, openBlockerCount: 1, openActionCount: 3 },
          },
        ],
      });
      mockGetById.mockResolvedValue({
        success: true,
        meeting: buildMeeting({
          id: 'meeting-0',
          sprint: { name: 'Sprint', number: '11', goal: '', date: '2026-09-01' },
        }),
      });
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: /Historique/ }));
      const entry = await screen.findByRole('button', { name: /Sprint n°11/ });
      fireEvent.click(entry);

      await waitFor(() => expect(mockGetById).toHaveBeenCalledWith('meeting-0'));
      await waitFor(() =>
        expect(screen.getByLabelText('Numéro du sprint')).toHaveValue('11')
      );
    });

    it('affiche le résumé de chaque point de l\'historique', async () => {
      mockList.mockResolvedValue({
        success: true,
        count: 1,
        meetings: [
          {
            id: 'meeting-0',
            sprint: { name: 'Sprint', number: '11', goal: '', date: '2026-09-01' },
            summary: { teamCount: 2, openBlockerCount: 1, openActionCount: 3 },
          },
        ],
      });
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: /Historique/ }));

      const entry = await screen.findByRole('button', { name: /Sprint n°11/ });
      expect(within(entry).getByText(/2 équipe\(s\)/)).toBeInTheDocument();
    });
  });

  describe('nouveau point', () => {
    it('reconduit le point après confirmation', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockCreateNext.mockResolvedValue({
        success: true,
        meeting: buildMeeting({
          id: 'meeting-2',
          sprint: { name: 'Sprint', number: '13', goal: '', date: '2026-09-15' },
        }),
      });
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: /Nouveau point/ }));

      await waitFor(() => expect(mockCreateNext).toHaveBeenCalledWith('meeting-1'));
      await waitFor(() =>
        expect(screen.getByLabelText('Numéro du sprint')).toHaveValue('13')
      );
    });

    it('ne fait rien si la confirmation est refusée', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: /Nouveau point/ }));

      expect(mockCreateNext).not.toHaveBeenCalled();
    });
  });
});
