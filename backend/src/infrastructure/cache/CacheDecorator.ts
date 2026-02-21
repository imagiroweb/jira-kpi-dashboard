import { IWorklogRepository, WorklogSearchParams } from '../../domain/worklog/repositories/IWorklogRepository';
import { ISprintRepository } from '../../domain/sprint/repositories/ISprintRepository';
import { Worklog } from '../../domain/worklog/entities/Worklog';
import { Sprint } from '../../domain/sprint/entities/Sprint';
import { SprintIssue } from '../../domain/sprint/entities/SprintIssue';
import { DateRange } from '../../domain/worklog/value-objects/DateRange';
import { logger } from '../../utils/logger';

/**
 * Simple in-memory cache
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class InMemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private defaultTTL: number;

  constructor(defaultTTLMinutes: number = 5) {
    this.defaultTTL = defaultTTLMinutes * 60 * 1000;
    
    // Clean expired entries every minute
    setInterval(() => this.cleanExpired(), 60 * 1000);
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    
    if (!entry || Date.now() > entry.expiresAt) {
      if (entry) this.cache.delete(key);
      return null;
    }
    
    logger.debug(`Cache HIT: ${key}`);
    return entry.data;
  }

  set<T>(key: string, data: T, ttlMinutes?: number): void {
    const ttl = ttlMinutes ? ttlMinutes * 60 * 1000 : this.defaultTTL;
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl
    });
  }

  invalidate(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

const cache = new InMemoryCache(5);

/**
 * Cached Worklog Repository Decorator
 */
export class CachedWorklogRepository implements IWorklogRepository {
  constructor(private readonly inner: IWorklogRepository) {}

  async findByIssue(issueKey: string): Promise<Worklog[]> {
    const key = `worklog:issue:${issueKey}`;
    const cached = cache.get<Worklog[]>(key);
    if (cached) return cached;

    const result = await this.inner.findByIssue(issueKey);
    cache.set(key, result, 10);
    return result;
  }

  async findByUser(accountId: string, range: DateRange): Promise<Worklog[]> {
    const key = `worklog:user:${accountId}:${range.fromISO}:${range.toISO}`;
    const cached = cache.get<Worklog[]>(key);
    if (cached) return cached;

    const result = await this.inner.findByUser(accountId, range);
    cache.set(key, result, 5);
    return result;
  }

  async findByProject(projectKey: string, range: DateRange): Promise<Worklog[]> {
    const key = `worklog:project:${projectKey}:${range.fromISO}:${range.toISO}`;
    const cached = cache.get<Worklog[]>(key);
    if (cached) return cached;

    const result = await this.inner.findByProject(projectKey, range);
    cache.set(key, result, 5);
    return result;
  }

  async findByOpenSprints(projectKey?: string): Promise<Worklog[]> {
    const key = `worklog:opensprints:${projectKey || 'all'}`;
    const cached = cache.get<Worklog[]>(key);
    if (cached) return cached;

    const result = await this.inner.findByOpenSprints(projectKey);
    cache.set(key, result, 2);
    return result;
  }

  async search(params: WorklogSearchParams): Promise<Worklog[]> {
    const key = `worklog:search:${JSON.stringify(params)}`;
    const cached = cache.get<Worklog[]>(key);
    if (cached) return cached;

    const result = await this.inner.search(params);
    cache.set(key, result, 5);
    return result;
  }
}

/**
 * Cached Sprint Repository Decorator
 */
export class CachedSprintRepository implements ISprintRepository {
  constructor(private readonly inner: ISprintRepository) {}

  async findByBoard(boardId: number): Promise<Sprint[]> {
    const key = `sprint:board:${boardId}`;
    const cached = cache.get<Sprint[]>(key);
    if (cached) return cached;

    const result = await this.inner.findByBoard(boardId);
    cache.set(key, result, 5);
    return result;
  }

  async findOpenSprints(projectKey: string): Promise<Sprint[]> {
    const key = `sprint:open:${projectKey}`;
    const cached = cache.get<Sprint[]>(key);
    if (cached) return cached;

    const result = await this.inner.findOpenSprints(projectKey);
    cache.set(key, result, 2);
    return result;
  }

  async findClosedSprints(projectKey: string, limit?: number): Promise<Sprint[]> {
    const key = `sprint:closed:${projectKey}:${limit || 10}`;
    const cached = cache.get<Sprint[]>(key);
    if (cached) return cached;

    const result = await this.inner.findClosedSprints(projectKey, limit);
    cache.set(key, result, 10);
    return result;
  }

  async findById(sprintId: number): Promise<Sprint | null> {
    const key = `sprint:id:${sprintId}`;
    const cached = cache.get<Sprint | null>(key);
    if (cached !== null) return cached;

    const result = await this.inner.findById(sprintId);
    if (result) cache.set(key, result, 10);
    return result;
  }

  async findSprintIssues(sprintId: number): Promise<SprintIssue[]> {
    const key = `sprint:issues:${sprintId}`;
    const cached = cache.get<SprintIssue[]>(key);
    if (cached) return cached;

    const result = await this.inner.findSprintIssues(sprintId);
    cache.set(key, result, 2);
    return result;
  }

  async findOpenSprintIssues(projectKey: string): Promise<SprintIssue[]> {
    const key = `sprint:openissues:${projectKey}`;
    const cached = cache.get<SprintIssue[]>(key);
    if (cached) return cached;

    const result = await this.inner.findOpenSprintIssues(projectKey);
    cache.set(key, result, 2);
    return result;
  }

  async findBacklogIssues(projectKey: string, maxResults?: number): Promise<SprintIssue[]> {
    const key = `sprint:backlog:${projectKey}:all`;
    const cached = cache.get<SprintIssue[]>(key);
    if (cached) return cached;

    const result = await this.inner.findBacklogIssues(projectKey, maxResults);
    cache.set(key, result, 10); // Cache for 10 minutes (backlog changes less frequently)
    return result;
  }
}

export { cache as globalCache };

