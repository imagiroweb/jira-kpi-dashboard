/**
 * Page « Coûts horaires » (issue #44) : qui y figure et qui y a accès, sans accès base de données.
 */

/**
 * Un utilisateur figure dans la liste des coûts s'il se connecte par SSO Microsoft, ou si un super
 * admin l'y a ajouté manuellement (compte non SSO). Seuls ces utilisateurs comptent dans les coûts.
 */
export function isInCostList(user: { provider?: string; includedInCosts?: boolean }): boolean {
  return user.provider === 'microsoft' || user.includedInCosts === true;
}

/**
 * Accès aux coûts (page « Coûts horaires » et coûts du Suivi épic) : super admin, ou rôle dont la
 * page `couts` est visible (ex. Finance).
 */
export function hasCostAccess(actor: { isSuperAdmin: boolean; pageVisibilities?: { couts?: boolean } | null }): boolean {
  return actor.isSuperAdmin || actor.pageVisibilities?.couts === true;
}
