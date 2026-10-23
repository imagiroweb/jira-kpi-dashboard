import { Role } from '../../domain/user/entities/Role';
import { logger } from '../../utils/logger';

/** Nom de rôle de lead : le mot « lead » ou « leads » (ex. « Lead dev », « Tech leads », pas « Leadership »). */
export const LEAD_ROLE_NAME = /\bleads?\b/i;

/**
 * Page « Suivi WIP » (issue #79) visible par les leads dev, PO et dev. Les rôles Dev et PO sont semés
 * au démarrage ; un rôle personnalisé dont le nom contient le mot « lead » et créé avant l'ajout de la page
 * la reçoit une seule fois (tant que le champ est absent). Un réglage fait ensuite dans la gestion
 * des rôles n'est jamais écrasé.
 */
export async function grantWipPageToLeadRoles(): Promise<number> {
  const res = await Role.updateMany(
    { name: LEAD_ROLE_NAME, 'pageVisibilities.wip': { $exists: false } },
    { $set: { 'pageVisibilities.wip': true } }
  );
  const count = res.modifiedCount ?? 0;
  if (count > 0) logger.info(`Page Suivi WIP activée pour ${count} rôle(s) de lead`);
  return count;
}
