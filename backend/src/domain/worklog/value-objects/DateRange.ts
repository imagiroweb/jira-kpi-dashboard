/**
 * Value Object representing a date range
 * Immutable and encapsulates date comparison logic
 */
export class DateRange {
  private constructor(
    private readonly _from: Date,
    private readonly _to: Date
  ) {
    if (_from > _to) {
      throw new Error('Start date cannot be after end date');
    }
  }

  static create(from: string | Date, to: string | Date): DateRange {
    const fromDate = typeof from === 'string' ? new Date(from) : from;
    const toDate = typeof to === 'string' ? new Date(to) : to;
    return new DateRange(fromDate, toDate);
  }

  static today(): DateRange {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return new DateRange(start, end);
  }

  static thisWeek(): DateRange {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    return new DateRange(monday, sunday);
  }

  static thisMonth(): DateRange {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return new DateRange(start, end);
  }

  static lastNDays(days: number): DateRange {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const start = new Date(end);
    start.setDate(end.getDate() - days + 1);
    start.setHours(0, 0, 0, 0);
    return new DateRange(start, end);
  }

  get from(): Date {
    return new Date(this._from);
  }

  get to(): Date {
    return new Date(this._to);
  }

  get fromISO(): string {
    return this._from.toISOString().split('T')[0];
  }

  get toISO(): string {
    return this._to.toISOString().split('T')[0];
  }

  /**
   * Get duration in days
   */
  get durationDays(): number {
    const diff = this._to.getTime() - this._from.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Get duration in working days (excluding weekends)
   */
  get workingDays(): number {
    let count = 0;
    const current = new Date(this._from);
    
    while (current <= this._to) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    return count;
  }

  /**
   * Check if a date is within this range
   */
  contains(date: Date | string): boolean {
    const checkDate = typeof date === 'string' ? new Date(date) : date;
    return checkDate >= this._from && checkDate <= this._to;
  }

  /**
   * Check if this range overlaps with another
   */
  overlaps(other: DateRange): boolean {
    return this._from <= other._to && this._to >= other._from;
  }

  /**
   * Check if this range fully contains another
   */
  encompasses(other: DateRange): boolean {
    return this._from <= other._from && this._to >= other._to;
  }

  /**
   * Extend range by N days on both ends
   */
  extend(days: number): DateRange {
    const newFrom = new Date(this._from);
    newFrom.setDate(newFrom.getDate() - days);
    
    const newTo = new Date(this._to);
    newTo.setDate(newTo.getDate() + days);
    
    return new DateRange(newFrom, newTo);
  }

  equals(other: DateRange): boolean {
    return this._from.getTime() === other._from.getTime() &&
           this._to.getTime() === other._to.getTime();
  }

  toString(): string {
    return `${this.fromISO} → ${this.toISO}`;
  }
}

