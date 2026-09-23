import { User } from '../../domain/user/entities/User';
import { Role } from '../../domain/user/entities/Role';
import type { AppUserForMatching } from '../../domain/kpi/epicTimeByUser';
import { hasCostAccess, isInCostList } from '../../domain/user/costList';
import type { HourlyRate } from '../../domain/user/hourlyRates';

/**
 * Utilisateurs de l'app avec le nom de leur rôle et leur coût horaire, pour retrouver le poste
 * d'un auteur Jira (issue #44). Inclut les comptes inactifs : leur temps reste imputé à une épic.
 * Les coûts horaires ne sont retenus que pour les utilisateurs de la liste des coûts (SSO ou ajoutés).
 */
export async function loadAppUsersForMatching(): Promise<AppUserForMatching[]> {
  const users = await User.find()
    .select('email firstName lastName role roleId hourlyRates provider includedInCosts')
    .populate('roleId', 'name')
    .lean<
      Array<{
        email: string;
        firstName?: string;
        lastName?: string;
        role?: string;
        roleId?: { name?: string } | null;
        hourlyRates?: HourlyRate[];
        provider?: string;
        includedInCosts?: boolean;
      }>
    >();
  return users.map((u) => ({
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    roleName: u.roleId?.name ?? (u.role === 'super_admin' ? 'Super admin' : null),
    hourlyRates: isInCostList(u) ? (u.hourlyRates ?? []) : [],
  }));
}

/** Droits d'un utilisateur sur les coûts : accès (super admin ou page « Coûts horaires ») et gestion de la liste (super admin). */
export async function getCostActor(userId: string): Promise<{ hasAccess: boolean; isSuperAdmin: boolean }> {
  const user = await User.findById(userId).select('role roleId').lean<{ role?: string; roleId?: unknown } | null>();
  if (!user) return { hasAccess: false, isSuperAdmin: false };
  const isSuperAdmin = user.role === 'super_admin';
  if (isSuperAdmin || !user.roleId) return { hasAccess: isSuperAdmin, isSuperAdmin };
  const role = await Role.findById(user.roleId)
    .select('pageVisibilities')
    .lean<{ pageVisibilities?: { couts?: boolean } } | null>();
  return { hasAccess: hasCostAccess({ isSuperAdmin, pageVisibilities: role?.pageVisibilities }), isSuperAdmin };
}

/** Accès aux coûts : super admin, ou rôle dont la page « Coûts horaires » est visible (ex. Finance). */
export async function userHasCostAccess(userId: string): Promise<boolean> {
  return (await getCostActor(userId)).hasAccess;
}
