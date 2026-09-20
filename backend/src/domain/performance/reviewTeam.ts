import mongoose from 'mongoose';
import { PerformanceCycle } from './entities/PerformanceCycle';
import { IPerformanceReview, PerformanceReview } from './entities/PerformanceReview';
import { Team } from '../team/entities/Team';
import { User } from '../user/entities/User';

/** Normalise un ObjectId / string / `{ _id }` en hex string. */
export function toIdString(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof (value as { toString?: () => string }).toString === 'function') {
    const s = (value as { toString: () => string }).toString();
    if (s && s !== '[object Object]') return s;
  }
  return undefined;
}

function reviewUserId(review: IPerformanceReview): string | undefined {
  const user = review.user as unknown;
  if (user && typeof user === 'object' && '_id' in (user as object)) {
    return toIdString((user as { _id: unknown })._id);
  }
  return toIdString(user);
}

/** userId → équipe unique dont il est lead (si plusieurs, on ignore). */
export function uniqueLeadTeamByUser(
  teams: { _id?: unknown; id?: unknown; name?: string; leadIds?: unknown[] }[]
): Map<string, { teamId: string; name?: string }> {
  const teamsByUser = new Map<string, { teamId: string; name?: string }[]>();
  for (const team of teams) {
    const teamId = toIdString(team._id) ?? toIdString(team.id);
    if (!teamId) continue;
    for (const leadId of team.leadIds ?? []) {
      const userId = toIdString(leadId);
      if (!userId) continue;
      const list = teamsByUser.get(userId) ?? [];
      list.push({ teamId, name: team.name });
      teamsByUser.set(userId, list);
    }
  }
  const unique = new Map<string, { teamId: string; name?: string }>();
  for (const [userId, list] of teamsByUser) {
    const ids = [...new Set(list.map((item) => item.teamId))];
    if (ids.length === 1) unique.set(userId, list[0]);
  }
  return unique;
}

/**
 * Si une fiche n'a pas d'équipe snapshotée (créée avant le rattachement),
 * on reprend `User.teamId` courant, sinon l'équipe unique dont l'utilisateur est lead.
 */
export async function teamOverridesForReviews(
  reviews: IPerformanceReview[]
): Promise<Map<string, { team?: string; teamNameSnapshot?: string }>> {
  const overrides = new Map<string, { team?: string; teamNameSnapshot?: string }>();
  const missing = reviews.filter((review) => !toIdString(review.team));
  if (missing.length === 0) return overrides;

  const userIds = missing.map(reviewUserId).filter((id): id is string => !!id);
  if (userIds.length === 0) return overrides;

  const [users, teams] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select('teamId').lean(),
    Team.find().select('name leadIds').lean()
  ]);
  const nameByTeam = new Map(teams.map((team) => [toIdString(team._id) ?? '', team.name]));
  const leadTeamByUser = uniqueLeadTeamByUser(teams);
  const teamByUser = new Map<string, string | undefined>();
  for (const user of users) {
    const userId = toIdString(user._id);
    if (!userId) continue;
    teamByUser.set(userId, toIdString(user.teamId) ?? leadTeamByUser.get(userId)?.teamId);
  }
  for (const userId of userIds) {
    if (!teamByUser.has(userId)) {
      teamByUser.set(userId, leadTeamByUser.get(userId)?.teamId);
    }
  }

  for (const review of missing) {
    const reviewId = toIdString(review._id);
    const userId = reviewUserId(review);
    if (!reviewId || !userId) continue;
    const teamId = teamByUser.get(userId);
    if (!teamId) continue;
    overrides.set(reviewId, { team: teamId, teamNameSnapshot: nameByTeam.get(teamId) });
  }
  return overrides;
}

/** Un lead sans `User.teamId` est rattaché à l'équipe qu'il dirige. */
export async function ensureLeadTeamMembership(
  teamId: string,
  leadIds: string[],
  teamName?: string | null
): Promise<void> {
  if (leadIds.length === 0) return;
  await User.updateMany(
    { _id: { $in: leadIds }, $or: [{ teamId: null }, { teamId: { $exists: false } }] },
    { $set: { teamId } }
  );
  await Promise.all(leadIds.map((userId) => syncOpenCycleReviewsTeam(userId, teamId, teamName)));
}

/** Recopie l'équipe courante sur les fiches des cycles encore ouverts (draft/active). */
export async function syncOpenCycleReviewsTeam(
  userId: string,
  teamId: string | null,
  teamName?: string | null
): Promise<void> {
  const openCycles = await PerformanceCycle.find({ status: { $in: ['active', 'draft'] } })
    .select('_id')
    .lean();
  if (openCycles.length === 0) return;

  const $set: { team: mongoose.Types.ObjectId | null; teamNameSnapshot?: string } = {
    team: teamId ? new mongoose.Types.ObjectId(teamId) : null
  };
  if (teamId && teamName) $set.teamNameSnapshot = teamName;
  if (!teamId) $set.teamNameSnapshot = '';

  await PerformanceReview.updateMany(
    { user: userId, cycle: { $in: openCycles.map((cycle) => cycle._id) } },
    { $set }
  );
}
