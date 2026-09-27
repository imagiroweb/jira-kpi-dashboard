import mongoose, { Document, Schema } from 'mongoose';

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
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        message: 'Email invalide'
      }
    },
    password: {
      type: String,
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
    hourlyRates: {
      type: [
        new Schema(
          {
            startDate: { type: String, default: null },
            rate: { type: Number, required: true, min: 0 }
          },
          { _id: false }
        )
      ],
      default: undefined
    },
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
    }
  },
  {
    timestamps: true
  }
);

// Index pour améliorer les performances de recherche
UserSchema.index({ email: 1 });
UserSchema.index({ microsoftId: 1 });
UserSchema.index({ teamId: 1 });
UserSchema.index({ organizationId: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);

