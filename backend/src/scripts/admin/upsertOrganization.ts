import { Organization, isTenantId } from '../../domain/organization/entities/Organization';
import { normalizeEmailDomains } from '../../domain/organization/emailDomain';
import { parseArgs, parseBool, runWithMongo } from './cli';

/**
 * Crée ou met à jour une organisation (onboarding d'une nouvelle entreprise, ajout de son tenant SSO).
 * Réservé à l'administrateur de la plateforme (accès au serveur / à MONGODB_URI).
 *
 * Usage :
 *   yarn organization:upsert --slug adoria --name "Adoria" \
 *     --tenant <GUID Entra ID> --domains adoria.com,imagiro.fr --allow-local false
 *   (en production : node dist/scripts/admin/upsertOrganization.js …)
 *
 * Options : --slug (requis) --name --tenant --domains --allow-local true|false --active true|false
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = typeof args.slug === 'string' ? args.slug.trim().toLowerCase() : '';
  if (!slug) throw new Error('--slug requis');

  const update: Record<string, unknown> = {};
  if (typeof args.name === 'string') update.name = args.name.trim();
  if (typeof args.tenant === 'string') {
    if (!isTenantId(args.tenant)) throw new Error('--tenant doit être le GUID du tenant Entra ID');
    update.sso = [{ provider: 'microsoft', tenantId: args.tenant.trim().toLowerCase() }];
  }
  if (typeof args.domains === 'string') update.allowedEmailDomains = normalizeEmailDomains(args.domains);
  const allowLocal = parseBool(args['allow-local']);
  if (allowLocal !== undefined) update.allowLocalAccounts = allowLocal;
  const active = parseBool(args.active);
  if (active !== undefined) update.isActive = active;

  const existing = await Organization.findOne({ slug });
  if (!existing && !update.name) throw new Error('--name requis pour créer une organisation');

  const org = await Organization.findOneAndUpdate(
    { slug },
    { $set: { slug, ...update } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  console.log(
    `${existing ? 'Organisation mise à jour' : 'Organisation créée'} : ${org.slug} (${org.name}) — ` +
      `tenant: ${org.sso[0]?.tenantId ?? 'aucun'}, domaines: ${org.allowedEmailDomains.join(', ') || 'aucune restriction'}, ` +
      `comptes locaux: ${org.allowLocalAccounts ? 'oui' : 'non'}, active: ${org.isActive ? 'oui' : 'non'}`
  );
}

void runWithMongo(main);
