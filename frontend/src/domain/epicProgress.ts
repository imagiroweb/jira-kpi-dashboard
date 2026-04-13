import type { EpicChildIssue } from '../services/api';

/** Préfixes de tickets (ex. INT-123, FAC-456) pour le filtre */
export const TICKET_PREFIXES = ['INT', 'FAC', 'CLI', 'OPT', 'NIM'] as const;
export type TicketPrefixFilter = (typeof TICKET_PREFIXES)[number] | 'all';

/** Répartition par catégorie Jira : Done (fini) / To Do (à faire) / In Progress (en cours). */
export type TicketStatusBreakdown = { done: number; todo: number; inProgress: number };

export function ticketStatusPercents(b: TicketStatusBreakdown): { done: number; todo: number; inProgress: number } {
  const t = b.done + b.todo + b.inProgress;
  if (t <= 0) return { done: 0, todo: 0, inProgress: 0 };
  let done = Math.round((100 * b.done) / t);
  let todo = Math.round((100 * b.todo) / t);
  let ip = Math.round((100 * b.inProgress) / t);
  const sum = done + todo + ip;
  if (sum !== 100) ip += 100 - sum;
  return { done, todo, inProgress: ip };
}

/** Compte les feuilles de l’arbre (sous-tickets sans enfants) ou le nœud seul. */
export function countLeafTicketsByStatus(items: EpicChildIssue[]): TicketStatusBreakdown {
  let done = 0;
  let todo = 0;
  let inProgress = 0;
  for (const item of items) {
    if (item.children && item.children.length > 0) {
      const sub = countLeafTicketsByStatus(item.children);
      done += sub.done;
      todo += sub.todo;
      inProgress += sub.inProgress;
    } else {
      const k = item.statusCategoryKey;
      if (k === 'done') done += 1;
      else if (k === 'new') todo += 1;
      else inProgress += 1;
    }
  }
  return { done, todo, inProgress };
}

/**
 * Story points du nœud + sous-arbre : chaque ticket (US, sous-ticket…) contribue ses propres points
 * selon son statut. Les points sur une US parente ne sont pas perdus lorsque les feuilles n’ont pas de SP.
 */
export function aggregateStoryPointsForNode(node: EpicChildIssue): TicketStatusBreakdown {
  const sp = node.storyPoints ?? 0;
  const k = node.statusCategoryKey;
  let done = 0;
  let todo = 0;
  let inProgress = 0;
  if (k === 'done') done += sp;
  else if (k === 'new') todo += sp;
  else inProgress += sp;
  if (node.children?.length) {
    for (const c of node.children) {
      const sub = aggregateStoryPointsForNode(c);
      done += sub.done;
      todo += sub.todo;
      inProgress += sub.inProgress;
    }
  }
  return { done, todo, inProgress };
}

/** Agrégat sur les racines affichées (enfants directs de l’epic / legend). */
export function aggregateStoryPointsFromRoots(items: EpicChildIssue[]): TicketStatusBreakdown {
  let done = 0;
  let todo = 0;
  let inProgress = 0;
  for (const item of items) {
    const sub = aggregateStoryPointsForNode(item);
    done += sub.done;
    todo += sub.todo;
    inProgress += sub.inProgress;
  }
  return { done, todo, inProgress };
}

function flattenIssueTree(nodes: EpicChildIssue[]): EpicChildIssue[] {
  const out: EpicChildIssue[] = [];
  function walk(n: EpicChildIssue) {
    out.push(n);
    n.children?.forEach(walk);
  }
  nodes.forEach(walk);
  return out;
}

export type StoryPointsDetailRow = {
  issueKey: string;
  summary: string;
  issueType: string;
  status: string;
  storyPoints: number;
  statusCategoryKey: string | null;
};

/** Détails pour la modale : reste à faire → en cours → terminé ; tri par pts puis clé. */
export function buildStoryPointsDetailRows(roots: EpicChildIssue[]): {
  todo: StoryPointsDetailRow[];
  inProgress: StoryPointsDetailRow[];
  done: StoryPointsDetailRow[];
} {
  const flat = flattenIssueTree(roots);
  const todo: StoryPointsDetailRow[] = [];
  const inProgress: StoryPointsDetailRow[] = [];
  const done: StoryPointsDetailRow[] = [];
  for (const n of flat) {
    const row: StoryPointsDetailRow = {
      issueKey: n.issueKey,
      summary: n.summary,
      issueType: n.issueType,
      status: n.status,
      storyPoints: n.storyPoints ?? 0,
      statusCategoryKey: n.statusCategoryKey,
    };
    if (n.statusCategoryKey === 'done') done.push(row);
    else if (n.statusCategoryKey === 'new') todo.push(row);
    else inProgress.push(row);
  }
  const sortRows = (a: StoryPointsDetailRow, b: StoryPointsDetailRow) =>
    b.storyPoints - a.storyPoints || a.issueKey.localeCompare(b.issueKey, 'fr');
  todo.sort(sortRows);
  inProgress.sort(sortRows);
  done.sort(sortRows);
  return { todo, inProgress, done };
}
