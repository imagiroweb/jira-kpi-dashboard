/**
 * Logique pure de résolution de portée d'accès à la section Performance :
 * qui peut voir/gérer la fiche de qui. Portée globale = CTO (via
 * `Role.performanceGlobalAccess`) ou super_admin ; portée équipe = lead pour
 * les fiches dont l'équipe (au moment du cycle, `PerformanceReview.team`)
 * est une équipe où il figure dans `Team.leadIds`.
 */

export interface PerformanceScopeActor {
  isSuperAdmin: boolean;
  performanceGlobalAccess: boolean;
  /** Ids (string) des équipes où l'acteur figure dans `leadIds`. */
  leadTeamIds: string[];
}

/** Portée globale (CTO/super_admin) : voit et peut gérer les fiches de n'importe qui. */
export function hasGlobalPerformanceAccess(
  actor: Pick<PerformanceScopeActor, 'isSuperAdmin' | 'performanceGlobalAccess'>
): boolean {
  return actor.isSuperAdmin || actor.performanceGlobalAccess;
}

/**
 * L'acteur peut-il accéder à une fiche dont l'équipe (snapshot du cycle) est
 * `reviewTeamId` ? `reviewTeamId` peut être absent (fiche créée avant tout
 * rattachement d'équipe) — dans ce cas, seule la portée globale y donne accès.
 */
export function canAccessReviewForTeam(
  actor: PerformanceScopeActor,
  reviewTeamId: string | null | undefined
): boolean {
  if (hasGlobalPerformanceAccess(actor)) return true;
  if (!reviewTeamId) return false;
  return actor.leadTeamIds.includes(reviewTeamId);
}

/** Le rôle (`IReviewAuthor.role`) à attribuer à l'acteur pour une action sur la fiche de `reviewTeamId`. */
export function resolveAuthorRole(
  actor: PerformanceScopeActor,
  reviewTeamId: string | null | undefined
): 'cto' | 'lead' | 'collaborateur' {
  if (hasGlobalPerformanceAccess(actor)) return 'cto';
  if (reviewTeamId && actor.leadTeamIds.includes(reviewTeamId)) return 'lead';
  return 'collaborateur';
}
