import mongoose, { Document, Schema } from 'mongoose';

/**
 * Organisation cliente (ex. "Adoria").
 *
 * Préparation multi-entreprises : chaque organisation déclare son propre fournisseur d'identité
 * (aujourd'hui Microsoft Entra ID, identifié par son `tenantId`). Le backend n'accepte une
 * connexion SSO que si le tenant du jeton correspond à une organisation active — c'est la
 * liste blanche des tenants (voir `domain/organization/ssoOrganization`).
 *
 * Le cloisonnement complet des données par organisation (rôles, équipes, cycles, fiches…)
 * fera l'objet d'un lot dédié ; pour l'instant seul `User.organizationId` est posé.
 */
export type SsoProvider = 'microsoft';

export interface IOrganizationSso {
  provider: SsoProvider;
  /** Identifiant du tenant Entra ID (GUID, claim `tid` des jetons Microsoft). */
  tenantId: string;
}

export interface IOrganization extends Document {
  name: string;
  /** Identifiant stable et lisible (ex. `adoria`), utilisé par les scripts d'administration. */
  slug: string;
  isActive: boolean;
  /** Fournisseurs d'identité autorisés pour cette organisation (un seul aujourd'hui). */
  sso: IOrganizationSso[];
  /** Domaines d'email autorisés (ex. `adoria.com`). Vide = pas de restriction de domaine (le tenant reste vérifié). */
  allowedEmailDomains: string[];
  /** Autorise la connexion par email/mot de passe (comptes créés par un administrateur). */
  allowLocalAccounts: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTenantId(value: unknown): value is string {
  return typeof value === 'string' && GUID_PATTERN.test(value.trim());
}

const OrganizationSsoSchema = new Schema<IOrganizationSso>(
  {
    provider: { type: String, enum: ['microsoft'], required: true },
    tenantId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      validate: { validator: isTenantId, message: 'tenantId invalide (GUID attendu)' }
    }
  },
  { _id: false }
);

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9-]+$/, 'slug invalide (minuscules, chiffres, tirets)']
    },
    isActive: { type: Boolean, default: true },
    sso: { type: [OrganizationSsoSchema], default: [] },
    allowedEmailDomains: {
      type: [{ type: String, trim: true, lowercase: true }],
      default: []
    },
    allowLocalAccounts: { type: Boolean, default: false }
  },
  { timestamps: true }
);

OrganizationSchema.index({ slug: 1 }, { unique: true });
// Un tenant ne peut appartenir qu'à une seule organisation.
OrganizationSchema.index(
  { 'sso.tenantId': 1 },
  { unique: true, partialFilterExpression: { 'sso.tenantId': { $exists: true } } }
);

export const Organization = mongoose.model<IOrganization>('Organization', OrganizationSchema);
