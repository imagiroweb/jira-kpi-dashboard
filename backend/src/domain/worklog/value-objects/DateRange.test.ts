import { DateRange } from './DateRange';

const isoLocalDate = (year: number, monthIndex: number, day: number, hours = 0, minutes = 0, seconds = 0): string =>
  new Date(year, monthIndex, day, hours, minutes, seconds).toISOString().split('T')[0];

describe('DateRange', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-29T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('refuse une plage invalide', () => {
    expect(() => DateRange.create('2026-04-30', '2026-04-01')).toThrow(
      'Start date cannot be after end date'
    );
  });

  it('calcule today / thisWeek / thisMonth', () => {
    const today = DateRange.today();
    expect(today.fromISO).toBe(isoLocalDate(2026, 3, 29, 0, 0, 0));
    expect(today.toISO).toBe(isoLocalDate(2026, 3, 29, 23, 59, 59));

    const week = DateRange.thisWeek();
    expect(week.fromISO).toBe(isoLocalDate(2026, 3, 27, 0, 0, 0));
    expect(week.toISO).toBe(isoLocalDate(2026, 4, 3, 23, 59, 59));

    const month = DateRange.thisMonth();
    expect(month.fromISO).toBe(isoLocalDate(2026, 3, 1, 0, 0, 0));
    expect(month.toISO).toBe(isoLocalDate(2026, 3, 30, 23, 59, 59));
  });

  it('calcule lastNDays, duration et workingDays', () => {
    const range = DateRange.lastNDays(7);
    expect(range.fromISO).toBe(isoLocalDate(2026, 3, 23, 0, 0, 0));
    expect(range.toISO).toBe(isoLocalDate(2026, 3, 29, 23, 59, 59));
    expect(range.durationDays).toBe(7);
    expect(range.workingDays).toBe(5);
  });

  it('gère contains/overlaps/encompasses/extend/equals/toString', () => {
    const base = DateRange.create('2026-04-10', '2026-04-20');
    const overlap = DateRange.create('2026-04-15', '2026-04-25');
    const inside = DateRange.create('2026-04-12', '2026-04-18');

    expect(base.contains('2026-04-12')).toBe(true);
    expect(base.contains(new Date('2026-04-30'))).toBe(false);
    expect(base.overlaps(overlap)).toBe(true);
    expect(base.encompasses(inside)).toBe(true);

    const extended = base.extend(2);
    expect(extended.fromISO).toBe('2026-04-08');
    expect(extended.toISO).toBe('2026-04-22');
    expect(base.equals(DateRange.create('2026-04-10', '2026-04-20'))).toBe(true);
    expect(base.toString()).toBe('2026-04-10 → 2026-04-20');
  });
});
