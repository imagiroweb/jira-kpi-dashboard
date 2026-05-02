import { Worklog } from './Worklog';
import { Author } from '../value-objects/Author';
import { TimeSpent } from '../value-objects/TimeSpent';
import { DateRange } from '../value-objects/DateRange';

function baseWorklog() {
  return Worklog.create({
    id: 'w1',
    issueKey: 'PROJ-42',
    author: Author.create('acc-1', 'Alice'),
    timeSpent: TimeSpent.fromSeconds(3600),
    workStart: new Date('2026-04-15T10:00:00.000Z')
  });
}

describe('Worklog', () => {
  it('projectKey extrait le préfixe', () => {
    expect(baseWorklog().projectKey).toBe('PROJ');
    const noDash = Worklog.create({
      id: 'w2',
      issueKey: 'KEY',
      author: Author.create('a', 'A'),
      timeSpent: TimeSpent.fromSeconds(60),
      workStart: new Date()
    });
    expect(noDash.projectKey).toBe('KEY');
  });

  it('markAsBillable / markAsNonBillable', () => {
    const w = baseWorklog();
    expect(w.isBillable).toBe(true);
    w.markAsNonBillable();
    expect(w.isBillable).toBe(false);
    w.markAsBillable();
    expect(w.isBillable).toBe(true);
  });

  it('isWithinRange et isFromAuthor', () => {
    const w = baseWorklog();
    const range = DateRange.create(
      new Date('2026-04-15T00:00:00.000Z'),
      new Date('2026-04-15T23:59:59.999Z')
    );
    expect(w.isWithinRange(range)).toBe(true);
    expect(w.isFromAuthor('acc-1')).toBe(true);
    expect(w.isFromAuthor('other')).toBe(false);
  });

  it('isBugWork et isSupportWork', () => {
    const bug = Worklog.create({
      id: 'b1',
      issueKey: 'P-1',
      author: Author.create('a', 'A'),
      timeSpent: TimeSpent.fromSeconds(60),
      workStart: new Date(),
      issueType: 'Bug'
    });
    expect(bug.isBugWork()).toBe(true);

    const support = Worklog.create({
      id: 's1',
      issueKey: 'P-2',
      author: Author.create('a', 'A'),
      timeSpent: TimeSpent.fromSeconds(60),
      workStart: new Date(),
      issueSummary: 'Customer assistance'
    });
    expect(support.isSupportWork()).toBe(true);
  });

  it('equals et toJSON', () => {
    const w = baseWorklog();
    const same = Worklog.create({
      id: 'w1',
      issueKey: 'X-1',
      author: Author.create('a', 'A'),
      timeSpent: TimeSpent.fromSeconds(1),
      workStart: new Date()
    });
    expect(w.equals(same)).toBe(true);
    const j = w.toJSON();
    expect(j.issueKey).toBe('PROJ-42');
    expect(j.billable).toBe(true);
  });
});
