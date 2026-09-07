import mongoose from 'mongoose';
import { WorklogHoursDaily } from '../../domain/worklog/entities/WorklogHoursDaily';
import { DateRange } from '../../domain/worklog/value-objects/DateRange';
import { Worklog } from '../../domain/worklog/entities/Worklog';
import { container } from '../../infrastructure/Container';
import { getWorklogCalendarDate } from '../../utils/worklogDate';
import { logger } from '../../utils/logger';

function isoToday(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Liste YYYY-MM-DD pour aujourd’hui et les N-1 jours précédents (UTC date). */
export function recentIsoDates(dayCount: number, now = new Date()): string[] {
  const n = Math.max(1, dayCount);
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(isoToday(d));
  }
  return dates;
}

/** Agrège des worklogs en Map date → heures (date calendaire Jira). */
export function bucketHoursByCalendarDate(worklogs: Worklog[]): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const w of worklogs) {
    const day = getWorklogCalendarDate(w.workStart);
    byDate.set(day, (byDate.get(day) || 0) + w.timeSpent.toHours);
  }
  return byDate;
}

function normalizeProjectKey(key: string): string {
  return key.trim().toUpperCase();
}

/**
 * Persistance / lecture des heures worklog quotidiennes (issue #37 phase 2).
 */
export class WorklogHoursDailyService {
  isMongoReady(): boolean {
    return mongoose.connection.readyState === 1;
  }

  async upsertProjectDay(projectKey: string, date: string, hours: number): Promise<void> {
    const pk = normalizeProjectKey(projectKey);
    await WorklogHoursDaily.findOneAndUpdate(
      { projectKey: pk, date },
      { $set: { hours: Math.max(0, hours) } },
      { upsert: true, new: true }
    );
  }

  async upsertBuckets(projectKey: string, buckets: Map<string, number>): Promise<number> {
    let n = 0;
    for (const [date, hours] of buckets) {
      await this.upsertProjectDay(projectKey, date, hours);
      n++;
    }
    return n;
  }

  /**
   * Pour chaque projet × jour : fetch Jira sur la journée et upsert les heures.
   */
  async syncDaysFromJira(projectKeys: string[], dates: string[]): Promise<{ upserts: number }> {
    if (!this.isMongoReady()) {
      logger.warn('WorklogHoursDaily sync skipped: MongoDB not connected');
      return { upserts: 0 };
    }
    const repo = container().worklogRepository;
    let upserts = 0;
    const keys = [...new Set(projectKeys.map(normalizeProjectKey).filter(Boolean))];

    for (const projectKey of keys) {
      for (const date of dates) {
        try {
          const range = DateRange.create(date, date);
          const worklogs = await repo.findByProject(projectKey, range);
          const buckets = bucketHoursByCalendarDate(worklogs);
          // Uniquement le jour demandé (évite de sous-compter un jour voisin via fetch partiel)
          const hoursForDay = buckets.get(date) ?? 0;
          await this.upsertProjectDay(projectKey, date, hoursForDay);
          upserts++;
        } catch (e) {
          logger.warn(`WorklogHoursDaily sync failed ${projectKey} ${date}:`, e);
        }
      }
    }
    return { upserts };
  }

  /** Sync J / J−1 / … (défaut 3 jours). */
  async syncRecentDays(projectKeys: string[], dayCount = 3): Promise<{ upserts: number; dates: string[] }> {
    const dates = recentIsoDates(dayCount);
    const result = await this.syncDaysFromJira(projectKeys, dates);
    logger.info(
      `WorklogHoursDaily recent sync: ${result.upserts} upserts for ${projectKeys.length} projects × ${dates.join(',')}`
    );
    return { ...result, dates };
  }

  /**
   * Si aucun doc YTD : backfill année via findByProject (une fois, coûteux).
   */
  async ensureYtdBackfill(projectKeys: string[], ytdFrom: string, ytdTo: string): Promise<boolean> {
    if (!this.isMongoReady()) return false;
    const keys = [...new Set(projectKeys.map(normalizeProjectKey).filter(Boolean))];
    const existing = await WorklogHoursDaily.countDocuments({
      projectKey: { $in: keys },
      date: { $gte: ytdFrom, $lte: ytdTo },
    });
    if (existing > 0) return false;

    logger.info(
      `WorklogHoursDaily YTD backfill starting (${ytdFrom}→${ytdTo}, ${keys.length} projects)…`
    );
    const repo = container().worklogRepository;
    const range = DateRange.create(ytdFrom, ytdTo);
    for (const projectKey of keys) {
      try {
        const worklogs = await repo.findByProject(projectKey, range);
        const buckets = bucketHoursByCalendarDate(worklogs);
        await this.upsertBuckets(projectKey, buckets);
        logger.info(
          `WorklogHoursDaily backfill ${projectKey}: ${worklogs.length} worklogs → ${buckets.size} days`
        );
      } catch (e) {
        logger.warn(`WorklogHoursDaily YTD backfill failed for ${projectKey}:`, e);
      }
    }
    return true;
  }

  /** Somme des heures par projet sur [from, to]. */
  async sumHoursByProject(
    projectKeys: string[],
    from: string,
    to: string
  ): Promise<Map<string, number>> {
    const keys = [...new Set(projectKeys.map(normalizeProjectKey).filter(Boolean))];
    const out = new Map<string, number>();
    for (const k of keys) out.set(k, 0);
    if (!this.isMongoReady() || keys.length === 0) return out;

    const rows = await WorklogHoursDaily.aggregate<{ _id: string; hours: number }>([
      {
        $match: {
          projectKey: { $in: keys },
          date: { $gte: from, $lte: to },
        },
      },
      { $group: { _id: '$projectKey', hours: { $sum: '$hours' } } },
    ]);

    for (const row of rows) {
      out.set(normalizeProjectKey(row._id), row.hours);
    }
    return out;
  }

  /** Projets ayant au moins un document dans la plage. */
  async projectsWithCoverage(projectKeys: string[], from: string, to: string): Promise<Set<string>> {
    const keys = [...new Set(projectKeys.map(normalizeProjectKey).filter(Boolean))];
    if (!this.isMongoReady() || keys.length === 0) return new Set();

    const rows = await WorklogHoursDaily.aggregate<{ _id: string }>([
      {
        $match: {
          projectKey: { $in: keys },
          date: { $gte: from, $lte: to },
        },
      },
      { $group: { _id: '$projectKey' } },
    ]);
    return new Set(rows.map((r) => normalizeProjectKey(r._id)));
  }
}

export const worklogHoursDailyService = new WorklogHoursDailyService();
