/**
 * Suivi hebdomadaire du WIP (travail en cours) : règles pures, sans I/O (spec issue #79).
 *
 * Un ticket entre dans le WIP à son premier passage dans un statut de départ (ex. « --In Progress-- »).
 * Il en sort quand il passe dans un statut d'arrivée (ex. « --GO PROD-- », compté comme terminé) ou dans
 * un autre statut de catégorie « terminé » (ex. annulé, non compté). S'il quitte ensuite ce statut
 * pour un statut non terminé, il revient dans le WIP.
 *
 * Mesure hebdomadaire (réponse de BDR sur l'issue #79) : le vendredi à 14:00, heure de Paris. Le WIP
 * de la semaine est celui de ce point de mesure ; les terminés sont ceux passés entre le point de
 * mesure précédent (vendredi d'avant, 14:00) et celui-ci. Pour la semaine en cours, avant vendredi
 * 14:00, le point de mesure est maintenant.
 */

/** Libellé utilisé pour les tickets sans valeur dans le champ équipe Jira. */
export const NO_TEAM = 'Sans équipe';

/** Nombre maximal de semaines affichables en une requête. */
export const MAX_WIP_WEEKS = 52;

/** Fuseau du point de mesure hebdomadaire. */
export const WIP_TIME_ZONE = 'Europe/Paris';

/** Point de mesure : jour (0 = lundi, 4 = vendredi) et heure locale. */
export const WIP_MEASURE_DAY_OFFSET = 4;
export const WIP_MEASURE_HOUR = 14;

/** Statuts du workflow courant (boards Cook, Brigade, Supply). Les tirets font partie du nom. */
export const DEFAULT_WIP_START_STATUSES = ['--In Progress--'];
export const DEFAULT_WIP_END_STATUSES = ['--GO PROD--'];
/**
 * Changement de workflow Jira (minuit, heure de Paris). Avant cette date, le flux allait de
 * « --In Progress-- » à « --Go Recette-- » puis « --Terminé-- » : le WIP sortait à « --Terminé-- »,
 * sans « --GO PROD-- ». Depuis, la sortie comptée terminée est « --GO PROD-- ».
 */
export const WIP_WORKFLOW_CHANGE_DATE = '2026-10-12';
export const PREVIOUS_WIP_END_STATUSES = ['--Terminé--'];
/** Anciens défauts, sans tirets : encore présents en base tant que personne n'a enregistré les réglages. */
export const LEGACY_WIP_START_STATUSES = ['In Progress'];
export const LEGACY_WIP_END_STATUSES = ['Go Prod'];
/** Types de tickets suivis (réponse de BDR sur l'issue #79). */
export const DEFAULT_WIP_ISSUE_TYPES = ['US', 'Tâche Tech', 'Bug', 'Bug dev'];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StatusTransition {
  /** Date ISO du changement. */
  at: string;
  /** Nom du statut d'arrivée. */
  to: string;
  /** Nom du statut de départ de la transition (statut initial pour la première). */
  from?: string | null;
}

/** Entrée d'historique Jira réduite à ce dont on a besoin (compatible avec `JiraChangeHistory`). */
export interface ChangeHistoryLike {
  created: string;
  items: Array<{ field?: string; fieldId?: string; fromString?: string | null; toString?: string | null }>;
}

export interface WipStatusConfig {
  startStatuses: string[];
  endStatuses: string[];
  /** Statuts de catégorie Jira « terminé » : ils sortent un ticket du WIP sans le compter terminé. */
  closedStatuses?: string[];
  /**
   * Statut d'arrivée avant `workflowChangeOn` (ex. « --Terminé-- »). À partir de cette date,
   * seuls `endStatuses` comptent comme sortie terminée.
   */
  previousEndStatuses?: string[];
  /** Jour du changement de workflow (YYYY-MM-DD, minuit dans le fuseau de mesure). */
  workflowChangeOn?: string;
}

export interface WipIssueInput {
  key: string;
  team: string | null;
  /** Boards (équipes) du ticket ; prioritaire sur `team` s'il est renseigné. */
  teams?: string[];
  /** Date de création ISO (repli si le ticket a été créé directement dans un statut de départ). */
  created?: string | null;
  currentStatus?: string | null;
  transitions: StatusTransition[];
}

export interface WipTicket {
  key: string;
  /** Équipes du ticket : un ticket présent sur plusieurs boards compte une fois par board. */
  teams: string[];
  /** Périodes passées dans le WIP, en ms ; `end` null : toujours en cours. */
  periods: Array<{ start: number; end: number | null }>;
  /** Dernier passage dans un statut d'arrivée (ms), ou null. */
  doneAt: number | null;
}

export interface WipCounts {
  /** Tickets dans le WIP au point de mesure (vendredi 14:00, ou maintenant pour la semaine en cours). */
  wip: number;
  /** Tickets dont le dernier passage en statut d'arrivée tombe depuis le point de mesure précédent. */
  done: number;
}

export interface WipWeek {
  /** Lundi de la semaine (YYYY-MM-DD). */
  weekStart: string;
  /** Dimanche de la semaine (YYYY-MM-DD). */
  weekEnd: string;
  /** Instant de la mesure (ISO) : vendredi 14:00 Paris, ou maintenant pour la semaine en cours. */
  measuredAt: string;
  total: WipCounts;
  byTeam: Record<string, WipCounts>;
}

/**
 * Liste de statuts séparés par des virgules (guillemets facultatifs), ou tableau. Vide : `fallback`.
 * Ex. `In Progress, "Go Prod"` → ['In Progress', 'Go Prod'].
 */
export function parseStatusList(raw: string | string[] | undefined | null, fallback: string[]): string[] {
  const parts = Array.isArray(raw) ? raw : (raw ?? '').split(',');
  const out = parts
    .map((s) => String(s).trim().replace(/^["']|["']$/g, '').trim())
    .filter((s) => s.length > 0);
  return out.length > 0 ? Array.from(new Set(out)) : fallback;
}

/**
 * Forme comparable d'un nom de statut : casse, accents et espaces ignorés. Les tirets et le reste
 * de la ponctuation font partie du nom : « --In Progress-- » n'est pas « In Progress », et
 * « --GO PROD-- » n'est pas « GO PROD » ni « GO-PROD ». « --GO PROD-- » correspond à « --Go Prod-- ».
 */
export const normalizeStatusName = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

/**
 * Remplace les anciens défauts « In Progress » / « Go Prod » par les statuts décorés du workflow.
 * Une liste personnalisée est conservée telle quelle.
 */
export function preferDecoratedDefaults(statuses: string[] | undefined, legacy: string[], decorated: string[]): string[] {
  const list = (statuses ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
  if (list.length === 0) return decorated;
  const sameLegacy =
    list.length === legacy.length && list.every((s, i) => normalizeStatusName(s) === normalizeStatusName(legacy[i]));
  return sameLegacy ? decorated : list;
}

const normalize = normalizeStatusName;

/**
 * Noms Jira réels correspondant aux statuts saisis (voir `normalizeStatusName`), pour la JQL qui
 * exige les noms exacts. Les statuts saisis sont toujours gardés, même absents de la liste Jira.
 */
export function resolveStatusNames(configured: string[], jiraStatusNames: string[]): string[] {
  const wanted = new Set(configured.map(normalize));
  const matches = jiraStatusNames.filter((n) => wanted.has(normalize(n)));
  return Array.from(new Set([...configured, ...matches]));
}

/** Valeur du champ équipe Jira : texte, objet `{ name }` / `{ value }`, ou tableau (première valeur). */
export function readTeamField(raw: unknown): string | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.length > 0 ? readTeamField(raw[0]) : null;
  if (typeof raw === 'string') return raw.trim() || null;
  const obj = raw as { name?: unknown; value?: unknown };
  const v = obj.name ?? obj.value;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Ticket dans le périmètre du WIP : ni sous-tâche, ni épic, ni légende, et, si une liste est donnée,
 * d'un des types suivis (comparaison insensible à la casse).
 */
export function isWipEligibleIssueType(
  type: { name?: string; subtask?: boolean } | null | undefined,
  allowedTypes: string[] = []
): boolean {
  if (type?.subtask) return false;
  const n = (type?.name ?? '').trim().toLowerCase();
  if (n.includes('epic') || n.includes('épic') || n.includes('legend') || n.includes('légende')) return false;
  return allowedTypes.length === 0 || allowedTypes.some((t) => t.trim().toLowerCase() === n);
}

/** Transitions de statut d'un historique Jira, triées par date croissante. */
export function extractStatusTransitions(histories: ChangeHistoryLike[]): StatusTransition[] {
  const out: StatusTransition[] = [];
  for (const h of histories) {
    for (const item of h.items ?? []) {
      const isStatus = item.fieldId === 'status' || (!item.fieldId && item.field?.toLowerCase() === 'status');
      if (isStatus && item.toString) out.push({ at: h.created, to: item.toString, from: item.fromString ?? null });
    }
  }
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Périodes de WIP et date de terminaison d'un ticket (voir l'en-tête du fichier). */
export function computeWipTicket(issue: WipIssueInput, config: WipStatusConfig): WipTicket {
  const starts = new Set(config.startStatuses.map(normalize));
  const ends = new Set(config.endStatuses.map(normalize));
  const previousEnds = new Set((config.previousEndStatuses ?? []).map(normalize));
  const changeAt = config.workflowChangeOn ? zonedMidnight(config.workflowChangeOn) : null;
  const closed = new Set((config.closedStatuses ?? []).map(normalize));
  // Avant le changement : seule l'ancienne sortie (ex. « --Terminé-- ») compte. Après : les sorties courantes.
  const isEndStatus = (status: string, at: number) =>
    changeAt !== null && at < changeAt ? previousEnds.has(status) : ends.has(status);
  const transitions = issue.transitions
    .map((t) => ({ at: Date.parse(t.at), to: normalize(t.to), from: t.from ?? null }))
    .filter((t) => !Number.isNaN(t.at))
    .sort((a, b) => a.at - b.at);

  // Ticket créé directement dans un statut de départ : on part de la création. Le statut initial est
  // celui d'où part la première transition, ou le statut actuel s'il n'y en a aucune.
  const created = issue.created ? Date.parse(issue.created) : NaN;
  const initialStatus = transitions.length > 0 ? transitions[0].from : issue.currentStatus;
  if (initialStatus && starts.has(normalize(initialStatus)) && !Number.isNaN(created) && (transitions.length === 0 || created <= transitions[0].at)) {
    transitions.unshift({ at: created, to: normalize(initialStatus), from: null });
  }

  const periods: WipTicket['periods'] = [];
  let doneAt: number | null = null;
  let started = false;
  let openSince: number | null = null;

  for (const t of transitions) {
    const isEnd = isEndStatus(t.to, t.at);
    const isClosed = isEnd || closed.has(t.to);
    if (isEnd && started) doneAt = t.at;
    if (openSince !== null) {
      if (isClosed) {
        periods.push({ start: openSince, end: t.at });
        openSince = null;
      }
      continue;
    }
    if (starts.has(t.to)) {
      started = true;
      openSince = t.at;
    } else if (started && !isClosed) {
      // Réouverture : le ticket quitte un statut terminé pour un statut non terminé.
      openSince = t.at;
    }
  }
  if (openSince !== null) periods.push({ start: openSince, end: null });

  const boards = Array.from(new Set((issue.teams ?? []).map((t) => t.trim()).filter(Boolean)));
  const teams = boards.length > 0 ? boards : [issue.team?.trim() || NO_TEAM];
  return { key: issue.key, teams, periods, doneAt };
}

/** Décalage (ms) du fuseau par rapport à UTC à l'instant donné. */
function timeZoneOffset(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - (ms - (ms % 1000));
}

/** Instant (ms) de minuit, dans le fuseau, du jour calendaire `YYYY-MM-DD`. */
export function zonedMidnight(date: string, timeZone: string = WIP_TIME_ZONE): number {
  const guess = Date.parse(`${date.slice(0, 10)}T00:00:00.000Z`);
  const first = guess - timeZoneOffset(guess, timeZone);
  return guess - timeZoneOffset(first, timeZone);
}

/** Jour calendaire (YYYY-MM-DD) d'un instant dans le fuseau. */
export function zonedIsoDate(ms: number, timeZone: string = WIP_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date.slice(0, 10)}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Lundi (YYYY-MM-DD) de la semaine contenant le jour calendaire donné. */
export function mondayOf(date: string): string {
  const day = new Date(`${date.slice(0, 10)}T00:00:00.000Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/** Nombre de semaines (lundi → dimanche) touchées par la période. */
export function countWeeks(from: string, to: string): number {
  const diff = Date.parse(`${mondayOf(to)}T00:00:00Z`) - Date.parse(`${mondayOf(from)}T00:00:00Z`);
  return diff < 0 ? 0 : Math.round(diff / (7 * DAY_MS)) + 1;
}

/** Semaines (lundi → dimanche) qui touchent la période, première et dernière comprises. */
export function listWeeks(from: string, to: string): Array<{ weekStart: string; weekEnd: string }> {
  const weeks: Array<{ weekStart: string; weekEnd: string }> = [];
  const last = mondayOf(to);
  for (let m = mondayOf(from); m <= last; m = addDays(m, 7)) {
    weeks.push({ weekStart: m, weekEnd: addDays(m, 6) });
  }
  return weeks;
}

/** Tri des équipes : ordre alphabétique, « Sans équipe » en dernier. */
export function sortTeams(teams: Iterable<string>): string[] {
  return Array.from(new Set(teams)).sort((a, b) => {
    if (a === NO_TEAM) return 1;
    if (b === NO_TEAM) return -1;
    return a.localeCompare(b, 'fr');
  });
}

/** Point de mesure (ms) de la semaine commençant le lundi donné : vendredi 14:00 dans le fuseau. */
export function measurePoint(weekStart: string, timeZone: string = WIP_TIME_ZONE): number {
  // Les changements d'heure ont lieu le dimanche : pas de décalage entre minuit et 14:00 un vendredi.
  return zonedMidnight(addDays(weekStart, WIP_MEASURE_DAY_OFFSET), timeZone) + WIP_MEASURE_HOUR * 3600 * 1000;
}

/** Agrège les tickets par semaine, au total et par équipe. Les semaines futures sont omises. */
export function aggregateWipByWeek(
  tickets: WipTicket[],
  from: string,
  to: string,
  now: Date = new Date(),
  timeZone: string = WIP_TIME_ZONE,
  knownTeams: string[] = []
): { weeks: WipWeek[]; teams: string[] } {
  const nowMs = now.getTime();
  // Les boards configurés apparaissent même sans ticket sur la période.
  const teams = sortTeams([...knownTeams, ...tickets.flatMap((t) => t.teams)]);

  const weeks = listWeeks(from, to)
    .filter((w) => zonedMidnight(w.weekStart, timeZone) <= nowMs)
    .map(({ weekStart, weekEnd }) => {
      const snapshot = Math.min(measurePoint(weekStart, timeZone), nowMs);
      const previous = measurePoint(addDays(weekStart, -7), timeZone);
      const total: WipCounts = { wip: 0, done: 0 };
      const byTeam: Record<string, WipCounts> = {};
      for (const team of teams) byTeam[team] = { wip: 0, done: 0 };

      // Le total compte chaque ticket une fois, même s'il est sur plusieurs boards.
      for (const t of tickets) {
        if (t.periods.some((p) => p.start <= snapshot && (p.end === null || p.end > snapshot))) {
          t.teams.forEach((team) => (byTeam[team].wip += 1));
          total.wip += 1;
        }
        if (t.doneAt !== null && t.doneAt > previous && t.doneAt <= snapshot) {
          t.teams.forEach((team) => (byTeam[team].done += 1));
          total.done += 1;
        }
      }
      return { weekStart, weekEnd, measuredAt: new Date(snapshot).toISOString(), total, byTeam };
    });

  return { weeks, teams };
}
