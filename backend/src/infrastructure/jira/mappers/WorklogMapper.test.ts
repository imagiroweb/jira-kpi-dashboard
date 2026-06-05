import { WorklogMapper } from './WorklogMapper';
import type { JiraWorklog } from '../JiraClient';

describe('WorklogMapper', () => {
  it('mappe un JiraWorklog vers Worklog domaine', () => {
    const jiraWorklog: JiraWorklog = {
      id: 'w1',
      started: '2026-04-01T10:00:00.000Z',
      timeSpentSeconds: 3600,
      author: {
        accountId: 'u1',
        displayName: 'Alice Doe',
        avatarUrls: { '48x48': 'avatar.png' }
      },
      comment: {
        content: [
          { content: [{ text: 'Ligne 1' }] },
          { content: [{ text: 'Ligne 2' }] }
        ]
      }
    };

    const worklog = WorklogMapper.toDomain(
      jiraWorklog,
      'ABC-1',
      {
        summary: 'Issue summary',
        issuetype: { name: 'Story' },
        status: { name: 'Done' },
        customfield_story: 5,
        customfield_weight: 8,
        timeoriginalestimate: 7200
      },
      'customfield_story',
      'customfield_weight'
    );

    expect(worklog.id).toBe('w1');
    expect(worklog.issueKey).toBe('ABC-1');
    expect(worklog.author.accountId).toBe('u1');
    expect(worklog.timeSpent.toSeconds).toBe(3600);
    expect(worklog.description).toContain('Ligne 1');
    expect(worklog.storyPoints).toBe(5);
    expect(worklog.weight).toBe(8);
    expect(worklog.originalEstimate?.toSeconds).toBe(7200);
  });

  it('retourne description vide si commentaire non exploitable', () => {
    const jiraWorklog: JiraWorklog = {
      id: 'w2',
      started: '2026-04-01T10:00:00.000Z',
      timeSpentSeconds: 60,
      author: { accountId: 'u1', displayName: 'Alice' },
      comment: undefined
    };
    const worklog = WorklogMapper.toDomain(jiraWorklog, 'ABC-1');
    expect(worklog.description).toBe('');
  });

  it('toDomainList mappe toute la liste', () => {
    const list = WorklogMapper.toDomainList(
      [
        { id: '1', started: '2026-04-01T10:00:00.000Z', timeSpentSeconds: 60, author: { accountId: 'u1', displayName: 'A' } },
        { id: '2', started: '2026-04-01T10:00:00.000Z', timeSpentSeconds: 120, author: { accountId: 'u2', displayName: 'B' } }
      ] satisfies JiraWorklog[],
      'ABC-1'
    );
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('1');
    expect(list[1].id).toBe('2');
  });
});
