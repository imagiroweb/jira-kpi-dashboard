import { SprintMapper } from './SprintMapper';
import type { JiraIssue, JiraSprint } from '../JiraClient';

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
      } satisfies JiraSprint,
      42
    );

    expect(sprint.id).toBe(10);
    expect(sprint.boardId).toBe(42);
    expect(sprint.name).toBe('Sprint 10');
  });

  it('issueToDomin mappe les champs Jira en SprintIssue', () => {
    const issue = SprintMapper.issueToDomin(
      {
        id: '10001',
        key: 'ABC-1',
        fields: {
          summary: 'Issue',
          issuetype: { name: 'Story' },
          status: { name: 'In Progress', statusCategory: { name: 'In Progress', key: 'indeterminate' } },
          customfield_story: 8,
          timeoriginalestimate: 3600
        }
      } satisfies JiraIssue,
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
        { id: '1', key: 'A-1', fields: { summary: 'A', status: { name: 'Done', statusCategory: { key: 'done' } } } },
        { id: '2', key: 'A-2', fields: { summary: 'B', status: { name: 'To Do', statusCategory: { key: 'new' } } } }
      ] satisfies JiraIssue[],
      'sp'
    );
    expect(result).toHaveLength(2);
    expect(result[0].issueKey).toBe('A-1');
    expect(result[1].issueKey).toBe('A-2');
  });

  it('toDomainList mappe chaque sprint', () => {
    const list = SprintMapper.toDomainList(
      [
        { id: 1, name: 'A', state: 'active' },
        { id: 2, name: 'B', state: 'future' }
      ] satisfies JiraSprint[],
      7
    );
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(1);
    expect(list[1].boardId).toBe(7);
  });

  it('issueToDomin gère summary et status absents', () => {
    const issue = SprintMapper.issueToDomin(
      {
        id: '99',
        key: 'Z-1',
        fields: {
          customfield_sp: null,
          timeoriginalestimate: null
        }
      } satisfies JiraIssue,
      'customfield_sp'
    );
    expect(issue.summary).toBe('');
    expect(issue.storyPoints).toBeNull();
    expect(issue.originalEstimate).toBeNull();
  });
});
