/**
 * Suivi hebdomadaire du WIP (travail en cours) : règles pures, sans I/O (spec issue #79).
 *
 * Un ticket entre dans le WIP à son premier passage dans un statut de départ (ex. « --In Progress-- »).
 * Il en sort quand il passe dans un statut d'arrivée (compté comme terminé) ou dans un autre statut
 * de catégorie « terminé » (ex. annulé, non compté) ou dans un statut « à faire ». S'il quitte ensuite
 * ce statut pour un statut du flux, il revient dans le WIP. Depuis le 12/10/2026, la sortie comptée est « --Terminé-- » :
 * « --Go Prod-- » reste dans le WIP.
 *
 * Mesure hebdomadaire (réponse de BDR sur l'issue #79) : le vendredi à 14:00, heure de Paris. Le WIP
 * de la semaine est celui de ce point de mesure ; les terminés sont ceux passés entre le point de
 * mesure précédent (vendredi d'avant, 14:00) et celui-ci. Pour la semaine en cours, avant vendredi
 * 14:00, le point de mesure est maintenant.
 */

/** Libellé utilisé pour les tickets sans valeur dans le champ équipe Jira. */
export const NO_TEAM = 'Sans équipe';
/** Ticket sans assigné Jira. */
export const UNASSIGNED = 'Non assigné';
/** Une personne est signalée dès qu'elle a strictement plus de tickets dans le WIP. */
export const WIP_PER_PERSON_LIMIT = 2;

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
 * « --In Progress-- » à « --Go Recette-- » puis « --Terminé-- ». Depuis, le flux passe par
 * « --Go Prod-- », mais le WIP va jusqu'à « --Terminé-- » : « --Go Prod-- » ne fait pas sortir.
 */
export const WIP_WORKFLOW_CHANGE_DATE = '2026-10-12';
export const PREVIOUS_WIP_END_STATUSES = ['--Terminé--'];
/** Sortie comptée terminée à partir de `WIP_WORKFLOW_CHANGE_DATE`. */
export const WIP_END_STATUSES_SINCE_CHANGE = ['--Terminé--'];
/** Anciens défauts, sans tirets : encore présents en base tant que personne n'a enregistré les réglages. */
export const LEGACY_WIP_START_STATUSES = ['In Progress'];
export const LEGACY_WIP_END_STATUSES = ['Go Prod'];
/** Types de tickets suivis (réponse de BDR sur l'issue #79). */
export const DEFAULT_WIP_ISSUE_TYPES = ['US', 'Tâche Tech', 'Bug', 'Bug dev'];
/** Types ajoutés depuis l'espace Support (projet SB), en plus des types de dev. */
export const WIP_SUPPORT_ISSUE_TYPES = ['Bug', 'Support'];
/** Flux Support : entrée au démarrage du traitement, sortie comptée à la résolution. */
export const WIP_SUPPORT_START_STATUSES = ['En cours...', 'In Progress'];
export const WIP_SUPPORT_END_STATUSES = ['Résolu', 'Terminé'];
/** Sortent du WIP Support sans compter terminé. */
export const WIP_SUPPORT_IGNORED_STATUSES = ['Not a ticket'];

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
  items: Array<{
    field?: string;
    fieldId?: string;
    /** Identifiant Team (champ Atlassian), distinct du nom affiché. */
    from?: string | null;
    to?: string | null;
    fromString?: string | null;
    toString?: string | null;
  }>;
}

/** Changement du champ Team : l'id compte, le nom sert à l'affichage. */
export interface TeamChange {
  at: string;
  fromId: string | null;
  fromName: string | null;
  id: string | null;
  name: string | null;
}

export interface WipStatusConfig {
  startStatuses: string[];
  endStatuses: string[];
  /** Statuts de catégorie Jira « terminé » : ils sortent un ticket du WIP sans le compter terminé. */
  closedStatuses?: string[];
  /** Statuts « à faire » : ils sortent du WIP sans compter terminé. Le ticket y revient à un statut de départ. */
  todoStatuses?: string[];
  /**
   * Statut d'arrivée avant `workflowChangeOn` (ex. « --Terminé-- »). À partir de cette date,
   * `endStatusesSinceChange` compte comme sortie terminée (défaut « --Terminé-- »), pas `endStatuses`.
   */
  previousEndStatuses?: string[];
  /** Sortie comptée à partir de `workflowChangeOn`. Défaut : `WIP_END_STATUSES_SINCE_CHANGE`. */
  endStatusesSinceChange?: string[];
  /** Jour du changement de workflow (YYYY-MM-DD, minuit dans le fuseau de mesure). */
  workflowChangeOn?: string;
}

export interface WipIssueInput {
  key: string;
  team: string | null;
  /** Boards (équipes) du ticket ; prioritaire sur `team` s'il est renseigné. */
  teams?: string[];
  /**
   * Id Team actuel. Avec `teamChanges`, l'équipe de chaque semaine est celle de l'instant
   * (et non le board actuel appliqué à tout l'historique).
   */
  teamId?: string | null;
  /** Nom actuel du champ Team, si l'id n'est relié à aucun board. */
  teamName?: string | null;
  /** Historique du champ Team. Absent : `teams` ou `team` pour toute la période. */
  teamChanges?: TeamChange[];
  /** Id Team (minuscules) → nom actuel du board qui le porte. */
  boardNameByTeamId?: Record<string, string>;
  /** Date de création ISO (repli si le ticket a été créé directement dans un statut de départ). */
  created?: string | null;
  currentStatus?: string | null;
  /** Nom affiché de l'assigné Jira ; vide : non assigné. */
  assignee?: string | null;
  transitions: StatusTransition[];
}

export interface WipTicket {
  key: string;
  /** Équipes du ticket : un ticket présent sur plusieurs boards compte une fois par board. */
  teams: string[];
  /** Assigné actuel. L'historique d'assignation n'est pas rejoué. */
  assignee: string;
  /** Statut Jira actuel. Le détail ouvert utilise `history` à l'instant de mesure. */
  status: string;
  /** Passages de statut (nom d'origine), pour le statut au point de mesure. */
  history: Array<{ at: number; status: string }>;
  /** Équipe affichée à chaque instant. Absent : `teams` pour toute la période. */
  teamTimeline?: Array<{ at: number; names: string[] }>;
  /** Périodes passées dans le WIP, en ms ; `end` null : toujours en cours. */
  periods: Array<{ start: number; end: number | null }>;
  /** Dernier passage dans un statut d'arrivée (ms), ou null. */
  doneAt: number | null;
}

/** Ticket dans le WIP à un instant donné, pour le détail par collaborateur. */
export interface WipOpenTicket {
  key: string;
  assignee: string;
  teams: string[];
  /** Statut au point de mesure. */
  status: string;
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

const TEAM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cleanText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Id et nom du champ Team Jira (objet Atlassian `{ id, name }`, texte, option ou première valeur). */
export function readTeamIdentity(raw: unknown): { id: string | null; name: string | null } {
  if (raw == null) return { id: null, name: null };
  if (Array.isArray(raw)) return raw.length > 0 ? readTeamIdentity(raw[0]) : { id: null, name: null };
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return { id: null, name: null };
    return TEAM_ID.test(text) ? { id: text, name: null } : { id: null, name: text };
  }
  const obj = raw as { id?: unknown; name?: unknown; title?: unknown; value?: unknown };
  const id = cleanText(obj.id);
  const name = cleanText(obj.name) ?? cleanText(obj.title) ?? cleanText(obj.value);
  if (id) return { id, name };
  if (name && TEAM_ID.test(name)) return { id: name, name: null };
  return { id: null, name };
}

/** Valeur affichée du champ équipe Jira : nom, sinon id. */
export function readTeamField(raw: unknown): string | null {
  const { id, name } = readTeamIdentity(raw);
  return name ?? id;
}

/** Changements du champ Team, triés par date. `fieldId` est celui de `JIRA_TEAM_FIELD`. */
export function extractTeamTransitions(histories: ChangeHistoryLike[], fieldId: string): TeamChange[] {
  const wanted = fieldId.trim();
  const out: TeamChange[] = [];
  for (const h of histories) {
    for (const item of h.items ?? []) {
      const byId = Boolean(item.fieldId) && item.fieldId === wanted;
      const byName = !item.fieldId && (item.field ?? '').toLowerCase() === 'team';
      if (!byId && !byName) continue;
      out.push({
        at: h.created,
        fromId: cleanText(item.from),
        fromName: cleanText(item.fromString),
        id: cleanText(item.to),
        name: cleanText(item.toString),
      });
    }
  }
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/**
 * Équipe affichée à chaque instant. Un id présent dans `boardNameByTeamId` prend le nom actuel
 * du board (board à un seul id). Les autres ids gardent le dernier nom porté par le champ.
 */
export function buildTeamTimeline(opts: {
  currentId: string | null;
  currentName: string | null;
  changes: TeamChange[];
  boardNameByTeamId?: Record<string, string>;
}): Array<{ at: number; names: string[] }> {
  const board = new Map<string, string>();
  for (const [id, name] of Object.entries(opts.boardNameByTeamId ?? {})) {
    if (id && name.trim()) board.set(id.toLowerCase(), name.trim());
  }
  const catalog = new Map<string, string>();
  const remember = (id: string | null, name: string | null) => {
    if (id && name?.trim() && !TEAM_ID.test(name)) catalog.set(id.toLowerCase(), name.trim());
  };
  for (const change of opts.changes) {
    remember(change.fromId, change.fromName);
    remember(change.id, change.name);
  }
  remember(opts.currentId, opts.currentName);

  const label = (id: string | null, name: string | null) => {
    if (!id) return NO_TEAM;
    const key = id.toLowerCase();
    return board.get(key) || catalog.get(key) || (name && !TEAM_ID.test(name) ? name.trim() : '') || NO_TEAM;
  };

  const changes = opts.changes
    .map((change) => ({ ...change, atMs: Date.parse(change.at) }))
    .filter((change) => !Number.isNaN(change.atMs))
    .sort((a, b) => a.atMs - b.atMs);

  if (changes.length === 0) return [{ at: 0, names: [label(opts.currentId, opts.currentName)] }];

  const points = [{ at: 0, names: [label(changes[0].fromId, changes[0].fromName)] }];
  for (const change of changes) points.push({ at: change.atMs, names: [label(change.id, change.name)] });
  return points;
}

/** Nom affiché de l'assigné Jira (`displayName` ou texte). Vide : « Non assigné ». */
export function readAssigneeName(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim() || UNASSIGNED;
  const name = (raw as { displayName?: unknown } | null)?.displayName;
  return typeof name === 'string' && name.trim() ? name.trim() : UNASSIGNED;
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
  const sinceEnds = new Set((config.endStatusesSinceChange ?? WIP_END_STATUSES_SINCE_CHANGE).map(normalize));
  const closed = new Set((config.closedStatuses ?? []).map(normalize));
  const todos = new Set((config.todoStatuses ?? []).map(normalize));
  // Avant le changement : l'ancienne sortie. Après : « --Terminé-- », « --Go Prod-- » reste dans le WIP.
  // Sans date de changement : les statuts d'arrivée des réglages.
  const isEndStatus = (status: string, at: number) => {
    if (changeAt === null) return ends.has(status);
    return at < changeAt ? previousEnds.has(status) : sinceEnds.has(status);
  };
  const transitions = issue.transitions
    .map((t) => ({ at: Date.parse(t.at), to: normalize(t.to), label: t.to.trim() || 'Statut inconnu', from: t.from ?? null }))
    .filter((t) => !Number.isNaN(t.at))
    .sort((a, b) => a.at - b.at);

  // Ticket créé directement dans un statut de départ : on part de la création. Le statut initial est
  // celui d'où part la première transition, ou le statut actuel s'il n'y en a aucune.
  const created = issue.created ? Date.parse(issue.created) : NaN;
  const initialStatus = transitions.length > 0 ? transitions[0].from : issue.currentStatus;
  if (initialStatus && starts.has(normalize(initialStatus)) && !Number.isNaN(created) && (transitions.length === 0 || created <= transitions[0].at)) {
    transitions.unshift({ at: created, to: normalize(initialStatus), label: initialStatus.trim(), from: null });
  }

  const periods: WipTicket['periods'] = [];
  let doneAt: number | null = null;
  let started = false;
  let openSince: number | null = null;

  for (const t of transitions) {
    const isEnd = isEndStatus(t.to, t.at);
    const isClosed = isEnd || closed.has(t.to);
    const leavesWip = isClosed || todos.has(t.to);
    if (isEnd && started) doneAt = t.at;
    if (openSince !== null) {
      if (leavesWip) {
        periods.push({ start: openSince, end: t.at });
        openSince = null;
      }
      continue;
    }
    if (starts.has(t.to)) {
      started = true;
      openSince = t.at;
    } else if (started && !leavesWip) {
      // Réouverture : le ticket quitte un statut terminé pour un statut encore dans le WIP.
      openSince = t.at;
    }
  }
  if (openSince !== null) periods.push({ start: openSince, end: null });

  const boards = Array.from(new Set((issue.teams ?? []).map((t) => t.trim()).filter(Boolean)));
  const staticTeams = boards.length > 0 ? boards : [issue.team?.trim() || NO_TEAM];
  const hasTeamId =
    Boolean(issue.teamId) || (issue.teamChanges ?? []).some((change) => change.id || change.fromId);
  const teamTimeline = hasTeamId
    ? buildTeamTimeline({
        currentId: issue.teamId ?? null,
        currentName: issue.teamName ?? issue.team,
        changes: issue.teamChanges ?? [],
        boardNameByTeamId: issue.boardNameByTeamId,
      })
    : undefined;
  const teams = teamTimeline
    ? Array.from(new Set(teamTimeline.flatMap((point) => point.names)))
    : staticTeams;
  const assignee = issue.assignee?.trim() || UNASSIGNED;
  const history = transitions.map((t) => ({ at: t.at, status: t.label }));
  return {
    key: issue.key,
    teams,
    assignee,
    status: issue.currentStatus?.trim() || 'Statut inconnu',
    history,
    teamTimeline,
    periods,
    doneAt,
  };
}

/** Équipes du ticket à l'instant `at` : champ Team s'il a un historique, sinon l'appartenance statique. */
export function teamsAt(ticket: WipTicket, at: number): string[] {
  const line = ticket.teamTimeline;
  if (!line || line.length === 0) return ticket.teams.length > 0 ? ticket.teams : [NO_TEAM];
  let names = line[0].names;
  for (const step of line) {
    if (step.at > at) break;
    names = step.names;
  }
  return names.length > 0 ? names : [NO_TEAM];
}

/** Statut du ticket à l'instant `at` (dernier passage antérieur ou égal). */
export function statusAt(history: Array<{ at: number; status: string }>, at: number): string {
  let status = '';
  for (const step of history) {
    if (step.at > at) break;
    status = step.status;
  }
  return status || 'Statut inconnu';
}

/** Tickets encore dans le WIP à l'instant `at` (même borne que le graphique : entrée ≤ at < sortie). */
export function listOpenWipTickets(tickets: WipTicket[], at: number): WipOpenTicket[] {
  return tickets
    .filter((t) => t.periods.some((p) => p.start <= at && (p.end === null || p.end > at)))
    .map((t) => ({ key: t.key, assignee: t.assignee || UNASSIGNED, teams: teamsAt(t, at), status: statusAt(t.history, at) }))
    .sort((a, b) => a.key.localeCompare(b.key, 'fr'));
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
  const weekDefs = listWeeks(from, to).filter((w) => zonedMidnight(w.weekStart, timeZone) <= nowMs);
  // Les boards configurés apparaissent même sans ticket. Les autres noms ne sont gardés
  // que s'ils comptent sur une semaine affichée (évite une équipe historique hors période).
  const used = new Set<string>(knownTeams.map((team) => team.trim()).filter(Boolean));
  const snapshots = weekDefs.map(({ weekStart }) => ({
    snapshot: Math.min(measurePoint(weekStart, timeZone), nowMs),
    previous: measurePoint(addDays(weekStart, -7), timeZone),
  }));
  for (const { snapshot, previous } of snapshots) {
    for (const ticket of tickets) {
      if (ticket.periods.some((p) => p.start <= snapshot && (p.end === null || p.end > snapshot))) {
        teamsAt(ticket, snapshot).forEach((team) => used.add(team));
      }
      if (ticket.doneAt !== null && ticket.doneAt > previous && ticket.doneAt <= snapshot) {
        teamsAt(ticket, ticket.doneAt).forEach((team) => used.add(team));
      }
    }
  }
  const teams = sortTeams(used);

  const weeks = weekDefs.map(({ weekStart, weekEnd }, index) => {
    const { snapshot, previous } = snapshots[index];
    const total: WipCounts = { wip: 0, done: 0 };
    const byTeam: Record<string, WipCounts> = {};
    for (const team of teams) byTeam[team] = { wip: 0, done: 0 };

    // Le total compte chaque ticket une fois, même s'il est sur plusieurs équipes.
    for (const ticket of tickets) {
      if (ticket.periods.some((p) => p.start <= snapshot && (p.end === null || p.end > snapshot))) {
        teamsAt(ticket, snapshot).forEach((team) => {
          if (byTeam[team]) byTeam[team].wip += 1;
        });
        total.wip += 1;
      }
      if (ticket.doneAt !== null && ticket.doneAt > previous && ticket.doneAt <= snapshot) {
        teamsAt(ticket, ticket.doneAt).forEach((team) => {
          if (byTeam[team]) byTeam[team].done += 1;
        });
        total.done += 1;
      }
    }
    return { weekStart, weekEnd, measuredAt: new Date(snapshot).toISOString(), total, byTeam };
  });

  return { weeks, teams };
}
