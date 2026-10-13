import mongoose, { Schema } from 'mongoose';
import { Container } from '../../infrastructure/Container';
import { resetMondayClient } from '../../infrastructure/monday/MondayClient';
import { logger } from '../../utils/logger';
import { encryptedString, withEncryptedFields } from '../../infrastructure/crypto/mongooseEncryption';

const SETTINGS_KEY = 'default';

export interface IIntegrationSettings {
  key: string;
  jiraUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  mondayApiKey: string;
  /** Une fois vrai, les listes de boards en base remplacent JIRA_BOARD_ID / JIRA_QA_BOARD_ID. */
  boardsConfigured: boolean;
  dashboardBoardIds: number[];
  qaBoardIds: number[];
}

const IntegrationSettingsSchema = new Schema<IIntegrationSettings>(
  {
    key: { type: String, required: true, unique: true, default: SETTINGS_KEY },
    jiraUrl: { type: String, default: '' },
    jiraEmail: { type: String, default: '' },
    // Secrets d'intégration chiffrés en base (jamais renvoyés au navigateur, voir la vue).
    jiraApiToken: { ...encryptedString({ trim: true }), default: '' },
    mondayApiKey: { ...encryptedString({ trim: true }), default: '' },
    boardsConfigured: { type: Boolean, default: false },
    dashboardBoardIds: { type: [Number], default: [] },
    qaBoardIds: { type: [Number], default: [] }
  },
  { timestamps: true }
);

withEncryptedFields(IntegrationSettingsSchema);

export const IntegrationSettings = mongoose.model<IIntegrationSettings>(
  'IntegrationSettings',
  IntegrationSettingsSchema
);

/** Identifiants numériques séparés par des virgules, espaces ou retours ligne. Les valeurs invalides sont ignorées. */
export function parseBoardIdList(raw: unknown): number[] {
  const source = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(/[\s,;]+/) : [];
  const ids: number[] = [];
  for (const part of source) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const id = Number(trimmed);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function parseEnvBoardIds(raw?: string): number[] {
  return parseBoardIdList(raw ?? '');
}

export interface IntegrationSettingsView {
  jiraUrl: string;
  jiraEmail: string;
  jiraApiTokenSet: boolean;
  jiraApiTokenFromDatabase: boolean;
  mondayApiKeySet: boolean;
  mondayApiKeyFromDatabase: boolean;
  dashboardBoardIds: number[];
  qaBoardIds: number[];
  boardsConfigured: boolean;
}

function envView(): IntegrationSettingsView {
  return {
    jiraUrl: process.env.JIRA_URL?.trim() || '',
    jiraEmail: process.env.JIRA_EMAIL?.trim() || '',
    jiraApiTokenSet: Boolean(process.env.JIRA_API_TOKEN?.trim()),
    jiraApiTokenFromDatabase: false,
    mondayApiKeySet: Boolean(process.env.MONDAY_API_KEY?.trim()),
    mondayApiKeyFromDatabase: false,
    dashboardBoardIds: parseEnvBoardIds(process.env.JIRA_BOARD_ID),
    qaBoardIds: parseEnvBoardIds(process.env.JIRA_QA_BOARD_ID),
    boardsConfigured: false
  };
}

export function toIntegrationSettingsView(doc: IIntegrationSettings | null): IntegrationSettingsView {
  const fromEnv = envView();
  if (!doc) return fromEnv;
  return {
    jiraUrl: doc.jiraUrl?.trim() || fromEnv.jiraUrl,
    jiraEmail: doc.jiraEmail?.trim() || fromEnv.jiraEmail,
    jiraApiTokenSet: Boolean(doc.jiraApiToken?.trim() || process.env.JIRA_API_TOKEN?.trim()),
    jiraApiTokenFromDatabase: Boolean(doc.jiraApiToken?.trim()),
    mondayApiKeySet: Boolean(doc.mondayApiKey?.trim() || process.env.MONDAY_API_KEY?.trim()),
    mondayApiKeyFromDatabase: Boolean(doc.mondayApiKey?.trim()),
    dashboardBoardIds: doc.boardsConfigured ? doc.dashboardBoardIds : fromEnv.dashboardBoardIds,
    qaBoardIds: doc.boardsConfigured ? doc.qaBoardIds : fromEnv.qaBoardIds,
    boardsConfigured: doc.boardsConfigured
  };
}

/** Applique le document sur process.env et reconstruit les clients Jira / Monday. */
export function applyIntegrationSettings(doc: IIntegrationSettings | null): void {
  if (!doc) return;
  if (doc.jiraUrl?.trim()) process.env.JIRA_URL = doc.jiraUrl.trim();
  if (doc.jiraEmail?.trim()) process.env.JIRA_EMAIL = doc.jiraEmail.trim();
  if (doc.jiraApiToken?.trim()) process.env.JIRA_API_TOKEN = doc.jiraApiToken.trim();
  if (doc.mondayApiKey?.trim()) process.env.MONDAY_API_KEY = doc.mondayApiKey.trim();
  if (doc.boardsConfigured) {
    process.env.JIRA_BOARD_ID = doc.dashboardBoardIds.join(',');
    process.env.JIRA_QA_BOARD_ID = doc.qaBoardIds.join(',');
  }
  Container.reset();
  resetMondayClient();
}

export async function loadIntegrationSettings(): Promise<IIntegrationSettings | null> {
  return IntegrationSettings.findOne({ key: SETTINGS_KEY }).lean<IIntegrationSettings>();
}

export async function getIntegrationSettingsView(): Promise<IntegrationSettingsView> {
  const doc = await loadIntegrationSettings();
  return toIntegrationSettingsView(doc);
}

export interface IntegrationSettingsInput {
  jiraUrl?: unknown;
  jiraEmail?: unknown;
  jiraApiToken?: unknown;
  mondayApiKey?: unknown;
  dashboardBoardIds?: unknown;
  qaBoardIds?: unknown;
}

export async function saveIntegrationSettings(input: IntegrationSettingsInput): Promise<IntegrationSettingsView> {
  const existing = await IntegrationSettings.findOne({ key: SETTINGS_KEY });
  const doc = existing ?? new IntegrationSettings({ key: SETTINGS_KEY });

  if (typeof input.jiraUrl === 'string') doc.jiraUrl = input.jiraUrl.trim();
  if (typeof input.jiraEmail === 'string') doc.jiraEmail = input.jiraEmail.trim();
  if (typeof input.jiraApiToken === 'string' && input.jiraApiToken.trim()) {
    doc.jiraApiToken = input.jiraApiToken.trim();
  }
  if (typeof input.mondayApiKey === 'string' && input.mondayApiKey.trim()) {
    doc.mondayApiKey = input.mondayApiKey.trim();
  }
  doc.dashboardBoardIds = parseBoardIdList(input.dashboardBoardIds);
  doc.qaBoardIds = parseBoardIdList(input.qaBoardIds);
  doc.boardsConfigured = true;
  await doc.save();
  applyIntegrationSettings(doc.toObject());
  logger.info(
    `Integration settings saved (dashboard boards: [${doc.dashboardBoardIds.join(', ')}], qa: [${doc.qaBoardIds.join(', ')}])`
  );
  return toIntegrationSettingsView(doc.toObject());
}

export async function applyStoredIntegrationSettings(): Promise<void> {
  try {
    const doc = await loadIntegrationSettings();
    if (!doc) return;
    applyIntegrationSettings(doc);
    logger.info('Integration settings loaded from database');
  } catch (error) {
    logger.warn('Could not load integration settings from database', error);
  }
}
