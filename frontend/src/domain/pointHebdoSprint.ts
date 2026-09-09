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

export interface MeetingBlocker {
  id: string;
  severity: MeetingBlockerSeverity;
  text: string;
  need: string;
  owner: string;
  resolved: boolean;
}

export interface MeetingInteraction {
  id: string;
  from: string;
  to: string;
  subject: string;
  status: MeetingInteractionStatus;
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

/** Sections modifiables, envoyées telles quelles au PATCH. */
export type WeeklyMeetingPatch = Partial<
  Pick<WeeklyMeeting, 'sprint' | 'teams' | 'blockers' | 'interactions' | 'retro' | 'actions'>
>;

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
 * Les indicateurs QA (cas de test, couverture) n'ont pas de source et restent
 * en saisie manuelle.
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
  [normalizeLabel('Bugs ouverts')]: 'hidden'
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
  /** Trajectoire idéale, décroissante sur les jours ouvrés uniquement. */
  ideal: number;
}

export interface TeamBurndown {
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
}): TeamBurndown | null {
  const { scopePoints, seriesName, boardId, resolved, today = todayIso() } = params;
  if (!resolved?.dateRange?.from || !resolved?.dateRange?.to) return null;

  const days = listDaysInclusive(resolved.dateRange.from, resolved.dateRange.to);
  if (days.length === 0) return null;

  const resolvedByDate = new Map<string, number>();
  for (const row of resolved.byDay ?? []) {
    const date = typeof row.date === 'string' ? row.date : '';
    if (!date) continue;
    resolvedByDate.set(date, readResolvedPointsForSeries(row, seriesName, boardId));
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

    return { date, remaining, ideal };
  });

  return {
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

  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * Fabriques de lignes
 * ------------------------------------------------------------------ */

export function createMetric(label = 'Nouvel indicateur'): MeetingMetric {
  return { id: createMeetingRowId(), label, value: '', target: '', source: 'manual' };
}

export function createTeam(role: MeetingTeamRole = 'dev'): MeetingTeam {
  const labels = role === 'qa' ? DEFAULT_QA_METRIC_LABELS : DEFAULT_DEV_METRIC_LABELS;
  return {
    id: createMeetingRowId(),
    // Pas d'intitulé générique « Nouvelle équipe » par défaut pour une équipe Dev : le select
    // « Type d'équipe » (Dev/QA) l'identifie déjà, le nom reste à saisir.
    name: role === 'qa' ? 'QA' : '',
    role,
    metrics: labels.map((label) => createMetric(label))
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
