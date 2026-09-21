/**
 * Logique métier pure du rattachement d'un collaborateur à une équipe.
 *
 * Règles (cf. décision produit) :
 * - Le CTO/super_admin peut rattacher n'importe qui à n'importe quelle équipe,
 *   ou le détacher (teamId = null).
 * - Un lead avec `canManageTeamAssignment` peut seulement rattacher un
 *   collaborateur à SA PROPRE équipe (une équipe où il figure dans
 *   `leadIds`) ; il ne peut ni détacher quelqu'un (teamId = null), ni
 *   toucher aux autres équipes, ni déplacer un lead d'équipe.
 * - Sans `canManageTeamAssignment` ni accès global, aucune action n'est permise.
 */

export interface TeamAssignmentActor {
  isSuperAdmin: boolean;
  /** `Role.performanceGlobalAccess` du rôle de l'acteur (portée CTO). */
  performanceGlobalAccess: boolean;
  /** Droit délégué par le CTO/super_admin — voir `User.canManageTeamAssignment`. */
  canManageTeamAssignment: boolean;
  /** Ids (string) des équipes où l'acteur figure dans `leadIds`. */
  leadTeamIds: string[];
}

export interface TeamAssignmentTarget {
  /** Le collaborateur ciblé est-il lead d'au moins une équipe ? */
  isLeadOfAnyTeam: boolean;
}

export type TeamAssignmentDecision = { allowed: true } | { allowed: false; reason: string };

/** Portée globale sur la gestion des équipes (création, renommage, leads) : CTO/super_admin. */
export function hasGlobalTeamManagementAccess(
  actor: Pick<TeamAssignmentActor, 'isSuperAdmin' | 'performanceGlobalAccess'>
): boolean {
  return actor.isSuperAdmin || actor.performanceGlobalAccess;
}

/**
 * Décide si `actor` peut rattacher le collaborateur `target` à l'équipe
 * `requestedTeamId` (`null` = détacher / retirer de son équipe actuelle).
 */
export function canAssignUserToTeam(
  actor: TeamAssignmentActor,
  target: TeamAssignmentTarget,
  requestedTeamId: string | null
): TeamAssignmentDecision {
  if (hasGlobalTeamManagementAccess(actor)) {
    return { allowed: true };
  }

  if (!actor.canManageTeamAssignment) {
    return {
      allowed: false,
      reason: "Vous n'avez pas le droit de rattacher un collaborateur à une équipe"
    };
  }

  if (requestedTeamId === null) {
    return {
      allowed: false,
      reason: 'Seuls le CTO ou un administrateur peuvent détacher un collaborateur de son équipe'
    };
  }

  if (!actor.leadTeamIds.includes(requestedTeamId)) {
    return {
      allowed: false,
      reason: "Vous ne pouvez rattacher un collaborateur qu'à votre propre équipe"
    };
  }

  if (target.isLeadOfAnyTeam) {
    return {
      allowed: false,
      reason: "Vous ne pouvez pas déplacer un lead d'équipe"
    };
  }

  return { allowed: true };
}
