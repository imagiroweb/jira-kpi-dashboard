import { CachedSprintRepository, CachedWorklogRepository, globalCache } from './CacheDecorator';
import { DateRange } from '../../domain/worklog/value-objects/DateRange';

describe('CacheDecorator', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    globalCache.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('CachedWorklogRepository met en cache findByIssue', async () => {
    const inner = {
      findByIssue: jest.fn().mockResolvedValue([{ id: 'w1' }]),
      findByUser: jest.fn(),
      findByProject: jest.fn(),
      findByOpenSprints: jest.fn(),
      search: jest.fn()
    } as any;
    const repo = new CachedWorklogRepository(inner);

    await repo.findByIssue('ABC-1');
    await repo.findByIssue('ABC-1');

    expect(inner.findByIssue).toHaveBeenCalledTimes(1);
  });

  it('CachedWorklogRepository ne met pas en cache search', async () => {
    const inner = {
      findByIssue: jest.fn(),
      findByUser: jest.fn(),
      findByProject: jest.fn(),
      findByOpenSprints: jest.fn(),
      search: jest.fn().mockResolvedValue([{ id: 'w1' }])
    } as any;
    const repo = new CachedWorklogRepository(inner);

    await repo.search({ projectKey: 'ABC' });
    await repo.search({ projectKey: 'ABC' });

    expect(inner.search).toHaveBeenCalledTimes(2);
  });

  it('CachedSprintRepository met en cache findByBoard et pas findById=null', async () => {
    const inner = {
      findByBoard: jest.fn().mockResolvedValue([{ id: 1 }]),
      findOpenSprints: jest.fn(),
      findClosedSprints: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
      findSprintIssues: jest.fn(),
      findOpenSprintIssues: jest.fn(),
      findBacklogIssues: jest.fn()
    } as any;
    const repo = new CachedSprintRepository(inner);

    await repo.findByBoard(42);
    await repo.findByBoard(42);
    expect(inner.findByBoard).toHaveBeenCalledTimes(1);

    await repo.findById(999);
    await repo.findById(999);
    expect(inner.findById).toHaveBeenCalledTimes(2);
  });

  it('CachedWorklogRepository met en cache findByUser avec clé de plage', async () => {
    const inner = {
      findByIssue: jest.fn(),
      findByUser: jest.fn().mockResolvedValue([{ id: 'wu' }]),
      findByProject: jest.fn(),
      findByOpenSprints: jest.fn(),
      search: jest.fn()
    } as any;
    const repo = new CachedWorklogRepository(inner);
    const range = DateRange.create('2026-04-01', '2026-04-15');

    await repo.findByUser('u1', range);
    await repo.findByUser('u1', range);

    expect(inner.findByUser).toHaveBeenCalledTimes(1);
  });

  it('globalCache invalide par préfixe et expire les entrées', () => {
    globalCache.set('worklog:a', { id: 1 }, 1);
    globalCache.set('worklog:b', { id: 2 }, 1);
    globalCache.set('sprint:a', { id: 3 }, 1);

    globalCache.invalidate('worklog:');

    expect(globalCache.get('worklog:a')).toBeNull();
    expect(globalCache.get('worklog:b')).toBeNull();
    expect(globalCache.get('sprint:a')).toEqual({ id: 3 });

    globalCache.set('ttl:key', { ok: true }, 1 / 120);
    expect(globalCache.get('ttl:key')).toEqual({ ok: true });
    jest.advanceTimersByTime(31_000);
    expect(globalCache.get('ttl:key')).toBeNull();
  });
});
