import { TEST_SPRINT_ISSUES_RESULT } from './worklogs';

/** Projets Jira mockés pour le mapping configured-projects */
export const TEST_JIRA_PROJECTS = [
  { key: 'PROJ', name: 'Project One', id: '100' },
  { key: 'ABC', name: 'Alpha Beta', id: '200' },
];

/** Boards configurés mockés */
export const TEST_CONFIGURED_BOARDS = [
  { id: 1, name: 'Board 1', projectKey: 'PROJ' },
  { id: 2, name: 'Board 2', projectKey: 'ABC' },
];

/** Résultat batch sprint-issues-all */
export const TEST_SPRINT_ISSUES_ALL_BOARDS = [
  { boardId: 1, boardName: 'Board 1', ...TEST_SPRINT_ISSUES_RESULT },
];

/** Résultat resolved-by-day (mode tickets) */
export const TEST_RESOLVED_BY_DAY_TICKETS = {
  byDay: [{ date: '2026-04-10', 'Board 1': 3 }],
  boards: [{ id: 1, name: 'Board 1', color: '#336699' }],
  totalResolvedTickets: 3,
  totalsBySeries: [{ name: 'Board 1', total: 3 }],
};

/** Résultat resolved-by-day (mode points) */
export const TEST_RESOLVED_BY_DAY_POINTS = {
  byDay: [{ date: '2026-04-10', 'Board 1': 8 }],
  boards: [{ id: 1, name: 'Board 1' }],
  totalsBySeriesPoints: [{ name: 'Board 1', total: 8 }],
};

/** Résultat epic-progress paginé */
export const TEST_EPIC_PROGRESS_RESULT = {
  items: [{ key: 'PROJ-100', summary: 'Epic CLI', status: 'In Progress', progress: 50 }],
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

/** Résultat epic-search */
export const TEST_EPIC_SEARCH_RESULT = {
  items: [{ key: 'PROJ-100', summary: 'Epic CLI' }],
};

/** Résultat epic details */
export const TEST_EPIC_DETAILS_RESULT = {
  epicKey: 'PROJ-100',
  summary: 'Epic CLI',
  status: 'In Progress',
  children: [{ key: 'PROJ-101', summary: 'Story 1', status: 'Done' }],
};

/** Config time tracking */
export const TEST_TIME_TRACKING_CONFIG = {
  workingHoursPerDay: 8,
  workingDaysPerWeek: 5,
};

/** Payload dashboard snapshot minimal */
export const TEST_DASHBOARD_SNAPSHOT_PROJECTS_STATS = [
  { key: 'PROJ', boardId: 1, name: 'Board 1', totalTickets: 10, resolvedTickets: 5 },
];

export const TEST_DASHBOARD_SNAPSHOT_TOTALS = {
  totalTickets: 10,
  resolvedTickets: 5,
  totalPoints: 20,
  resolvedPoints: 12,
  totalTimeHours: 40,
};
