import mongoose, { Document, Schema } from 'mongoose';

/**
 * Cycle de performance (semestre), ex. "S2-2026".
 * Un seul cycle `active` à la fois — c'est celui que les collaborateurs
 * mettent à jour ; les cycles `closed` restent consultables en lecture seule.
 */
export const PERFORMANCE_CYCLE_STATUSES = ['draft', 'active', 'closed'] as const;
export type PerformanceCycleStatus = (typeof PERFORMANCE_CYCLE_STATUSES)[number];

export interface IPerformanceCycle extends Document {
  label: string;
  startDate: Date;
  endDate: Date;
  status: PerformanceCycleStatus;
  createdAt: Date;
  updatedAt: Date;
}

const PerformanceCycleSchema = new Schema<IPerformanceCycle>(
  {
    label: {
      type: String,
      required: true,
      trim: true
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: PERFORMANCE_CYCLE_STATUSES,
      default: 'draft'
    }
  },
  { timestamps: true }
);

PerformanceCycleSchema.index({ label: 1 }, { unique: true });
PerformanceCycleSchema.index({ status: 1 });

export const PerformanceCycle = mongoose.model<IPerformanceCycle>(
  'PerformanceCycle',
  PerformanceCycleSchema
);
