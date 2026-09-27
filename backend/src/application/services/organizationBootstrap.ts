import { Organization, isTenantId } from '../../domain/organization/entities/Organization';
import { normalizeEmailDomains } from '../../domain/organization/emailDomain';
import { User } from '../../domain/user/entities/User';
import { logger } from '../../utils/logger';

/**
 * Amorçage de l'organisation par défaut (migration vers le multi-entreprises).
 *
 * Au démarrage : si aucune organisation n'existe, crée celle décrite par les variables
 * `DEFAULT_ORG_*` (Adoria), puis — tant qu'il n'existe qu'une seule organisation — y rattache
 * les utilisateurs qui n'en ont pas encore. Idempotent. Les organisations suivantes se créent
 * avec le script `organization:upsert`.
 */
export interface DefaultOrganizationConfig {
  name: string;
  slug: string;
  tenantId: string | null;
  allowedEmailDomains: string[];
  allowLocalAccounts: boolean;
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function readDefaultOrganizationConfig(env: NodeJS.ProcessEnv = process.env): DefaultOrganizationConfig {
  const name = (env.DEFAULT_ORG_NAME || 'Adoria').trim();
  const tenantCandidate = (env.DEFAULT_ORG_TENANT_ID || env.MICROSOFT_TENANT_ID || '').trim();
  return {
    name,
    slug: slugify(env.DEFAULT_ORG_SLUG || name) || 'default',
    tenantId: isTenantId(tenantCandidate) ? tenantCandidate.toLowerCase() : null,
    allowedEmailDomains: normalizeEmailDomains(env.DEFAULT_ORG_EMAIL_DOMAINS),
    allowLocalAccounts: (env.DEFAULT_ORG_ALLOW_LOCAL_ACCOUNTS ?? 'true').trim().toLowerCase() !== 'false'
  };
}

export interface BootstrapResult {
  created: boolean;
  organizationId: string | null;
  attachedUsers: number;
}

export async function ensureDefaultOrganization(
  config: DefaultOrganizationConfig = readDefaultOrganizationConfig()
): Promise<BootstrapResult> {
  let created = false;
  const count = await Organization.countDocuments();

  if (count === 0) {
    await Organization.create({
      name: config.name,
      slug: config.slug,
      isActive: true,
      sso: config.tenantId ? [{ provider: 'microsoft', tenantId: config.tenantId }] : [],
      allowedEmailDomains: config.allowedEmailDomains,
      allowLocalAccounts: config.allowLocalAccounts
    });
    created = true;
    logger.info(`Organisation par défaut créée : ${config.slug}`);
    if (!config.tenantId) {
      logger.warn(
        `Organisation ${config.slug} sans tenant Microsoft : la connexion SSO sera refusée tant que ` +
          'DEFAULT_ORG_TENANT_ID (ou le script organization:upsert) ne l’a pas renseigné.'
      );
    }
  }

  const orgs = await Organization.find().select('_id slug').limit(2).lean();
  if (orgs.length !== 1) {
    const orphans = await User.countDocuments({ organizationId: null });
    if (orphans > 0) {
      logger.warn(`${orphans} utilisateur(s) sans organisation : rattachement manuel requis (plusieurs organisations).`);
    }
    return { created, organizationId: null, attachedUsers: 0 };
  }

  const organizationId = String(orgs[0]._id);
  const result = await User.updateMany({ organizationId: null }, { $set: { organizationId: orgs[0]._id } });
  const attachedUsers = result.modifiedCount ?? 0;
  if (attachedUsers > 0) {
    logger.info(`${attachedUsers} utilisateur(s) rattaché(s) à l’organisation ${orgs[0].slug}`);
  }
  return { created, organizationId, attachedUsers };
}
