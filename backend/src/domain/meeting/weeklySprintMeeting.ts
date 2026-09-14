/**
 * Logique pure du point hebdo sprint : structure par défaut, reconduction d'un
 * point au suivant et validation des payloads reçus par les routes.
 */
import {
  IMeetingAction,
  IMeetingBlocker,
  IMeetingInteraction,
  IMeetingMetric,
  IMeetingRetro,
  IMeetingRetroItem,
  IMeetingRowAuthor,
  IMeetingSprint,
  IMeetingTeam,
  MEETING_ACTION_STATUSES,
  MEETING_BLOCKER_SEVERITIES,
  MEETING_INTERACTION_STATUSES,
  MEETING_METRIC_SOURCES,
  MEETING_RETRO_COLUMNS,
  MEETING_TEAM_ROLES,
  MeetingActionStatus,
  MeetingBlockerSeverity,
  MeetingInteractionStatus,
  MeetingMetricSource,
  MeetingTeamRole
} from './entities/WeeklySprintMeeting';

/** Libellés d'indicateurs proposés par défaut selon le type d'équipe. */
export const DEFAULT_DEV_METRIC_LABELS = [
  'Points engagés',
  'Points réalisés',
  'Tickets en cours',
  'Tickets terminés',
  'Bugs ouverts'
] as const;

export const DEFAULT_QA_METRIC_LABELS = [
  'Tickets en cours',
  'Tickets en QA',
  'Tickets terminés',
  'Bugs ouverts',
  'Bugs détectés'
] as const;

const MAX_TEAMS = 20;
const MAX_METRICS_PER_TEAM = 40;
const MAX_ROWS = 200;
const MAX_SHORT_TEXT = 200;
const MAX_LONG_TEXT = 2000;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

let idCounter = 0;

/** Identifiant stable d'une ligne, utilisé comme clé côté React et pour les fusions. */
export function createMeetingRowId(): string {
  idCounter += 1;
  return `m${Date.now().toString(36)}${idCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

export function buildDefaultMetrics(role: MeetingTeamRole): IMeetingMetric[] {
  const labels = role === 'qa' ? DEFAULT_QA_METRIC_LABELS : DEFAULT_DEV_METRIC_LABELS;
  return labels.map((label) => ({
    id: createMeetingRowId(),
    label,
    value: '',
    target: '',
    source: 'manual' as MeetingMetricSource
  }));
}

export interface WeeklyMeetingDraft {
  sprint: IMeetingSprint;
  teams: IMeetingTeam[];
  blockers: IMeetingBlocker[];
  interactions: IMeetingInteraction[];
  retro: IMeetingRetro;
  actions: IMeetingAction[];
}

/** Point vierge : une équipe Dev, une équipe QA, sections vides. */
export function buildDefaultMeeting(date: string): WeeklyMeetingDraft {
  return {
    sprint: { name: 'Sprint', number: '1', goal: '', date },
    teams: [
      { id: createMeetingRowId(), name: 'Équipe Dev', role: 'dev', metrics: buildDefaultMetrics('dev') },
      { id: createMeetingRowId(), name: 'QA', role: 'qa', metrics: buildDefaultMetrics('qa') }
    ],
    blockers: [],
    interactions: [],
    retro: { keep: [], stop: [], try: [] },
    actions: []
  };
}

/**
 * Prépare le point suivant : on conserve la structure d'équipes, les libellés
 * d'indicateurs, leurs cibles, les blocages non levés, les interactions non OK
 * et les actions non terminées ; le reste repart à zéro.
 */
export function buildNextMeetingDraft(
  previous: WeeklyMeetingDraft,
  date: string
): WeeklyMeetingDraft {
  const previousNumber = parseInt(previous.sprint.number, 10);
  return {
    sprint: {
      name: previous.sprint.name,
      number: Number.isNaN(previousNumber)
        ? previous.sprint.number
        : String(previousNumber + 1),
      goal: '',
      date
    },
    teams: previous.teams.map((team) => ({
      id: createMeetingRowId(),
      name: team.name,
      role: team.role,
      ...(team.boardId != null ? { boardId: team.boardId } : {}),
      metrics: team.metrics.map((metric) => ({
        id: createMeetingRowId(),
        label: metric.label,
        value: '',
        target: metric.target,
        source: metric.source
      }))
    })),
    blockers: previous.blockers
      .filter((blocker) => !blocker.resolved)
      .map((blocker) => ({
        id: createMeetingRowId(),
        severity: blocker.severity,
        text: blocker.text,
        need: blocker.need,
        owner: blocker.owner,
        resolved: false,
        ...(blocker.createdBy ? { createdBy: blocker.createdBy } : {})
      })),
    interactions: previous.interactions
      .filter((interaction) => interaction.status !== 'OK')
      .map((interaction) => ({
        id: createMeetingRowId(),
        from: interaction.from,
        to: interaction.to,
        subject: interaction.subject,
        status: interaction.status,
        ...(interaction.createdBy ? { createdBy: interaction.createdBy } : {})
      })),
    retro: { keep: [], stop: [], try: [] },
    actions: previous.actions
      .filter((action) => action.status !== 'Fait')
      .map((action) => ({
        id: createMeetingRowId(),
        text: action.text,
        owner: action.owner,
        due: action.due,
        status: action.status,
        ...(action.createdBy ? { createdBy: action.createdBy } : {})
      }))
  };
}

function parseText(raw: unknown, max: number): string | null {
  if (raw == null) return '';
  if (typeof raw !== 'string' || raw.length > max) return null;
  return raw;
}

function parseId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  return id && id.length <= 64 ? id : null;
}

function parseEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T | null {
  if (raw == null) return fallback;
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : null;
}

function parseDate(raw: unknown, { allowEmpty }: { allowEmpty: boolean }): string | null {
  if (raw == null) return allowEmpty ? '' : null;
  if (typeof raw !== 'string') return null;
  if (!raw) return allowEmpty ? '' : null;
  return DATE_PATTERN.test(raw) ? raw : null;
}

function parseList<T>(raw: unknown, max: number, parseItem: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(raw) || raw.length > max) return null;
  const parsed: T[] = [];
  for (const item of raw) {
    const value = parseItem(item);
    if (value == null) return null;
    parsed.push(value);
  }
  return parsed;
}

function parseIdList(raw: unknown, max: number): string[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > max) return null;
  const ids: string[] = [];
  for (const item of raw) {
    const id = parseId(item);
    if (id == null) return null;
    ids.push(id);
  }
  return ids;
}

function parseRowAuthor(raw: unknown): IMeetingRowAuthor | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { id, name } = raw as Record<string, unknown>;
  const parsedId = parseId(id);
  const parsedName = parseText(name, MAX_SHORT_TEXT);
  if (parsedId == null || parsedName == null || !parsedName) return undefined;
  return { id: parsedId, name: parsedName };
}

function withRowAuthors<T>(row: T, source: Record<string, unknown>): T {
  const createdBy = parseRowAuthor(source.createdBy);
  const updatedBy = parseRowAuthor(source.updatedBy);
  return {
    ...row,
    ...(createdBy ? { createdBy } : {}),
    ...(updatedBy ? { updatedBy } : {})
  };
}

function parseSprint(raw: unknown): IMeetingSprint | null {
  if (!raw || typeof raw !== 'object') return null;
  const { name, number, goal, date } = raw as Record<string, unknown>;
  const parsedName = parseText(name, MAX_SHORT_TEXT);
  const parsedNumber = parseText(number, 20);
  const parsedGoal = parseText(goal, MAX_LONG_TEXT);
  const parsedDate = parseDate(date, { allowEmpty: false });
  if (parsedName == null || parsedNumber == null || parsedGoal == null || parsedDate == null) {
    return null;
  }
  return { name: parsedName, number: parsedNumber, goal: parsedGoal, date: parsedDate };
}

function parseMetric(raw: unknown): IMeetingMetric | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, label, value, target, source } = raw as Record<string, unknown>;
  const parsedId = parseId(id);
  const parsedLabel = parseText(label, MAX_SHORT_TEXT);
  const parsedValue = parseText(value, 40);
  const parsedTarget = parseText(target, 40);
  const parsedSource = parseEnum<MeetingMetricSource>(source, MEETING_METRIC_SOURCES, 'manual');
  if (
    parsedId == null ||
    parsedLabel == null ||
    parsedValue == null ||
    parsedTarget == null ||
    parsedSource == null
  ) {
    return null;
  }
  return {
    id: parsedId,
    label: parsedLabel,
    value: parsedValue,
    target: parsedTarget,
    source: parsedSource
  };
}

function parseTeam(raw: unknown): IMeetingTeam | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, name, role, boardId, metrics } = raw as Record<string, unknown>;
  const parsedId = parseId(id);
  const parsedName = parseText(name, MAX_SHORT_TEXT);
  const parsedRole = parseEnum<MeetingTeamRole>(role, MEETING_TEAM_ROLES, 'dev');
  const parsedMetrics = parseList(metrics ?? [], MAX_METRICS_PER_TEAM, parseMetric);
  if (parsedId == null || parsedName == null || parsedRole == null || parsedMetrics == null) {
    return null;
  }
  if (boardId != null && (typeof boardId !== 'number' || !Number.isFinite(boardId))) {
    return null;
  }
  return {
    id: parsedId,
    name: parsedName,
    role: parsedRole,
    ...(typeof boardId === 'number' ? { boardId } : {}),
    metrics: parsedMetrics
  };
}

function parseBlocker(raw: unknown): IMeetingBlocker | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, severity, text, need, owner, resolved } = raw as Record<string, unknown>;
  const parsedId = parseId(id);
  const parsedSeverity = parseEnum<MeetingBlockerSeverity>(
    severity,
    MEETING_BLOCKER_SEVERITIES,
    'Moyen'
  );
  const parsedText = parseText(text, MAX_LONG_TEXT);
  const parsedNeed = parseText(need, MAX_LONG_TEXT);
  const parsedOwner = parseText(owner, MAX_SHORT_TEXT);
  if (
    parsedId == null ||
    parsedSeverity == null ||
    parsedText == null ||
    parsedNeed == null ||
    parsedOwner == null ||
    (resolved != null && typeof resolved !== 'boolean')
  ) {
    return null;
  }
  return withRowAuthors(
    {
      id: parsedId,
      severity: parsedSeverity,
      text: parsedText,
      need: parsedNeed,
      owner: parsedOwner,
      resolved: resolved === true
    },
    raw as Record<string, unknown>
  );
}

function parseInteraction(raw: unknown): IMeetingInteraction | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, from, to, subject, status } = raw as Record<string, unknown>;
  const parsedId = parseId(id);
  const parsedFrom = parseText(from, MAX_SHORT_TEXT);
  const parsedTo = parseText(to, MAX_SHORT_TEXT);
  const parsedSubject = parseText(subject, MAX_LONG_TEXT);
  const parsedStatus = parseEnum<MeetingInteractionStatus>(
    status,
    MEETING_INTERACTION_STATUSES,
    'À traiter'
  );
  if (
    parsedId == null ||
    parsedFrom == null ||
    parsedTo == null ||
    parsedSubject == null ||
    parsedStatus == null
  ) {
    return null;
  }
  return withRowAuthors(
    {
      id: parsedId,
      from: parsedFrom,
      to: parsedTo,
      subject: parsedSubject,
      status: parsedStatus
    },
    raw as Record<string, unknown>
  );
}

function parseRetroItem(raw: unknown): IMeetingRetroItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, text } = raw as Record<string, unknown>;
  const parsedId = parseId(id);
  const parsedText = parseText(text, MAX_LONG_TEXT);
  if (parsedId == null || parsedText == null) return null;
  return { id: parsedId, text: parsedText };
}

function parseAction(raw: unknown): IMeetingAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, text, owner, due, status } = raw as Record<string, unknown>;
  const parsedId = parseId(id);
  const parsedText = parseText(text, MAX_LONG_TEXT);
  const parsedOwner = parseText(owner, MAX_SHORT_TEXT);
  const parsedDue = parseDate(due, { allowEmpty: true });
  const parsedStatus = parseEnum<MeetingActionStatus>(status, MEETING_ACTION_STATUSES, 'À faire');
  if (
    parsedId == null ||
    parsedText == null ||
    parsedOwner == null ||
    parsedDue == null ||
    parsedStatus == null
  ) {
    return null;
  }
  return withRowAuthors(
    {
      id: parsedId,
      text: parsedText,
      owner: parsedOwner,
      due: parsedDue,
      status: parsedStatus
    },
    raw as Record<string, unknown>
  );
}

export interface MeetingListOps<T> {
  upsert: T[];
  remove: string[];
}

export interface MeetingTeamsOps extends MeetingListOps<IMeetingTeam> {
  removeMetrics: string[];
}

export interface MeetingRetroOps {
  keep: MeetingListOps<IMeetingRetroItem>;
  stop: MeetingListOps<IMeetingRetroItem>;
  try: MeetingListOps<IMeetingRetroItem>;
}

export type WeeklyMeetingPatch = {
  sprint?: IMeetingSprint;
  teams?: MeetingTeamsOps;
  blockers?: MeetingListOps<IMeetingBlocker>;
  interactions?: MeetingListOps<IMeetingInteraction>;
  retro?: MeetingRetroOps;
  actions?: MeetingListOps<IMeetingAction>;
};

function parseListOps<T>(
  raw: unknown,
  max: number,
  parseItem: (item: unknown) => T | null
): MeetingListOps<T> | null {
  if (Array.isArray(raw)) {
    const upsert = parseList(raw, max, parseItem);
    return upsert == null ? null : { upsert, remove: [] };
  }
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  if (!('upsert' in source) && !('remove' in source)) return null;
  const upsert = parseList(source.upsert ?? [], max, parseItem);
  const remove = parseIdList(source.remove ?? [], max);
  if (upsert == null || remove == null) return null;
  return { upsert, remove };
}

function parseTeamsOps(raw: unknown): MeetingTeamsOps | null {
  if (Array.isArray(raw)) {
    const upsert = parseList(raw, MAX_TEAMS, parseTeam);
    return upsert == null ? null : { upsert, remove: [], removeMetrics: [] };
  }
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  if (!('upsert' in source) && !('remove' in source) && !('removeMetrics' in source)) return null;
  const upsert = parseList(source.upsert ?? [], MAX_TEAMS, parseTeam);
  const remove = parseIdList(source.remove ?? [], MAX_TEAMS);
  const removeMetrics = parseIdList(source.removeMetrics ?? [], MAX_METRICS_PER_TEAM * MAX_TEAMS);
  if (upsert == null || remove == null || removeMetrics == null) return null;
  return { upsert, remove, removeMetrics };
}

function parseRetroOps(raw: unknown): MeetingRetroOps | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const retro: MeetingRetroOps = {
    keep: { upsert: [], remove: [] },
    stop: { upsert: [], remove: [] },
    try: { upsert: [], remove: [] }
  };
  let hasColumn = false;
  for (const column of MEETING_RETRO_COLUMNS) {
    if (!(column in source)) continue;
    const ops = parseListOps(source[column], MAX_ROWS, parseRetroItem);
    if (ops == null) return null;
    retro[column] = ops;
    hasColumn = true;
  }
  return hasColumn ? retro : null;
}

/**
 * Fusionne une liste par id : upsert remplace ou ajoute, remove retire.
 * Les lignes absentes de upsert ne sont pas considérées comme supprimées.
 */
export function mergeMeetingRows<T extends { id: string }>(
  current: T[],
  ops: MeetingListOps<T>
): T[] {
  const remove = new Set(ops.remove);
  const upserts = new Map(ops.upsert.map((row) => [row.id, row]));
  const result: T[] = [];
  const seen = new Set<string>();

  for (const row of current) {
    if (remove.has(row.id)) continue;
    result.push(upserts.get(row.id) ?? row);
    seen.add(row.id);
  }
  for (const row of ops.upsert) {
    if (remove.has(row.id) || seen.has(row.id)) continue;
    result.push(row);
    seen.add(row.id);
  }
  return result;
}

export function mergeMeetingTeams(current: IMeetingTeam[], ops: MeetingTeamsOps): IMeetingTeam[] {
  const currentById = new Map(current.map((team) => [team.id, team]));
  const upserts = ops.upsert.map((incoming) => {
    const existing = currentById.get(incoming.id);
    if (!existing) return incoming;
    return {
      ...incoming,
      metrics: mergeMeetingRows(existing.metrics, { upsert: incoming.metrics, remove: ops.removeMetrics })
    };
  });
  return mergeMeetingRows(current, { upsert: upserts, remove: ops.remove }).map((team) => ({
    ...team,
    metrics: team.metrics.filter((metric) => !ops.removeMetrics.includes(metric.id))
  }));
}

export function mergeMeetingRetro(current: IMeetingRetro, ops: MeetingRetroOps): IMeetingRetro {
  return {
    keep: mergeMeetingRows(current.keep, ops.keep),
    stop: mergeMeetingRows(current.stop, ops.stop),
    try: mergeMeetingRows(current.try, ops.try)
  };
}

export function applyMeetingPatch(
  current: WeeklyMeetingDraft,
  patch: WeeklyMeetingPatch
): WeeklyMeetingDraft {
  return {
    sprint: patch.sprint ?? current.sprint,
    teams: patch.teams ? mergeMeetingTeams(current.teams, patch.teams) : current.teams,
    blockers: patch.blockers ? mergeMeetingRows(current.blockers, patch.blockers) : current.blockers,
    interactions: patch.interactions
      ? mergeMeetingRows(current.interactions, patch.interactions)
      : current.interactions,
    retro: patch.retro ? mergeMeetingRetro(current.retro, patch.retro) : current.retro,
    actions: patch.actions ? mergeMeetingRows(current.actions, patch.actions) : current.actions
  };
}

type RowWithAuthor = { id: string; createdBy?: IMeetingRowAuthor; updatedBy?: IMeetingRowAuthor };

function stampListAuthors<T extends RowWithAuthor>(
  current: T[],
  ops: MeetingListOps<T>,
  author: IMeetingRowAuthor
): MeetingListOps<T> {
  const existingById = new Map(current.map((row) => [row.id, row]));
  return {
    remove: ops.remove,
    upsert: ops.upsert.map((row) => {
      const existing = existingById.get(row.id);
      return {
        ...row,
        createdBy: existing?.createdBy ?? author,
        updatedBy: author
      };
    })
  };
}

/** Pose createdBy à la création et updatedBy à chaque édition. Ne fait pas confiance au client. */
export function stampMeetingPatchAuthors(
  current: WeeklyMeetingDraft,
  patch: WeeklyMeetingPatch,
  author: IMeetingRowAuthor
): WeeklyMeetingPatch {
  return {
    ...patch,
    blockers: patch.blockers ? stampListAuthors(current.blockers, patch.blockers, author) : undefined,
    interactions: patch.interactions
      ? stampListAuthors(current.interactions, patch.interactions, author)
      : undefined,
    actions: patch.actions ? stampListAuthors(current.actions, patch.actions, author) : undefined
  };
}

export function snapshotFromPatch(
  next: WeeklyMeetingDraft,
  patch: WeeklyMeetingPatch
): Partial<WeeklyMeetingDraft> {
  const snapshot: Partial<WeeklyMeetingDraft> = {};
  if (patch.sprint) snapshot.sprint = next.sprint;
  if (patch.teams) snapshot.teams = next.teams;
  if (patch.blockers) snapshot.blockers = next.blockers;
  if (patch.interactions) snapshot.interactions = next.interactions;
  if (patch.retro) snapshot.retro = next.retro;
  if (patch.actions) snapshot.actions = next.actions;
  return snapshot;
}

/**
 * Valide une mise à jour partielle : seules les sections présentes dans le corps
 * de la requête sont retournées. Renvoie null si une section est mal formée.
 * Un tableau plat est accepté (rétrocompatibilité) et traité comme un upsert sans remove.
 */
export function parseWeeklyMeetingPatch(body: unknown): WeeklyMeetingPatch | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const source = body as Record<string, unknown>;
  const patch: WeeklyMeetingPatch = {};

  if ('sprint' in source) {
    const sprint = parseSprint(source.sprint);
    if (sprint == null) return null;
    patch.sprint = sprint;
  }
  if ('teams' in source) {
    const teams = parseTeamsOps(source.teams);
    if (teams == null) return null;
    patch.teams = teams;
  }
  if ('blockers' in source) {
    const blockers = parseListOps(source.blockers, MAX_ROWS, parseBlocker);
    if (blockers == null) return null;
    patch.blockers = blockers;
  }
  if ('interactions' in source) {
    const interactions = parseListOps(source.interactions, MAX_ROWS, parseInteraction);
    if (interactions == null) return null;
    patch.interactions = interactions;
  }
  if ('retro' in source) {
    const retro = parseRetroOps(source.retro);
    if (retro == null) return null;
    patch.retro = retro;
  }
  if ('actions' in source) {
    const actions = parseListOps(source.actions, MAX_ROWS, parseAction);
    if (actions == null) return null;
    patch.actions = actions;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
