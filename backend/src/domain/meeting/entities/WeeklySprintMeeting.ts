import mongoose, { Document, Schema } from 'mongoose';

export const MEETING_TEAM_ROLES = ['dev', 'qa'] as const;
export type MeetingTeamRole = (typeof MEETING_TEAM_ROLES)[number];

export const MEETING_BLOCKER_SEVERITIES = ['Faible', 'Moyen', 'Élevé', 'Critique'] as const;
export type MeetingBlockerSeverity = (typeof MEETING_BLOCKER_SEVERITIES)[number];

export const MEETING_INTERACTION_STATUSES = ['À traiter', 'En cours', 'OK'] as const;
export type MeetingInteractionStatus = (typeof MEETING_INTERACTION_STATUSES)[number];

export const MEETING_ACTION_STATUSES = ['À faire', 'En cours', 'Fait'] as const;
export type MeetingActionStatus = (typeof MEETING_ACTION_STATUSES)[number];

export const MEETING_RETRO_COLUMNS = ['keep', 'stop', 'try'] as const;
export type MeetingRetroColumn = (typeof MEETING_RETRO_COLUMNS)[number];

/** Origine de la valeur : préremplie depuis Jira ou saisie pendant le point. */
export const MEETING_METRIC_SOURCES = ['jira', 'manual'] as const;
export type MeetingMetricSource = (typeof MEETING_METRIC_SOURCES)[number];

export interface IMeetingMetric {
  id: string;
  label: string;
  value: string;
  target: string;
  source: MeetingMetricSource;
}

export interface IMeetingTeam {
  id: string;
  name: string;
  role: MeetingTeamRole;
  /** Board Jira utilisé pour le préremplissage des chiffres. */
  boardId?: number;
  metrics: IMeetingMetric[];
}

export interface IMeetingBlocker {
  id: string;
  severity: MeetingBlockerSeverity;
  text: string;
  need: string;
  owner: string;
  resolved: boolean;
}

export interface IMeetingInteraction {
  id: string;
  from: string;
  to: string;
  subject: string;
  status: MeetingInteractionStatus;
}

export interface IMeetingRetroItem {
  id: string;
  text: string;
}

export interface IMeetingRetro {
  keep: IMeetingRetroItem[];
  stop: IMeetingRetroItem[];
  try: IMeetingRetroItem[];
}

export interface IMeetingAction {
  id: string;
  text: string;
  owner: string;
  /** Échéance au format YYYY-MM-DD, vide si non fixée. */
  due: string;
  status: MeetingActionStatus;
}

export interface IMeetingSprint {
  name: string;
  number: string;
  goal: string;
  /** Date du point au format YYYY-MM-DD. */
  date: string;
}

export interface IMeetingAuthor {
  id: string;
  email: string;
  name?: string;
}

export interface IWeeklySprintMeeting extends Document {
  sprint: IMeetingSprint;
  teams: IMeetingTeam[];
  blockers: IMeetingBlocker[];
  interactions: IMeetingInteraction[];
  retro: IMeetingRetro;
  actions: IMeetingAction[];
  createdBy: IMeetingAuthor;
  updatedBy?: IMeetingAuthor;
  createdAt: Date;
  updatedAt: Date;
}

const MetricSchema = new Schema<IMeetingMetric>(
  {
    id: { type: String, required: true },
    label: { type: String, default: '', trim: true },
    value: { type: String, default: '' },
    target: { type: String, default: '' },
    source: { type: String, enum: MEETING_METRIC_SOURCES, default: 'manual' }
  },
  { _id: false }
);

const TeamSchema = new Schema<IMeetingTeam>(
  {
    id: { type: String, required: true },
    name: { type: String, default: '', trim: true },
    role: { type: String, enum: MEETING_TEAM_ROLES, default: 'dev' },
    boardId: { type: Number },
    metrics: { type: [MetricSchema], default: [] }
  },
  { _id: false }
);

const BlockerSchema = new Schema<IMeetingBlocker>(
  {
    id: { type: String, required: true },
    severity: { type: String, enum: MEETING_BLOCKER_SEVERITIES, default: 'Moyen' },
    text: { type: String, default: '' },
    need: { type: String, default: '' },
    owner: { type: String, default: '' },
    resolved: { type: Boolean, default: false }
  },
  { _id: false }
);

const InteractionSchema = new Schema<IMeetingInteraction>(
  {
    id: { type: String, required: true },
    from: { type: String, default: '' },
    to: { type: String, default: '' },
    subject: { type: String, default: '' },
    status: { type: String, enum: MEETING_INTERACTION_STATUSES, default: 'À traiter' }
  },
  { _id: false }
);

const RetroItemSchema = new Schema<IMeetingRetroItem>(
  {
    id: { type: String, required: true },
    text: { type: String, default: '' }
  },
  { _id: false }
);

const RetroSchema = new Schema<IMeetingRetro>(
  {
    keep: { type: [RetroItemSchema], default: [] },
    stop: { type: [RetroItemSchema], default: [] },
    try: { type: [RetroItemSchema], default: [] }
  },
  { _id: false }
);

const ActionSchema = new Schema<IMeetingAction>(
  {
    id: { type: String, required: true },
    text: { type: String, default: '' },
    owner: { type: String, default: '' },
    due: { type: String, default: '' },
    status: { type: String, enum: MEETING_ACTION_STATUSES, default: 'À faire' }
  },
  { _id: false }
);

const AuthorSchema = new Schema<IMeetingAuthor>(
  {
    id: { type: String, required: true },
    email: { type: String, required: true },
    name: { type: String }
  },
  { _id: false }
);

const WeeklySprintMeetingSchema = new Schema<IWeeklySprintMeeting>(
  {
    sprint: {
      name: { type: String, default: 'Sprint', trim: true },
      number: { type: String, default: '1', trim: true },
      goal: { type: String, default: '', trim: true },
      date: { type: String, required: true }
    },
    teams: { type: [TeamSchema], default: [] },
    blockers: { type: [BlockerSchema], default: [] },
    interactions: { type: [InteractionSchema], default: [] },
    retro: { type: RetroSchema, default: () => ({ keep: [], stop: [], try: [] }) },
    actions: { type: [ActionSchema], default: [] },
    createdBy: { type: AuthorSchema, required: true },
    updatedBy: { type: AuthorSchema }
  },
  { timestamps: true }
);

WeeklySprintMeetingSchema.index({ 'sprint.date': -1 });
WeeklySprintMeetingSchema.index({ createdAt: -1 });
WeeklySprintMeetingSchema.index({ 'createdBy.id': 1 });

export const WeeklySprintMeeting = mongoose.model<IWeeklySprintMeeting>(
  'WeeklySprintMeeting',
  WeeklySprintMeetingSchema
);
