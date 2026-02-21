import mongoose, { Document, Schema } from 'mongoose';

export const PAGE_IDS = [
  'dashboard',
  'users',
  'support',
  'epics',
  'marketing',
  'produit',
  'gestionUtilisateurs'
] as const;

export type PageId = (typeof PAGE_IDS)[number];

export interface IPageVisibilities {
  dashboard: boolean;
  users: boolean;
  support: boolean;
  epics: boolean;
  marketing: boolean;
  produit: boolean;
  gestionUtilisateurs: boolean;
}

export interface IRole extends Document {
  name: string;
  pageVisibilities: IPageVisibilities;
  createdAt: Date;
  updatedAt: Date;
}

const defaultPageVisibilities: IPageVisibilities = {
  dashboard: true,
  users: true,
  support: true,
  epics: true,
  marketing: true,
  produit: true,
  gestionUtilisateurs: false
};

const PageVisibilitiesSchema = new Schema<IPageVisibilities>(
  {
    dashboard: { type: Boolean, default: true },
    users: { type: Boolean, default: true },
    support: { type: Boolean, default: true },
    epics: { type: Boolean, default: true },
    marketing: { type: Boolean, default: true },
    produit: { type: Boolean, default: true },
    gestionUtilisateurs: { type: Boolean, default: false }
  },
  { _id: false }
);

const RoleSchema = new Schema<IRole>(
  {
    name: { type: String, required: true, trim: true },
    pageVisibilities: {
      type: PageVisibilitiesSchema,
      default: defaultPageVisibilities
    }
  },
  { timestamps: true }
);

RoleSchema.index({ name: 1 }, { unique: true });

export const Role = mongoose.model<IRole>('Role', RoleSchema);
