import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { TEST_USER } from '@/test/fixtures/users';
import { createMockSocketContextValue } from '@/test/mocks/socket';
import { applyMeetingWritePatch, type WeeklyMeeting } from '../domain/pointHebdoSprint';

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

async function renderPage(options: { socket?: ReturnType<typeof createMockSocketContextValue> } = {}) {
  renderWithProviders(<PointHebdoPage />, { user: TEST_USER, socket: options.socket ?? false });
  await waitFor(() => expect(screen.getByLabelText('Numéro du sprint')).toBeInTheDocument());
}

describe('PointHebdoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLatest.mockResolvedValue({ success: true, meeting: buildMeeting() });
    mockUpdate.mockImplementation(async (_id, patch) => ({
      success: true,
      meeting: applyMeetingWritePatch(buildMeeting(), patch),
    }));
    mockFetch({
      'configured-boards': { success: true, boards: [{ id: 7, name: 'Board Dev' }] },
    });
  });

  describe('affichage', () => {
    it('charge le dernier point et affiche son en-tête', async () => {
      await renderPage();

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

    it('regroupe en bas de page les suivis ouverts par responsable', async () => {
      mockGetLatest.mockResolvedValue({
        success: true,
        meeting: buildMeeting({
          blockers: [
            {
              id: 'b1',
              severity: 'Critique',
              text: 'Env. de recette KO',
              need: 'Intervention Ops',
              owner: 'Léa',
              resolved: false,
            },
            {
              id: 'b2',
              severity: 'Faible',
              text: 'Doc à jour',
              need: '',
              owner: 'Léa',
              resolved: true,
            },
          ],
          actions: [
            { id: 'a1', text: 'Automatiser le déploiement', owner: 'Sam', due: '2026-09-15', status: 'En cours' },
            { id: 'a2', text: 'Documenter', owner: 'Léa', due: '', status: 'Fait' },
          ],
        }),
      });
      await renderPage();

      const recap = screen.getByRole('table', { name: 'À faire par responsable' });
      expect(within(recap).getByText('Léa')).toBeInTheDocument();
      expect(within(recap).getByText('Env. de recette KO')).toBeInTheDocument();
      expect(within(recap).getByText('À lever : Intervention Ops')).toBeInTheDocument();
      expect(within(recap).getByText('Sam')).toBeInTheDocument();
      expect(within(recap).getByText('Automatiser le déploiement')).toBeInTheDocument();
      expect(within(recap).queryByText('Doc à jour')).not.toBeInTheDocument();
      expect(within(recap).queryByText('Documenter')).not.toBeInTheDocument();
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
            teams: {
              upsert: [expect.objectContaining({ metrics: [expect.objectContaining({ value: '33' })] })],
              remove: [],
            },
          }),
          expect.any(String)
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
          }),
          expect.any(String)
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

  describe('édition collaborative (Socket.io)', () => {
    it('rejoint la room temps réel du point ouvert', async () => {
      const socket = createMockSocketContextValue();
      await renderPage({ socket });

      expect(socket.subscribeToMeeting).toHaveBeenCalledWith('meeting-1');
    });

    it('applique en direct une modification reçue d\'un autre client sur le même point', async () => {
      const socket = createMockSocketContextValue();
      await renderPage({ socket });

      act(() => {
        socket.triggerMeetingUpdate({
          meetingId: 'meeting-1',
          patch: {
            sprint: { name: 'Sprint', number: '12', goal: 'Objectif mis à jour par Bob', date: '2026-09-08' },
          },
          origin: 'autre-onglet',
        });
      });

      await waitFor(() => {
        expect(screen.getByLabelText('Objectif du sprint')).toHaveValue('Objectif mis à jour par Bob');
      });
    });

    it('ignore une modification reçue pour un autre point hebdo', async () => {
      const socket = createMockSocketContextValue();
      await renderPage({ socket });

      act(() => {
        socket.triggerMeetingUpdate({
          meetingId: 'un-autre-point',
          patch: {
            sprint: { name: 'Sprint', number: '99', goal: 'Ne doit pas apparaître', date: '2026-09-08' },
          },
          origin: 'autre-onglet',
        });
      });

      expect(screen.getByLabelText('Objectif du sprint')).toHaveValue('Livrer la facturation');
    });

    it('ignore son propre écho (même origine que le dernier enregistrement envoyé)', async () => {
      const socket = createMockSocketContextValue();
      await renderPage({ socket });

      fireEvent.change(screen.getByLabelText('Objectif du sprint'), {
        target: { value: 'Mon édition en cours' },
      });
      await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
      const myOrigin = mockUpdate.mock.calls[0][2] as string;
      expect(myOrigin).toEqual(expect.any(String));

      act(() => {
        socket.triggerMeetingUpdate({
          meetingId: 'meeting-1',
          patch: {
            sprint: { name: 'Sprint', number: '12', goal: 'Ecrasement indésirable', date: '2026-09-08' },
          },
          origin: myOrigin,
        });
      });

      expect(screen.getByLabelText('Objectif du sprint')).toHaveValue('Mon édition en cours');
    });

    it('conserve un blocage en cours de saisie quand un autre client en ajoute un', async () => {
      const socket = createMockSocketContextValue();
      await renderPage({ socket });

      fireEvent.click(screen.getByRole('button', { name: /Ajouter un blocage/ }));
      fireEvent.change(screen.getByLabelText('Blocage'), {
        target: { value: 'Mon blocage local' },
      });

      act(() => {
        socket.triggerMeetingUpdate({
          meetingId: 'meeting-1',
          patch: {
            blockers: [
              {
                id: 'b-remote',
                severity: 'Critique',
                text: 'Blocage de Léa',
                need: 'Ops',
                owner: 'Léa',
                resolved: false,
                createdBy: { id: 'u-lea', name: 'lea' },
              },
            ],
          },
          origin: 'autre-onglet',
        });
      });

      expect(screen.getByDisplayValue('Mon blocage local')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Blocage de Léa')).toBeInTheDocument();
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
          expect.objectContaining({
            blockers: { upsert: [expect.objectContaining({ severity: 'Moyen' })], remove: [] },
          }),
          expect.any(String)
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
          expect.objectContaining({
            retro: { keep: { upsert: [expect.anything()], remove: [] } },
          }),
          expect.any(String)
        )
      );
    });

    it('supprime un indicateur', async () => {
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Supprimer Points engagés' }));

      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith(
          'meeting-1',
          expect.objectContaining({
            teams: expect.objectContaining({
              upsert: [expect.objectContaining({ metrics: [] })],
              remove: [],
              removeMetrics: [expect.any(String)],
            }),
          }),
          expect.any(String)
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

    it('propose le board QA Licornes à côté des équipes Dev', async () => {
      mockFetch({
        'configured-boards': {
          success: true,
          boards: [
            { id: 7, name: 'Board Dev' },
            { id: 8, name: 'Board Cook' },
            { id: 9, name: 'Board Support' },
          ],
          qaBoards: [{ id: 946, name: 'Licornes' }],
        },
      });

      await renderPage();

      expect(screen.getByRole('button', { name: /Ajouter QA/ })).toBeInTheDocument();
      const selector = screen.getByLabelText('Nom de l\'équipe');
      expect(within(selector).getByRole('option', { name: 'Licornes' })).toBeInTheDocument();
      expect(within(selector).getByRole('option', { name: 'Board Dev' })).toBeInTheDocument();
    });

    it('rattache Licornes avec les indicateurs du board QA', async () => {
      mockFetch({
        'configured-boards': {
          success: true,
          boards: [{ id: 7, name: 'Board Dev' }],
          qaBoards: [{ id: 946, name: 'Licornes' }],
        },
        'sprint-issues-all': {
          success: true,
          boards: [
            {
              boardId: 946,
              name: 'Licornes',
              sprint: {
                statusCounts: { total: 8, todo: 1, inProgress: 2, qa: 3, resolved: 2 },
                storyPointsByStatus: { total: 0, todo: 0, inProgress: 0, qa: 0, resolved: 0 },
                issues: [
                  { issueType: 'Bug', statusCategoryKey: 'indeterminate' },
                  { issueType: 'Bug', statusCategoryKey: 'done' },
                ],
              },
            },
          ],
        },
      });
      mockGetLatest.mockResolvedValue({
        success: true,
        meeting: {
          ...buildMeeting(),
          teams: [
            {
              id: 't-qa',
              name: 'QA',
              role: 'qa' as const,
              metrics: [
                { id: 'm1', label: 'Cas de test exécutés', value: '', target: '', source: 'manual' as const },
                { id: 'm2', label: 'Taux de réussite (%)', value: '', target: '', source: 'manual' as const },
                { id: 'm3', label: 'Bugs détectés', value: '', target: '', source: 'manual' as const },
                { id: 'm4', label: 'Bugs critiques', value: '', target: '', source: 'manual' as const },
                { id: 'm5', label: 'Couverture (%)', value: '', target: '', source: 'manual' as const },
              ],
            },
          ],
        },
      });

      await renderPage();

      fireEvent.change(screen.getByLabelText('Nom de l\'équipe'), { target: { value: '946' } });

      expect(screen.getByLabelText('Type d\'équipe')).toHaveValue('qa');
      await waitFor(() =>
        expect(screen.getByLabelText('Valeur — Tickets en QA')).toHaveValue('3')
      );
      expect(screen.getByLabelText('Valeur — Bugs ouverts')).toHaveValue('1');
      expect(screen.queryByLabelText('Valeur — Cas de test exécutés')).not.toBeInTheDocument();
    });

    it('demande aussi le sprint des boards QA au préremplissage', async () => {
      const fetchMock = mockFetch({
        'configured-boards': {
          success: true,
          boards: [{ id: 7, name: 'Board Dev' }],
          qaBoards: [{ id: 946, name: 'Licornes' }],
        },
        'sprint-issues-all': JIRA_BOARDS['sprint-issues-all'],
      });
      mockGetLatest.mockResolvedValue({ success: true, meeting: emptyMeeting() });

      await renderPage();

      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(([url]) =>
            String(url).includes('sprint-issues-all?includeQa=true')
          )
        ).toBe(true)
      );
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

  describe('burndown du sprint', () => {
    const SPRINT_BOARDS = {
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
    };

    function faithfulBurndown(boardId: number, overrides: Record<string, unknown> = {}) {
      return {
        boardId,
        unit: 'points',
        scopePoints: 45,
        remainingPoints: 30,
        idealPoints: 28,
        deltaPoints: -2,
        completedPoints: 15,
        days: [{ date: '2026-09-08', remaining: 30, scope: 45, ideal: 28 }],
        ...overrides,
      };
    }

    it('affiche une courbe par équipe avec le reste à faire du jour', async () => {
      mockFetch({
        'configured-boards': { success: true, boards: [{ id: 7, name: 'Board Dev' }] },
        'sprint-issues-all': SPRINT_BOARDS,
        'sprint-burndown': { success: true, boards: [faithfulBurndown(7)] },
      });

      await renderPage();

      expect(await screen.findByText('Burndown du sprint en cours')).toBeInTheDocument();
      expect(screen.getByText('périmètre actuel 45 SP')).toBeInTheDocument();
      expect(screen.getByLabelText('Reste à faire — Équipe Dev')).toHaveTextContent('30 SP');
      expect(
        screen.getByLabelText('Écart à la trajectoire idéale — Équipe Dev')
      ).toBeInTheDocument();
    });

    it('affiche le burndown QA en tickets, pas en story points', async () => {
      mockGetLatest.mockResolvedValue({
        success: true,
        meeting: {
          ...buildMeeting(),
          teams: [
            {
              id: 't-qa',
              name: 'Licornes',
              role: 'qa' as const,
              boardId: 946,
              metrics: [{ id: 'm1', label: 'Tickets en cours', value: '2', target: '', source: 'jira' as const }],
            },
          ],
        },
      });
      mockFetch({
        'configured-boards': {
          success: true,
          boards: [{ id: 7, name: 'Board Dev' }],
          qaBoards: [{ id: 946, name: 'Licornes' }],
        },
        'sprint-issues-all': { success: true, boards: [] },
        'sprint-burndown': {
          success: true,
          boards: [
            faithfulBurndown(946, {
              unit: 'tickets',
              scopePoints: 10,
              remainingPoints: 7,
              completedPoints: 3,
            }),
          ],
        },
      });

      await renderPage();

      expect(await screen.findByText('Burndown du sprint en cours')).toBeInTheDocument();
      expect(screen.getByText('périmètre actuel 10 tickets')).toBeInTheDocument();
      expect(screen.getByLabelText('Reste à faire — Licornes')).toHaveTextContent('7 tickets');
      expect(screen.queryByText(/périmètre actuel 0 SP/)).not.toBeInTheDocument();
    });

    it('demande le burndown fidèle du sprint actif, y compris QA', async () => {
      const fetchMock = mockFetch({
        'configured-boards': { success: true, boards: [{ id: 7, name: 'Board Dev' }] },
        'sprint-issues-all': SPRINT_BOARDS,
        'sprint-burndown': { success: true, boards: [faithfulBurndown(7)] },
      });

      await renderPage();

      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(([url]) =>
            String(url).includes('sprint-burndown?includeQa=true')
          )
        ).toBe(true)
      );
    });

    it('reste masqué quand l\'historique Jira est indisponible', async () => {
      mockFetch({
        'configured-boards': { success: true, boards: [{ id: 7, name: 'Board Dev' }] },
        'sprint-issues-all': SPRINT_BOARDS,
      });

      await renderPage();

      await waitFor(() => expect(mockUpdate).not.toHaveBeenCalled());
      expect(screen.queryByText('Burndown du sprint en cours')).not.toBeInTheDocument();
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
