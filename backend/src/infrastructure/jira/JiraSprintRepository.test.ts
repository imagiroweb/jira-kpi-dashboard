import { JiraSprintRepository } from './JiraSprintRepository';
import type { JiraClient } from './JiraClient';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

describe('JiraSprintRepository', () => {
  const getBoardSprints = jest.fn();
  const getBoards = jest.fn();
  const searchIssuesWithPagination = jest.fn();
  const getSprintIssues = jest.fn();
  const getBoardConfiguration = jest.fn();
  const getFilterJql = jest.fn();

  const jiraClient = {
    getBoardSprints,
    getBoards,
    searchIssuesWithPagination,
    getSprintIssues,
    getBoardConfiguration,
    getFilterJql
  } as unknown as JiraClient;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JIRA_PROJECT_KEY = 'CFG';
    process.env.JIRA_BOARD_ID = '100';
    delete process.env.JIRA_STORY_POINTS_FIELD;
  });

  it('findByBoard mappe les sprints', async () => {
    getBoardSprints.mockResolvedValue([
      { id: 1, name: 'S1', state: 'active', startDate: '2026-04-01', endDate: '2026-04-15', boardId: 7 }
    ]);
    const repo = new JiraSprintRepository(jiraClient);
    const sprints = await repo.findByBoard(7);
    expect(getBoardSprints).toHaveBeenCalledWith(7);
    expect(sprints).toHaveLength(1);
    expect(sprints[0].id).toBe(1);
  });

  it('findOpenSprints utilise le mapping env projet → board', async () => {
    getBoardSprints.mockResolvedValue([
      { id: 2, name: 'Open', state: 'active', startDate: '2026-04-01', endDate: '2026-04-20', boardId: 100 }
    ]);
    const repo = new JiraSprintRepository(jiraClient);
    const sprints = await repo.findOpenSprints('CFG');
    expect(getBoardSprints).toHaveBeenCalledWith(100, 'active');
    expect(sprints[0].name).toBe('Open');
  });

  it('findOpenSprints sans mapping cherche via getBoards', async () => {
    process.env.JIRA_PROJECT_KEY = 'ONLY';
    process.env.JIRA_BOARD_ID = '1';
    getBoards.mockResolvedValue([
      { id: 200, name: 'Board ONLY', location: { projectKey: 'OTHER' } }
    ]);
    getBoardSprints.mockResolvedValue([]);
    const repo = new JiraSprintRepository(jiraClient);
    const sprints = await repo.findOpenSprints('OTHER');
    expect(getBoards).toHaveBeenCalled();
    expect(getBoardSprints).toHaveBeenCalledWith(200, 'active');
    expect(sprints).toEqual([]);
  });

  it('findOpenSprints retourne [] si aucun board', async () => {
    process.env.JIRA_PROJECT_KEY = 'X';
    process.env.JIRA_BOARD_ID = '1';
    getBoards.mockResolvedValue([]);
    const repo = new JiraSprintRepository(jiraClient);
    expect(await repo.findOpenSprints('UNKNOWN')).toEqual([]);
    expect(getBoardSprints).not.toHaveBeenCalled();
  });

  it('findClosedSprints trie par endDate et limite', async () => {
    getBoardSprints.mockResolvedValue([
      { id: 1, name: 'Old', state: 'closed', endDate: '2026-01-01T00:00:00Z', boardId: 100 },
      { id: 2, name: 'New', state: 'closed', endDate: '2026-06-01T00:00:00Z', boardId: 100 },
      { id: 3, name: 'NoEnd', state: 'closed', boardId: 100 }
    ]);
    const repo = new JiraSprintRepository(jiraClient);
    const sprints = await repo.findClosedSprints('CFG', 1);
    expect(sprints).toHaveLength(1);
    expect(sprints[0].name).toBe('New');
  });

  it('findById parcourt boards et sprints', async () => {
    getBoards.mockResolvedValue([{ id: 10, name: 'B' }]);
    getBoardSprints.mockResolvedValueOnce([
      { id: 99, name: 'Found', state: 'closed', endDate: '2026-01-01', boardId: 10 }
    ]);
    const repo = new JiraSprintRepository(jiraClient);
    const sprint = await repo.findById(99);
    expect(sprint).not.toBeNull();
    expect(sprint!.id).toBe(99);
  });

  it('findSprintIssues et findOpenSprintIssues / findBacklogIssues', async () => {
    getSprintIssues.mockResolvedValue([
      {
        key: 'K-1',
        fields: {
          summary: 'S',
          issuetype: { name: 'Story' },
          status: { name: 'To Do', statusCategory: { name: 'To Do', key: 'new' } },
          customfield_10127: 5
        }
      }
    ]);
    searchIssuesWithPagination.mockResolvedValue({ issues: [] });
    const repo = new JiraSprintRepository(jiraClient);
    const issues = await repo.findSprintIssues(50);
    expect(getSprintIssues).toHaveBeenCalledWith(50, expect.stringContaining('customfield_10127'));
    expect(issues[0].issueKey).toBe('K-1');

    await repo.findOpenSprintIssues('CFG');
    expect(searchIssuesWithPagination).toHaveBeenCalled();
    await repo.findBacklogIssues('CFG');
    expect(searchIssuesWithPagination).toHaveBeenCalledTimes(2);
  });

  it('findBoardBacklogIssues utilise le filtre du board (pas tout le projet)', async () => {
    getBoardConfiguration.mockResolvedValue({ filter: { id: '12345' } });
    getFilterJql.mockResolvedValue('project = AD AND "Team[Team]" = 7 ORDER BY Rank ASC');
    searchIssuesWithPagination.mockResolvedValue({
      issues: [
        {
          key: 'AD-10',
          fields: {
            summary: 'B',
            issuetype: { name: 'Story' },
            status: { name: 'To Do', statusCategory: { name: 'To Do', key: 'new' } },
            customfield_10127: 3
          }
        }
      ]
    });
    const repo = new JiraSprintRepository(jiraClient);
    const issues = await repo.findBoardBacklogIssues(843, 'AD');
    expect(getBoardConfiguration).toHaveBeenCalledWith(843);
    expect(getFilterJql).toHaveBeenCalledWith('12345');
    const jql = searchIssuesWithPagination.mock.calls[0][0] as string;
    expect(jql).toContain('(project = AD AND "Team[Team]" = 7) AND Sprint is EMPTY');
    expect(jql).not.toContain('ORDER BY Rank');
    expect(issues).toHaveLength(1);
    expect(issues[0].storyPoints).toBe(3);
  });

  it('findBoardBacklogIssues retombe sur le backlog projet si le board n’a pas de filtre', async () => {
    getBoardConfiguration.mockResolvedValue(null);
    searchIssuesWithPagination.mockResolvedValue({ issues: [] });
    const repo = new JiraSprintRepository(jiraClient);
    await repo.findBoardBacklogIssues(843, 'AD');
    expect(searchIssuesWithPagination.mock.calls[0][0]).toBe(
      'project = "AD" AND Sprint is EMPTY AND statusCategory != Done ORDER BY created DESC'
    );
  });

  it('findBoardBacklogIssues retombe sur le projet si la résolution du filtre échoue', async () => {
    getBoardConfiguration.mockRejectedValue(new Error('403'));
    searchIssuesWithPagination.mockResolvedValue({ issues: [] });
    const repo = new JiraSprintRepository(jiraClient);
    await repo.findBoardBacklogIssues(843, 'AD');
    expect(searchIssuesWithPagination.mock.calls[0][0]).toContain('project = "AD"');
  });

  it('findBoardBacklogIssues sans filtre ni projet renvoie un backlog vide', async () => {
    getBoardConfiguration.mockResolvedValue({ filter: { id: '1' } });
    getFilterJql.mockResolvedValue('   ');
    const repo = new JiraSprintRepository(jiraClient);
    const issues = await repo.findBoardBacklogIssues(843);
    expect(issues).toEqual([]);
    expect(searchIssuesWithPagination).not.toHaveBeenCalled();
  });
});
