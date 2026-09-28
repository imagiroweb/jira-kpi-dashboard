import { User } from '../../domain/user/entities/User';
import { PerformanceReview } from '../../domain/performance/entities/PerformanceReview';
import { IntegrationSettings } from '../../domain/settings/integrationSettings';
import { emailHashOf, normalizeEmail } from '../../domain/user/emailHash';
import { decryptValue, encryptJson, encryptString, isEncryptedValue } from '../../infrastructure/crypto/fieldEncryption';
import { logger } from '../../utils/logger';

/**
 * Migration des données historiques en clair vers le chiffrement de champs (lot 4).
 * Idempotente : une valeur déjà chiffrée n'est jamais retouchée. Exécutée au démarrage (juste après le
 * chargement du trousseau) et consultable à blanc via `yarn encryption:status`.
 * Travaille sur les documents bruts (collection MongoDB) pour ne pas dépendre des setters Mongoose.
 */

export interface EncryptionMigrationReport {
  users: number;
  reviews: number;
  integrationSettings: number;
  droppedLegacyEmailIndex: boolean;
}

type Raw = Record<string, unknown>;

function encryptTextIfPlain(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value !== 'string' || value === '' || isEncryptedValue(value)) return { value, changed: false };
  return { value: encryptString(value), changed: true };
}

/** Calcule le `$set` à appliquer à un utilisateur brut (vide si déjà migré). */
export function userMigrationSet(raw: Raw): Raw {
  const set: Raw = {};
  if (typeof raw.email === 'string' && raw.email !== '') {
    const plain = normalizeEmail(String(decryptValue(raw.email)));
    if (!isEncryptedValue(raw.email)) set.email = encryptString(plain);
    const hash = emailHashOf(plain);
    if (raw.emailHash !== hash) set.emailHash = hash;
  }
  if (Array.isArray(raw.hourlyRates)) set.hourlyRates = encryptJson(raw.hourlyRates);
  return set;
}

const ASSESSMENT_FIELDS = ['comment', 'coachingAction'] as const;
const QUALITATIVE_KEYS = ['successes', 'challenges', 'growthAreas', 'overallReview'] as const;

function encryptFields(target: Raw | undefined, fields: readonly string[]): boolean {
  if (!target || typeof target !== 'object') return false;
  let changed = false;
  for (const field of fields) {
    const result = encryptTextIfPlain(target[field]);
    if (result.changed) {
      target[field] = result.value;
      changed = true;
    }
  }
  return changed;
}

/** Chiffre en place les textes libres d'une fiche brute ; renvoie les chemins racine modifiés. */
export function encryptReviewInPlace(raw: Raw): Raw {
  const set: Raw = {};
  const objectives = Array.isArray(raw.objectives) ? (raw.objectives as Raw[]) : [];
  let objectivesChanged = false;
  for (const objective of objectives) {
    for (const kr of (Array.isArray(objective.krs) ? objective.krs : []) as Raw[]) {
      for (const update of (Array.isArray(kr.progressHistory) ? kr.progressHistory : []) as Raw[]) {
        objectivesChanged = encryptFields(update, ['note', 'evidenceUrl']) || objectivesChanged;
      }
    }
    for (const action of (Array.isArray(objective.actions) ? objective.actions : []) as Raw[]) {
      objectivesChanged = encryptFields(action, ['label']) || objectivesChanged;
    }
    objectivesChanged = encryptFields(objective.selfAssessment as Raw, ASSESSMENT_FIELDS) || objectivesChanged;
    objectivesChanged = encryptFields(objective.managerAssessment as Raw, ASSESSMENT_FIELDS) || objectivesChanged;
  }
  if (objectivesChanged) set.objectives = objectives;

  const qualitative = raw.qualitative as Raw | undefined;
  let qualitativeChanged = false;
  if (qualitative && typeof qualitative === 'object') {
    for (const key of QUALITATIVE_KEYS) {
      qualitativeChanged = encryptFields(qualitative[key] as Raw, ['self', 'manager']) || qualitativeChanged;
    }
  }
  if (qualitativeChanged) set.qualitative = qualitative;
  return set;
}

export function integrationSettingsMigrationSet(raw: Raw): Raw {
  const set: Raw = {};
  for (const field of ['jiraApiToken', 'mondayApiKey']) {
    const result = encryptTextIfPlain(raw[field]);
    if (result.changed) set[field] = result.value;
  }
  return set;
}

async function migrateCollection(
  collection: { find: (filter: Raw) => AsyncIterable<Raw>; updateOne: (f: Raw, u: Raw) => Promise<unknown> },
  computeSet: (raw: Raw) => Raw,
  dryRun: boolean
): Promise<number> {
  let count = 0;
  for await (const raw of collection.find({})) {
    const set = computeSet(raw);
    if (Object.keys(set).length === 0) continue;
    count++;
    if (!dryRun) await collection.updateOne({ _id: raw._id }, { $set: set });
  }
  return count;
}

/** Index unique historique sur l'email en clair : inutile sur des valeurs chiffrées (remplacé par emailHash). */
async function dropLegacyEmailIndex(dryRun: boolean): Promise<boolean> {
  const indexes = await User.collection.indexes().catch(() => [] as Array<{ name?: string }>);
  if (!indexes.some((index) => index.name === 'email_1')) return false;
  if (!dryRun) await User.collection.dropIndex('email_1');
  return true;
}

export async function migrateLegacyPlaintext(options: { dryRun?: boolean } = {}): Promise<EncryptionMigrationReport> {
  const dryRun = options.dryRun === true;
  const asCollection = (model: { collection: unknown }) =>
    model.collection as unknown as Parameters<typeof migrateCollection>[0];
  const report: EncryptionMigrationReport = {
    users: await migrateCollection(asCollection(User), userMigrationSet, dryRun),
    reviews: await migrateCollection(asCollection(PerformanceReview), encryptReviewInPlace, dryRun),
    integrationSettings: await migrateCollection(
      asCollection(IntegrationSettings),
      integrationSettingsMigrationSet,
      dryRun
    ),
    droppedLegacyEmailIndex: await dropLegacyEmailIndex(dryRun)
  };
  const total = report.users + report.reviews + report.integrationSettings;
  if (total > 0 || report.droppedLegacyEmailIndex) {
    logger.info(
      `Chiffrement${dryRun ? ' (à blanc)' : ''} : ${report.users} utilisateur(s), ${report.reviews} fiche(s), ` +
        `${report.integrationSettings} réglage(s) d'intégration à chiffrer` +
        (report.droppedLegacyEmailIndex ? ', index email_1 historique supprimé' : '')
    );
  }
  return report;
}
