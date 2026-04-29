import { SprintMapper } from './SprintMapper';

describe('SprintMapper', () => {
  it('mappe un sprint Jira vers entité Sprint', () => {
    const sprint = SprintMapper.toDomain(
      {
        id: 10,
        name: 'Sprint 10',
        state: 'active',
        startDate: '2026-04-01',
        endDate: '2026-04-15',
        completeDate: undefined,
        goal: 'Goal'
      } as any,
      42
    );

    expect(sprint.id).toBe(10);
    expect(sprint.boardId).toBe(42);
    expect(sprint.name).toBe('Sprint 10');
  });

  it('issueToDomin mappe les champs Jira en SprintIssue', () => {
    const issue = SprintMapper.issueToDomin(
      {
        key: 'ABC-1',
        fields: {
          summary: 'Issue',
          issuetype: { name: 'Story' },
          status: { name: 'In Progress', statusCategory: { name: 'In Progress', key: 'indeterminate' } },
          customfield_story: 8,
          timeoriginalestimate: 3600
        }
      } as any,
      'customfield_story'
    );

    expect(issue.issueKey).toBe('ABC-1');
    expect(issue.storyPoints).toBe(8);
    expect(issue.originalEstimate?.toSeconds).toBe(3600);
    expect(issue.isInProgress).toBe(true);
  });

  it('issuesToDomain mappe plusieurs issues', () => {
    const result = SprintMapper.issuesToDomain(
      [
        { key: 'A-1', fields: { summary: 'A', status: { name: 'Done', statusCategory: { key: 'done' } } } },
        { key: 'A-2', fields: { summary: 'B', status: { name: 'To Do', statusCategory: { key: 'new' } } } }
      ] as any,
      'sp'
    );
    expect(result).toHaveLength(2);
    expect(result[0].issueKey).toBe('A-1');
    expect(result[1].issueKey).toBe('A-2');
  });
});
