import {
  CachedSprintRepository,
  CachedWorklogRepository,
  globalCache
} from './CacheDecorator';
import { DateRange } from '../../domain/worklog/value-objects/DateRange';
import { IWorklogRepository } from '../../domain/worklog/repositories/IWorklogRepository';
import { ISprintRepository } from '../../domain/sprint/repositories/ISprintRepository';
import { Sprint } from '../../domain/sprint/entities/Sprint';

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
    } as jest.Mocked<IWorklogRepository>;
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
    } as jest.Mocked<IWorklogRepository>;
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
    } as jest.Mocked<ISprintRepository>;
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
    } as jest.Mocked<IWorklogRepository>;
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

  it('détache le timer de nettoyage avec unref', () => {
    const unref = jest.fn();
    const setIntervalSpy = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue({ unref } as unknown as ReturnType<typeof setInterval>);

    jest.isolateModules(() => {
      // Recharger le module pour exécuter de nouveau l'instanciation du cache global.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./CacheDecorator');
    });

    expect(setIntervalSpy).toHaveBeenCalled();
    expect(unref).toHaveBeenCalledTimes(1);
    setIntervalSpy.mockRestore();
  });

  it('CachedWorklogRepository met en cache findByProject et findByOpenSprints', async () => {
    const inner = {
      findByIssue: jest.fn(),
      findByUser: jest.fn(),
      findByProject: jest.fn().mockResolvedValue([{ id: 'p1' }]),
      findByOpenSprints: jest.fn().mockResolvedValue([{ id: 'o1' }]),
      search: jest.fn()
    } as jest.Mocked<IWorklogRepository>;
    const repo = new CachedWorklogRepository(inner);
    const range = DateRange.create('2026-04-01', '2026-04-15');

    await repo.findByProject('ABC', range);
    await repo.findByProject('ABC', range);
    expect(inner.findByProject).toHaveBeenCalledTimes(1);

    await repo.findByOpenSprints();
    await repo.findByOpenSprints();
    expect(inner.findByOpenSprints).toHaveBeenCalledTimes(1);

    await repo.findByOpenSprints('XYZ');
    await repo.findByOpenSprints('XYZ');
    expect(inner.findByOpenSprints).toHaveBeenCalledTimes(2);
  });

  it('CachedSprintRepository met en cache findOpenSprints, findClosedSprints, findSprintIssues, issues ouvertes et backlog', async () => {
    const inner = {
      findByBoard: jest.fn(),
      findOpenSprints: jest.fn().mockResolvedValue([{ id: 1 }]),
      findClosedSprints: jest.fn().mockResolvedValue([{ id: 2 }]),
      findById: jest.fn(),
      findSprintIssues: jest.fn().mockResolvedValue([]),
      findOpenSprintIssues: jest.fn().mockResolvedValue([]),
      findBacklogIssues: jest.fn().mockResolvedValue([])
    } as jest.Mocked<ISprintRepository>;
    const repo = new CachedSprintRepository(inner);

    await repo.findOpenSprints('P');
    await repo.findOpenSprints('P');
    expect(inner.findOpenSprints).toHaveBeenCalledTimes(1);

    await repo.findClosedSprints('P', 20);
    await repo.findClosedSprints('P', 20);
    expect(inner.findClosedSprints).toHaveBeenCalledWith('P', 20);
    expect(inner.findClosedSprints).toHaveBeenCalledTimes(1);

    await repo.findSprintIssues(99);
    await repo.findSprintIssues(99);
    expect(inner.findSprintIssues).toHaveBeenCalledTimes(1);

    await repo.findOpenSprintIssues('P');
    await repo.findOpenSprintIssues('P');
    expect(inner.findOpenSprintIssues).toHaveBeenCalledTimes(1);

    await repo.findBacklogIssues('P', 50);
    await repo.findBacklogIssues('P', 50);
    expect(inner.findBacklogIssues).toHaveBeenCalledTimes(1);
  });

  it('CachedSprintRepository met en cache findById quand le sprint existe', async () => {
    const sprint = Sprint.create({ id: 5, name: 'Sprint 5', state: 'active', boardId: 1 });
    const inner = {
      findByBoard: jest.fn(),
      findOpenSprints: jest.fn(),
      findClosedSprints: jest.fn(),
      findById: jest.fn().mockResolvedValue(sprint),
      findSprintIssues: jest.fn(),
      findOpenSprintIssues: jest.fn(),
      findBacklogIssues: jest.fn()
    } as jest.Mocked<ISprintRepository>;
    const repo = new CachedSprintRepository(inner);
    await repo.findById(5);
    await repo.findById(5);
    expect(inner.findById).toHaveBeenCalledTimes(1);
  });
});
