import mongoose, { Document, Schema } from 'mongoose';

// Interface pour les stats d'un projet
export interface IProjectStats {
  key: string;
  name: string;
  color: string;
  totalPoints: number;
  todoPoints: number;
  inProgressPoints: number;
  qaPoints: number;
  resolvedPoints: number;
  estimatedPoints: number;
  totalTickets: number;
  todoTickets: number;
  inProgressTickets: number;
  qaTickets: number;
  resolvedTickets: number;
  totalTimeHours: number;
  backlogTickets: number;
  backlogPoints: number;
}

// Interface pour les totaux
export interface IDashboardTotals {
  totalPoints: number;
  todoPoints: number;
  inProgressPoints: number;
  qaPoints: number;
  resolvedPoints: number;
  estimatedPoints: number;
  totalTickets: number;
  todoTickets: number;
  inProgressTickets: number;
  qaTickets: number;
  resolvedTickets: number;
  totalTimeHours: number;
  backlogTickets: number;
  backlogPoints: number;
}

export interface IDashboardSprintSnapshot extends Document {
  sprintName: string;
  savedAt: Date;
  savedBy: {
    id: string;
    email: string;
    name?: string;
  };
  dateRange: {
    from: string;
    to: string;
  };
  projectsStats: IProjectStats[];
  totals: IDashboardTotals;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectStatsSchema = new Schema({
  key: { type: String, required: true },
  name: { type: String, required: true },
  color: { type: String },
  totalPoints: { type: Number, default: 0 },
  todoPoints: { type: Number, default: 0 },
  inProgressPoints: { type: Number, default: 0 },
  qaPoints: { type: Number, default: 0 },
  resolvedPoints: { type: Number, default: 0 },
  estimatedPoints: { type: Number, default: 0 },
  totalTickets: { type: Number, default: 0 },
  todoTickets: { type: Number, default: 0 },
  inProgressTickets: { type: Number, default: 0 },
  qaTickets: { type: Number, default: 0 },
  resolvedTickets: { type: Number, default: 0 },
  totalTimeHours: { type: Number, default: 0 },
  backlogTickets: { type: Number, default: 0 },
  backlogPoints: { type: Number, default: 0 }
}, { _id: false });

const TotalsSchema = new Schema({
  totalPoints: { type: Number, default: 0 },
  todoPoints: { type: Number, default: 0 },
  inProgressPoints: { type: Number, default: 0 },
  qaPoints: { type: Number, default: 0 },
  resolvedPoints: { type: Number, default: 0 },
  estimatedPoints: { type: Number, default: 0 },
  totalTickets: { type: Number, default: 0 },
  todoTickets: { type: Number, default: 0 },
  inProgressTickets: { type: Number, default: 0 },
  qaTickets: { type: Number, default: 0 },
  resolvedTickets: { type: Number, default: 0 },
  totalTimeHours: { type: Number, default: 0 },
  backlogTickets: { type: Number, default: 0 },
  backlogPoints: { type: Number, default: 0 }
}, { _id: false });

const DashboardSprintSnapshotSchema = new Schema<IDashboardSprintSnapshot>(
  {
    sprintName: {
      type: String,
      required: true,
      trim: true
    },
    savedAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    savedBy: {
      id: { type: String, required: true },
      email: { type: String, required: true },
      name: { type: String }
    },
    dateRange: {
      from: { type: String, required: true },
      to: { type: String, required: true }
    },
    projectsStats: [ProjectStatsSchema],
    totals: TotalsSchema,
    notes: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Index pour recherche rapide
DashboardSprintSnapshotSchema.index({ sprintName: 1 });
DashboardSprintSnapshotSchema.index({ savedAt: -1 });
DashboardSprintSnapshotSchema.index({ 'savedBy.id': 1 });

export const DashboardSprintSnapshot = mongoose.model<IDashboardSprintSnapshot>(
  'DashboardSprintSnapshot',
  DashboardSprintSnapshotSchema
);

