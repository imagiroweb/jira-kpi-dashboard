import { DateRange } from '../../worklog/value-objects/DateRange';

export type SprintState = 'future' | 'active' | 'closed';

/**
 * Sprint Entity
 * Represents a Jira sprint
 */
export class Sprint {
  private constructor(
    private readonly _id: number,
    private readonly _name: string,
    private readonly _state: SprintState,
    private readonly _startDate: Date | null,
    private readonly _endDate: Date | null,
    private readonly _completeDate: Date | null,
    private readonly _goal: string | null,
    private readonly _boardId: number
  ) {}

  static create(props: {
    id: number;
    name: string;
    state: string;
    startDate?: string | null;
    endDate?: string | null;
    completeDate?: string | null;
    goal?: string | null;
    boardId: number;
  }): Sprint {
    const state = props.state.toLowerCase() as SprintState;
    
    return new Sprint(
      props.id,
      props.name,
      state,
      props.startDate ? new Date(props.startDate) : null,
      props.endDate ? new Date(props.endDate) : null,
      props.completeDate ? new Date(props.completeDate) : null,
      props.goal || null,
      props.boardId
    );
  }

  // Getters
  get id(): number { return this._id; }
  get name(): string { return this._name; }
  get state(): SprintState { return this._state; }
  get startDate(): Date | null { return this._startDate ? new Date(this._startDate) : null; }
  get endDate(): Date | null { return this._endDate ? new Date(this._endDate) : null; }
  get completeDate(): Date | null { return this._completeDate ? new Date(this._completeDate) : null; }
  get goal(): string | null { return this._goal; }
  get boardId(): number { return this._boardId; }

  // Domain methods
  get isActive(): boolean {
    return this._state === 'active';
  }

  get isClosed(): boolean {
    return this._state === 'closed';
  }

  get isFuture(): boolean {
    return this._state === 'future';
  }

  /**
   * Get sprint duration as DateRange (if dates are available)
   */
  get dateRange(): DateRange | null {
    if (!this._startDate || !this._endDate) {
      return null;
    }
    return DateRange.create(this._startDate, this._endDate);
  }

  /**
   * Get planned duration in days
   */
  get plannedDurationDays(): number | null {
    return this.dateRange?.durationDays ?? null;
  }

  /**
   * Get actual duration in days (for closed sprints)
   */
  get actualDurationDays(): number | null {
    if (!this._startDate || !this._completeDate) {
      return null;
    }
    const diff = this._completeDate.getTime() - this._startDate.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate remaining days (for active sprints)
   */
  get remainingDays(): number | null {
    if (!this.isActive || !this._endDate) {
      return null;
    }
    const now = new Date();
    const diff = this._endDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  /**
   * Calculate elapsed days (for active sprints)
   */
  get elapsedDays(): number | null {
    if (!this._startDate) {
      return null;
    }
    const now = new Date();
    const diff = now.getTime() - this._startDate.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  /**
   * Get sprint progress percentage (for active sprints)
   */
  get progressPercent(): number | null {
    const planned = this.plannedDurationDays;
    const elapsed = this.elapsedDays;
    
    if (!planned || elapsed === null) {
      return null;
    }
    
    return Math.min(100, Math.round((elapsed / planned) * 100));
  }

  /**
   * Check if sprint is overdue
   */
  get isOverdue(): boolean {
    if (!this.isActive || !this._endDate) {
      return false;
    }
    return new Date() > this._endDate;
  }

  equals(other: Sprint): boolean {
    return this._id === other._id;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this._id,
      name: this._name,
      state: this._state,
      startDate: this._startDate?.toISOString() ?? null,
      endDate: this._endDate?.toISOString() ?? null,
      completeDate: this._completeDate?.toISOString() ?? null,
      goal: this._goal,
      boardId: this._boardId,
      isActive: this.isActive,
      remainingDays: this.remainingDays,
      progressPercent: this.progressPercent
    };
  }
}

