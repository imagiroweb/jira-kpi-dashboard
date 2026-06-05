/** Payload worklog minimal pour les tests de routes (format API simplifié) */
export const TEST_WORKLOG_PAYLOAD = {
  id: 'w1',
  issueKey: 'PROJ-42',
  timeSpentSeconds: 3600,
  authorAccountId: 'acc-1',
  authorDisplayName: 'Alice',
  workStart: '2026-04-15T10:00:00.000Z',
};

/** Entité worklog mockée avec toJSON() pour worklogRoutes */
export function mockWorklogEntity(payload: Record<string, unknown> = TEST_WORKLOG_PAYLOAD) {
  return {
    toJSON: () => payload,
  };
}

/** Métriques legacy retournées par calculateMetrics (mock route) */
export const TEST_WORKLOG_METRICS = {
  totalTimeSpentHours: 2,
  billableHours: 1.5,
  worklogCount: 1,
  uniqueUsers: 1,
  uniqueIssues: 1,
  byUser: { u1: 2 },
  byProject: { PROJ: 2 },
  byDay: { '2026-04-15': 2 },
};

export const TEST_SPRINT_ISSUES_RESULT = {
  issues: [{ issueKey: 'PROJ-1', summary: 'Story', status: 'In Progress', storyPoints: 3 }],
  statusCounts: { total: 1, todo: 0, inProgress: 1, qa: 0, resolved: 0 },
  storyPointsByStatus: { total: 3, todo: 0, inProgress: 3, qa: 0, resolved: 0 },
  totalStoryPoints: 3,
  backlog: { ticketCount: 2, storyPoints: 2 },
};

export const TEST_VELOCITY_HISTORY_RESULT = {
  sprints: [{ id: 1, name: 'Sprint 1', velocity: 21 }],
  averageVelocity: 21,
  trend: 'stable' as const,
};

export const TEST_SUPPORT_KPI_RESULT = {
  statusCounts: { total: 5, todo: 1, inProgress: 2, qa: 1, resolved: 1 },
  ponderationByStatus: { total: 10, todo: 2, inProgress: 4, qa: 2, resolved: 2 },
  ponderationByType: { Bug: 3 },
  ponderationByAssignee: [{ assignee: 'Alice', ponderation: 4, ticketCount: 2 }],
  ponderationByLevel: {
    low: { count: 1, total: 1 },
    medium: { count: 2, total: 3 },
    high: { count: 1, total: 4 },
    veryHigh: { count: 1, total: 2 },
  },
  ponderationByLabel: [{ label: 'urgent', ponderation: 2, ticketCount: 1 }],
  ponderationByTeam: [{ team: 'Support', ponderation: 5, ticketCount: 3 }],
  backlog: { ticketCount: 1, totalPonderation: 1 },
  avgResolutionTimeHours: 12,
  avgFirstResponseTimeHours: 2,
  avgResolutionTimeFromDatesHours: 10,
  highPondFastResolutionPercent: 80,
  veryHighPondFastResolutionPercent: 60,
};
