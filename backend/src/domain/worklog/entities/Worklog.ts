import { TimeSpent } from '../value-objects/TimeSpent';
import { Author } from '../value-objects/Author';
import { DateRange } from '../value-objects/DateRange';

/**
 * Worklog Entity
 * Represents time logged on a Jira issue
 */
export class Worklog {
  private constructor(
    private readonly _id: string,
    private readonly _issueKey: string,
    private readonly _author: Author,
    private readonly _timeSpent: TimeSpent,
    private readonly _workStart: Date,
    private readonly _description: string,
    private _billable: boolean,
    private readonly _issueSummary?: string,
    private readonly _issueType?: string,
    private readonly _status?: string,
    private readonly _storyPoints?: number | null,
    private readonly _weight?: number | null,
    private readonly _originalEstimate?: TimeSpent | null
  ) {}

  static create(props: {
    id: string;
    issueKey: string;
    author: Author;
    timeSpent: TimeSpent;
    workStart: Date;
    description?: string;
    billable?: boolean;
    issueSummary?: string;
    issueType?: string;
    status?: string;
    storyPoints?: number | null;
    weight?: number | null;
    originalEstimateSeconds?: number | null;
  }): Worklog {
    return new Worklog(
      props.id,
      props.issueKey,
      props.author,
      props.timeSpent,
      props.workStart,
      props.description || '',
      props.billable ?? true,
      props.issueSummary,
      props.issueType,
      props.status,
      props.storyPoints,
      props.weight,
      props.originalEstimateSeconds ? TimeSpent.fromSeconds(props.originalEstimateSeconds) : null
    );
  }

  // Getters
  get id(): string { return this._id; }
  get issueKey(): string { return this._issueKey; }
  get author(): Author { return this._author; }
  get timeSpent(): TimeSpent { return this._timeSpent; }
  get workStart(): Date { return new Date(this._workStart); }
  get workDate(): string { return this._workStart.toISOString().split('T')[0]; }
  get description(): string { return this._description; }
  get isBillable(): boolean { return this._billable; }
  get issueSummary(): string | undefined { return this._issueSummary; }
  get issueType(): string | undefined { return this._issueType; }
  get status(): string | undefined { return this._status; }
  get storyPoints(): number | null | undefined { return this._storyPoints; }
  get weight(): number | null | undefined { return this._weight; }
  get originalEstimate(): TimeSpent | null | undefined { return this._originalEstimate; }

  // Domain methods
  markAsBillable(): void {
    this._billable = true;
  }

  markAsNonBillable(): void {
    this._billable = false;
  }

  isWithinRange(range: DateRange): boolean {
    return range.contains(this._workStart);
  }

  isFromAuthor(accountId: string): boolean {
    return this._author.accountId === accountId;
  }

  /**
   * Check if this is a bug-related worklog
   */
  isBugWork(): boolean {
    const bugKeywords = ['bug', 'defect', 'issue', 'fix', 'hotfix'];
    const type = this._issueType?.toLowerCase() || '';
    return bugKeywords.some(keyword => type.includes(keyword));
  }

  /**
   * Check if this is a support-related worklog
   */
  isSupportWork(): boolean {
    const supportKeywords = ['support', 'help', 'assistance', 'ticket'];
    const type = this._issueType?.toLowerCase() || '';
    const summary = this._issueSummary?.toLowerCase() || '';
    return supportKeywords.some(keyword => 
      type.includes(keyword) || summary.includes(keyword)
    );
  }

  /**
   * Get project key from issue key (e.g., "PROJ-123" → "PROJ")
   */
  get projectKey(): string {
    const parts = this._issueKey.split('-');
    return parts.length > 1 ? parts[0] : this._issueKey;
  }

  equals(other: Worklog): boolean {
    return this._id === other._id;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this._id,
      issueKey: this._issueKey,
      author: this._author.toJSON(),
      timeSpentSeconds: this._timeSpent.toSeconds,
      timeSpentHours: this._timeSpent.toHours,
      workStart: this._workStart.toISOString(),
      workDate: this.workDate,
      description: this._description,
      billable: this._billable,
      issueSummary: this._issueSummary,
      issueType: this._issueType,
      status: this._status,
      storyPoints: this._storyPoints,
      weight: this._weight,
      originalEstimateSeconds: this._originalEstimate?.toSeconds ?? null
    };
  }
}

