import mongoose, { Document, Schema } from 'mongoose';

export const PAGE_IDS = [
  'dashboard',
  'users',
  'support',
  'epics',
  'marketing',
  'produit',
  'pointHebdo',
  'gestionUtilisateurs',
  'performance',
  'performanceDashboard'
] as const;

export type PageId = (typeof PAGE_IDS)[number];

export interface IPageVisibilities {
  dashboard: boolean;
  users: boolean;
  support: boolean;
  epics: boolean;
  marketing: boolean;
  produit: boolean;
  pointHebdo: boolean;
  gestionUtilisateurs: boolean;
  /** "Ma performance" (auto-évaluation, avancement des KR) — pertinent pour tout le monde. */
  performance: boolean;
  /** "Performance équipe" — vue lead/CTO, voir aussi `performanceGlobalAccess` pour la portée. */
  performanceDashboard: boolean;
}

export interface IRole extends Document {
  name: string;
  pageVisibilities: IPageVisibilities;
  /**
   * Portée globale sur la section Performance (CTO) : voit et peut définir les objectifs de
   * n'importe quel collaborateur, pas seulement d'une équipe où il est lead (`Team.leadIds`).
   * Indépendant de `pageVisibilities.performanceDashboard`, qui contrôle seulement si la page
   * est visible, pas sa portée.
   */
  performanceGlobalAccess: boolean;
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
  pointHebdo: true,
  gestionUtilisateurs: false,
  performance: true,
  performanceDashboard: false
};

const PageVisibilitiesSchema = new Schema<IPageVisibilities>(
  {
    dashboard: { type: Boolean, default: true },
    users: { type: Boolean, default: true },
    support: { type: Boolean, default: true },
    epics: { type: Boolean, default: true },
    marketing: { type: Boolean, default: true },
    produit: { type: Boolean, default: true },
    pointHebdo: { type: Boolean, default: true },
    gestionUtilisateurs: { type: Boolean, default: false },
    performance: { type: Boolean, default: true },
    performanceDashboard: { type: Boolean, default: false }
  },
  { _id: false }
);

const RoleSchema = new Schema<IRole>(
  {
    name: { type: String, required: true, trim: true },
    pageVisibilities: {
      type: PageVisibilitiesSchema,
      default: defaultPageVisibilities
    },
    performanceGlobalAccess: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

RoleSchema.index({ name: 1 }, { unique: true });

export const Role = mongoose.model<IRole>('Role', RoleSchema);
