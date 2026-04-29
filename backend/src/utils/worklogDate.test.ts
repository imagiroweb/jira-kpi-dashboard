import { getWorklogCalendarDate } from './worklogDate';

describe('getWorklogCalendarDate', () => {
  it('utilise UTC quand demandé explicitement', () => {
    const date = new Date('2026-04-29T23:30:00.000Z');
    expect(getWorklogCalendarDate(date, 'UTC')).toBe('2026-04-29');
  });

  it('utilise le fuseau Europe/Paris par défaut', () => {
    const date = new Date('2026-04-29T23:30:00.000Z');
    // 23:30 UTC => 01:30 (+1j) à Paris
    expect(getWorklogCalendarDate(date, 'Europe/Paris')).toBe('2026-04-30');
  });

  it('prend en compte JIRA_WORKLOG_DATE_TZ si aucun argument', () => {
    const initial = process.env.JIRA_WORKLOG_DATE_TZ;
    process.env.JIRA_WORKLOG_DATE_TZ = 'UTC';
    const date = new Date('2026-04-29T23:30:00.000Z');
    expect(getWorklogCalendarDate(date)).toBe('2026-04-29');
    process.env.JIRA_WORKLOG_DATE_TZ = initial;
  });
});
