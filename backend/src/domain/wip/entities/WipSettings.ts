import mongoose, { Schema } from 'mongoose';
import { DEFAULT_MAX_TICKETS_PER_DEV, type WipTeamSetting } from '../wipSettings';
import { DEFAULT_WIP_END_STATUSES, DEFAULT_WIP_START_STATUSES } from '../wipWeekly';

/** Réglages partagés de la page « Suivi WIP » (document unique, clé `default`). */
export interface IWipSettings {
  key: string;
  startStatuses: string[];
  endStatuses: string[];
  defaultMaxPerDev: number;
  teams: WipTeamSetting[];
  /** Id de l'utilisateur qui a enregistré en dernier. */
  updatedBy?: string;
}

const WipTeamSettingSchema = new Schema<WipTeamSetting>(
  {
    team: { type: String, required: true, trim: true },
    devCount: { type: Number, required: true, min: 0 },
    maxPerDev: { type: Number, default: null }
  },
  { _id: false }
);

const WipSettingsSchema = new Schema<IWipSettings>(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    startStatuses: { type: [String], default: DEFAULT_WIP_START_STATUSES },
    endStatuses: { type: [String], default: DEFAULT_WIP_END_STATUSES },
    defaultMaxPerDev: { type: Number, default: DEFAULT_MAX_TICKETS_PER_DEV },
    teams: { type: [WipTeamSettingSchema], default: [] },
    updatedBy: { type: String }
  },
  { timestamps: true }
);

export const WipSettings = mongoose.model<IWipSettings>('WipSettings', WipSettingsSchema);
