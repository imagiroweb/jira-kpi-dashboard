/**
 * Coûts horaires par période (issue #44), côté saisie : un coût initial puis jusqu'à deux changements
 * « à partir du ». Mêmes règles que le serveur (backend domain/user/hourlyRates).
 */

export const MAX_HOURLY_RATES = 3;

export interface HourlyRate {
  /** null pour le coût initial ; sinon date de début YYYY-MM-DD. */
  startDate: string | null;
  rate: number;
}

/** Ligne en cours de saisie (valeurs brutes des champs). */
export interface HourlyRateDraft {
  startDate: string;
  rate: string;
}

export function toDrafts(rates: HourlyRate[]): HourlyRateDraft[] {
  if (rates.length === 0) return [{ startDate: '', rate: '' }];
  return rates.map((r) => ({ startDate: r.startDate ?? '', rate: String(r.rate) }));
}

/**
 * Convertit la saisie en coûts : coût initial vide et aucune période = aucun coût ; sinon coûts ≥ 0
 * (virgule acceptée), dates de début obligatoires et strictement croissantes après le coût initial.
 */
export function parseDrafts(drafts: HourlyRateDraft[]): { ok: true; rates: HourlyRate[] } | { ok: false; error: string } {
  if (drafts.length > MAX_HOURLY_RATES) return { ok: false, error: `${MAX_HOURLY_RATES} coûts horaires maximum` };
  if (drafts.length === 1 && drafts[0].rate.trim() === '') return { ok: true, rates: [] };

  const rates: HourlyRate[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const raw = drafts[i].rate.trim().replace(',', '.');
    const rate = Number(raw);
    if (raw === '' || !Number.isFinite(rate) || rate < 0) {
      return { ok: false, error: i === 0 ? 'Coût initial invalide' : `Coût de la période ${i} invalide` };
    }
    if (i === 0) {
      rates.push({ startDate: null, rate });
      continue;
    }
    const startDate = drafts[i].startDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { ok: false, error: `Date de début de la période ${i} manquante` };
    const previous = rates[i - 1].startDate;
    if (previous !== null && startDate <= previous) {
      return { ok: false, error: 'Les dates de début doivent être croissantes et distinctes' };
    }
    rates.push({ startDate, rate });
  }
  return { ok: true, rates };
}

export function formatDateFr(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

/** Résumé lisible, ex. « 50 €/h · 60 €/h dès le 01/07/2026 ». */
export function formatRates(rates: HourlyRate[]): string {
  return rates
    .map((r) => (r.startDate ? `${r.rate} €/h dès le ${formatDateFr(r.startDate)}` : `${r.rate} €/h`))
    .join(' · ');
}
