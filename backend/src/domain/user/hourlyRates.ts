/**
 * Coûts horaires par période (issue #44) : un coût initial, puis jusqu'à deux changements datés
 * (« à partir du »). Un changement en cours d'année s'applique au temps saisi après sa date, sans
 * modifier le coût initial ni le coût du temps saisi avant.
 */

export const MAX_HOURLY_RATES = 3;

export interface HourlyRate {
  /** null pour le coût initial (s'applique avant tout changement) ; sinon date de début YYYY-MM-DD. */
  startDate: string | null;
  /** Coût horaire en euros. */
  rate: number;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(ymd: string): boolean {
  if (!YMD.test(ymd)) return false;
  const d = new Date(`${ymd}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd;
}

/**
 * Valide une liste de coûts saisie : vide (aucun coût) ou de 1 à 3 entrées ; la première sans date
 * (coût initial), les suivantes avec des dates valides strictement croissantes ; coûts ≥ 0.
 */
export function validateHourlyRates(input: unknown): { ok: true; rates: HourlyRate[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'Liste de coûts horaires attendue' };
  if (input.length > MAX_HOURLY_RATES) return { ok: false, error: `${MAX_HOURLY_RATES} coûts horaires maximum par utilisateur` };

  const rates: HourlyRate[] = [];
  for (let i = 0; i < input.length; i++) {
    const entry = input[i] as { startDate?: unknown; rate?: unknown } | null;
    const rate = entry?.rate;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100000) {
      return { ok: false, error: 'Coût horaire invalide (nombre positif attendu)' };
    }
    const startDate = entry?.startDate ?? null;
    if (i === 0) {
      if (startDate !== null) return { ok: false, error: 'Le coût initial ne doit pas avoir de date de début' };
    } else {
      if (typeof startDate !== 'string' || !isValidDate(startDate)) {
        return { ok: false, error: 'Date de début invalide (AAAA-MM-JJ attendu)' };
      }
      const previous = rates[i - 1].startDate;
      if (previous !== null && startDate <= previous) {
        return { ok: false, error: 'Les dates de début doivent être croissantes et distinctes' };
      }
    }
    rates.push({ startDate, rate });
  }
  return { ok: true, rates };
}

/** Coût horaire en vigueur à une date (YYYY-MM-DD) : dernier changement commencé, sinon coût initial. */
export function rateAt(rates: HourlyRate[], ymd: string): number | null {
  let current: number | null = null;
  for (const r of rates) {
    if (r.startDate === null || r.startDate <= ymd) current = r.rate;
  }
  return current;
}

/** Coût (€, au centime) d'un temps réparti par jour, chaque jour valorisé au coût en vigueur. */
export function costOfDailySeconds(rates: HourlyRate[], secondsByDay: Record<string, number>): number | null {
  if (rates.length === 0) return null;
  let total = 0;
  for (const [day, seconds] of Object.entries(secondsByDay)) {
    total += (seconds / 3600) * (rateAt(rates, day) ?? 0);
  }
  return Math.round(total * 100) / 100;
}
