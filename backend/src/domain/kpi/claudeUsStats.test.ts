import { aggregateClaudeUsByBoard, claudeUsCounts, findLabelAddedDate, toClaudeUsIssueRow } from './claudeUsStats';

describe('claudeUsCounts', () => {
  it('calcule non Claude et le pourcentage arrondi à 0,1', () => {
    expect(claudeUsCounts(3, 1)).toEqual({ claudeCount: 1, nonClaudeCount: 2, totalCount: 3, claudePercent: 33.3 });
  });

  it('retourne 0 % sans US', () => {
    expect(claudeUsCounts(0, 0).claudePercent).toBe(0);
  });
});

describe('aggregateClaudeUsByBoard', () => {
  it('donne le détail par équipe et des totaux dédoublonnés', () => {
    const { totals, byTeam } = aggregateClaudeUsByBoard([
      { id: 810, name: 'Choco', allKeys: ['A-1', 'A-2', 'A-3'], claudeKeys: ['A-1'] },
      { id: 843, name: 'Cook', allKeys: ['A-3', 'A-4'], claudeKeys: ['A-4'] },
    ]);

    expect(byTeam).toEqual([
      { id: 810, name: 'Choco', claudeCount: 1, nonClaudeCount: 2, totalCount: 3, claudePercent: 33.3 },
      { id: 843, name: 'Cook', claudeCount: 1, nonClaudeCount: 1, totalCount: 2, claudePercent: 50 },
    ]);
    expect(totals).toEqual({ claudeCount: 2, nonClaudeCount: 2, totalCount: 4, claudePercent: 50 });
  });
});

describe('findLabelAddedDate', () => {
  const change = (created: string, fromString: string | null, toString: string | null, fieldId = 'labels') => ({
    created,
    items: [{ fieldId, fromString, toString }],
  });

  it("retourne la date de l'ajout du label", () => {
    expect(
      findLabelAddedDate([change('2026-07-10T10:00:00.000+0200', 'front', 'front claude-us')], 'claude-us')
    ).toBe('2026-07-10T10:00:00.000+0200');
  });

  it("ignore les autres champs et les modifications qui n'ajoutent pas le label", () => {
    expect(
      findLabelAddedDate(
        [
          change('2026-07-10T10:00:00.000+0200', 'claude-us', 'claude-us front'),
          change('2026-07-11T10:00:00.000+0200', null, 'claude-us', 'summary'),
        ],
        'claude-us'
      )
    ).toBeNull();
  });

  it('retient le dernier ajout si le label a été retiré puis remis', () => {
    expect(
      findLabelAddedDate(
        [
          change('2026-07-01T10:00:00.000+0200', null, 'claude-us'),
          change('2026-07-05T10:00:00.000+0200', 'claude-us', null),
          change('2026-08-01T10:00:00.000+0200', null, 'claude-us'),
        ],
        'claude-us'
      )
    ).toBe('2026-08-01T10:00:00.000+0200');
  });

  it("ne confond pas un label qui contient le nom d'un autre", () => {
    expect(findLabelAddedDate([change('2026-07-01', null, 'claude-us-old')], 'claude-us')).toBeNull();
  });
});

describe('toClaudeUsIssueRow', () => {
  it('prend la date de résolution, sinon la date de passage à Done', () => {
    const base = {
      summary: 'Titre',
      created: '2026-01-15T09:00:00.000+0100',
      statuscategorychangedate: '2026-08-02T09:00:00.000+0200',
    };
    const done = { name: 'Terminé', statusCategory: { key: 'done' } };

    expect(
      toClaudeUsIssueRow({ key: 'AD-1', fields: { ...base, status: done, resolutiondate: '2026-08-01T09:00:00.000+0200' } }, true, null)
    ).toEqual({
      key: 'AD-1',
      summary: 'Titre',
      status: 'Terminé',
      created: '2026-01-15T09:00:00.000+0100',
      resolved: '2026-08-01T09:00:00.000+0200',
      isClaude: true,
      labelAddedAt: null,
    });
    expect(toClaudeUsIssueRow({ key: 'AD-2', fields: { ...base, status: done } }, false, null).resolved).toBe(
      '2026-08-02T09:00:00.000+0200'
    );
    expect(
      toClaudeUsIssueRow({ key: 'AD-3', fields: { ...base, status: { name: 'En cours', statusCategory: { key: 'indeterminate' } } } }, false, null)
        .resolved
    ).toBeNull();
  });
});
