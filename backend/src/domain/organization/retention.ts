import type { IOrganizationRetention } from './entities/Organization';

/**
 * Règles pures de conservation : dates limites au-delà desquelles les données sont purgées.
 */
export interface RetentionCutoffs {
  /** Logs d'activité antérieurs à cette date → supprimés. */
  activityLogsBefore: Date | null;
  /** Fiches dont le cycle s'est terminé avant cette date → supprimées. */
  performanceCyclesEndedBefore: Date | null;
  /** Comptes désactivés depuis avant cette date → anonymisés. */
  inactiveAccountsDeactivatedBefore: Date | null;
}

function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

function isValidDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function computeRetentionCutoffs(retention: Partial<IOrganizationRetention> | undefined, now: Date): RetentionCutoffs {
  const r = retention ?? {};
  return {
    activityLogsBefore: isValidDuration(r.activityLogMonths) ? monthsAgo(now, r.activityLogMonths) : null,
    performanceCyclesEndedBefore: isValidDuration(r.performanceReviewYears) ? monthsAgo(now, r.performanceReviewYears * 12) : null,
    inactiveAccountsDeactivatedBefore: isValidDuration(r.inactiveAccountMonths) ? monthsAgo(now, r.inactiveAccountMonths) : null
  };
}

export interface RetentionInput {
  activityLogMonths?: unknown;
  performanceReviewYears?: unknown;
  inactiveAccountMonths?: unknown;
}

const LIMITS: Record<keyof IOrganizationRetention, [number, number]> = {
  activityLogMonths: [1, 120],
  performanceReviewYears: [1, 50],
  inactiveAccountMonths: [1, 120]
};

/**
 * Valide une mise à jour des durées : entier dans les bornes, ou `null` (pas de purge).
 * Retourne les champs à écrire ou la liste des erreurs.
 */
export function parseRetentionInput(input: RetentionInput): { value?: Partial<IOrganizationRetention>; errors: string[] } {
  const value: Partial<IOrganizationRetention> = {};
  const errors: string[] = [];
  for (const key of Object.keys(LIMITS) as Array<keyof IOrganizationRetention>) {
    if (!(key in input)) continue;
    const raw = (input as Record<string, unknown>)[key];
    if (raw === null) {
      value[key] = null;
      continue;
    }
    const [min, max] = LIMITS[key];
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < min || raw > max) {
      errors.push(`${key} : entier entre ${min} et ${max}, ou null`);
      continue;
    }
    value[key] = raw;
  }
  return errors.length ? { errors } : { value, errors };
}
