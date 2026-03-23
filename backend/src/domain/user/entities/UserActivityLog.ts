import mongoose, { Document, Schema } from 'mongoose';

/** Activity types */
export type UserActivityType =
  | 'login'
  | 'page_view'
  | 'error_500'
  | 'password_reset_request'
  | 'password_reset_complete';

/** Optional metadata per type */
export interface IUserActivityLogMeta {
  /** page_view: page identifier (e.g. 'dashboard', 'support') */
  page?: string;
  /** page_view: time spent on page in ms */
  durationMs?: number;
  /** error_500: request path that returned 500 */
  path?: string;
  /** error_500: count of 500 errors in a time window */
  count?: number;
  /** password_reset_request: whether the email was successfully sent */
  emailSent?: boolean;
}

export interface IUserActivityLog extends Document {
  userId: mongoose.Types.ObjectId;
  type: UserActivityType;
  timestamp: Date;
  /** Optional metadata for page_view / error_500 */
  meta?: IUserActivityLogMeta;
  createdAt: Date;
  updatedAt: Date;
}

const UserActivityLogSchema = new Schema<IUserActivityLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ['login', 'page_view', 'error_500', 'password_reset_request', 'password_reset_complete'],
      required: true
    },
    timestamp: {
      type: Date,
      required: true,
      default: () => new Date()
    },
    meta: {
      type: Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
);

UserActivityLogSchema.index({ userId: 1, timestamp: -1 });

export const UserActivityLog = mongoose.model<IUserActivityLog>('UserActivityLog', UserActivityLogSchema);
