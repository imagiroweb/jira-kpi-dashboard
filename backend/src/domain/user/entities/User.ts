import mongoose, { Document, Schema } from 'mongoose';
import { safeDecrypt } from '../../../infrastructure/crypto/fieldEncryption';
import { emailHashOf } from '../emailHash';

import { encryptedJson, encryptedString, withEncryptedFields } from '../../../infrastructure/crypto/mongooseEncryption';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Filtres par défaut Roadmap Adoria 2026 (page Produit) */
export type RoadmapAdoriaQuarterFilter = 'all' | 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface IRoadmapAdoria2026Filters {
  trimestre: RoadmapAdoriaQuarterFilter;
  /** Statuts cochés ; vide = pas de filtre statut */
  statut: string[];
  /** Teams cochées ; vide = pas de filtre team (tout afficher) */
  team: string[];
}

export interface IUserPreferences {
  roadmapAdoria2026Filters?: IRoadmapAdoria2026Filters;
}

export interface IUser extends Document {
  email: string;
  /** Empreinte de recherche de l'email (voir `emailHashOf`). */
  emailHash?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  provider: 'local' | 'microsoft';
  microsoftId?: string;
  isActive: boolean;
  /** 'super_admin' = full access + gestion utilisateurs; otherwise use roleId */
  role?: 'super_admin';
  roleId?: mongoose.Types.ObjectId;
  /** Organisation de rattachement (voir domain/organization). Posée pour le multi-entreprises ;
   * le cloisonnement complet des données par organisation fera l'objet d'un lot dédié. */
  organizationId?: mongoose.Types.ObjectId;
  /** Administrateur de la plateforme (éditeur) : gère les organisations et leur SSO.
   * Distinct de `role: 'super_admin'`, qui administre une organisation. Jamais attribué
   * automatiquement : uniquement via le script d'amorçage. */
  isPlatformAdmin?: boolean;
  /** Équipe actuelle du collaborateur — modifiable (changement d'équipe) ; voir domain/team/entities/Team */
  teamId?: mongoose.Types.ObjectId;
  /** Droit délégué par le CTO/super_admin : permet à ce lead de rattacher un collaborateur à SA PROPRE
   * équipe (jamais d'en faire sortir un lead, ni de toucher aux autres équipes). Sans effet si
   * l'utilisateur n'est lead d'aucune équipe. */
  canManageTeamAssignment?: boolean;
  /** Coûts horaires (€) par période, saisis dans la page « Coûts horaires » : coût initial (sans date)
   * puis jusqu'à deux changements datés — voir domain/user/hourlyRates. Valorisent le temps passé sur
   * les épics. Donnée réservée : visible seulement du super admin et des rôles ayant la page `couts`. */
  hourlyRates?: Array<{ startDate: string | null; rate: number }>;
  /** Compte non SSO ajouté manuellement par un super admin à la page « Coûts horaires ». */
  includedInCosts?: boolean;
  lastLogin?: Date;
  /** Préférences UI personnelles (filtres par défaut, etc.) */
  preferences?: IUserPreferences;
  /** SHA-256 hash du token de réinitialisation (jamais le plaintext) */
  passwordResetToken?: string;
  /** Date d'expiration du token (1h après génération) */
  passwordResetExpires?: Date;
  /** Version des sessions : incrémentée pour révoquer tous les JWT émis (désactivation,
   * changement de rôle, réinitialisation du mot de passe). Comparée au claim `tv` du jeton. */
  tokenVersion?: number;
  /** Date de désactivation du compte : point de départ de la durée de conservation avant anonymisation. */
  deactivatedAt?: Date | null;
  /** Compte anonymisé (droit à l'effacement ou fin de durée de conservation) : plus aucune donnée personnelle. */
  anonymizedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ROADMAP_ADORIA_QUARTER_FILTERS: RoadmapAdoriaQuarterFilter[] = [
  'all',
  'Q1',
  'Q2',
  'Q3',
  'Q4',
];

export const DEFAULT_ROADMAP_ADORIA_2026_FILTERS: IRoadmapAdoria2026Filters = {
  trimestre: 'all',
  statut: [],
  team: [],
};

const UserSchema = new Schema<IUser>(
  {
    // Email chiffré en base (AES-256-GCM) ; la recherche et l'unicité passent par `emailHash`.
    email: {
      ...encryptedString({ trim: true, lowercase: true }),
      required: true,
      validate: {
        // Le validateur reçoit la valeur stockée (chiffrée) : on valide la valeur en clair.
        validator: (stored: string) => isValidEmail(String(safeDecrypt(stored, ''))),
        message: 'Email invalide'
      }
    },
    /** Empreinte HMAC-SHA256 (clé d'index) de l'email normalisé : recherche exacte et unicité
     * sans stocker l'email en clair. Calculée automatiquement (voir hook `validate`). */
    emailHash: {
      type: String,
      unique: true,
      sparse: true
    },
    password: {
      type: String,
      // Hash bcrypt jamais renvoyé par défaut : à demander explicitement (`.select('+password')`).
      select: false,
      required: function(this: IUser) {
        return this.provider === 'local';
      },
      minlength: [12, 'Le mot de passe doit contenir au moins 12 caractères']
    },
    firstName: {
      type: String,
      trim: true
    },
    lastName: {
      type: String,
      trim: true
    },
    provider: {
      type: String,
      enum: ['local', 'microsoft'],
      default: 'local'
    },
    microsoftId: {
      type: String,
      sparse: true,
      unique: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    role: {
      type: String,
      enum: ['super_admin'],
      default: null
    },
    roleId: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
      default: null
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      default: null
    },
    isPlatformAdmin: {
      type: Boolean,
      default: false
    },
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      default: null
    },
    canManageTeamAssignment: {
      type: Boolean,
      default: false
    },
    // Coûts horaires chiffrés (donnée salariale) : validés côté domaine (domain/user/hourlyRates).
    hourlyRates: encryptedJson<Array<{ startDate: string | null; rate: number }>>(),
    includedInCosts: {
      type: Boolean,
      default: false
    },
    lastLogin: {
      type: Date
    },
    preferences: {
      roadmapAdoria2026Filters: {
        trimestre: {
          type: String,
          enum: ROADMAP_ADORIA_QUARTER_FILTERS,
          default: 'all'
        },
        statut: {
          type: [String],
          default: []
        },
        team: {
          type: [String],
          default: []
        }
      }
    },
    passwordResetToken: {
      type: String,
      select: false
    },
    passwordResetExpires: {
      type: Date,
      select: false
    },
    tokenVersion: {
      type: Number,
      default: 0
    },
    deactivatedAt: {
      type: Date,
      default: null
    },
    anonymizedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

UserSchema.pre('validate', function (next) {
  if (this.isModified('email') || !this.emailHash) {
    const plain = String(safeDecrypt(this.get('email', null, { getters: false }), ''));
    if (plain) this.emailHash = emailHashOf(plain);
  }
  next();
});

withEncryptedFields(UserSchema);

// Index pour améliorer les performances de recherche
UserSchema.index({ teamId: 1 });
UserSchema.index({ organizationId: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);

