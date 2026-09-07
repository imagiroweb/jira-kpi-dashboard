import mongoose, { Document, Schema } from 'mongoose';

/**
 * Agrégat quotidien d’heures de worklog par projet (issue #37 — phase 2).
 * Alimenté par le scheduler / backfill ; lu par getSupportBuildRatio (YTD).
 */
export interface IWorklogHoursDaily extends Document {
  projectKey: string;
  /** Date calendaire YYYY-MM-DD (fuseau worklog Jira) */
  date: string;
  hours: number;
  createdAt: Date;
  updatedAt: Date;
}

const WorklogHoursDailySchema = new Schema<IWorklogHoursDaily>(
  {
    projectKey: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    hours: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'worklog_hours_daily',
  }
);

WorklogHoursDailySchema.index({ projectKey: 1, date: 1 }, { unique: true });
WorklogHoursDailySchema.index({ date: 1 });

export const WorklogHoursDaily = mongoose.model<IWorklogHoursDaily>(
  'WorklogHoursDaily',
  WorklogHoursDailySchema
);
