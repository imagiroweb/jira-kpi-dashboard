import { container } from '../../infrastructure/Container';
import { globalCache } from '../../infrastructure/cache';
import { buildWipJql } from '../../infrastructure/jira/jql';
import {
  aggregateWipByWeek,
  DEFAULT_WIP_ISSUE_TYPES,
  computeWipTicket,
  extractStatusTransitions,
  isWipEligibleIssueType,
  listWeeks,
  parseStatusList,
  readTeamField,
  type WipWeek,
} from '../../domain/wip/wipWeekly';
import { DEFAULT_WIP_SETTINGS, type WipSettingsValue } from '../../domain/wip/wipSettings';
import { WipSettings } from '../../domain/wip/entities/WipSettings';
import { logger } from '../../utils/logger';

export interface WipWeeklyResult {
  from: string;
  to: string;
  weeks: WipWeek[];
  teams: string[];
  projectKeys: string[];
  /** Nombre de tickets analysés (passés par le WIP ou candidats). */
  ticketCount: number;
  settings: WipSettingsValue;
}

const CACHE_PREFIX = 'wip-weekly:';

function cacheTtlMinutes(): number {
  const n = parseInt(process.env.WIP_WEEKLY_CACHE_TTL_MINUTES || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86400000).toISOString().slice(0, 10);

/**
 * Suivi hebdomadaire du WIP (spec issue #79) : lecture Jira (tickets + historique des statuts),
 * calcul pur dans `domain/wip`, résultat mis en cache (vidé à chaque synchronisation).
 */
export class WipService {
  async getSettings(): Promise<WipSettingsValue> {
    const doc = await WipSettings.findOne({ key: 'default' }).lean();
    if (!doc) return { ...DEFAULT_WIP_SETTINGS };
    return {
      startStatuses: doc.startStatuses?.length ? doc.startStatuses : DEFAULT_WIP_SETTINGS.startStatuses,
      endStatuses: doc.endStatuses?.length ? doc.endStatuses : DEFAULT_WIP_SETTINGS.endStatuses,
      defaultMaxPerDev: doc.defaultMaxPerDev ?? DEFAULT_WIP_SETTINGS.defaultMaxPerDev,
      teams: (doc.teams ?? []).map((t) => ({ team: t.team, devCount: t.devCount, maxPerDev: t.maxPerDev ?? null })),
    };
  }

  async saveSettings(value: WipSettingsValue, userId: string): Promise<WipSettingsValue> {
    await WipSettings.findOneAndUpdate(
      { key: 'default' },
      { $set: { ...value, updatedBy: userId } },
      { upsert: true, new: true }
    );
    // Les statuts changent le calcul : on repart de Jira au prochain affichage.
    globalCache.invalidate(CACHE_PREFIX);
    return this.getSettings();
  }

  /** Projets suivis : JIRA_WIP_PROJECT_KEYS, sinon les projets configurés hors projet Support. */
  getProjectKeys(): string[] {
    const explicit = (process.env.JIRA_WIP_PROJECT_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean);
    if (explicit.length > 0) return explicit;
    const support = (process.env.JIRA_SUPPORT_PROJECT_KEY || 'SB').trim().toUpperCase();
    return container().jiraClient.configuredProjectKeys.filter((k) => k && k.toUpperCase() !== support);
  }

  async getWeekly(from: string, to: string, now: Date = new Date()): Promise<WipWeeklyResult> {
    const settings = await this.getSettings();
    const statusKey = [settings.startStatuses.join('|'), settings.endStatuses.join('|')].join('>');
    const cacheKey = `${CACHE_PREFIX}${from}:${to}:${statusKey}`;
    const cached = globalCache.get<Omit<WipWeeklyResult, 'settings'>>(cacheKey);
    if (cached) return { ...cached, settings };

    const jiraClient = container().jiraClient;
    const teamField = (process.env.JIRA_TEAM_FIELD || 'customfield_10001').trim();
    const projectKeys = this.getProjectKeys();
    const issueTypes = parseStatusList(process.env.JIRA_WIP_ISSUE_TYPES, DEFAULT_WIP_ISSUE_TYPES);
    const weeks = listWeeks(from, to);
    // Les terminés de la 1re semaine partent du vendredi précédent ; marge d'un jour de chaque côté
    // car les dates JQL sont lues dans le fuseau du compte Jira.
    const jql = buildWipJql({
      projectKeys,
      issueTypes,
      startStatuses: settings.startStatuses,
      endStatuses: settings.endStatuses,
      from: shiftDate(weeks[0]?.weekStart ?? from, -4),
      toExclusive: shiftDate(weeks[weeks.length - 1]?.weekEnd ?? to, 2),
    });

    const [issues, closedStatuses] = await Promise.all([
      jiraClient.searchAllIssuesByJql(jql, `key,issuetype,status,created,${teamField}`),
      this.getDoneCategoryStatuses(),
    ]);
    const tracked = issues.filter((i) =>
      isWipEligibleIssueType(i.fields.issuetype as { name?: string; subtask?: boolean } | undefined, issueTypes)
    );
    const changelogs = tracked.length > 0 ? await jiraClient.getFieldChangelogs(tracked.map((i) => String(i.id)), 'status') : new Map();

    const config = { startStatuses: settings.startStatuses, endStatuses: settings.endStatuses, closedStatuses };
    const tickets = tracked.map((i) =>
      computeWipTicket(
        {
          key: i.key,
          team: readTeamField(i.fields[teamField]),
          created: (i.fields.created as string) ?? null,
          currentStatus: (i.fields.status as { name?: string } | undefined)?.name ?? null,
          transitions: extractStatusTransitions(changelogs.get(String(i.id)) ?? []),
        },
        config
      )
    );
    const { weeks: byWeek, teams } = aggregateWipByWeek(tickets, from, to, now);

    const result = { from, to, weeks: byWeek, teams, projectKeys, ticketCount: tracked.length };
    logger.info(`getWipWeekly: ${tracked.length} tickets, ${byWeek.length} semaines, projets [${projectKeys.join(', ')}]`);
    globalCache.set(cacheKey, result, cacheTtlMinutes());
    return { ...result, settings };
  }

  /**
   * Noms des statuts de catégorie Jira « terminé » : sortie du WIP sans être comptés terminés.
   * Liste vide si Jira ne répond pas (le calcul reste possible avec les seuls statuts d'arrivée).
   */
  private async getDoneCategoryStatuses(): Promise<string[]> {
    try {
      const statuses = await container().jiraClient.get<Array<{ name?: string; statusCategory?: { key?: string } }>>(
        '/rest/api/3/status'
      );
      return (statuses ?? []).filter((s) => s.statusCategory?.key === 'done' && s.name).map((s) => s.name as string);
    } catch (err) {
      logger.warn(`getWipWeekly: liste des statuts Jira indisponible: ${err}`);
      return [];
    }
  }
}

export const wipService = new WipService();
