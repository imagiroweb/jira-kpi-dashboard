/**
 * Agrégation de l'indicateur US Claude / non Claude (issue #39), sans appel réseau.
 */

export interface ClaudeUsCounts {
  claudeCount: number;
  nonClaudeCount: number;
  totalCount: number;
  /** % d'US Claude, arrondi à 0,1. */
  claudePercent: number;
}

export interface ClaudeUsBoardKeys {
  id: number;
  name: string;
  /** Clés des US terminées sur la période dans le périmètre du board. */
  allKeys: string[];
  /** Sous-ensemble identifié « Claude ». */
  claudeKeys: string[];
}

export function claudeUsCounts(totalCount: number, claudeCount: number): ClaudeUsCounts {
  return {
    claudeCount,
    nonClaudeCount: Math.max(0, totalCount - claudeCount),
    totalCount,
    claudePercent: totalCount > 0 ? Math.round((claudeCount / totalCount) * 1000) / 10 : 0,
  };
}

/**
 * Compteurs par board (équipe) et totaux. Les totaux sont dédoublonnés sur les clés :
 * une US visible dans deux boards n'est comptée qu'une fois.
 */
export function aggregateClaudeUsByBoard(boards: ClaudeUsBoardKeys[]): {
  totals: ClaudeUsCounts;
  byTeam: Array<{ id: number; name: string } & ClaudeUsCounts>;
} {
  const allKeys = new Set<string>();
  const claudeKeys = new Set<string>();
  const byTeam = boards.map((b) => {
    b.allKeys.forEach((k) => allKeys.add(k));
    b.claudeKeys.forEach((k) => claudeKeys.add(k));
    return { id: b.id, name: b.name, ...claudeUsCounts(b.allKeys.length, b.claudeKeys.length) };
  });
  return { totals: claudeUsCounts(allKeys.size, claudeKeys.size), byTeam };
}

/** Entrée d'historique Jira réduite à ce qui sert ici. */
export interface LabelChangeHistory {
  created: string;
  items: Array<{ field?: string; fieldId?: string; fromString?: string | null; toString?: string | null }>;
}

const splitLabels = (v: string | null | undefined) => (v ?? '').split(/\s+/).filter(Boolean);

/**
 * Date de l'ajout du label d'après l'historique : dernier ajout (si le label a été retiré puis remis,
 * c'est l'ajout qui explique sa présence actuelle). null si l'historique ne contient pas d'ajout.
 */
export function findLabelAddedDate(histories: LabelChangeHistory[], label: string): string | null {
  let latest: string | null = null;
  for (const h of histories) {
    const added = h.items.some(
      (it) =>
        (it.fieldId ?? it.field) === 'labels' &&
        splitLabels(it.toString).includes(label) &&
        !splitLabels(it.fromString).includes(label)
    );
    if (added && (latest === null || new Date(h.created).getTime() > new Date(latest).getTime())) latest = h.created;
  }
  return latest;
}

/** Ligne du détail d'un encart US Claude. */
export interface ClaudeUsIssueRow {
  key: string;
  summary: string;
  status: string;
  created: string | null;
  /** Date de résolution Jira, sinon date de passage dans la catégorie Done. */
  resolved: string | null;
  isClaude: boolean;
  /** Date d'ajout du label Claude (null si absent ou non trouvé dans l'historique). */
  labelAddedAt: string | null;
}

/** Transforme un ticket Jira brut (champs de recherche) en ligne de détail. */
export function toClaudeUsIssueRow(
  issue: { key: string; fields: Record<string, unknown> },
  isClaude: boolean,
  labelAddedAt: string | null
): ClaudeUsIssueRow {
  const f = issue.fields;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const status = f.status as { name?: string; statusCategory?: { key?: string } } | undefined;
  const isDone = status?.statusCategory?.key === 'done';
  return {
    key: issue.key,
    summary: str(f.summary) ?? '',
    status: status?.name ?? '',
    created: str(f.created),
    resolved: str(f.resolutiondate) ?? (isDone ? str(f.statuscategorychangedate) : null),
    isClaude,
    labelAddedAt,
  };
}
