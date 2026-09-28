import mongoose from 'mongoose';
import { Organization } from '../../domain/organization/entities/Organization';
import { computeRetentionCutoffs } from '../../domain/organization/retention';
import { User } from '../../domain/user/entities/User';
import { UserActivityLog } from '../../domain/user/entities/UserActivityLog';
import { PerformanceCycle } from '../../domain/performance/entities/PerformanceCycle';
import { PerformanceReview } from '../../domain/performance/entities/PerformanceReview';
import { logger } from '../../utils/logger';

/**
 * Purge des données au-delà des durées de conservation de chaque organisation (RGPD art. 5.1.e).
 * Exécutée une fois par jour (voir `startRetentionSchedule`). Idempotente.
 */
export interface OrganizationPurgeReport {
  organization: string;
  activityLogsDeleted: number;
  performanceReviewsDeleted: number;
  accountsAnonymized: number;
}

/** Anonymisation d'un compte — branchée par le service d'effacement (évite une dépendance circulaire). */
type AnonymizeFn = (userId: string, reason: 'retention') => Promise<unknown>;
let anonymizeAccount: AnonymizeFn | null = null;
export function registerAccountAnonymizer(fn: AnonymizeFn): void {
  anonymizeAccount = fn;
}

export async function purgeExpiredData(now: Date = new Date()): Promise<OrganizationPurgeReport[]> {
  const organizations = await Organization.find().select('slug retention').lean();
  const reports: OrganizationPurgeReport[] = [];

  for (const org of organizations) {
    const cutoffs = computeRetentionCutoffs(org.retention, now);
    const report: OrganizationPurgeReport = {
      organization: org.slug,
      activityLogsDeleted: 0,
      performanceReviewsDeleted: 0,
      accountsAnonymized: 0
    };
    const userIds = (await User.find({ organizationId: org._id }).distinct('_id')) as mongoose.Types.ObjectId[];

    if (cutoffs.activityLogsBefore && userIds.length) {
      const res = await UserActivityLog.deleteMany({ userId: { $in: userIds }, timestamp: { $lt: cutoffs.activityLogsBefore } });
      report.activityLogsDeleted = res.deletedCount ?? 0;
    }

    if (cutoffs.performanceCyclesEndedBefore && userIds.length) {
      const cycleIds = await PerformanceCycle.find({ endDate: { $lt: cutoffs.performanceCyclesEndedBefore } }).distinct('_id');
      if (cycleIds.length) {
        const res = await PerformanceReview.deleteMany({ user: { $in: userIds }, cycle: { $in: cycleIds } });
        report.performanceReviewsDeleted = res.deletedCount ?? 0;
      }
    }

    if (cutoffs.inactiveAccountsDeactivatedBefore && anonymizeAccount) {
      const expired = await User.find({
        organizationId: org._id,
        isActive: false,
        anonymizedAt: null,
        deactivatedAt: { $ne: null, $lt: cutoffs.inactiveAccountsDeactivatedBefore }
      }).distinct('_id');
      for (const id of expired) {
        await anonymizeAccount(String(id), 'retention');
        report.accountsAnonymized++;
      }
    }

    if (report.activityLogsDeleted || report.performanceReviewsDeleted || report.accountsAnonymized) {
      logger.info(
        `Purge conservation (${org.slug}) : ${report.activityLogsDeleted} log(s) d'activité, ` +
          `${report.performanceReviewsDeleted} fiche(s) de performance, ${report.accountsAnonymized} compte(s) anonymisé(s)`
      );
    }
    reports.push(report);
  }
  return reports;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Planifie la purge quotidienne (première exécution 1 min après le démarrage). RETENTION_PURGE_ENABLED=false pour désactiver. */
export function startRetentionSchedule(): NodeJS.Timeout | null {
  if (process.env.RETENTION_PURGE_ENABLED === 'false') {
    logger.info('Purge de conservation désactivée (RETENTION_PURGE_ENABLED=false)');
    return null;
  }
  const run = () => {
    purgeExpiredData().catch((error) => logger.error('Purge de conservation en échec :', error));
  };
  setTimeout(run, 60 * 1000).unref();
  const interval = setInterval(run, DAY_MS);
  interval.unref();
  return interval;
}
