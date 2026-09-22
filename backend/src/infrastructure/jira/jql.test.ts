import { stripOrderBy, buildBoardBacklogJql, buildProjectBacklogJql } from './jql';

describe('jql utils', () => {
  it('stripOrderBy sépare la clause ORDER BY', () => {
    expect(stripOrderBy('project = AD AND team = Choco ORDER BY Rank ASC')).toEqual({
      base: 'project = AD AND team = Choco',
      orderBy: 'ORDER BY Rank ASC'
    });
    expect(stripOrderBy('project = AD order by created')).toEqual({ base: 'project = AD', orderBy: 'order by created' });
    expect(stripOrderBy('  project = AD  ')).toEqual({ base: 'project = AD', orderBy: '' });
    expect(stripOrderBy('ORDER BY Rank ASC')).toEqual({ base: '', orderBy: 'ORDER BY Rank ASC' });
  });

  it('buildBoardBacklogJql combine le filtre du board avec les conditions backlog', () => {
    expect(buildBoardBacklogJql('project = AD AND "Team[Team]" = 42 ORDER BY Rank ASC')).toBe(
      '(project = AD AND "Team[Team]" = 42) AND Sprint is EMPTY AND statusCategory != Done ' +
        'AND issuetype not in subTaskIssueTypes() ORDER BY created DESC'
    );
  });

  it('buildBoardBacklogJql protège un filtre avec OR par des parenthèses', () => {
    const jql = buildBoardBacklogJql('component = Choco OR labels = choco');
    expect(jql).toMatch(/^\(component = Choco OR labels = choco\) AND Sprint is EMPTY/);
  });

  it('buildBoardBacklogJql retourne null si le filtre est vide ou ne contient qu’un ORDER BY', () => {
    expect(buildBoardBacklogJql('')).toBeNull();
    expect(buildBoardBacklogJql('ORDER BY Rank ASC')).toBeNull();
  });

  it('buildProjectBacklogJql conserve le comportement historique', () => {
    expect(buildProjectBacklogJql('AD')).toBe(
      'project = "AD" AND Sprint is EMPTY AND statusCategory != Done ORDER BY created DESC'
    );
  });
});
