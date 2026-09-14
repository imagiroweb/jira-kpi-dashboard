/**
 * Burndown fidèle : rejoue les événements GreenHopper
 * (`scopechangeburndownchart`) pour faire apparaître les ajouts / retraits
 * de périmètre en cours de sprint, comme le graphique Jira.
 */

export type BurndownUnit = 'points' | 'tickets';

export interface ScopeChangeColumn {
  done?: boolean;
  notDone?: boolean;
}

export interface ScopeChangeStat {
  newValue?: number;
  oldValue?: number;
}

export interface ScopeChangeEvent {
  key: string;
  added?: boolean;
  column?: ScopeChangeColumn;
  statC?: ScopeChangeStat;
}

export interface ScopeChangeChart {
  changes: Record<string, ScopeChangeEvent[]>;
  startTime: number;
  endTime?: number;
  now?: number;
}

export interface FaithfulBurndownPoint {
  date: string;
  remaining: number | null;
  scope: number;
  ideal: number;
}

export interface FaithfulBurndown {
  unit: BurndownUnit;
  scopePoints: number;
  completedPoints: number;
  remainingPoints: number;
  idealPoints: number;
  deltaPoints: number;
  days: FaithfulBurndownPoint[];
}

export interface IssueBurndownState {
  inSprint: boolean;
  done: boolean;
  points: number;
}

const MAX_SPRINT_DAYS = 200;
/** Ajouts de planning juste après le start du sprint : comptés dans le périmètre initial (guideline). */
const INITIAL_GRACE_MS = 2 * 60 * 60 * 1000;

function roundPoints(value: number): number {
  return Math.round(value * 100) / 100;
}

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

export function isWorkingDay(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

export function emptyIssueState(): IssueBurndownState {
  return { inSprint: false, done: false, points: 0 };
}

export function applyScopeChangeEvent(
  state: IssueBurndownState,
  event: ScopeChangeEvent
): IssueBurndownState {
  const next = { ...state };
  if (event.statC && typeof event.statC.newValue === 'number') {
    next.points = event.statC.newValue;
  }
  if (event.added === true) next.inSprint = true;
  if (event.added === false) next.inSprint = false;
  if (event.column) {
    if (event.column.done === true || event.column.notDone === false) next.done = true;
    else if (event.column.notDone === true) next.done = false;
  }
  return next;
}

function issueContribution(
  state: IssueBurndownState,
  unit: BurndownUnit
): { remaining: number; scope: number } {
  if (!state.inSprint) return { remaining: 0, scope: 0 };
  const value = unit === 'tickets' ? 1 : state.points;
  return { remaining: state.done ? 0 : value, scope: value };
}

function totals(states: Map<string, IssueBurndownState>, unit: BurndownUnit): {
  remaining: number;
  scope: number;
} {
  let remaining = 0;
  let scope = 0;
  for (const state of states.values()) {
    const part = issueContribution(state, unit);
    remaining += part.remaining;
    scope += part.scope;
  }
  return { remaining: roundPoints(remaining), scope: roundPoints(scope) };
}

function timestampToDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Rejoue l'historique GreenHopper et produit une série quotidienne :
 * le reste à faire monte si on ajoute au sprint, descend si on retire ou
 * si on termine. La guideline part du périmètre de début de sprint
 * (fenêtre de grâce après `startTime`) et ignore les ajouts ultérieurs.
 */
export function buildFaithfulBurndown(params: {
  chart: ScopeChangeChart;
  dateRange: { from: string; to: string };
  unit: BurndownUnit;
  today?: string;
}): FaithfulBurndown {
  const { chart, dateRange, unit, today = new Date().toISOString().slice(0, 10) } = params;
  const days = listDaysInclusive(dateRange.from, dateRange.to);
  const now = chart.now ?? Date.now();
  const startTime = chart.startTime;

  const timestamps = Object.keys(chart.changes)
    .map((key) => Number(key))
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => a - b);

  const states = new Map<string, IssueBurndownState>();
  const endOfDay = new Map<string, { remaining: number; scope: number }>();
  let initialRemaining = 0;
  let totalsAtStart = { remaining: 0, scope: 0 };

  for (const timestamp of timestamps) {
    if (timestamp > now) break;
    const events = chart.changes[String(timestamp)] ?? [];
    for (const event of events) {
      if (!event.key) continue;
      states.set(event.key, applyScopeChangeEvent(states.get(event.key) ?? emptyIssueState(), event));
    }
    const current = totals(states, unit);
    if (timestamp <= startTime) totalsAtStart = current;
    if (timestamp >= startTime) endOfDay.set(timestampToDate(timestamp), current);
    if (timestamp <= startTime + INITIAL_GRACE_MS) initialRemaining = current.remaining;
  }

  const workingDayCount = days.filter(isWorkingDay).length || days.length;
  const startDate = timestampToDate(startTime);
  const reference = today < days[0] ? days[0] : today > days[days.length - 1] ? days[days.length - 1] : today;
  let workingElapsed = 0;
  let carried = { remaining: 0, scope: 0 };
  let remainingPoints = 0;
  let scopePoints = 0;
  let idealPoints = initialRemaining;

  const points: FaithfulBurndownPoint[] = days.map((date) => {
    if (endOfDay.has(date)) {
      carried = endOfDay.get(date)!;
    } else if (date === startDate && !endOfDay.has(date)) {
      carried = totalsAtStart;
    } else if (date < startDate) {
      carried = { remaining: 0, scope: 0 };
    }

    if (isWorkingDay(date)) workingElapsed += 1;
    const ideal = roundPoints(Math.max(0, initialRemaining * (1 - workingElapsed / workingDayCount)));
    const remaining = date <= today ? carried.remaining : null;

    if (date === reference) {
      remainingPoints = carried.remaining;
      scopePoints = carried.scope;
      idealPoints = ideal;
    }

    return { date, remaining, scope: carried.scope, ideal };
  });

  return {
    unit,
    scopePoints,
    completedPoints: roundPoints(scopePoints - remainingPoints),
    remainingPoints,
    idealPoints,
    deltaPoints: roundPoints(idealPoints - remainingPoints),
    days: points
  };
}
