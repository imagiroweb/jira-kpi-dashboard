/**
 * Value Object representing a worklog author
 * Immutable
 */
export class Author {
  private constructor(
    private readonly _accountId: string,
    private readonly _displayName: string,
    private readonly _avatarUrl?: string
  ) {
    if (!_accountId) {
      throw new Error('Author accountId is required');
    }
  }

  static create(accountId: string, displayName: string, avatarUrl?: string): Author {
    return new Author(accountId, displayName || 'Unknown', avatarUrl);
  }

  static unknown(): Author {
    return new Author('unknown', 'Unknown User');
  }

  get accountId(): string {
    return this._accountId;
  }

  get displayName(): string {
    return this._displayName;
  }

  get avatarUrl(): string | undefined {
    return this._avatarUrl;
  }

  /**
   * Get initials from display name (e.g., "John Doe" → "JD")
   */
  get initials(): string {
    return this._displayName
      .split(' ')
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  }

  equals(other: Author): boolean {
    return this._accountId === other._accountId;
  }

  toString(): string {
    return this._displayName;
  }

  toJSON(): { accountId: string; displayName: string; avatarUrl?: string } {
    return {
      accountId: this._accountId,
      displayName: this._displayName,
      avatarUrl: this._avatarUrl
    };
  }
}

