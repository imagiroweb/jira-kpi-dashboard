import mongoose from 'mongoose';
import { User } from '../../domain/user/entities/User';
import { Role } from '../../domain/user/entities/Role';
import { UserActivityLog } from '../../domain/user/entities/UserActivityLog';
import { Team } from '../../domain/team/entities/Team';
import { Organization } from '../../domain/organization/entities/Organization';
import { PerformanceReview } from '../../domain/performance/entities/PerformanceReview';
import { PerformanceCycle } from '../../domain/performance/entities/PerformanceCycle';
import { DashboardSprintSnapshot } from '../../domain/sprint/entities/DashboardSprintSnapshot';
import { SupportSprintSnapshot } from '../../domain/support/entities/SupportSprintSnapshot';
import { WeeklySprintMeeting } from '../../domain/meeting/entities/WeeklySprintMeeting';
import { anonymizeReviewContent } from '../../domain/performance/anonymizeReview';
import { logger } from '../../utils/logger';

/**
 * Droits des personnes (RGPD art. 15, 17, 20) : export des données d'un utilisateur et
 * anonymisation de son compte.
 */

/** Nom affiché à la place d'un auteur anonymisé (fiches, points hebdo, snapshots). */
export const ANONYMIZED_AUTHOR_NAME = 'Utilisateur supprimé';

export function anonymizedEmail(userId: string): string {
  return `supprime-${userId}@anonyme.invalid`;
}

const ACCOUNT_FIELDS =
  'email firstName lastName provider isActive role roleId teamId organizationId canManageTeamAssignment ' +
  'hourlyRates includedInCosts lastLogin preferences deactivatedAt createdAt updatedAt';

/**
 * Export complet (JSON) des données personnelles d'un utilisateur : compte, rattachements, fiches
 * de performance, logs d'activité et contenus dont il est l'auteur. Aucun secret (hash du mot de
 * passe, jetons de réinitialisation, version de session).
 */
export async function exportPersonalData(userId: string): Promise<Record<string, unknown> | null> {
  const user = await User.findById(userId).select(ACCOUNT_FIELDS).lean();
  if (!user) return null;

  const [role, team, organization, reviews, activityLogs, dashboardSnapshots, supportSnapshots, meetings, ledTeams] =
    await Promise.all([
      user.roleId ? Role.findById(user.roleId).select('name').lean() : null,
      user.teamId ? Team.findById(user.teamId).select('name').lean() : null,
      user.organizationId ? Organization.findById(user.organizationId).select('name').lean() : null,
      PerformanceReview.find({ user: user._id }).lean(),
      UserActivityLog.find({ userId: user._id }).sort({ timestamp: -1 }).select('type timestamp meta').lean(),
      DashboardSprintSnapshot.find({ 'savedBy.id': userId }).select('sprintName savedAt').lean(),
      SupportSprintSnapshot.find({ 'savedBy.id': userId }).select('sprintName savedAt').lean(),
      WeeklySprintMeeting.find({ 'createdBy.id': userId }).select('sprint.date sprint.name createdAt').lean(),
      Team.find({ leadIds: user._id }).select('name').lean()
    ]);

  const cycleIds = [...new Set(reviews.map((r) => String(r.cycle)))];
  const cycles = cycleIds.length ? await PerformanceCycle.find({ _id: { $in: cycleIds } }).select('label startDate endDate').lean() : [];
  const cycleById = new Map(cycles.map((c) => [String(c._id), c]));

  return {
    generatedAt: new Date().toISOString(),
    notice:
      'Export de vos données personnelles (RGPD, droits d’accès et de portabilité). ' +
      'Les secrets de sécurité (mot de passe, jetons) ne sont jamais exportés.',
    account: {
      id: String(user._id),
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      provider: user.provider,
      isActive: user.isActive,
      isSuperAdmin: user.role === 'super_admin',
      role: role?.name ?? null,
      organization: organization?.name ?? null,
      team: team?.name ?? null,
      leadOfTeams: ledTeams.map((t) => t.name),
      canManageTeamAssignment: user.canManageTeamAssignment ?? false,
      hourlyRates: user.hourlyRates ?? [],
      includedInCosts: user.includedInCosts ?? false,
      preferences: user.preferences ?? {},
      lastLogin: user.lastLogin ?? null,
      deactivatedAt: user.deactivatedAt ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    },
    performanceReviews: reviews.map((r) => {
      const cycle = cycleById.get(String(r.cycle));
      const { _id, user: _user, cycle: _cycle, __v, ...content } = r as Record<string, unknown>;
      return {
        id: String(_id),
        cycle: cycle ? { label: cycle.label, startDate: cycle.startDate, endDate: cycle.endDate } : null,
        ...content
      };
    }),
    activityLogs: activityLogs.map((l) => ({ type: l.type, timestamp: l.timestamp, meta: l.meta ?? null })),
    authoredContent: {
      dashboardSnapshots: dashboardSnapshots.map((s) => ({ id: String(s._id), sprintName: s.sprintName, savedAt: s.savedAt })),
      supportSnapshots: supportSnapshots.map((s) => ({ id: String(s._id), sprintName: s.sprintName, savedAt: s.savedAt })),
      weeklyMeetings: meetings.map((m) => ({ id: String(m._id), date: m.sprint?.date, sprint: m.sprint?.name, createdAt: m.createdAt }))
    }
  };
}

export interface AnonymizationReport {
  userId: string;
  activityLogsDeleted: number;
  performanceReviewsAnonymized: number;
}

/**
 * Anonymise les fiches de performance correspondant au filtre, sans les supprimer (statistiques
 * des cycles passés conservées) : texte libre effacé, lien vers le compte rompu (identifiant
 * aléatoire), nom de la personne remplacé là où elle est autrice. Voir `anonymizeReviewContent`.
 */
export async function anonymizePerformanceReviews(filter: Record<string, unknown>): Promise<number> {
  const reviews = await PerformanceReview.find({ ...filter, anonymizedAt: null }).lean();
  const now = new Date();
  for (const review of reviews) {
    const newUserId = new mongoose.Types.ObjectId();
    const content = anonymizeReviewContent(
      review as unknown as Parameters<typeof anonymizeReviewContent>[0],
      String(review.user),
      String(newUserId)
    );
    await PerformanceReview.updateOne({ _id: review._id }, { $set: { ...content, user: newUserId, anonymizedAt: now } });
  }
  return reviews.length;
}

/**
 * Anonymise un compte (droit à l'effacement, ou fin de la durée de conservation d'un compte
 * désactivé). Irréversible :
 *  - compte : identité, email, identifiant SSO, mot de passe, coûts horaires et préférences
 *    effacés ; compte désactivé et sessions révoquées ; retiré des leads d'équipe ;
 *  - logs d'activité supprimés ; fiches de performance anonymisées (texte libre effacé, lien
 *    vers le compte rompu) et conservées pour les statistiques des cycles passés ;
 *  - dans les contenus rédigés par la personne (fiches d'autres collaborateurs, points hebdo,
 *    snapshots), son nom est remplacé par « Utilisateur supprimé ».
 * Les champs en texte libre saisis par d'autres (ex. « responsable » d'une action) ne sont pas
 * modifiés.
 */
export async function anonymizeUser(userId: string, reason: 'request' | 'retention'): Promise<AnonymizationReport | null> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null;
  const user = await User.findById(userId).select('_id').lean();
  if (!user) return null;
  const oid = user._id;
  const now = new Date();

  await User.updateOne(
    { _id: oid },
    {
      $set: {
        email: anonymizedEmail(userId),
        isActive: false,
        anonymizedAt: now,
        deactivatedAt: now,
        canManageTeamAssignment: false,
        includedInCosts: false,
        isPlatformAdmin: false,
        roleId: null,
        teamId: null
      },
      $unset: {
        firstName: 1,
        lastName: 1,
        microsoftId: 1,
        password: 1,
        passwordResetToken: 1,
        passwordResetExpires: 1,
        hourlyRates: 1,
        preferences: 1,
        lastLogin: 1,
        role: 1
      },
      $inc: { tokenVersion: 1 }
    }
  );

  await Team.updateMany({ leadIds: oid }, { $pull: { leadIds: oid } });
  const logs = await UserActivityLog.deleteMany({ userId: oid });
  const reviewsAnonymized = await anonymizePerformanceReviews({ user: oid });

  // Nom de l'auteur remplacé dans les contenus rédigés pour d'autres.
  const anon = ANONYMIZED_AUTHOR_NAME;
  await PerformanceReview.updateMany({ 'createdBy.id': userId }, { $set: { 'createdBy.name': anon } });
  await PerformanceReview.updateMany({ 'updatedBy.id': userId }, { $set: { 'updatedBy.name': anon } });
  await PerformanceReview.updateMany({ 'definedBy.id': userId }, { $set: { 'definedBy.name': anon } });
  await PerformanceReview.updateMany(
    { 'objectives.krs.progressHistory.updatedBy.id': userId },
    { $set: { 'objectives.$[].krs.$[].progressHistory.$[p].updatedBy.name': anon } },
    { arrayFilters: [{ 'p.updatedBy.id': userId }] }
  );
  await PerformanceReview.updateMany(
    { 'objectives.actions.createdBy.id': userId },
    { $set: { 'objectives.$[].actions.$[a].createdBy.name': anon } },
    { arrayFilters: [{ 'a.createdBy.id': userId }] }
  );
  await PerformanceReview.updateMany(
    { 'objectives.actions.updatedBy.id': userId },
    { $set: { 'objectives.$[].actions.$[a].updatedBy.name': anon } },
    { arrayFilters: [{ 'a.updatedBy.id': userId }] }
  );

  const anonAuthor = { name: anon, email: anonymizedEmail(userId) };
  for (const Model of [DashboardSprintSnapshot, SupportSprintSnapshot] as const) {
    await (Model as mongoose.Model<unknown>).updateMany(
      { 'savedBy.id': userId },
      { $set: { 'savedBy.name': anonAuthor.name, 'savedBy.email': anonAuthor.email } }
    );
  }
  await WeeklySprintMeeting.updateMany(
    { 'createdBy.id': userId },
    { $set: { 'createdBy.name': anonAuthor.name, 'createdBy.email': anonAuthor.email } }
  );
  await WeeklySprintMeeting.updateMany(
    { 'updatedBy.id': userId },
    { $set: { 'updatedBy.name': anonAuthor.name, 'updatedBy.email': anonAuthor.email } }
  );
  for (const list of ['blockers', 'interactions', 'actions'] as const) {
    for (const field of ['createdBy', 'updatedBy'] as const) {
      await WeeklySprintMeeting.updateMany(
        { [`${list}.${field}.id`]: userId },
        { $set: { [`${list}.$[row].${field}.name`]: anon } },
        { arrayFilters: [{ [`row.${field}.id`]: userId }] }
      );
    }
  }

  const report: AnonymizationReport = {
    userId,
    activityLogsDeleted: logs.deletedCount ?? 0,
    performanceReviewsAnonymized: reviewsAnonymized
  };
  logger.info(
    `Compte ${userId} anonymisé (${reason === 'request' ? 'demande d’effacement' : 'fin de durée de conservation'}) : ` +
      `${report.activityLogsDeleted} log(s) supprimé(s), ${report.performanceReviewsAnonymized} fiche(s) anonymisée(s)`
  );
  return report;
}
