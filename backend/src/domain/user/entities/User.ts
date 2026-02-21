import mongoose, { Document, Schema } from 'mongoose';

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
  createdAt: Date;
  updatedAt: Date;
}

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

