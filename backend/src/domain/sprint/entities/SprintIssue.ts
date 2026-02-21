import { TimeSpent } from '../../worklog/value-objects/TimeSpent';

export type StatusCategory = 'To Do' | 'In Progress' | 'Done' | 'Unknown';
export type StatusCategoryKey = 'new' | 'indeterminate' | 'done' | 'undefined';

/**
 * SprintIssue Entity
 * Represents a Jira issue within a sprint context
 */
export class SprintIssue {
  private constructor(
    private readonly _issueKey: string,
    private readonly _summary: string,
    private readonly _issueType: string,
    private readonly _status: string,
    private readonly _statusCategory: StatusCategory,
    private readonly _statusCategoryKey: StatusCategoryKey,
    private readonly _storyPoints: number | null,
    private readonly _originalEstimate: TimeSpent | null
  ) {}

  static create(props: {
    issueKey: string;
    summary: string;
    issueType?: string;
    status?: string;
    statusCategory?: StatusCategory;
    statusCategoryKey?: StatusCategoryKey;
    storyPoints?: number | null;
    originalEstimateSeconds?: number | null;
  }): SprintIssue {
    return new SprintIssue(
      props.issueKey,
      props.summary,
      props.issueType || 'Task',
      props.status || 'Unknown',
      props.statusCategory || 'Unknown',
      props.statusCategoryKey || 'undefined',
      props.storyPoints ?? null,
      props.originalEstimateSeconds ? TimeSpent.fromSeconds(props.originalEstimateSeconds) : null
    );
  }

  // Getters
  get issueKey(): string { return this._issueKey; }
  get summary(): string { return this._summary; }
  get issueType(): string { return this._issueType; }
  get status(): string { return this._status; }
  get statusCategory(): StatusCategory { return this._statusCategory; }
  get statusCategoryKey(): StatusCategoryKey { return this._statusCategoryKey; }
  get storyPoints(): number | null { return this._storyPoints; }
  get originalEstimate(): TimeSpent | null { return this._originalEstimate; }

  /**
   * Get project key from issue key
   */
  get projectKey(): string {
    const parts = this._issueKey.split('-');
    return parts.length > 1 ? parts[0] : this._issueKey;
  }

  // Domain methods - Status classification (category/key from Jira, with fallback from status name)
  get isTodo(): boolean {
    if (this._statusCategoryKey === 'new' || this._statusCategory === 'To Do') return true;
    const s = this._status.toLowerCase();
    return ['to do', 'à faire', 'open', 'backlog', 'nouveau'].some(k => s.includes(k));
  }

  get isInProgress(): boolean {
    if (this._statusCategoryKey === 'indeterminate' || this._statusCategory === 'In Progress') return true;
    const s = this._status.toLowerCase();
    return ['in progress', 'en cours', 'wip', 'en progression'].some(k => s.includes(k));
  }

  get isDone(): boolean {
    if (this._statusCategoryKey === 'done' || this._statusCategory === 'Done') return true;
    const s = this._status.toLowerCase();
    return ['done', 'résolu', 'resolved', 'closed', 'complete', 'terminé', 'livré'].some(k => s.includes(k));
  }

  /**
   * Check if issue is in QA (based on status name keywords)
   */
  get isInQA(): boolean {
    const QA_KEYWORDS = ['qa', 'test', 'testing', 'validation', 'recette'];
    const statusLower = this._status.toLowerCase();
    return QA_KEYWORDS.some(keyword => statusLower.includes(keyword));
  }

  /**
   * Check if this is a bug
   */
  get isBug(): boolean {
    const bugTypes = ['bug', 'defect', 'issue'];
    return bugTypes.some(t => this._issueType.toLowerCase().includes(t));
  }

  /**
   * Check if this is a story
   */
  get isStory(): boolean {
    return this._issueType.toLowerCase().includes('story');
  }

  /**
   * Check if this is a task
   */
  get isTask(): boolean {
    return this._issueType.toLowerCase().includes('task');
  }

  /**
   * Check if this issue has story points
   */
  get hasStoryPoints(): boolean {
    return this._storyPoints !== null && this._storyPoints > 0;
  }

  equals(other: SprintIssue): boolean {
    return this._issueKey === other._issueKey;
  }

  toJSON(): Record<string, unknown> {
    return {
      issueKey: this._issueKey,
      summary: this._summary,
      issueType: this._issueType,
      status: this._status,
      statusCategory: this._statusCategory,
      statusCategoryKey: this._statusCategoryKey,
      storyPoints: this._storyPoints,
      originalEstimateSeconds: this._originalEstimate?.toSeconds ?? null,
      isTodo: this.isTodo,
      isInProgress: this.isInProgress,
      isDone: this.isDone,
      isInQA: this.isInQA
    };
  }
}

