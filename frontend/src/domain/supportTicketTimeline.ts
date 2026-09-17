/** Graphe Support « Évolution des tickets dans le temps », borné à la période de la page. */

const MAX_TIMELINE_DAYS = 400;

export interface SupportTimelineIssue {
  created: string;
  resolved: string | null;
  ponderation?: number | null;
}

export interface SupportTicketTimelinePoint {
  date: string;
  displayDate: string;
  created: number;
  resolved: number;
  ponderation: number;
}

export function localTodayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function resolveSupportTimelineRange(input: {
  apiRange?: { from: string; to: string } | null;
  useActiveSprint: boolean;
  selectedRange: { from: string; to: string };
  today: string;
}): { from: string; to: string } | null {
  if (input.apiRange?.from && input.apiRange?.to) {
    if (input.useActiveSprint) {
      return {
        from: input.apiRange.from,
        to: input.apiRange.to < input.today ? input.apiRange.to : input.today,
      };
    }
    return { from: input.apiRange.from, to: input.apiRange.to };
  }
  if (!input.useActiveSprint && input.selectedRange.from && input.selectedRange.to) {
    return { from: input.selectedRange.from, to: input.selectedRange.to };
  }
  return null;
}

export function listSupportTimelineDays(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const days: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && days.length < MAX_TIMELINE_DAYS) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function formatSupportTimelineDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function isoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = value.split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export function buildSupportTicketTimeline(
  issues: SupportTimelineIssue[],
  range: { from: string; to: string }
): SupportTicketTimelinePoint[] {
  const days = listSupportTimelineDays(range.from, range.to);
  const byDay = new Map(days.map((date) => [date, { created: 0, resolved: 0, ponderation: 0 }]));

  for (const issue of issues) {
    const created = isoDay(issue.created);
    if (created && byDay.has(created)) {
      const row = byDay.get(created)!;
      row.created += 1;
      row.ponderation += issue.ponderation || 0;
    }
    const resolved = isoDay(issue.resolved);
    if (resolved && byDay.has(resolved)) {
      byDay.get(resolved)!.resolved += 1;
    }
  }

  return days.map((date) => {
    const data = byDay.get(date)!;
    return {
      date,
      displayDate: formatSupportTimelineDay(date),
      created: data.created,
      resolved: data.resolved,
      ponderation: data.ponderation,
    };
  });
}
