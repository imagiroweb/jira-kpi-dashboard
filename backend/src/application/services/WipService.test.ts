/**
 * Service du suivi WIP : lecture Jira mockée, périmètre, cache, réglages (CT-21, CT-22, CT-58).
 */
const mockSearchAll = jest.fn();
const mockGetChangelogs = jest.fn();
const mockGet = jest.fn();
let mockProjectKeys = ['AD', 'SB'];
let mockBoardIds: number[] = [];
const mockGetBoard = jest.fn();
const mockGetBoardConfiguration = jest.fn();
const mockGetFilterJql = jest.fn();

jest.mock('../../infrastructure/Container', () => ({
  container: () => ({
    jiraClient: {
      searchAllIssuesByJql: mockSearchAll,
      getFieldChangelogs: mockGetChangelogs,
      get: mockGet,
      getBoard: mockGetBoard,
      getBoardConfiguration: mockGetBoardConfiguration,
      getFilterJql: mockGetFilterJql,
      get configuredProjectKeys() {
        return mockProjectKeys;
      },
      get configuredBoardIds() {
        return mockBoardIds;
      },
    },
  }),
}));

const mockFindOne = jest.fn();
const mockFindOneAndUpdate = jest.fn();
jest.mock('../../domain/wip/entities/WipSettings', () => ({
  WipSettings: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
  },
}));

jest.mock('../../utils/logger', () => jest.requireActual('../../test/mocks/logger').loggerMockFactory());

import { WipService } from './WipService';
import { globalCache } from '../../infrastructure/cache';
import { DEFAULT_WIP_SETTINGS } from '../../domain/wip/wipSettings';

const NOW = new Date('2026-09-20T12:00:00+02:00');
const issue = (id: string, key: string, type: object, team: unknown = { value: 'Team A' }) => ({
  id,
  key,
  fields: { issuetype: type, status: { name: 'QA' }, created: '2026-09-01T10:00:00+02:00', customfield_10001: team },
});
const history = (at: string, to: string) => ({ created: at, items: [{ fieldId: 'status', toString: to }] });

describe('WipService', () => {
  const service = new WipService();

  beforeEach(() => {
    jest.clearAllMocks();
    globalCache.clear();
    mockProjectKeys = ['AD', 'SB'];
    mockBoardIds = [];
    delete process.env.JIRA_WIP_PROJECT_KEYS;
    delete process.env.JIRA_WIP_BOARD_IDS;
    delete process.env.JIRA_SUPPORT_PROJECT_KEY;
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/rest/api/3/issuetype'
          ? [{ name: 'US' }, { name: 'Tâche Tech' }, { name: 'Bug' }, { name: 'Bug dev' }, { name: 'Epic' }]
          : [
              { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
              { name: 'Go Prod', statusCategory: { key: 'done' } },
              { name: 'Annulé', statusCategory: { key: 'done' } },
              { name: 'QA', statusCategory: { key: 'indeterminate' } },
            ]
      )
    );
  });

  it('CT-22 : exclut le projet Support, les sous-tâches et les épics ; agrège par semaine et par équipe', async () => {
    mockSearchAll.mockResolvedValue([
      issue('1', 'AD-1', { name: 'US' }),
      issue('2', 'AD-2', { name: 'Sous-tâche', subtask: true }),
      issue('3', 'AD-3', { name: 'Epic' }),
      issue('4', 'AD-4', { name: 'Bug dev' }, null),
      issue('5', 'AD-5', { name: 'Story' }),
    ]);
    mockGetChangelogs.mockResolvedValue(
      new Map([
        ['1', [history('2026-09-08T10:00:00+02:00', '--In Progress--')]],
        ['4', [history('2026-09-08T10:00:00+02:00', '--In Progress--'), history('2026-09-10T10:00:00+02:00', 'Annulé')]],
      ])
    );

    const res = await service.getWeekly('2026-09-07', '2026-09-20', NOW);

    const [jql, fields] = mockSearchAll.mock.calls[0];
    expect(jql).toContain('project in ("AD")');
    expect(jql).not.toContain('"SB"');
    expect(jql).toContain('before "2026/09/22"');
    expect(jql).toContain('after "2026/09/03"');
    expect(jql).toContain('issuetype in ("US", "Tâche Tech", "Bug", "Bug dev")');
    expect(fields).toBe('key,issuetype,status,created,assignee,project,customfield_10001');
    expect(mockGetChangelogs).toHaveBeenCalledWith(['1', '4'], 'status');
    expect(res.ticketCount).toBe(2);
    expect(res.teams).toEqual(['Team A']);
    expect(res.weeks.map((w) => w.total)).toEqual([
      { wip: 1, done: 0 },
      { wip: 1, done: 0 },
    ]);
    expect(res.settings).toEqual(DEFAULT_WIP_SETTINGS);
    expect(res.projectKeys).toEqual(['AD']);
  });

  it('détail par collaborateur : assigné actuel des tickets encore dans le WIP', async () => {
    const withAssignee = (id: string, key: string, name: string | null) => ({
      ...issue(id, key, { name: 'US' }),
      fields: {
        issuetype: { name: 'US' },
        status: { name: 'QA' },
        created: '2026-09-01T10:00:00+02:00',
        customfield_10001: { value: 'Team A' },
        assignee: name ? { displayName: name } : null,
      },
    });
    mockSearchAll.mockResolvedValue([
      withAssignee('1', 'AD-1', 'Alice Martin'),
      withAssignee('2', 'AD-2', 'Alice Martin'),
      withAssignee('3', 'AD-3', 'Bob'),
      withAssignee('4', 'AD-4', null),
    ]);
    mockGetChangelogs.mockResolvedValue(
      new Map([
        ['1', [history('2026-09-08T10:00:00+02:00', '--In Progress--')]],
        ['2', [history('2026-09-08T10:00:00+02:00', '--In Progress--'), history('2026-09-09T10:00:00+02:00', 'Annulé')]],
        ['3', [history('2026-09-08T10:00:00+02:00', '--In Progress--')]],
        ['4', [history('2026-09-08T10:00:00+02:00', '--In Progress--')]],
      ])
    );

    const res = await service.getWeekly('2026-09-07', '2026-09-20', NOW);

    expect(res.openTickets).toEqual([
      { key: 'AD-1', assignee: 'Alice Martin', teams: ['Team A'], status: '--In Progress--' },
      { key: 'AD-3', assignee: 'Bob', teams: ['Team A'], status: '--In Progress--' },
      { key: 'AD-4', assignee: 'Non assigné', teams: ['Team A'], status: '--In Progress--' },
    ]);
  });

  it('met le résultat en cache et ne relit pas Jira', async () => {
    mockSearchAll.mockResolvedValue([]);
    await service.getWeekly('2026-09-07', '2026-09-20', NOW);
    await service.getWeekly('2026-09-07', '2026-09-20', NOW);
    expect(mockSearchAll).toHaveBeenCalledTimes(2);
    expect(mockGetChangelogs).not.toHaveBeenCalled();
  });

  it('JIRA_WIP_PROJECT_KEYS prioritaire ; statuts Jira indisponibles → calcul quand même', async () => {
    process.env.JIRA_WIP_PROJECT_KEYS = 'X, Y';
    mockGet.mockRejectedValue(new Error('down'));
    mockSearchAll.mockResolvedValue([]);
    const res = await service.getWeekly('2026-09-07', '2026-09-13', NOW);
    expect(res.projectKeys).toEqual(['X', 'Y']);
    expect(res.weeks).toHaveLength(1);
  });

  it('cible --In Progress-- et, depuis le 12/10, --Terminé-- sans exclure --Go Prod--', async () => {
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/rest/api/3/issuetype'
          ? [{ name: 'US' }]
          : [
              { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
              { name: '--In Progress--', statusCategory: { key: 'indeterminate' } },
              { name: 'GO PROD', statusCategory: { key: 'indeterminate' } },
              { name: 'GO-PROD', statusCategory: { key: 'indeterminate' } },
              { name: '--Go Prod--', statusCategory: { key: 'indeterminate' } },
            ]
      )
    );
    mockSearchAll.mockResolvedValue([issue('1', 'AD-1', { name: 'US' })]);
    mockGetChangelogs.mockResolvedValue(new Map([['1', [history('2026-09-08T10:00:00+02:00', '--In Progress--')]]]));

    const res = await service.getWeekly('2026-09-07', '2026-09-13', NOW);

    const jql = mockSearchAll.mock.calls[0][0];
    expect(jql).toContain('status was in ("--In Progress--")');
    expect(jql).not.toContain('"In Progress"');
    expect(jql).toContain('"--Terminé--"');
    expect(jql).not.toContain('"--GO PROD--"');
    expect(jql).not.toContain('"--Go Prod--"');
    expect(jql).not.toContain('"GO PROD"');
    expect(jql).not.toContain('"GO-PROD"');
    expect(res.weeks.map((w) => w.total.wip)).toEqual([1]);
  });

  it('ignore les types suivis absents de Jira', async () => {
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(path === '/rest/api/3/issuetype' ? [{ name: 'US' }, { name: 'Bug dev' }] : [])
    );
    mockSearchAll.mockResolvedValue([]);
    await service.getWeekly('2026-09-07', '2026-09-13', NOW);
    expect(mockSearchAll.mock.calls[0][0]).toContain('issuetype in ("US", "Bug dev")');
  });

  it('statuts inconnus de Jira détectés (casse ignorée, tirets conservés) ; Jira muet → aucune vérification', async () => {
    expect(await service.findUnknownStatuses(['in progress', 'Go-Prod', 'Livré'])).toEqual(['Go-Prod', 'Livré']);
    globalCache.clear();
    mockGet.mockRejectedValue(new Error('down'));
    expect(await service.findUnknownStatuses(['Go-Prod'])).toEqual([]);
  });

  it('la mesure « maintenant » de la semaine en cours n\'est plus servie du cache après vendredi 14:00', async () => {
    mockSearchAll.mockResolvedValue([]);
    await service.getWeekly('2026-09-07', '2026-09-13', new Date('2026-09-11T13:50:00+02:00'));
    await service.getWeekly('2026-09-07', '2026-09-13', new Date('2026-09-11T14:10:00+02:00'));
    expect(mockSearchAll).toHaveBeenCalledTimes(4);
  });

  it('réécrit les anciens défauts In Progress / Go Prod vers le format décoré', async () => {
    mockFindOne.mockReturnValue({
      lean: () => Promise.resolve({ startStatuses: ['In Progress'], endStatuses: ['Go Prod'], teams: [] }),
    });
    expect(await service.getSettings()).toMatchObject({
      startStatuses: ['--In Progress--'],
      endStatuses: ['--GO PROD--'],
    });
  });

  it('lit les réglages enregistrés, avec repli sur les statuts par défaut', async () => {
    mockFindOne.mockReturnValue({
      lean: () => Promise.resolve({ startStatuses: [], endStatuses: ['Livré'], teams: [{ team: 'A', devCount: 2 }] }),
    });
    expect(await service.getSettings()).toEqual({
      startStatuses: ['--In Progress--'],
      endStatuses: ['Livré'],
      defaultMaxPerDev: 3,
      teams: [{ team: 'A', devCount: 2, maxPerDev: null }],
    });
  });

  it('CT-58 : enregistrer les réglages vide le cache du calcul', async () => {
    mockSearchAll.mockResolvedValue([]);
    await service.getWeekly('2026-09-07', '2026-09-13', NOW);
    mockFindOneAndUpdate.mockResolvedValue({});
    await service.saveSettings({ ...DEFAULT_WIP_SETTINGS, startStatuses: ['Dev'] }, 'u1');
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { key: 'default' },
      { $set: expect.objectContaining({ startStatuses: ['Dev'], updatedBy: 'u1' }) },
      { upsert: true, new: true }
    );
    await service.getWeekly('2026-09-07', '2026-09-13', NOW);
    expect(mockSearchAll).toHaveBeenCalledTimes(4);
  });

  describe('CT-78 : une équipe = un board configuré', () => {
    const BOARDS: Record<number, { name: string; filter: string | null }> = {
      10: { name: 'Supply', filter: '200' },
      11: { name: 'Brigade', filter: '201' },
      12: { name: 'Calson', filter: '202' },
      13: { name: 'Sans filtre', filter: null },
    };
    const FILTERS: Record<string, string> = {
      '200': 'project = AD AND team = Supply ORDER BY Rank ASC',
      '201': 'project = AD AND team = Brigade',
      '202': 'project = AD AND team = Calson',
    };

    beforeEach(() => {
      mockBoardIds = [10, 11, 12, 13];
      mockGetBoard.mockImplementation((id: number) => Promise.resolve({ id, name: BOARDS[id].name }));
      mockGetBoardConfiguration.mockImplementation((id: number) =>
        Promise.resolve(BOARDS[id].filter ? { filter: { id: BOARDS[id].filter } } : {})
      );
      mockGetFilterJql.mockImplementation((id: string) => Promise.resolve(FILTERS[id]));
    });

    it('lit chaque board avec son filtre ; un ticket sur deux boards compte pour les deux, une fois au total', async () => {
      mockSearchAll.mockImplementation((jql: string) =>
        Promise.resolve(
          jql.includes('team = Supply')
            ? [issue('1', 'AD-1', { name: 'US' }), issue('2', 'AD-2', { name: 'Bug' })]
            : jql.includes('team = Brigade')
              ? [issue('2', 'AD-2', { name: 'Bug' })]
              : []
        )
      );
      mockGetChangelogs.mockResolvedValue(
        new Map([
          ['1', [history('2026-09-08T10:00:00+02:00', '--In Progress--')]],
          ['2', [history('2026-09-08T10:00:00+02:00', '--In Progress--')]],
        ])
      );

      const res = await service.getWeekly('2026-09-07', '2026-09-13', NOW);

      const jqls = mockSearchAll.mock.calls.map((c) => c[0] as string);
      const boardJqls = jqls.filter((jql) => !jql.includes('project = "SB"'));
      expect(boardJqls).toHaveLength(3);
      expect(jqls.some((jql) => jql.startsWith('project = "SB" AND ') && jql.includes('"Bug"'))).toBe(true);
      expect(jqls[0].startsWith('(project = AD AND team = Supply) AND ')).toBe(true);
      expect(jqls[0]).not.toContain('ORDER BY');
      expect(jqls.every((j) => !j.includes('project in'))).toBe(true);
      expect(mockGetChangelogs).toHaveBeenCalledWith(['1', '2'], 'status');
      expect(res.boards).toEqual(['Supply', 'Brigade', 'Calson']);
      expect(res.projectKeys).toEqual([]);
      // Calson n'a aucun ticket mais reste proposée ; le champ équipe Jira est ignoré.
      expect(res.teams).toEqual(['Brigade', 'Calson', 'Supply']);
      expect(res.weeks[0].total).toEqual({ wip: 2, done: 0 });
      expect(res.weeks[0].byTeam).toEqual({
        Brigade: { wip: 1, done: 0 },
        Calson: { wip: 0, done: 0 },
        Supply: { wip: 2, done: 0 },
      });
    });

    it('JIRA_WIP_BOARD_IDS prioritaire sur les boards du dashboard', async () => {
      process.env.JIRA_WIP_BOARD_IDS = '12, x';
      mockSearchAll.mockResolvedValue([]);
      const res = await service.getWeekly('2026-09-07', '2026-09-13', NOW);
      expect(mockGetBoard).toHaveBeenCalledTimes(1);
      expect(res.boards).toEqual(['Calson']);
    });

    it('aucun board exploitable : repli sur les projets et le champ équipe', async () => {
      mockBoardIds = [13];
      mockSearchAll.mockResolvedValue([]);
      const res = await service.getWeekly('2026-09-07', '2026-09-13', NOW);
      expect(mockSearchAll.mock.calls[0][0]).toContain('project in ("AD")');
      expect(res.boards).toEqual([]);
      expect(res.projectKeys).toEqual(['AD']);
    });
  });

  it('range chaque semaine selon l\'id Team et ajoute les Bug et Support de SB', async () => {
    const brigade = '931e2ea1-6791-4262-ad27-a5a46b22d1fe';
    const calson = 'deedfde0-1c90-458b-b37a-9648eaf61e04';
    mockBoardIds = [11];
    mockGetBoard.mockResolvedValue({ id: 11, name: 'Brigade' });
    mockGetBoardConfiguration.mockResolvedValue({ filter: { id: '201' } });
    mockGetFilterJql.mockResolvedValue(`project = AD AND Team in (${brigade})`);
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/rest/api/3/issuetype'
          ? [{ name: 'US' }, { name: 'Tâche Tech' }, { name: 'Bug' }, { name: 'Bug dev' }, { name: 'Support' }]
          : [
              { name: '--In Progress--', statusCategory: { key: 'indeterminate' } },
              { name: 'Go Prod', statusCategory: { key: 'done' } },
            ]
      )
    );
    const dev = issue('1', 'AD-1', { name: 'US' }, { id: brigade, name: 'Brigade' });
    const previous = issue('9', 'AD-9', { name: 'US' }, { id: calson, name: 'Calson' });
    const supportBase = issue('8', 'SB-8', { name: 'Support' }, { id: brigade, name: 'Brigade' });
    const support = { ...supportBase, fields: { ...supportBase.fields, project: { key: 'SB' } } };
    mockSearchAll.mockImplementation((jql: string) => {
      if (jql.includes(calson)) return Promise.resolve([previous]);
      if (jql.includes('project = "SB"')) return Promise.resolve([support]);
      if (jql.includes(brigade)) return Promise.resolve([dev]);
      return Promise.resolve([]);
    });
    mockGetChangelogs.mockImplementation((ids: string[], field: string) => {
      if (field === 'status') {
        return Promise.resolve(
          new Map(
            ids.map((id) => [
              id,
              [history('2026-09-08T10:00:00+02:00', id === '8' ? 'En cours...' : '--In Progress--')],
            ])
          )
        );
      }
      return Promise.resolve(
        new Map([
          [
            '1',
            [
              {
                created: '2026-10-04T21:58:00+02:00',
                items: [{ fieldId: 'customfield_10001', from: calson, fromString: 'Calson', to: brigade, toString: 'Brigade' }],
              },
            ],
          ],
        ])
      );
    });

    const res = await service.getWeekly('2026-09-28', '2026-10-11', new Date('2026-10-21T15:00:00+02:00'));

    const jqls = mockSearchAll.mock.calls.map((call) => call[0] as string);
    expect(
      jqls.some(
        (jql) =>
          jql.startsWith('project = "SB" AND ') &&
          jql.includes('"Support"') &&
          jql.includes('"Bug"') &&
          jql.includes('"En cours..."') &&
          !jql.includes('"--In Progress--"')
      )
    ).toBe(true);
    expect(jqls.some((jql) => jql.includes(`Team in (${calson})`))).toBe(true);
    expect(res.boards).toEqual(['Brigade']);
    expect(res.ticketCount).toBe(3);
    expect(res.weeks.map((week) => week.byTeam.Calson.wip)).toEqual([2, 1]);
    expect(res.weeks.map((week) => week.byTeam.Brigade.wip)).toEqual([1, 2]);
    expect(res.openTickets.map((ticket) => ticket.key)).toEqual(['AD-1', 'AD-9', 'SB-8']);
    expect(res.openTickets.find((ticket) => ticket.key === 'AD-1')?.teams).toEqual(['Brigade']);
    expect(res.openTickets.find((ticket) => ticket.key === 'AD-9')?.teams).toEqual(['Calson']);
    expect(res.openTickets.find((ticket) => ticket.key === 'SB-8')?.teams).toEqual(['Brigade']);
  });

  it('un board à plusieurs ids Team garde Choco distinct de Supply', async () => {
    const choco = '972ac800-927e-42c6-a6c9-4d691ce8c87e';
    const supply = '83219e84-63fa-4122-b927-fde8e28adf97';
    mockBoardIds = [12];
    mockGetBoard.mockResolvedValue({ id: 12, name: 'Supply' });
    mockGetBoardConfiguration.mockResolvedValue({ filter: { id: '202' } });
    mockGetFilterJql.mockResolvedValue(`project = AD AND Team in (${choco}, ${supply})`);
    mockSearchAll.mockImplementation((jql: string) =>
      Promise.resolve(
        jql.includes(choco) && jql.includes(supply)
          ? [
              issue('1', 'AD-1', { name: 'US' }, { id: choco, name: 'Choco' }),
              issue('2', 'AD-2', { name: 'US' }, { id: supply, name: 'Supply' }),
            ]
          : []
      )
    );
    mockGetChangelogs.mockImplementation((ids: string[], field: string) =>
      Promise.resolve(
        field === 'status'
          ? new Map(ids.map((id) => [id, [history('2026-09-08T10:00:00+02:00', '--In Progress--')]]))
          : new Map()
      )
    );

    const res = await service.getWeekly('2026-09-07', '2026-09-13', NOW);

    expect(res.boards).toEqual(['Supply']);
    expect(res.teams).toEqual(expect.arrayContaining(['Choco', 'Supply']));
    expect(res.weeks[0].byTeam.Choco).toEqual({ wip: 1, done: 0 });
    expect(res.weeks[0].byTeam.Supply).toEqual({ wip: 1, done: 0 });
  });
});
