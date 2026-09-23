/**
 * Utilitaires JQL purs (sans appel réseau), partagés entre repositories et services.
 */

/** Sépare le ORDER BY d'une JQL pour pouvoir ajouter des conditions avant (JQL valide). */
export function stripOrderBy(jql: string): { base: string; orderBy: string } {
  const orderByIdx = jql.toUpperCase().lastIndexOf(' ORDER BY ');
  if (orderByIdx === -1) {
    const trimmed = jql.trim();
    // JQL composée uniquement d'un ORDER BY (ex. "ORDER BY Rank ASC")
    if (trimmed.toUpperCase().startsWith('ORDER BY ')) return { base: '', orderBy: trimmed };
    return { base: trimmed, orderBy: '' };
  }
  return {
    base: jql.substring(0, orderByIdx).trim(),
    orderBy: jql.substring(orderByIdx).trim()
  };
}

/** Conditions "backlog" : hors de tout sprint et non terminé. */
export const BACKLOG_CONDITIONS = 'Sprint is EMPTY AND statusCategory != Done';

/**
 * JQL du backlog d'un board, alignée sur la section "Backlog" de Jira :
 * - périmètre = filtre du board (et non tout le projet, partagé par plusieurs équipes),
 * - hors sprint (les sprints futurs sont affichés à part dans Jira),
 * - sous-tâches exclues (Jira ne les liste pas comme lignes du backlog).
 * Retourne null si le filtre ne contient aucune condition exploitable.
 */
export function buildBoardBacklogJql(boardFilterJql: string): string | null {
  const { base } = stripOrderBy(boardFilterJql);
  if (!base) return null;
  return `(${base}) AND ${BACKLOG_CONDITIONS} AND issuetype not in subTaskIssueTypes() ORDER BY created DESC`;
}

/** JQL de repli (ancien comportement) : backlog de tout le projet. */
export function buildProjectBacklogJql(projectKey: string): string {
  return `project = "${projectKey}" AND ${BACKLOG_CONDITIONS} ORDER BY created DESC`;
}

export type QuarterKey = 'Q1' | 'Q2' | 'Q3' | 'Q4';

/** Période [from, toExclusive) d'un trimestre (ou de l'année entière si quarter = 'all'), dates YYYY-MM-DD. */
export function quarterDateRange(year: number, quarter: QuarterKey | 'all'): { from: string; toExclusive: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  if (quarter === 'all') return { from: `${year}-01-01`, toExclusive: `${year + 1}-01-01` };
  const q = Number(quarter.slice(1));
  const startMonth = (q - 1) * 3 + 1;
  const from = `${year}-${pad(startMonth)}-01`;
  const toExclusive = q === 4 ? `${year + 1}-01-01` : `${year}-${pad(startMonth + 3)}-01`;
  return { from, toExclusive };
}

/**
 * Union des filtres de plusieurs boards (ORDER BY retirés), pour restreindre une JQL
 * au périmètre des boards plutôt qu'à tout l'espace. Retourne null si aucun filtre exploitable.
 */
export function combineBoardFiltersJql(filterJqls: string[]): string | null {
  const bases = filterJqls.map((f) => stripOrderBy(f).base).filter(Boolean);
  if (bases.length === 0) return null;
  return bases.length === 1 ? `(${bases[0]})` : `(${bases.map((b) => `(${b})`).join(' OR ')})`;
}

/** US passées à Done sur la période, ou US créées sur la période (quel que soit leur statut). */
export type ClaudeUsBasis = 'done' | 'created';

export interface ClaudeUsJqlOptions {
  /** Défaut : 'done'. */
  basis?: ClaudeUsBasis;
  /** Périmètre (ex. union des filtres des boards) ; prioritaire sur projectKeys. */
  scopeJql?: string | null;
  /** Clés projet, utilisées si scopeJql est absent (vide = pas de restriction projet). */
  projectKeys: string[];
  /** Types de ticket comptés comme US (ex. ["US"]). */
  issueTypes: string[];
  /** Label identifiant les US réalisées avec Claude (ignoré si filterId est défini). */
  label: string;
  /** Filtre Jira identifiant les US Claude (prioritaire sur le label). */
  filterId?: string | null;
  /** Période (passage à Done ou création selon basis) : [from, toExclusive), YYYY-MM-DD. */
  from: string;
  toExclusive: string;
}

const quoteJql = (v: string) => `"${v.replace(/"/g, '')}"`;

/**
 * JQL des US passées à Done (ou créées) sur la période : toutes, et celles identifiées « Claude »
 * (label ou filtre Jira). Le nombre d'US non Claude est calculé comme total − claude.
 */
export function buildClaudeUsJql(opts: ClaudeUsJqlOptions): { allJql: string; claudeJql: string } {
  const conditions: string[] = [];
  if (opts.scopeJql) conditions.push(opts.scopeJql);
  else if (opts.projectKeys.length > 0) conditions.push(`project in (${opts.projectKeys.map(quoteJql).join(', ')})`);
  if (opts.issueTypes.length > 0) conditions.push(`issuetype in (${opts.issueTypes.map(quoteJql).join(', ')})`);
  const dateField = opts.basis === 'created' ? 'created' : 'statusCategoryChangedDate';
  if (opts.basis !== 'created') conditions.push('statusCategory = Done');
  conditions.push(`${dateField} >= "${opts.from.replace(/-/g, '/')}"`);
  conditions.push(`${dateField} < "${opts.toExclusive.replace(/-/g, '/')}"`);
  const allJql = conditions.join(' AND ');
  const filterId = (opts.filterId ?? '').trim();
  const claudeCondition = filterId ? `filter = ${quoteJql(filterId)}` : `labels = ${quoteJql(opts.label)}`;
  return { allJql, claudeJql: `${allJql} AND ${claudeCondition}` };
}
