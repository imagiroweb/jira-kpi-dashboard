/**
 * Date calendaire (YYYY-MM-DD) d'un worklog pour le filtrage aligné sur JQL worklogDate.
 * Jira utilise le fuseau du site / de l'utilisateur ; le filtre UTC pur (toISOString) décale les jours.
 */
export function getWorklogCalendarDate(workStart: Date, timeZone?: string): string {
  const tz = timeZone ?? process.env.JIRA_WORKLOG_DATE_TZ ?? 'Europe/Paris';
  if (tz === 'UTC') {
    return workStart.toISOString().split('T')[0];
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(workStart);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (!y || !m || !d) {
    return workStart.toISOString().split('T')[0];
  }
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
