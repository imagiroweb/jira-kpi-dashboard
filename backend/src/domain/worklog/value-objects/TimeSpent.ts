/**
 * Value Object representing time spent on a task
 * Immutable and encapsulates time conversion logic
 */
export class TimeSpent {
  private constructor(private readonly seconds: number) {
    if (seconds < 0) {
      throw new Error('TimeSpent cannot be negative');
    }
  }

  static zero(): TimeSpent {
    return new TimeSpent(0);
  }

  static fromSeconds(seconds: number): TimeSpent {
    return new TimeSpent(Math.round(seconds));
  }

  static fromMinutes(minutes: number): TimeSpent {
    return new TimeSpent(Math.round(minutes * 60));
  }

  static fromHours(hours: number): TimeSpent {
    return new TimeSpent(Math.round(hours * 3600));
  }

  get toSeconds(): number {
    return this.seconds;
  }

  get toMinutes(): number {
    return this.seconds / 60;
  }

  get toHours(): number {
    return this.seconds / 3600;
  }

  get toDays(): number {
    return this.seconds / (3600 * 8); // 8-hour workday
  }

  add(other: TimeSpent): TimeSpent {
    return new TimeSpent(this.seconds + other.seconds);
  }

  subtract(other: TimeSpent): TimeSpent {
    const result = this.seconds - other.seconds;
    return new TimeSpent(Math.max(0, result));
  }

  multiply(factor: number): TimeSpent {
    return new TimeSpent(Math.round(this.seconds * factor));
  }

  isGreaterThan(other: TimeSpent): boolean {
    return this.seconds > other.seconds;
  }

  isLessThan(other: TimeSpent): boolean {
    return this.seconds < other.seconds;
  }

  equals(other: TimeSpent): boolean {
    return this.seconds === other.seconds;
  }

  isZero(): boolean {
    return this.seconds === 0;
  }

  /**
   * Format as "Xh Ym" string
   */
  format(): string {
    const totalMinutes = Math.round(this.seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours === 0) {
      return `${minutes}m`;
    }
    if (minutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${minutes}m`;
  }

  /**
   * Format as decimal hours (e.g., 1.5 for 1h30m)
   */
  formatDecimal(precision: number = 2): string {
    return this.toHours.toFixed(precision);
  }

  toString(): string {
    return this.format();
  }
}

