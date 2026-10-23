/**
 * Service du suivi WIP : lecture Jira mockée, périmètre, cache, réglages (CT-21, CT-22, CT-58).
 */
const mockSearchAll = jest.fn();
const mockGetChangelogs = jest.fn();
const mockGet = jest.fn();
let mockProjectKeys = ['AD', 'SB'];

jest.mock('../../infrastructure/Container', () => ({
  container: () => ({
    jiraClient: {
      searchAllIssuesByJql: mockSearchAll,
      getFieldChangelogs: mockGetChangelogs,
      get: mockGet,
      get configuredProjectKeys() {
        return mockProjectKeys;
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
    delete process.env.JIRA_WIP_PROJECT_KEYS;
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
        ['1', [history('2026-09-08T10:00:00+02:00', 'In Progress')]],
        ['4', [history('2026-09-08T10:00:00+02:00', 'In Progress'), history('2026-09-10T10:00:00+02:00', 'Annulé')]],
      ])
    );

    const res = await service.getWeekly('2026-09-07', '2026-09-20', NOW);

    const [jql, fields] = mockSearchAll.mock.calls[0];
    expect(jql).toContain('project in ("AD")');
    expect(jql).not.toContain('"SB"');
    expect(jql).toContain('before "2026/09/22"');
    expect(jql).toContain('after "2026/09/03"');
    expect(jql).toContain('issuetype in ("US", "Tâche Tech", "Bug", "Bug dev")');
    expect(fields).toBe('key,issuetype,status,created,customfield_10001');
    expect(mockGetChangelogs).toHaveBeenCalledWith(['1', '4'], 'status');
    expect(res.ticketCount).toBe(2);
    expect(res.teams).toEqual(['Team A', 'Sans équipe']);
    expect(res.weeks.map((w) => w.total)).toEqual([
      { wip: 1, done: 0 },
      { wip: 1, done: 0 },
    ]);
    expect(res.settings).toEqual(DEFAULT_WIP_SETTINGS);
    expect(res.projectKeys).toEqual(['AD']);
  });

  it('met le résultat en cache et ne relit pas Jira', async () => {
    mockSearchAll.mockResolvedValue([]);
    await service.getWeekly('2026-09-07', '2026-09-20', NOW);
    await service.getWeekly('2026-09-07', '2026-09-20', NOW);
    expect(mockSearchAll).toHaveBeenCalledTimes(1);
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

  it('ignore les types suivis absents de Jira', async () => {
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(path === '/rest/api/3/issuetype' ? [{ name: 'US' }, { name: 'Bug dev' }] : [])
    );
    mockSearchAll.mockResolvedValue([]);
    await service.getWeekly('2026-09-07', '2026-09-13', NOW);
    expect(mockSearchAll.mock.calls[0][0]).toContain('issuetype in ("US", "Bug dev")');
  });

  it('statuts inconnus de Jira détectés sans tenir compte de la casse ; Jira muet → aucune vérification', async () => {
    expect(await service.findUnknownStatuses(['in progress', 'Go-Prod'])).toEqual(['Go-Prod']);
    globalCache.clear();
    mockGet.mockRejectedValue(new Error('down'));
    expect(await service.findUnknownStatuses(['Go-Prod'])).toEqual([]);
  });

  it('la mesure « maintenant » de la semaine en cours n\'est plus servie du cache après vendredi 14:00', async () => {
    mockSearchAll.mockResolvedValue([]);
    await service.getWeekly('2026-09-07', '2026-09-13', new Date('2026-09-11T13:50:00+02:00'));
    await service.getWeekly('2026-09-07', '2026-09-13', new Date('2026-09-11T14:10:00+02:00'));
    expect(mockSearchAll).toHaveBeenCalledTimes(2);
  });

  it('lit les réglages enregistrés, avec repli sur les statuts par défaut', async () => {
    mockFindOne.mockReturnValue({
      lean: () => Promise.resolve({ startStatuses: [], endStatuses: ['Livré'], teams: [{ team: 'A', devCount: 2 }] }),
    });
    expect(await service.getSettings()).toEqual({
      startStatuses: ['In Progress'],
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
    expect(mockSearchAll).toHaveBeenCalledTimes(2);
  });
});
