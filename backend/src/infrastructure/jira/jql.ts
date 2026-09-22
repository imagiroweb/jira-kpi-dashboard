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
