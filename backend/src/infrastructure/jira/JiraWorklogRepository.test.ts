import { DateRange } from '../../domain/worklog/value-objects/DateRange';
import { JiraWorklogRepository } from './JiraWorklogRepository';
import type { JiraClient } from './JiraClient';
import type { JiraIssue, JiraWorklog } from './JiraClient';

const minimalWorklog = (id: string, started: string): JiraWorklog =>
  ({
    id,
    author: { accountId: 'acc-1', displayName: 'User' },
    timeSpentSeconds: 3600,
    started
  }) as JiraWorklog;

function issue(key: string): JiraIssue {
  return {
    id: 'iss-1',
    key,
    fields: {
      summary: 'Summary',
      issuetype: { name: 'Task' },
      status: { name: 'Open' }
    }
  } as JiraIssue;
}

describe('JiraWorklogRepository', () => {
  const searchAllIssuesByJql = jest.fn();
  const getIssueWorklogsForMany = jest.fn();
  const getIssueWorklogs = jest.fn();

  const jiraClient = {
    searchAllIssuesByJql,
    getIssueWorklogsForMany,
    getIssueWorklogs
  } as unknown as JiraClient;

  let repo: JiraWorklogRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    searchAllIssuesByJql.mockResolvedValue([]);
    getIssueWorklogsForMany.mockResolvedValue(new Map());
    repo = new JiraWorklogRepository(jiraClient);
  });

  it('findByIssue délègue getIssueWorklogs puis mappe', async () => {
    const wl = minimalWorklog('w1', '2026-04-15T12:00:00.000Z');
    getIssueWorklogs.mockResolvedValue([wl]);
    const out = await repo.findByIssue('ABC-1');
    expect(getIssueWorklogs).toHaveBeenCalledWith('ABC-1');
    expect(out).toHaveLength(1);
    expect(out[0].issueKey).toBe('ABC-1');
  });

  it('search fusionne plusieurs projectKeys distincts', async () => {
    searchAllIssuesByJql.mockResolvedValueOnce([issue('A-1')]).mockResolvedValueOnce([issue('B-1')]);
    getIssueWorklogsForMany.mockImplementation(async (keys: string[]) => {
      const m = new Map<string, JiraWorklog[]>();
      for (const k of keys) {
        m.set(k, [minimalWorklog(`wl-${k}`, '2026-04-15T12:00:00.000Z')]);
      }
      return m;
    });

    const out = await repo.search({
      projectKeys: ['A', 'B'],
      from: '2026-04-15',
      to: '2026-04-15'
    });
    expect(searchAllIssuesByJql).toHaveBeenCalledTimes(2);
    expect(out.length).toBeGreaterThanOrEqual(1);
  });

  it('search avec un seul projectKey construit le JQL', async () => {
    searchAllIssuesByJql.mockResolvedValue([issue('A-1')]);
    getIssueWorklogsForMany.mockResolvedValue(
      new Map([['A-1', [minimalWorklog('w1', '2026-04-15T12:00:00.000Z')]]])
    );
    await repo.search({ projectKeys: ['A'], from: '2026-04-15', to: '2026-04-15' });
    expect(searchAllIssuesByJql.mock.calls[0][0]).toContain('project = "A"');
  });

  it('search sans dates ajoute updated >= -30d', async () => {
    searchAllIssuesByJql.mockResolvedValue([]);
    await repo.search({ projectKey: 'Z' });
    expect(searchAllIssuesByJql.mock.calls[0][0]).toContain('updated >= -30d');
  });

  it('findByOpenSprints avec et sans projectKey', async () => {
    searchAllIssuesByJql.mockResolvedValue([]);
    await repo.findByOpenSprints();
    expect(searchAllIssuesByJql.mock.calls[0][0]).toBe('Sprint in openSprints()');
    await repo.findByOpenSprints('PROJ');
    expect(searchAllIssuesByJql.mock.calls[1][0]).toContain('project = "PROJ"');
  });

  it('findByUser et findByProject appellent searchWithJql via search', async () => {
    searchAllIssuesByJql.mockResolvedValue([]);
    const range = DateRange.create('2026-04-15', '2026-04-15');
    await repo.findByUser('u-1', range);
    expect(searchAllIssuesByJql.mock.calls[0][0]).toContain('worklogAuthor = "u-1"');
    await repo.findByProject('ABC', range);
    expect(searchAllIssuesByJql.mock.calls[1][0]).toContain('project = "ABC"');
  });
});
