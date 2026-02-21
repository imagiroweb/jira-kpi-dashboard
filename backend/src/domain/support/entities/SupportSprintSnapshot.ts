import mongoose, { Document, Schema } from 'mongoose';

// Interface pour les stats par assignee
interface AssigneeStats {
  assignee: string;
  ponderation: number;
  ticketCount: number;
}

// Interface pour les données KPI du support
export interface ISupportKPIData {
  statusCounts: {
    total: number;
    todo: number;
    inProgress: number;
    qa: number;
    resolved: number;
  };
  ponderationByStatus: {
    total: number;
    todo: number;
    inProgress: number;
    qa: number;
    resolved: number;
  };
  ponderationByType: Record<string, number>;
  ponderationByAssignee: AssigneeStats[];
  ponderationByLevel: {
    low: { count: number; total: number };
    medium: { count: number; total: number };
    high: { count: number; total: number };
    veryHigh: { count: number; total: number };
  };
  ponderationByLabel: Array<{
    label: string;
    ponderation: number;
    ticketCount: number;
  }>;
  ponderationByTeam: Array<{
    team: string;
    ponderation: number;
    ticketCount: number;
  }>;
  backlog: {
    ticketCount: number;
    totalPonderation: number;
  };
  avgResolutionTimeHours: number;
  avgFirstResponseTimeHours: number;
  avgResolutionTimeFromDatesHours: number;
  highPondFastResolutionPercent: number;
  veryHighPondFastResolutionPercent: number;
  totalPonderation: number;
}

export interface ISupportSprintSnapshot extends Document {
  sprintName: string;
  sprintId?: string;
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
  kpiData: ISupportKPIData;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SupportSprintSnapshotSchema = new Schema<ISupportSprintSnapshot>(
  {
    sprintName: {
      type: String,
      required: true,
      trim: true
    },
    sprintId: {
      type: String,
      sparse: true
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
    kpiData: {
      statusCounts: {
        total: { type: Number, default: 0 },
        todo: { type: Number, default: 0 },
        inProgress: { type: Number, default: 0 },
        qa: { type: Number, default: 0 },
        resolved: { type: Number, default: 0 }
      },
      ponderationByStatus: {
        total: { type: Number, default: 0 },
        todo: { type: Number, default: 0 },
        inProgress: { type: Number, default: 0 },
        qa: { type: Number, default: 0 },
        resolved: { type: Number, default: 0 }
      },
      ponderationByType: {
        type: Map,
        of: Number,
        default: {}
      },
      ponderationByAssignee: [{
        assignee: String,
        ponderation: Number,
        ticketCount: Number
      }],
      ponderationByLevel: {
        low: { count: { type: Number, default: 0 }, total: { type: Number, default: 0 } },
        medium: { count: { type: Number, default: 0 }, total: { type: Number, default: 0 } },
        high: { count: { type: Number, default: 0 }, total: { type: Number, default: 0 } },
        veryHigh: { count: { type: Number, default: 0 }, total: { type: Number, default: 0 } }
      },
      ponderationByLabel: [{
        label: String,
        ponderation: Number,
        ticketCount: Number
      }],
      ponderationByTeam: [{
        team: String,
        ponderation: Number,
        ticketCount: Number
      }],
      backlog: {
        ticketCount: { type: Number, default: 0 },
        totalPonderation: { type: Number, default: 0 }
      },
      avgResolutionTimeHours: { type: Number, default: 0 },
      avgFirstResponseTimeHours: { type: Number, default: 0 },
      avgResolutionTimeFromDatesHours: { type: Number, default: 0 },
      highPondFastResolutionPercent: { type: Number, default: 0 },
      veryHighPondFastResolutionPercent: { type: Number, default: 0 },
      totalPonderation: { type: Number, default: 0 }
    },
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
SupportSprintSnapshotSchema.index({ sprintName: 1 });
SupportSprintSnapshotSchema.index({ savedAt: -1 });
SupportSprintSnapshotSchema.index({ 'savedBy.id': 1 });

export const SupportSprintSnapshot = mongoose.model<ISupportSprintSnapshot>(
  'SupportSprintSnapshot',
  SupportSprintSnapshotSchema
);

