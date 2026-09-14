/**
 * Logique métier du point hebdo sprint (Dev & QA), extraite du composant pour
 * rester testable sans DOM : déroulé de la séance, minuteur, préremplissage des
 * chiffres depuis Jira et génération du compte-rendu.
 */

export type MeetingTeamRole = 'dev' | 'qa';
export type MeetingBlockerSeverity = 'Faible' | 'Moyen' | 'Élevé' | 'Critique';
export type MeetingInteractionStatus = 'À traiter' | 'En cours' | 'OK';
export type MeetingActionStatus = 'À faire' | 'En cours' | 'Fait';
export type MeetingRetroColumn = 'keep' | 'stop' | 'try';
export type MeetingMetricSource = 'jira' | 'manual';

export const MEETING_BLOCKER_SEVERITIES: MeetingBlockerSeverity[] = [
  'Faible',
  'Moyen',
  'Élevé',
  'Critique'
];
export const MEETING_INTERACTION_STATUSES: MeetingInteractionStatus[] = [
  'À traiter',
  'En cours',
  'OK'
];
export const MEETING_ACTION_STATUSES: MeetingActionStatus[] = ['À faire', 'En cours', 'Fait'];

export interface MeetingMetric {
  id: string;
  label: string;
  value: string;
  target: string;
  source: MeetingMetricSource;
}

export interface MeetingTeam {
  id: string;
  name: string;
  role: MeetingTeamRole;
  boardId?: number;
  metrics: MeetingMetric[];
}

export interface MeetingRowAuthor {
  id: string;
  name: string;
}

export interface MeetingBlocker {
  id: string;
  severity: MeetingBlockerSeverity;
  text: string;
  need: string;
  owner: string;
  resolved: boolean;
  createdBy?: MeetingRowAuthor;
  updatedBy?: MeetingRowAuthor;
}

export interface MeetingInteraction {
  id: string;
  from: string;
  to: string;
  subject: string;
  status: MeetingInteractionStatus;
  createdBy?: MeetingRowAuthor;
  updatedBy?: MeetingRowAuthor;
}

export interface MeetingRetroItem {
  id: string;
  text: string;
}

export interface MeetingRetro {
  keep: MeetingRetroItem[];
  stop: MeetingRetroItem[];
  try: MeetingRetroItem[];
}

export interface MeetingAction {
  id: string;
  text: string;
  owner: string;
  due: string;
  status: MeetingActionStatus;
  createdBy?: MeetingRowAuthor;
  updatedBy?: MeetingRowAuthor;
}

export interface MeetingSprint {
  name: string;
  number: string;
  goal: string;
  date: string;
}

export interface MeetingAuthor {
  id: string;
  email: string;
  name?: string;
}

export interface WeeklyMeeting {
  id: string;
  sprint: MeetingSprint;
  teams: MeetingTeam[];
  blockers: MeetingBlocker[];
  interactions: MeetingInteraction[];
  retro: MeetingRetro;
  actions: MeetingAction[];
  createdBy?: MeetingAuthor;
  updatedBy?: MeetingAuthor;
  createdAt?: string;
  updatedAt?: string;
}

export interface WeeklyMeetingSummary {
  id: string;
  sprint: MeetingSprint;
  updatedAt?: string;
  updatedBy?: MeetingAuthor;
  summary: {
    teamCount: number;
    openBlockerCount: number;
    openActionCount: number;
  };
}

export interface MeetingListOps<T> {
  upsert: T[];
  remove: string[];
}

export interface MeetingTeamsOps extends MeetingListOps<MeetingTeam> {
  removeMetrics?: string[];
}

export interface MeetingRetroOps {
  keep?: MeetingListOps<MeetingRetroItem>;
  stop?: MeetingListOps<MeetingRetroItem>;
  try?: MeetingListOps<MeetingRetroItem>;
}

/** Payload d'écriture : upsert/remove par ligne, pas le tableau entier. */
export type WeeklyMeetingPatch = {
  sprint?: MeetingSprint;
  teams?: MeetingTeamsOps;
  blockers?: MeetingListOps<MeetingBlocker>;
  interactions?: MeetingListOps<MeetingInteraction>;
  retro?: MeetingRetroOps;
  actions?: MeetingListOps<MeetingAction>;
};

/** Section complète renvoyée par le socket après fusion serveur. */
export type WeeklyMeetingSnapshotPatch = Partial<
  Pick<WeeklyMeeting, 'sprint' | 'teams' | 'blockers' | 'interactions' | 'retro' | 'actions'>
>;

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

export function mergeMeetingTeams(current: MeetingTeam[], ops: MeetingTeamsOps): MeetingTeam[] {
  const removeMetrics = ops.removeMetrics ?? [];
  const currentById = new Map(current.map((team) => [team.id, team]));
  const upserts = ops.upsert.map((incoming) => {
    const existing = currentById.get(incoming.id);
    if (!existing) return incoming;
    return {
      ...incoming,
      metrics: mergeMeetingRows(existing.metrics, { upsert: incoming.metrics, remove: removeMetrics })
    };
  });
  return mergeMeetingRows(current, { upsert: upserts, remove: ops.remove }).map((team) => ({
    ...team,
    metrics: team.metrics.filter((metric) => !removeMetrics.includes(metric.id))
  }));
}

function emptyRetroOps(): Required<MeetingRetroOps> {
  return {
    keep: { upsert: [], remove: [] },
    stop: { upsert: [], remove: [] },
    try: { upsert: [], remove: [] }
  };
}

export function applyMeetingWritePatch(
  meeting: WeeklyMeeting,
  patch: WeeklyMeetingPatch
): WeeklyMeeting {
  const retroOps = { ...emptyRetroOps(), ...patch.retro };
  return {
    ...meeting,
    sprint: patch.sprint ?? meeting.sprint,
    teams: patch.teams ? mergeMeetingTeams(meeting.teams, patch.teams) : meeting.teams,
    blockers: patch.blockers ? mergeMeetingRows(meeting.blockers, patch.blockers) : meeting.blockers,
    interactions: patch.interactions
      ? mergeMeetingRows(meeting.interactions, patch.interactions)
      : meeting.interactions,
    retro: patch.retro
      ? {
          keep: mergeMeetingRows(meeting.retro.keep, retroOps.keep),
          stop: mergeMeetingRows(meeting.retro.stop, retroOps.stop),
          try: mergeMeetingRows(meeting.retro.try, retroOps.try)
        }
      : meeting.retro,
    actions: patch.actions ? mergeMeetingRows(meeting.actions, patch.actions) : meeting.actions
  };
}

function mergeListOps<T extends { id: string }>(
  base: MeetingListOps<T> | undefined,
  next: MeetingListOps<T>
): MeetingListOps<T> {
  const remove = new Set([...(base?.remove ?? []), ...next.remove]);
  const upsertById = new Map<string, T>();
  for (const row of base?.upsert ?? []) {
    if (!remove.has(row.id)) upsertById.set(row.id, row);
  }
  for (const row of next.upsert) {
    if (!remove.has(row.id)) upsertById.set(row.id, row);
  }
  return { upsert: [...upsertById.values()], remove: [...remove] };
}

export function mergeMeetingWritePatches(
  base: WeeklyMeetingPatch,
  next: WeeklyMeetingPatch
): WeeklyMeetingPatch {
  const merged: WeeklyMeetingPatch = {};
  const sprint = next.sprint ?? base.sprint;
  if (sprint) merged.sprint = sprint;

  const teams = next.teams
    ? (() => {
        const removeMetrics = [
          ...new Set([...(base.teams?.removeMetrics ?? []), ...(next.teams.removeMetrics ?? [])])
        ];
        return {
          ...mergeListOps(base.teams, next.teams),
          ...(removeMetrics.length > 0 ? { removeMetrics } : {})
        };
      })()
    : base.teams;
  if (teams) merged.teams = teams;

  const blockers = next.blockers ? mergeListOps(base.blockers, next.blockers) : base.blockers;
  if (blockers) merged.blockers = blockers;

  const interactions = next.interactions
    ? mergeListOps(base.interactions, next.interactions)
    : base.interactions;
  if (interactions) merged.interactions = interactions;

  const retro = next.retro
    ? {
        keep: next.retro.keep ? mergeListOps(base.retro?.keep, next.retro.keep) : base.retro?.keep,
        stop: next.retro.stop ? mergeListOps(base.retro?.stop, next.retro.stop) : base.retro?.stop,
        try: next.retro.try ? mergeListOps(base.retro?.try, next.retro.try) : base.retro?.try
      }
    : base.retro;
  if (retro) merged.retro = retro;

  const actions = next.actions ? mergeListOps(base.actions, next.actions) : base.actions;
  if (actions) merged.actions = actions;

  return merged;
}

export function isMeetingWritePatchEmpty(patch: WeeklyMeetingPatch): boolean {
  return (
    patch.sprint == null &&
    patch.teams == null &&
    patch.blockers == null &&
    patch.interactions == null &&
    patch.retro == null &&
    patch.actions == null
  );
}

/**
 * Applique une liste distante complète en conservant les lignes encore dirty
 * localement (saisie en cours ou flush en vol).
 */
export function applyRemoteRows<T extends { id: string }>(
  local: T[],
  remote: T[],
  dirtyUpsertIds: ReadonlySet<string>,
  pendingRemoveIds: ReadonlySet<string>
): T[] {
  const localById = new Map(local.map((row) => [row.id, row]));
  const result: T[] = [];
  const seen = new Set<string>();

  for (const row of remote) {
    if (pendingRemoveIds.has(row.id)) continue;
    if (dirtyUpsertIds.has(row.id)) {
      const localRow = localById.get(row.id);
      if (localRow) {
        result.push(localRow);
        seen.add(row.id);
      }
      continue;
    }
    result.push(row);
    seen.add(row.id);
  }

  for (const row of local) {
    if (dirtyUpsertIds.has(row.id) && !seen.has(row.id)) {
      result.push(row);
    }
  }
  return result;
}

export function applyRemoteSnapshot(
  meeting: WeeklyMeeting,
  snapshot: WeeklyMeetingSnapshotPatch,
  pending: WeeklyMeetingPatch,
  inFlight: WeeklyMeetingPatch
): WeeklyMeeting {
  const dirty = mergeMeetingWritePatches(inFlight, pending);
  const next = { ...meeting };

  if (snapshot.sprint && dirty.sprint == null) {
    next.sprint = snapshot.sprint;
  }
  if (snapshot.teams) {
    next.teams = applyRemoteRows(
      meeting.teams,
      snapshot.teams,
      new Set((dirty.teams?.upsert ?? []).map((row) => row.id)),
      new Set(dirty.teams?.remove ?? [])
    );
  }
  if (snapshot.blockers) {
    next.blockers = applyRemoteRows(
      meeting.blockers,
      snapshot.blockers,
      new Set((dirty.blockers?.upsert ?? []).map((row) => row.id)),
      new Set(dirty.blockers?.remove ?? [])
    );
  }
  if (snapshot.interactions) {
    next.interactions = applyRemoteRows(
      meeting.interactions,
      snapshot.interactions,
      new Set((dirty.interactions?.upsert ?? []).map((row) => row.id)),
      new Set(dirty.interactions?.remove ?? [])
    );
  }
  if (snapshot.actions) {
    next.actions = applyRemoteRows(
      meeting.actions,
      snapshot.actions,
      new Set((dirty.actions?.upsert ?? []).map((row) => row.id)),
      new Set(dirty.actions?.remove ?? [])
    );
  }
  if (snapshot.retro) {
    next.retro = {
      keep: applyRemoteRows(
        meeting.retro.keep,
        snapshot.retro.keep,
        new Set((dirty.retro?.keep?.upsert ?? []).map((row) => row.id)),
        new Set(dirty.retro?.keep?.remove ?? [])
      ),
      stop: applyRemoteRows(
        meeting.retro.stop,
        snapshot.retro.stop,
        new Set((dirty.retro?.stop?.upsert ?? []).map((row) => row.id)),
        new Set(dirty.retro?.stop?.remove ?? [])
      ),
      try: applyRemoteRows(
        meeting.retro.try,
        snapshot.retro.try,
        new Set((dirty.retro?.try?.upsert ?? []).map((row) => row.id)),
        new Set(dirty.retro?.try?.remove ?? [])
      )
    };
  }
  return next;
}

export function rowAuthorLabel(
  row: { createdBy?: MeetingRowAuthor; updatedBy?: MeetingRowAuthor } | undefined
): string | undefined {
  const name = row?.createdBy?.name || row?.updatedBy?.name;
  return name?.trim() || undefined;
}

function stampRowAuthors<T extends { id: string; createdBy?: MeetingRowAuthor; updatedBy?: MeetingRowAuthor }>(
  local: T[],
  remote: T[] | undefined
): T[] {
  if (!remote) return local;
  const byId = new Map(remote.map((row) => [row.id, row]));
  return local.map((row) => {
    const serverRow = byId.get(row.id);
    if (!serverRow) return row;
    return {
      ...row,
      ...(serverRow.createdBy ? { createdBy: serverRow.createdBy } : {}),
      ...(serverRow.updatedBy ? { updatedBy: serverRow.updatedBy } : {})
    };
  });
}

/** Reprend seulement les auteurs posés par le serveur, sans remplacer les listes locales. */
export function stampAuthorsFromServer(local: WeeklyMeeting, server: WeeklyMeeting): WeeklyMeeting {
  return {
    ...local,
    blockers: stampRowAuthors(local.blockers, server.blockers),
    interactions: stampRowAuthors(local.interactions, server.interactions),
    actions: stampRowAuthors(local.actions, server.actions)
  };
}

export function meetingRowAuthorFromUser(
  user: { id: string; email: string; firstName?: string } | null | undefined
): MeetingRowAuthor | undefined {
  if (!user) return undefined;
  const name = user.firstName?.trim() || user.email.split('@')[0];
  return name ? { id: user.id, name } : undefined;
}

export interface MeetingPhase {
  id: string;
  label: string;
  budgetMinutes: number;
}

/** Déroulé de la séance : 60 minutes réparties en quatre temps. */
export const MEETING_PHASES: MeetingPhase[] = [
  { id: 'chiffres', label: 'Avancée du sprint', budgetMinutes: 20 },
  { id: 'blocages', label: 'Points bloquants', budgetMinutes: 15 },
  { id: 'interactions', label: 'Interactions entre équipes', budgetMinutes: 10 },
  { id: 'amelioration', label: 'Amélioration continue', budgetMinutes: 15 }
];

export const MEETING_TOTAL_BUDGET_SECONDS = MEETING_PHASES.reduce(
  (total, phase) => total + phase.budgetMinutes * 60,
  0
);

export const RETRO_COLUMNS: Array<{ key: MeetingRetroColumn; title: string; hint: string }> = [
  { key: 'keep', title: 'Continuer', hint: 'Ce qui marche' },
  { key: 'stop', title: 'Arrêter', hint: 'Ce qui gêne' },
  { key: 'try', title: 'Essayer', hint: 'À tester ce sprint' }
];

export const DEFAULT_DEV_METRIC_LABELS = [
  'Points engagés',
  'Points réalisés',
  'Tickets en cours',
  'Tickets terminés',
  'Bugs ouverts'
];

export const DEFAULT_QA_METRIC_LABELS = [
  'Tickets en cours',
  'Tickets en QA',
  'Tickets terminés',
  'Bugs ouverts',
  'Bugs détectés'
];

/** Anciens indicateurs QA (saisie manuelle) : un point encore vierge bascule vers le set Jira. */
export const LEGACY_QA_METRIC_LABELS = [
  'Cas de test exécutés',
  'Taux de réussite (%)',
  'Bugs détectés',
  'Bugs critiques',
  'Couverture (%)'
];

let rowIdCounter = 0;

/** Identifiant local d'une ligne ajoutée pendant la réunion. */
export function createMeetingRowId(): string {
  rowIdCounter += 1;
  return `m${Date.now().toString(36)}${rowIdCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

/** Formate une durée en MM:SS, préfixée d'un « - » lorsque le budget est dépassé. */
export function formatMeetingClock(seconds: number): string {
  const negative = seconds < 0;
  const absolute = Math.abs(Math.round(seconds));
  const minutes = Math.floor(absolute / 60);
  const rest = absolute % 60;
  return `${negative ? '-' : ''}${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/** Temps restant sur la phase courante ; négatif en cas de dépassement. */
export function computePhaseRemainingSeconds(
  phaseIndex: number,
  elapsedSeconds: number,
  phaseStartedAtSeconds: number
): number {
  const phase = MEETING_PHASES[phaseIndex];
  if (!phase) return 0;
  return phase.budgetMinutes * 60 - (elapsedSeconds - phaseStartedAtSeconds);
}

/** Convertit une saisie utilisateur en nombre, en tolérant la virgule décimale. */
export function parseMetricNumber(raw: string): number | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Avancement d'un indicateur vers sa cible, borné à 100 %. Null si non calculable. */
export function computeMetricProgress(value: string, target: string): number | null {
  const current = parseMetricNumber(value);
  const objective = parseMetricNumber(target);
  if (current == null || objective == null || objective <= 0) return null;
  return Math.max(0, Math.min(100, (current / objective) * 100));
}

/* ------------------------------------------------------------------ *
 * Préremplissage depuis Jira
 * ------------------------------------------------------------------ */

export interface SprintBoardIssue {
  issueType: string;
  statusCategoryKey: string;
  /** Date de résolution Jira (ISO), absente si le ticket n'est pas résolu. */
  resolutionDate?: string | null;
}

export interface SprintBoardResult {
  boardId: number;
  name?: string;
  statusCounts?: { total: number; todo: number; inProgress: number; qa: number; resolved: number };
  storyPointsByStatus?: {
    total: number;
    todo: number;
    inProgress: number;
    qa: number;
    resolved: number;
  };
  issues?: SprintBoardIssue[];
}

const BUG_ISSUE_TYPES = ['bug', 'bogue', 'anomalie', 'defaut'];

function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isBugIssue(issue: SprintBoardIssue): boolean {
  const type = normalizeLabel(issue.issueType ?? '');
  return BUG_ISSUE_TYPES.some((bugType) => type.includes(bugType));
}

function isOpenIssue(issue: SprintBoardIssue): boolean {
  return (issue.statusCategoryKey ?? '').toLowerCase() !== 'done';
}

/**
 * Valeurs proposées pour un board, indexées par libellé d'indicateur normalisé.
 * Dev et QA partagent les compteurs de tickets / bugs ; seuls les points
 * (engagés, réalisés) n'ont de sens que sur un board Dev.
 */
export function computeBoardPrefill(board: SprintBoardResult): Record<string, string> {
  const statusCounts = board.statusCounts ?? { total: 0, todo: 0, inProgress: 0, qa: 0, resolved: 0 };
  const points = board.storyPointsByStatus ?? {
    total: 0,
    todo: 0,
    inProgress: 0,
    qa: 0,
    resolved: 0
  };
  const issues = board.issues ?? [];
  const bugs = issues.filter(isBugIssue);

  return {
    [normalizeLabel('Points engagés')]: String(points.total),
    [normalizeLabel('Points réalisés')]: String(points.resolved),
    [normalizeLabel('Tickets en cours')]: String(statusCounts.inProgress),
    [normalizeLabel('Tickets terminés')]: String(statusCounts.resolved),
    [normalizeLabel('Tickets en QA')]: String(statusCounts.qa),
    [normalizeLabel('Bugs ouverts')]: String(bugs.filter(isOpenIssue).length),
    [normalizeLabel('Bugs détectés')]: String(bugs.length)
  };
}

/**
 * Cibles proposées pour un board, indexées par libellé d'indicateur normalisé.
 * Seul « Tickets terminés » a une cible source Jira (le nombre total de tickets
 * de l'équipe sur le sprint en cours) — les autres cibles spéciales (« Points
 * réalisés » = cible « Points engagés », etc.) sont dérivées côté affichage,
 * voir {@link getMetricTargetMode}.
 */
export function computeBoardPrefillTargets(board: SprintBoardResult): Record<string, string> {
  const statusCounts = board.statusCounts ?? { total: 0, todo: 0, inProgress: 0, qa: 0, resolved: 0 };
  return {
    [normalizeLabel('Tickets terminés')]: String(statusCounts.total)
  };
}

/**
 * Applique les valeurs (et cibles Jira connues) aux indicateurs d'une équipe rattachée
 * à un board. Les valeurs saisies à la main ne sont jamais écrasées ; une cible déjà
 * renseignée (manuellement ou par un préremplissage précédent) n'est jamais écrasée non plus.
 */
export function applyPrefillToTeam(team: MeetingTeam, board: SprintBoardResult | undefined): MeetingTeam {
  if (!board) return team;
  const prefill = computeBoardPrefill(board);
  const prefillTargets = computeBoardPrefillTargets(board);

  return {
    ...team,
    metrics: team.metrics.map((metric) => {
      const suggested = prefill[normalizeLabel(metric.label)];
      const suggestedTarget = prefillTargets[normalizeLabel(metric.label)];

      const withTarget =
        suggestedTarget !== undefined && metric.target.trim() === ''
          ? { ...metric, target: suggestedTarget }
          : metric;

      if (suggested === undefined) return withTarget;
      if (metric.source === 'manual' && metric.value.trim() !== '') return withTarget;
      return { ...withTarget, value: suggested, source: 'jira' as MeetingMetricSource };
    })
  };
}

/**
 * Comment la cible (« cible ») d'un indicateur par défaut doit être présentée :
 * - `auto-engaged-points` : lecture seule, toujours égale à la valeur de l'indicateur
 *   « Points engagés » de la même équipe (« Points réalisés »).
 * - `hidden` : pas de cible pertinente (« Tickets en cours », « Bugs ouverts ») — le champ
 *   n'est pas affiché.
 * - `manual` : cible librement éditable (comportement par défaut, y compris pour les
 *   indicateurs personnalisés et « Tickets terminés », dont la cible est seulement
 *   suggérée depuis Jira via {@link computeBoardPrefillTargets}).
 */
export type MetricTargetMode = 'auto-engaged-points' | 'hidden' | 'manual';

const METRIC_TARGET_MODE_BY_LABEL: Record<string, MetricTargetMode> = {
  [normalizeLabel('Points réalisés')]: 'auto-engaged-points',
  [normalizeLabel('Tickets en cours')]: 'hidden',
  [normalizeLabel('Tickets en QA')]: 'hidden',
  [normalizeLabel('Bugs ouverts')]: 'hidden',
  [normalizeLabel('Bugs détectés')]: 'hidden'
};

export function getMetricTargetMode(label: string): MetricTargetMode {
  return METRIC_TARGET_MODE_BY_LABEL[normalizeLabel(label)] ?? 'manual';
}

/** Valeur de l'indicateur « Points engagés » de l'équipe (cible dérivée de « Points réalisés »). */
export function findEngagedPointsValue(metrics: MeetingMetric[]): string {
  const engaged = metrics.find((m) => normalizeLabel(m.label) === normalizeLabel('Points engagés'));
  return engaged?.value ?? '';
}

/** Applique le préremplissage à toutes les équipes ayant un board renseigné. */
export function applyPrefillToTeams(
  teams: MeetingTeam[],
  boards: SprintBoardResult[]
): MeetingTeam[] {
  const byBoardId = new Map(boards.map((board) => [board.boardId, board]));
  return teams.map((team) =>
    team.boardId == null ? team : applyPrefillToTeam(team, byBoardId.get(team.boardId))
  );
}

/* ------------------------------------------------------------------ *
 * Burndown du sprint (reconstruit)
 * ------------------------------------------------------------------ */

export type ResolvedByDayRow = Record<string, string | number>;

/** Réponse de `GET /api/jira/resolved-by-day?activeSprint=true&mode=points`. */
export interface ResolvedByDayResult {
  byDay: ResolvedByDayRow[];
  dateRange: { from: string; to: string };
}

export interface BurndownPoint {
  date: string;
  /** Reste à faire en fin de journée ; null pour les jours encore à venir. */
  remaining: number | null;
  /** Périmètre du sprint ce jour-là (monte si on ajoute, descend si on retire). */
  scope: number;
  /** Trajectoire idéale, décroissante sur les jours ouvrés uniquement. */
  ideal: number;
}

export type BurndownUnit = 'points' | 'tickets';

export interface TeamBurndown {
  unit: BurndownUnit;
  scopePoints: number;
  completedPoints: number;
  remainingPoints: number;
  idealPoints: number;
  /** Positif = en avance sur la trajectoire idéale, négatif = en retard. */
  deltaPoints: number;
  days: BurndownPoint[];
}

const MAX_SPRINT_DAYS = 200;

function roundPoints(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Liste des jours d'un intervalle, bornes incluses, au format YYYY-MM-DD. */
export function listDaysInclusive(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const days: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && days.length < MAX_SPRINT_DAYS) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Jour ouvré = du lundi au vendredi. */
export function isWorkingDay(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

/**
 * Story points résolus pour une série donnée, en gérant les deux formats de
 * `resolved-by-day` : séries nommées par équipe (`<nom>_points`) ou par board
 * (`board_<id>`, qui porte déjà des points lorsque `mode=points`).
 */
export function readResolvedPointsForSeries(
  row: ResolvedByDayRow,
  seriesName: string | undefined,
  boardId?: number
): number {
  if (seriesName) {
    const named = row[`${seriesName}_points`];
    if (typeof named === 'number') return named;
  }
  if (boardId != null) {
    const byBoard = row[`board_${boardId}`];
    if (typeof byBoard === 'number') return byBoard;
  }
  return 0;
}

/**
 * Tickets résolus pour une série : `resolved-by-day` en `mode=tickets` pose le
 * compte sur le nom d'équipe, ou sur `board_<id>` dans le format historique.
 */
export function readResolvedTicketsForSeries(
  row: ResolvedByDayRow,
  seriesName: string | undefined,
  boardId?: number
): number {
  if (seriesName) {
    const named = row[seriesName];
    if (typeof named === 'number') return named;
  }
  if (boardId != null) {
    const byBoard = row[`board_${boardId}`];
    if (typeof byBoard === 'number') return byBoard;
  }
  return 0;
}

function clampDateToRange(date: string, from: string, to: string): string {
  if (date < from) return from;
  if (date > to) return to;
  return date;
}

/**
 * Reconstruit un historique « résolus par jour » à partir des dates de
 * résolution des tickets d'un board (burndown QA, sans story points).
 */
export function buildTicketResolvedByDay(
  issues: Array<{ resolutionDate?: string | null }>,
  dateRange: { from: string; to: string },
  seriesName: string
): ResolvedByDayResult {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    const raw = issue.resolutionDate?.split('T')[0];
    if (!raw) continue;
    const date = clampDateToRange(raw, dateRange.from, dateRange.to);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  return {
    dateRange,
    byDay: listDaysInclusive(dateRange.from, dateRange.to).map((date) => ({
      date,
      [seriesName]: counts.get(date) ?? 0
    }))
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Burndown approché d'une équipe : le périmètre est celui constaté aujourd'hui,
 * duquel on retire le cumul des story points résolus jour après jour. Les
 * changements de périmètre en cours de sprint ne sont donc pas visibles ; une
 * courbe qui passe sous zéro signale des tickets résolus hors du périmètre
 * actuel (typiquement sortis du sprint).
 */
export function computeTeamBurndown(params: {
  scopePoints: number;
  seriesName?: string;
  boardId?: number;
  resolved: ResolvedByDayResult | null;
  today?: string;
  unit?: BurndownUnit;
}): TeamBurndown | null {
  const { scopePoints, seriesName, boardId, resolved, today = todayIso(), unit = 'points' } = params;
  if (!resolved?.dateRange?.from || !resolved?.dateRange?.to) return null;

  const days = listDaysInclusive(resolved.dateRange.from, resolved.dateRange.to);
  if (days.length === 0) return null;

  const readValue = unit === 'tickets' ? readResolvedTicketsForSeries : readResolvedPointsForSeries;
  const resolvedByDate = new Map<string, number>();
  for (const row of resolved.byDay ?? []) {
    const date = typeof row.date === 'string' ? row.date : '';
    if (!date) continue;
    resolvedByDate.set(date, readValue(row, seriesName, boardId));
  }

  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const reference = today < firstDay ? firstDay : today > lastDay ? lastDay : today;

  const workingDayCount = days.filter(isWorkingDay).length || days.length;

  let cumulative = 0;
  let workingElapsed = 0;
  let completedPoints = 0;
  let remainingPoints = scopePoints;
  let idealPoints = scopePoints;

  const points: BurndownPoint[] = days.map((date) => {
    cumulative += resolvedByDate.get(date) ?? 0;
    if (isWorkingDay(date)) workingElapsed += 1;

    const ideal = roundPoints(Math.max(0, scopePoints * (1 - workingElapsed / workingDayCount)));
    const isPast = date <= reference;
    const remaining = isPast ? roundPoints(scopePoints - cumulative) : null;

    if (date === reference) {
      completedPoints = roundPoints(cumulative);
      remainingPoints = roundPoints(scopePoints - cumulative);
      idealPoints = ideal;
    }

    return { date, remaining, scope: roundPoints(scopePoints), ideal };
  });

  return {
    unit,
    scopePoints: roundPoints(scopePoints),
    completedPoints,
    remainingPoints,
    idealPoints,
    deltaPoints: roundPoints(idealPoints - remainingPoints),
    days: points
  };
}

/* ------------------------------------------------------------------ *
 * Compte-rendu
 * ------------------------------------------------------------------ */

/** Compte-rendu texte prêt à coller dans un canal d'équipe. */
export function buildMeetingReport(meeting: WeeklyMeeting): string {
  const lines: string[] = [];
  const { sprint } = meeting;

  lines.push(`# ${sprint.name} n°${sprint.number} — point du ${sprint.date}`);
  if (sprint.goal) lines.push(`Objectif : ${sprint.goal}`);

  lines.push('', '## Chiffres');
  meeting.teams.forEach((team) => {
    lines.push(`- ${team.name} (${team.role.toUpperCase()})`);
    team.metrics.forEach((metric) => {
      const target = metric.target ? ` / ${metric.target}` : '';
      lines.push(`    · ${metric.label} : ${metric.value || '—'}${target}`);
    });
  });

  lines.push('', '## Points bloquants');
  if (meeting.blockers.length === 0) {
    lines.push('- aucun');
  }
  meeting.blockers.forEach((blocker) => {
    const resolved = blocker.resolved ? ' (levé)' : '';
    const need = blocker.need ? ` → à lever : ${blocker.need}` : '';
    const owner = blocker.owner ? ` (resp. ${blocker.owner})` : '';
    lines.push(`- [${blocker.severity}]${resolved} ${blocker.text || '—'}${need}${owner}`);
  });

  lines.push('', '## Interactions entre équipes');
  if (meeting.interactions.length === 0) {
    lines.push('- aucune');
  }
  meeting.interactions.forEach((interaction) => {
    lines.push(
      `- ${interaction.from || '?'} → ${interaction.to || '?'} [${interaction.status}] : ${
        interaction.subject || '—'
      }`
    );
  });

  lines.push('', '## Amélioration continue');
  RETRO_COLUMNS.forEach((column) => {
    const items = meeting.retro[column.key].filter((item) => item.text.trim());
    if (items.length > 0) {
      lines.push(`${column.title} :`);
      items.forEach((item) => lines.push(`- ${item.text}`));
    }
  });

  lines.push('', 'Actions :');
  if (meeting.actions.length === 0) {
    lines.push('- aucune');
  }
  meeting.actions.forEach((action) => {
    const owner = action.owner ? ` — ${action.owner}` : '';
    const due = action.due ? ` (${action.due})` : '';
    lines.push(`- [${action.status}] ${action.text || '—'}${owner}${due}`);
  });

  const recap = buildOwnerRecap(meeting);
  lines.push('', '## À faire par responsable');
  if (recap.length === 0) {
    lines.push('- aucun suivi ouvert');
  }
  recap.forEach((group) => {
    lines.push(`${group.owner} :`);
    group.items.forEach((item) => {
      const detail = item.detail ? ` — ${item.detail}` : '';
      lines.push(`- [${item.kindLabel} · ${item.status}] ${item.title}${detail}`);
    });
  });

  return lines.join('\n');
}

export const UNASSIGNED_OWNER_LABEL = 'Sans responsable';

export type OwnerRecapKind = 'blocker' | 'action';

export interface OwnerRecapItem {
  id: string;
  kind: OwnerRecapKind;
  kindLabel: string;
  title: string;
  detail: string;
  status: string;
}

export interface OwnerRecapGroup {
  owner: string;
  items: OwnerRecapItem[];
}

const BLOCKER_SEVERITY_RANK: Record<MeetingBlockerSeverity, number> = {
  Critique: 0,
  'Élevé': 1,
  Moyen: 2,
  Faible: 3
};

function ownerIdentity(raw: string): { key: string; label: string } {
  const label = raw.trim();
  if (!label) return { key: '', label: UNASSIGNED_OWNER_LABEL };
  return { key: label.toLocaleLowerCase('fr'), label };
}

/**
 * Regroupe les blocages non levés et les actions encore ouvertes par responsable,
 * pour le tableau de fin de page et le compte-rendu.
 */
export function buildOwnerRecap(
  meeting: Pick<WeeklyMeeting, 'blockers' | 'actions'>
): OwnerRecapGroup[] {
  const groups = new Map<string, OwnerRecapGroup>();

  const add = (owner: string, item: OwnerRecapItem) => {
    const identity = ownerIdentity(owner);
    const existing = groups.get(identity.key);
    if (existing) {
      existing.items.push(item);
      return;
    }
    groups.set(identity.key, { owner: identity.label, items: [item] });
  };

  meeting.blockers
    .filter((blocker) => !blocker.resolved && (blocker.text.trim() || blocker.need.trim()))
    .forEach((blocker) => {
      add(blocker.owner, {
        id: blocker.id,
        kind: 'blocker',
        kindLabel: 'Point bloquant',
        title: blocker.text.trim() || '—',
        detail: blocker.need.trim() ? `À lever : ${blocker.need.trim()}` : '',
        status: blocker.severity
      });
    });

  meeting.actions
    .filter((action) => action.status !== 'Fait' && action.text.trim())
    .forEach((action) => {
      add(action.owner, {
        id: action.id,
        kind: 'action',
        kindLabel: 'Action',
        title: action.text.trim(),
        detail: action.due,
        status: action.status
      });
    });

  return [...groups.entries()]
    .sort(([keyA, groupA], [keyB, groupB]) => {
      if (keyA === '') return 1;
      if (keyB === '') return -1;
      return groupA.owner.localeCompare(groupB.owner, 'fr', { sensitivity: 'base' });
    })
    .map(([, group]) => ({
      owner: group.owner,
      items: [...group.items].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'blocker' ? -1 : 1;
        if (a.kind === 'blocker') {
          return (
            (BLOCKER_SEVERITY_RANK[a.status as MeetingBlockerSeverity] ?? 9) -
            (BLOCKER_SEVERITY_RANK[b.status as MeetingBlockerSeverity] ?? 9)
          );
        }
        return a.status.localeCompare(b.status, 'fr');
      })
    }));
}

/* ------------------------------------------------------------------ *
 * Fabriques de lignes
 * ------------------------------------------------------------------ */

export function createMetric(label = 'Nouvel indicateur'): MeetingMetric {
  return { id: createMeetingRowId(), label, value: '', target: '', source: 'manual' };
}

export function metricLabelsForRole(role: MeetingTeamRole): readonly string[] {
  return role === 'qa' ? DEFAULT_QA_METRIC_LABELS : DEFAULT_DEV_METRIC_LABELS;
}

function labelsMatchSet(metrics: MeetingMetric[], labels: readonly string[]): boolean {
  if (metrics.length !== labels.length) return false;
  const actual = metrics.map((metric) => normalizeLabel(metric.label)).sort();
  const expected = labels.map((label) => normalizeLabel(label)).sort();
  return actual.every((label, index) => label === expected[index]);
}

function areMetricsBlank(metrics: MeetingMetric[]): boolean {
  return metrics.every((metric) => metric.value.trim() === '' && metric.target.trim() === '');
}

const KNOWN_DEFAULT_METRIC_SETS: readonly (readonly string[])[] = [
  DEFAULT_DEV_METRIC_LABELS,
  DEFAULT_QA_METRIC_LABELS,
  LEGACY_QA_METRIC_LABELS
];

/** True si l'équipe n'a encore que le jeu d'indicateurs proposé, sans aucune saisie. */
export function canReplaceDefaultMetrics(team: MeetingTeam): boolean {
  return (
    areMetricsBlank(team.metrics) &&
    KNOWN_DEFAULT_METRIC_SETS.some((labels) => labelsMatchSet(team.metrics, labels))
  );
}

function withRoleMetrics(team: MeetingTeam, role: MeetingTeamRole): MeetingTeam {
  if (labelsMatchSet(team.metrics, metricLabelsForRole(role))) return { ...team, role };
  return {
    ...team,
    role,
    metrics: metricLabelsForRole(role).map((label) => createMetric(label))
  };
}

/**
 * Change le type Dev/QA. Les indicateurs ne sont remplacés que s'ils sont encore
 * le jeu par défaut, vide — une saisie manuelle ou un jeu personnalisé est conservé.
 */
export function applyTeamRole(team: MeetingTeam, role: MeetingTeamRole): MeetingTeam {
  if (team.role === role && labelsMatchSet(team.metrics, metricLabelsForRole(role))) return team;
  const next = { ...team, role };
  if (!canReplaceDefaultMetrics(team)) return next;
  return withRoleMetrics(next, role);
}

export interface SelectableJiraBoard {
  id: number;
  name: string;
}

/**
 * Rattache (ou détache) un board Jira. Un board QA bascule le rôle et, si le
 * jeu d'indicateurs est encore le défaut vide (y compris l'ancien set manuel),
 * le remplace par les compteurs du board.
 */
export function applyTeamBoard(
  team: MeetingTeam,
  board: SelectableJiraBoard | null,
  kind: MeetingTeamRole
): MeetingTeam {
  if (!board) {
    return { ...team, boardId: undefined };
  }

  const next: MeetingTeam = {
    ...team,
    boardId: board.id,
    name: board.name,
    role: kind
  };

  if (!canReplaceDefaultMetrics(team)) return next;
  return withRoleMetrics(next, kind);
}

export function createTeam(role: MeetingTeamRole = 'dev'): MeetingTeam {
  return {
    id: createMeetingRowId(),
    // Pas d'intitulé générique « Nouvelle équipe » par défaut pour une équipe Dev : le select
    // « Type d'équipe » (Dev/QA) l'identifie déjà, le nom reste à saisir.
    name: role === 'qa' ? 'QA' : '',
    role,
    metrics: metricLabelsForRole(role).map((label) => createMetric(label))
  };
}

export function createBlocker(): MeetingBlocker {
  return { id: createMeetingRowId(), severity: 'Moyen', text: '', need: '', owner: '', resolved: false };
}

export function createInteraction(): MeetingInteraction {
  return { id: createMeetingRowId(), from: '', to: '', subject: '', status: 'À traiter' };
}

export function createRetroItem(): MeetingRetroItem {
  return { id: createMeetingRowId(), text: '' };
}

export function createAction(): MeetingAction {
  return { id: createMeetingRowId(), text: '', owner: '', due: '', status: 'À faire' };
}
