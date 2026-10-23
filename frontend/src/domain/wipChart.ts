/**
 * Graphique de la page « Suivi WIP » (spec issue #79) : séries par semaine pour les équipes
 * sélectionnées, seuils (devs × tickets max par dev) et dépassements. Sans rendu.
 */

export const NO_TEAM = 'Sans équipe';
export const MAX_WIP_WEEKS = 52;
export const DEFAULT_WIP_WEEKS = 12;
/**
 * Même date que `WIP_WORKFLOW_CHANGE_DATE` côté backend. Avant : sortie à « --Terminé-- »
 * (flux « --In Progress-- » → « --Go Recette-- » → « --Terminé-- »). Depuis : sortie à « --GO PROD-- ».
 */
export const WIP_WORKFLOW_CHANGE_DATE = '2026-10-12';
export const WIP_WORKFLOW_CHANGE_NOTE =
  'Avant le 12/10/2026, le flux allait de --In Progress-- à --Go Recette-- puis --Terminé-- : le WIP se terminait à --Terminé--, sans --GO PROD--. Depuis cette date, la sortie du WIP est --GO PROD--.';
export const DEFAULT_MAX_TICKETS_PER_DEV = 3;
export const MAX_DEV_COUNT = 50;
export const MAX_TICKETS_PER_DEV = 20;

export interface WipCounts {
  wip: number;
  done: number;
}

export interface WipWeek {
  weekStart: string;
  weekEnd: string;
  /** Instant de la mesure (ISO) : vendredi 14:00 Paris, ou maintenant pour la semaine en cours. */
  measuredAt?: string;
  total: WipCounts;
  byTeam: Record<string, WipCounts>;
}

export interface WipTeamSetting {
  team: string;
  devCount: number;
  maxPerDev: number | null;
}

export interface WipSettings {
  startStatuses: string[];
  endStatuses: string[];
  defaultMaxPerDev: number;
  teams: WipTeamSetting[];
}

export interface WipWeeklyData {
  from: string;
  to: string;
  weeks: WipWeek[];
  teams: string[];
  projectKeys: string[];
  /** Boards qui délimitent les équipes ; vide : équipes lues dans le champ équipe Jira. */
  boards?: string[];
  ticketCount: number;
  settings: WipSettings;
}

export interface WipThreshold {
  /** Somme des seuils définis, ou null si aucun. */
  value: number | null;
  /** Vrai si au moins une équipe prise en compte n'a pas de seuil. */
  partial: boolean;
}

export interface WipRow {
  weekStart: string;
  weekEnd: string;
  /** Libellé court de l'axe (« 07/09 »). */
  label: string;
  /** Instant de la mesure (ISO), absent pour une semaine sans données. */
  measuredAt: string | null;
  wip: number;
  done: number;
  threshold: number | null;
  /** WIP strictement supérieur au seuil. */
  over: boolean;
  /** WIP − seuil, ou null sans seuil. */
  gap: number | null;
  /** WIP de chaque équipe sélectionnée, clé = nom de l'équipe. */
  teams: Record<string, number>;
  /** Semaine qui contient le changement de workflow du 12/10/2026. */
  workflowChange: boolean;
}

const DAY_MS = 86400000;
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const parseIso = (date: string) => Date.parse(`${date}T00:00:00.000Z`);
const addDays = (date: string, days: number) => toIso(parseIso(date) + days * DAY_MS);

/** Lundi (YYYY-MM-DD) de la semaine contenant le jour donné. */
export function mondayOf(date: string): string {
  const day = new Date(parseIso(date)).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/** Jour calendaire local (YYYY-MM-DD) d'une date. */
export function localIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Période par défaut : les 12 dernières semaines, semaine en cours comprise (lundi → dimanche). */
export function defaultWipPeriod(now: Date = new Date(), weeks = DEFAULT_WIP_WEEKS): { from: string; to: string } {
  const monday = mondayOf(localIsoDate(now));
  return { from: addDays(monday, -7 * (weeks - 1)), to: addDays(monday, 6) };
}

/** Semaines (lundi → dimanche) touchées par la période, bornes comprises. */
export function listWeeks(from: string, to: string): Array<{ weekStart: string; weekEnd: string }> {
  const out: Array<{ weekStart: string; weekEnd: string }> = [];
  const last = mondayOf(to);
  for (let m = mondayOf(from); m <= last; m = addDays(m, 7)) out.push({ weekStart: m, weekEnd: addDays(m, 6) });
  return out;
}

/** Message d'erreur de période, ou null si elle est valide. */
export function validateWipPeriod(from: string, to: string): string | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(from) || !iso.test(to)) return 'Choisissez une date de début et une date de fin';
  if (from > to) return 'La date de début doit précéder la date de fin';
  const weeks = listWeeks(from, to).length;
  if (weeks > MAX_WIP_WEEKS) return `Période trop longue (${weeks} semaines) : réduisez-la à ${MAX_WIP_WEEKS} semaines maximum`;
  return null;
}

/** Seuil d'une équipe (devs × max par dev), ou null : non réglée, 0 dev ou « Sans équipe ». */
export function teamThreshold(settings: WipSettings, team: string): number | null {
  if (team === NO_TEAM) return null;
  const row = settings.teams.find((t) => t.team.toLowerCase() === team.toLowerCase());
  if (!row || row.devCount <= 0) return null;
  return row.devCount * (row.maxPerDev ?? settings.defaultMaxPerDev);
}

/** Seuil cumulé des équipes : somme des seuils définis ; partiel s'il en manque. */
export function combinedThreshold(settings: WipSettings, teams: string[]): WipThreshold {
  let value: number | null = null;
  let partial = false;
  for (const team of teams) {
    const t = teamThreshold(settings, team);
    if (t === null) partial = true;
    else value = (value ?? 0) + t;
  }
  return { value, partial: value !== null && partial };
}

/** Équipes prises en compte : la sélection, ou toutes si elle est vide (vue globale). */
export function effectiveTeams(allTeams: string[], selected: string[]): string[] {
  const kept = selected.filter((t) => allTeams.includes(t));
  return kept.length > 0 ? kept : allTeams;
}

/** « 07/09 » */
export function formatDayMonth(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** « vendredi 11/09 à 14:00 » (heure de Paris), libellé du point de mesure. */
export function formatMeasuredAt(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(/(\d{2}\/\d{2}) /, '$1 à ');
}

/** « 07/09 – 13/09 » */
export function formatWeekRange(weekStart: string, weekEnd: string): string {
  return `${formatDayMonth(weekStart)} – ${formatDayMonth(weekEnd)}`;
}

/**
 * Lignes du graphique : une par semaine de la période (semaines absentes de la réponse → 0, sauf
 * semaines futures), WIP et terminés sommés sur les équipes prises en compte, seuil cumulé.
 */
export function buildWipRows(data: WipWeeklyData, selected: string[], now: Date = new Date()): { rows: WipRow[]; teams: string[]; threshold: WipThreshold } {
  const teams = effectiveTeams(data.teams, selected);
  // « Toutes » : total du serveur, où un ticket présent sur plusieurs boards ne compte qu'une fois.
  // Équipes cochées : somme de leurs tickets, comparable à la somme de leurs seuils.
  const explicitSelection = selected.some((t) => data.teams.includes(t));
  const threshold = combinedThreshold(data.settings, teams);
  const byStart = new Map(data.weeks.map((w) => [w.weekStart, w]));
  const currentMonday = mondayOf(localIsoDate(now));

  const rows = listWeeks(data.from, data.to)
    .filter((w) => byStart.has(w.weekStart) || w.weekStart <= currentMonday)
    .map(({ weekStart, weekEnd }) => {
      const week = byStart.get(weekStart);
      const perTeam: Record<string, number> = {};
      let wip = 0;
      let done = 0;
      for (const team of teams) {
        const c = week?.byTeam[team] ?? { wip: 0, done: 0 };
        perTeam[team] = c.wip;
        wip += c.wip;
        done += c.done;
      }
      if (!explicitSelection && week) {
        wip = week.total.wip;
        done = week.total.done;
      }
      const gap = threshold.value === null ? null : wip - threshold.value;
      return {
        weekStart,
        weekEnd,
        label: formatDayMonth(weekStart),
        measuredAt: week?.measuredAt ?? null,
        wip,
        done,
        threshold: threshold.value,
        over: gap !== null && gap > 0,
        gap,
        teams: perTeam,
        workflowChange: weekStart <= WIP_WORKFLOW_CHANGE_DATE && WIP_WORKFLOW_CHANGE_DATE <= weekEnd,
      };
    });
  return { rows, teams, threshold };
}

/**
 * Libellé du seuil. `summed` : plusieurs équipes choisies, le seuil est leur somme
 * (comme la courbe « WIP sélection », qui additionne leurs tickets).
 */
export function thresholdLabel(threshold: WipThreshold, summed = false): string {
  if (threshold.value === null) return 'Seuil non défini';
  const prefix = summed
    ? threshold.partial
      ? 'Somme partielle des seuils'
      : 'Somme des seuils'
    : threshold.partial
      ? 'Seuil partiel'
      : 'Seuil';
  return `${prefix} : ${threshold.value}`;
}

/** Brouillon d'édition des réglages : saisies texte converties et contrôlées avant envoi. */
export function parseTeamDrafts(
  drafts: Array<{ team: string; devCount: string; maxPerDev: string }>
): { ok: true; teams: WipTeamSetting[] } | { ok: false; error: string } {
  const teams: WipTeamSetting[] = [];
  for (const d of drafts) {
    const devRaw = d.devCount.trim();
    if (devRaw === '') continue;
    const devCount = Number(devRaw);
    if (!Number.isInteger(devCount) || devCount < 0 || devCount > MAX_DEV_COUNT) {
      return { ok: false, error: `${d.team} : le nombre de devs doit être un entier entre 0 et ${MAX_DEV_COUNT}` };
    }
    const maxRaw = d.maxPerDev.trim();
    const maxPerDev = maxRaw === '' ? null : Number(maxRaw);
    if (maxPerDev !== null && (!Number.isInteger(maxPerDev) || maxPerDev < 1 || maxPerDev > MAX_TICKETS_PER_DEV)) {
      return { ok: false, error: `${d.team} : le maximum de tickets par dev doit être un entier entre 1 et ${MAX_TICKETS_PER_DEV}` };
    }
    teams.push({ team: d.team, devCount, maxPerDev });
  }
  return { ok: true, teams };
}
