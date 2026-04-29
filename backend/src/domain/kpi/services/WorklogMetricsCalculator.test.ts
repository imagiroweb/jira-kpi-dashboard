import { WorklogMetricsCalculator } from './WorklogMetricsCalculator';
import { Worklog } from '../../worklog/entities/Worklog';
import { Author } from '../../worklog/value-objects/Author';
import { TimeSpent } from '../../worklog/value-objects/TimeSpent';

function makeWorklog(params: {
  id: string;
  issueKey: string;
  accountId: string;
  name: string;
  hours: number;
  date: string;
  billable?: boolean;
  issueType?: string;
}) {
  return Worklog.create({
    id: params.id,
    issueKey: params.issueKey,
    author: Author.create(params.accountId, params.name),
    timeSpent: TimeSpent.fromHours(params.hours),
    workStart: new Date(params.date),
    billable: params.billable ?? true,
    issueType: params.issueType
  });
}

describe('WorklogMetricsCalculator', () => {
  const calculator = new WorklogMetricsCalculator();

  it('retourne des métriques vides si aucun worklog', () => {
    const m = calculator.calculate([]);
    expect(m.worklogCount).toBe(0);
    expect(m.totalTimeSpentHours).toBe(0);
    expect(m.byUser).toEqual([]);
  });

  it('calcule les agrégations globales et par dimensions', () => {
    const worklogs = [
      makeWorklog({ id: '1', issueKey: 'ABC-1', accountId: 'u1', name: 'Alice', hours: 2, date: '2026-04-01', issueType: 'Story' }),
      makeWorklog({ id: '2', issueKey: 'ABC-1', accountId: 'u1', name: 'Alice', hours: 1, date: '2026-04-02', billable: false, issueType: 'Story' }),
      makeWorklog({ id: '3', issueKey: 'XYZ-2', accountId: 'u2', name: 'Bob', hours: 3, date: '2026-04-01', issueType: 'Bug' })
    ];

    const m = calculator.calculate(worklogs);

    expect(m.totalTimeSpentHours).toBe(6);
    expect(m.billableHours).toBe(5);
    expect(m.nonBillableHours).toBe(1);
    expect(m.uniqueUsers).toBe(2);
    expect(m.uniqueIssues).toBe(2);
    expect(m.uniqueProjects).toBe(2);
    expect(m.averageTimePerWorklog.toHours).toBe(2);

    expect(m.byUser[0].accountId).toBe('u1');
    expect(m.byUser[0].totalHours).toBe(3);
    expect(m.byProject[0].projectKey).toBe('ABC');
    expect(m.byProject[0].totalHours).toBe(3);
    expect(m.byDay[0].date).toBe('2026-04-01');
    expect(m.byIssueType[0].issueType).toBe('Story');
    expect(m.byIssueType[1].issueType).toBe('Bug');
  });
});
