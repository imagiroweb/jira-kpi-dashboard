import { describe, expect, it } from 'vitest';
import type { EpicChildIssue } from '../services/api';
import {
  aggregateStoryPointsForNode,
  aggregateStoryPointsFromRoots,
  buildStoryPointsDetailRows,
  countLeafTicketsByStatus,
  ticketStatusPercents,
} from './epicProgress';

function issue(partial: Partial<EpicChildIssue> & Pick<EpicChildIssue, 'issueKey'>): EpicChildIssue {
  const base: EpicChildIssue = {
    issueKey: partial.issueKey,
    summary: '',
    issueType: 'Story',
    status: 'Open',
    statusCategoryKey: null,
    originalEstimateSeconds: 0,
    timeSpentSeconds: 0,
    storyPoints: null,
    parentKey: null,
    hierarchyLevel: 0,
  };
  return { ...base, ...partial };
}

describe('ticketStatusPercents', () => {
  it('retourne des zéros si le total est nul', () => {
    expect(ticketStatusPercents({ done: 0, todo: 0, inProgress: 0 })).toEqual({
      done: 0,
      todo: 0,
      inProgress: 0,
    });
  });

  it('répartit 100 % sur une seule catégorie', () => {
    expect(ticketStatusPercents({ done: 5, todo: 0, inProgress: 0 })).toEqual({
      done: 100,
      todo: 0,
      inProgress: 0,
    });
  });

  it('ajuste le dernier segment pour que la somme fasse 100', () => {
    const p = ticketStatusPercents({ done: 1, todo: 1, inProgress: 1 });
    expect(p.done + p.todo + p.inProgress).toBe(100);
  });
});

describe('countLeafTicketsByStatus', () => {
  it('compte une feuille par statut', () => {
    const tree: EpicChildIssue[] = [
      issue({ issueKey: 'A-1', statusCategoryKey: 'new' }),
      issue({ issueKey: 'A-2', statusCategoryKey: 'indeterminate' }),
      issue({ issueKey: 'A-3', statusCategoryKey: 'done' }),
    ];
    expect(countLeafTicketsByStatus(tree)).toEqual({ done: 1, todo: 1, inProgress: 1 });
  });

  it('agrège les feuilles sous les parents', () => {
    const tree: EpicChildIssue[] = [
      issue({
        issueKey: 'P',
        statusCategoryKey: 'new',
        children: [
          issue({ issueKey: 'C1', statusCategoryKey: 'done' }),
          issue({ issueKey: 'C2', statusCategoryKey: 'new' }),
        ],
      }),
    ];
    expect(countLeafTicketsByStatus(tree)).toEqual({ done: 1, todo: 1, inProgress: 0 });
  });
});

describe('aggregateStoryPointsForNode', () => {
  it('répartit les points du nœud selon son statut', () => {
    const n = issue({ issueKey: 'X-1', statusCategoryKey: 'new', storyPoints: 3 });
    expect(aggregateStoryPointsForNode(n)).toEqual({ done: 0, todo: 3, inProgress: 0 });
  });

  it('additionne les sous-arbres', () => {
    const n = issue({
      issueKey: 'P',
      statusCategoryKey: 'indeterminate',
      storyPoints: 2,
      children: [
        issue({ issueKey: 'C1', statusCategoryKey: 'done', storyPoints: 5 }),
        issue({ issueKey: 'C2', statusCategoryKey: 'new', storyPoints: 1 }),
      ],
    });
    expect(aggregateStoryPointsForNode(n)).toEqual({ done: 5, todo: 1, inProgress: 2 });
  });
});

describe('aggregateStoryPointsFromRoots', () => {
  it('somme plusieurs racines', () => {
    const roots: EpicChildIssue[] = [
      issue({ issueKey: 'A', statusCategoryKey: 'done', storyPoints: 2 }),
      issue({ issueKey: 'B', statusCategoryKey: 'new', storyPoints: 3 }),
    ];
    expect(aggregateStoryPointsFromRoots(roots)).toEqual({ done: 2, todo: 3, inProgress: 0 });
  });
});

describe('buildStoryPointsDetailRows', () => {
  it('retourne trois listes vides pour un arbre vide', () => {
    expect(buildStoryPointsDetailRows([])).toEqual({
      todo: [],
      inProgress: [],
      done: [],
    });
  });

  it('aplatit l’arbre et classe par catégorie Jira', () => {
    const roots: EpicChildIssue[] = [
      issue({
        issueKey: 'ROOT',
        statusCategoryKey: 'new',
        summary: 'R',
        children: [
          issue({ issueKey: 'CHILD', statusCategoryKey: 'done', summary: 'C', storyPoints: 1 }),
        ],
      }),
    ];
    const { todo, inProgress, done } = buildStoryPointsDetailRows(roots);
    expect(todo.map((r) => r.issueKey)).toEqual(['ROOT']);
    expect(inProgress).toHaveLength(0);
    expect(done.map((r) => r.issueKey)).toEqual(['CHILD']);
  });

  it('traite null / indeterminate comme « en cours »', () => {
    const roots: EpicChildIssue[] = [
      issue({ issueKey: 'N', statusCategoryKey: null, summary: 'x' }),
      issue({ issueKey: 'I', statusCategoryKey: 'indeterminate', summary: 'y' }),
    ];
    const { todo, inProgress } = buildStoryPointsDetailRows(roots);
    expect(todo).toHaveLength(0);
    expect(inProgress.map((r) => r.issueKey).sort()).toEqual(['I', 'N']);
  });

  it('trie par points décroissants puis clé (locale fr)', () => {
    const roots: EpicChildIssue[] = [
      issue({ issueKey: 'B-2', statusCategoryKey: 'new', storyPoints: 2 }),
      issue({ issueKey: 'A-1', statusCategoryKey: 'new', storyPoints: 2 }),
      issue({ issueKey: 'Z-9', statusCategoryKey: 'new', storyPoints: 5 }),
    ];
    const { todo } = buildStoryPointsDetailRows(roots);
    expect(todo.map((r) => r.issueKey)).toEqual(['Z-9', 'A-1', 'B-2']);
  });

  it('normalise storyPoints null en 0', () => {
    const roots: EpicChildIssue[] = [issue({ issueKey: 'X', statusCategoryKey: 'done', storyPoints: null })];
    const { done } = buildStoryPointsDetailRows(roots);
    expect(done[0].storyPoints).toBe(0);
  });
});
