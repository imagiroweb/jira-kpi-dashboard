import { stripOrderBy, buildBoardBacklogJql, buildProjectBacklogJql, quarterDateRange, buildClaudeUsJql, combineBoardFiltersJql } from './jql';

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

describe('quarterDateRange', () => {
  it('calcule les bornes des trimestres', () => {
    expect(quarterDateRange(2026, 'Q1')).toEqual({ from: '2026-01-01', toExclusive: '2026-04-01' });
    expect(quarterDateRange(2026, 'Q3')).toEqual({ from: '2026-07-01', toExclusive: '2026-10-01' });
    expect(quarterDateRange(2026, 'Q4')).toEqual({ from: '2026-10-01', toExclusive: '2027-01-01' });
  });

  it("couvre l'année entière pour 'all'", () => {
    expect(quarterDateRange(2026, 'all')).toEqual({ from: '2026-01-01', toExclusive: '2027-01-01' });
  });
});

describe('buildClaudeUsJql', () => {
  const base = {
    projectKeys: ['ADORIA26'],
    issueTypes: ['US'],
    label: 'claude-us',
    from: '2026-07-01',
    toExclusive: '2026-10-01',
  };

  it('restreint aux US passées à Done sur la période et ajoute le label Claude', () => {
    const { allJql, claudeJql, nonClaudeJql } = buildClaudeUsJql(base);
    expect(allJql).toBe(
      'project in ("ADORIA26") AND issuetype in ("US") AND statusCategory = Done ' +
        'AND statusCategoryChangedDate >= "2026/07/01" AND statusCategoryChangedDate < "2026/10/01"'
    );
    expect(claudeJql).toBe(`${allJql} AND labels = "claude-us"`);
    expect(nonClaudeJql).toBe(`${allJql} AND (labels is EMPTY OR labels != "claude-us")`);
  });

  it("porte sur la date de création, sans condition de statut, pour basis = 'created'", () => {
    const { allJql, claudeJql } = buildClaudeUsJql({ ...base, basis: 'created' });
    expect(allJql).toBe(
      'project in ("ADORIA26") AND issuetype in ("US") AND created >= "2026/07/01" AND created < "2026/10/01"'
    );
    expect(claudeJql).toBe(`${allJql} AND labels = "claude-us"`);
  });

  it('utilise le filtre Jira à la place du label quand il est fourni', () => {
    const { allJql, claudeJql, nonClaudeJql } = buildClaudeUsJql({ ...base, filterId: ' 12345 ' });
    expect(claudeJql).toBe(`${allJql} AND filter = "12345"`);
    expect(nonClaudeJql).toBe(`${allJql} AND filter != "12345"`);
  });

  it('omet la restriction projet si aucune clé', () => {
    const { allJql } = buildClaudeUsJql({ ...base, projectKeys: [] });
    expect(allJql.startsWith('issuetype in ("US")')).toBe(true);
  });
});

describe('combineBoardFiltersJql', () => {
  it('unit les filtres des boards sans leur ORDER BY', () => {
    expect(
      combineBoardFiltersJql(['project = AD AND team = Choco ORDER BY Rank ASC', 'project = AD AND team = Cook'])
    ).toBe('((project = AD AND team = Choco) OR (project = AD AND team = Cook))');
  });

  it('retourne un seul filtre entre parenthèses et null sans filtre exploitable', () => {
    expect(combineBoardFiltersJql(['labels = a OR labels = b'])).toBe('(labels = a OR labels = b)');
    expect(combineBoardFiltersJql(['ORDER BY Rank ASC'])).toBeNull();
    expect(combineBoardFiltersJql([])).toBeNull();
  });

  it('remplace la restriction projet dans buildClaudeUsJql', () => {
    const { allJql } = buildClaudeUsJql({
      scopeJql: '((team = Choco) OR (team = Cook))',
      projectKeys: ['ADORIA26'],
      issueTypes: ['US'],
      label: 'claude-us',
      from: '2026-07-01',
      toExclusive: '2026-10-01',
    });
    expect(allJql.startsWith('((team = Choco) OR (team = Cook)) AND issuetype in ("US")')).toBe(true);
    expect(allJql).not.toContain('project in');
  });
});
