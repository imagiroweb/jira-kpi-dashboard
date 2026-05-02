import { SprintIssue } from './SprintIssue';

describe('SprintIssue', () => {
  it('projectKey sans tiret renvoie la clé entière', () => {
    const i = SprintIssue.create({ issueKey: 'BADKEY', summary: 'x' });
    expect(i.projectKey).toBe('BADKEY');
  });

  it('isTodo via mots-clés de statut', () => {
    expect(SprintIssue.create({ issueKey: 'A-1', summary: 's', status: 'À faire' }).isTodo).toBe(true);
    expect(SprintIssue.create({ issueKey: 'A-2', summary: 's', status: 'Open' }).isTodo).toBe(true);
  });

  it('isInProgress via mots-clés', () => {
    expect(SprintIssue.create({ issueKey: 'A-1', summary: 's', status: 'En cours' }).isInProgress).toBe(true);
    expect(SprintIssue.create({ issueKey: 'A-2', summary: 's', status: 'WIP' }).isInProgress).toBe(true);
  });

  it('isDone via mots-clés', () => {
    expect(SprintIssue.create({ issueKey: 'A-1', summary: 's', status: 'Résolu' }).isDone).toBe(true);
    expect(SprintIssue.create({ issueKey: 'A-2', summary: 's', status: 'Livré' }).isDone).toBe(true);
  });

  it('isInQA détecte validation / recette', () => {
    expect(SprintIssue.create({ issueKey: 'A-1', summary: 's', status: 'In QA' }).isInQA).toBe(true);
    expect(SprintIssue.create({ issueKey: 'A-2', summary: 's', status: 'Recette' }).isInQA).toBe(true);
  });

  it('isBug / isStory / isTask', () => {
    expect(SprintIssue.create({ issueKey: 'A-1', summary: 's', issueType: 'Defect' }).isBug).toBe(true);
    expect(SprintIssue.create({ issueKey: 'A-2', summary: 's', issueType: 'User Story' }).isStory).toBe(true);
    expect(SprintIssue.create({ issueKey: 'A-3', summary: 's', issueType: 'Sub-task' }).isTask).toBe(true);
  });

  it('hasStoryPoints', () => {
    expect(SprintIssue.create({ issueKey: 'A-1', summary: 's', storyPoints: 0 }).hasStoryPoints).toBe(false);
    expect(SprintIssue.create({ issueKey: 'A-2', summary: 's', storyPoints: 3 }).hasStoryPoints).toBe(true);
  });

  it('equals et toJSON', () => {
    const a = SprintIssue.create({ issueKey: 'K-1', summary: 's' });
    const b = SprintIssue.create({ issueKey: 'K-1', summary: 'other' });
    const c = SprintIssue.create({ issueKey: 'K-2', summary: 's' });
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    const j = a.toJSON();
    expect(j.issueKey).toBe('K-1');
    expect(j).toHaveProperty('isTodo');
  });
});
