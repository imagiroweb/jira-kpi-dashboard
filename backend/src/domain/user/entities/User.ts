import mongoose, { Document, Schema } from 'mongoose';

/** Filtres par défaut Roadmap Adoria 2026 (page Produit) */
export type RoadmapAdoriaQuarterFilter = 'all' | 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface IRoadmapAdoria2026Filters {
  trimestre: RoadmapAdoriaQuarterFilter;
  /** Statuts cochés ; vide = pas de filtre statut */
  statut: string[];
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

export const User = mongoose.model<IUser>('User', UserSchema);

