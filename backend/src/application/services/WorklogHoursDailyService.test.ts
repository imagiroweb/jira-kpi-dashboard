import { TimeSpent } from '../../domain/worklog/value-objects/TimeSpent';
import { Author } from '../../domain/worklog/value-objects/Author';
import { Worklog } from '../../domain/worklog/entities/Worklog';

const mockFindOneAndUpdate = jest.fn();
const mockCountDocuments = jest.fn();
const mockAggregate = jest.fn();

jest.mock('../../domain/worklog/entities/WorklogHoursDaily', () => ({
  WorklogHoursDaily: {
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
    countDocuments: (...args: unknown[]) => mockCountDocuments(...args),
    aggregate: (...args: unknown[]) => mockAggregate(...args),
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockFindByProject = jest.fn();

jest.mock('../../infrastructure/Container', () => ({
  container: () => ({
    worklogRepository: {
      findByProject: mockFindByProject,
    },
  }),
}));

jest.mock('mongoose', () => ({
  connection: { readyState: 1 },
}));

import {
  WorklogHoursDailyService,
  bucketHoursByCalendarDate,
  recentIsoDates,
} from './WorklogHoursDailyService';

function makeWorklog(issueKey: string, workStart: Date, seconds: number): Worklog {
  return Worklog.create({
    id: `${issueKey}-${workStart.toISOString()}`,
    issueKey,
    author: Author.create('u1', 'User'),
    timeSpent: TimeSpent.fromSeconds(seconds),
    workStart,
  });
}

describe('WorklogHoursDailyService (issue #37 phase 2)', () => {
  const service = new WorklogHoursDailyService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindOneAndUpdate.mockResolvedValue({});
    mockCountDocuments.mockResolvedValue(0);
    mockAggregate.mockResolvedValue([]);
    mockFindByProject.mockResolvedValue([]);
  });

  it('recentIsoDates retourne N jours UTC décroissants', () => {
    const dates = recentIsoDates(3, new Date('2026-09-07T12:00:00.000Z'));
    expect(dates).toEqual(['2026-09-07', '2026-09-06', '2026-09-05']);
  });

  it('bucketHoursByCalendarDate agrège par jour calendaire', () => {
    const logs = [
      makeWorklog('ABC-1', new Date('2026-04-01T10:00:00.000Z'), 3600),
      makeWorklog('ABC-2', new Date('2026-04-01T14:00:00.000Z'), 1800),
      makeWorklog('ABC-3', new Date('2026-04-02T10:00:00.000Z'), 7200),
    ];
    const buckets = bucketHoursByCalendarDate(logs);
    expect(buckets.get('2026-04-01')).toBe(1.5);
    expect(buckets.get('2026-04-02')).toBe(2);
  });

  it('sumHoursByProject mappe l’agrégat Mongo', async () => {
    mockAggregate.mockResolvedValue([
      { _id: 'ABC', hours: 12.5 },
      { _id: 'SB', hours: 3 },
    ]);

    const map = await service.sumHoursByProject(['abc', 'SB', 'REL'], '2026-01-01', '2026-09-07');

    expect(map.get('ABC')).toBe(12.5);
    expect(map.get('SB')).toBe(3);
    expect(map.get('REL')).toBe(0);
  });

  it('projectsWithCoverage retourne les projets présents', async () => {
    mockAggregate.mockResolvedValue([{ _id: 'ABC' }, { _id: 'sb' }]);
    const set = await service.projectsWithCoverage(['ABC', 'SB', 'REL'], '2026-01-01', '2026-09-07');
    expect(set.has('ABC')).toBe(true);
    expect(set.has('SB')).toBe(true);
    expect(set.has('REL')).toBe(false);
  });

  it('ensureYtdBackfill ne fait rien si des docs existent déjà', async () => {
    mockCountDocuments.mockResolvedValue(10);
    const ran = await service.ensureYtdBackfill(['ABC'], '2026-01-01', '2026-09-07');
    expect(ran).toBe(false);
    expect(mockFindByProject).not.toHaveBeenCalled();
  });

  it('ensureYtdBackfill fetch Jira et upsert si collection vide', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockFindByProject.mockResolvedValue([
      makeWorklog('ABC-1', new Date('2026-03-01T10:00:00.000Z'), 3600),
    ]);

    const ran = await service.ensureYtdBackfill(['ABC'], '2026-01-01', '2026-09-07');

    expect(ran).toBe(true);
    expect(mockFindByProject).toHaveBeenCalled();
    expect(mockFindOneAndUpdate).toHaveBeenCalled();
  });

  it('syncDaysFromJira upsert le jour demandé', async () => {
    mockFindByProject.mockResolvedValue([
      makeWorklog('SB-1', new Date('2026-09-07T10:00:00.000Z'), 7200),
    ]);

    const { upserts } = await service.syncDaysFromJira(['SB'], ['2026-09-07']);

    expect(upserts).toBe(1);
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { projectKey: 'SB', date: '2026-09-07' },
      { $set: { hours: 2 } },
      { upsert: true, new: true }
    );
  });
});
