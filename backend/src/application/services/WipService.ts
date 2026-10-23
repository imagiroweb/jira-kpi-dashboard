import { container } from '../../infrastructure/Container';
import { globalCache } from '../../infrastructure/cache';
import { buildWipJql, stripOrderBy } from '../../infrastructure/jira/jql';
import {
  aggregateWipByWeek,
  DEFAULT_WIP_ISSUE_TYPES,
  computeWipTicket,
  extractStatusTransitions,
  isWipEligibleIssueType,
  listWeeks,
  measurePoint,
  mondayOf,
  normalizeStatusName,
  parseStatusList,
  resolveStatusNames,
  zonedIsoDate,
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
  /** Boards dont le filtre délimite chaque équipe ; vide : repli sur les projets et le champ équipe. */
  boards: string[];
  /** Nombre de tickets analysés (passés par le WIP ou candidats). */
  ticketCount: number;
  settings: WipSettingsValue;
}

const CACHE_PREFIX = 'wip-weekly:';
const JIRA_STATUSES_CACHE_KEY = 'wip-jira-statuses';

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

  /** Boards suivis : JIRA_WIP_BOARD_IDS, sinon les boards configurés du dashboard (hors boards QA). */
  getBoardIds(): number[] {
    const explicit = (process.env.JIRA_WIP_BOARD_IDS || '')
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => Number.isInteger(id) && id > 0);
    return explicit.length > 0 ? explicit : container().jiraClient.configuredBoardIds;
  }

  /**
   * Nom et filtre de chaque board suivi : une équipe = un board, son périmètre = le filtre du board.
   * Les boards sans filtre lisible sont ignorés.
   */
  private async getTeamBoards(boardIds: number[]): Promise<Array<{ id: number; name: string; scopeJql: string }>> {
    const jiraClient = container().jiraClient;
    const boards = await Promise.all(
      boardIds.map(async (id) => {
        const [board, config] = await Promise.all([jiraClient.getBoard(id), jiraClient.getBoardConfiguration(id)]);
        const filterJql = config?.filter?.id ? await jiraClient.getFilterJql(config.filter.id) : null;
        const base = filterJql ? stripOrderBy(filterJql).base : '';
        if (!base) {
          logger.warn(`WIP : board ${id} sans filtre exploitable, ignoré`);
          return null;
        }
        return { id, name: board?.name?.trim() || `Board ${id}`, scopeJql: `(${base})` };
      })
    );
    return boards.filter((b): b is NonNullable<typeof b> => b !== null);
  }

  async getWeekly(from: string, to: string, now: Date = new Date()): Promise<WipWeeklyResult> {
    const settings = await this.getSettings();
    const statusKey = [settings.startStatuses.join('|'), settings.endStatuses.join('|')].join('>');
    const boardIds = this.getBoardIds();
    // La semaine en cours est mesurée « maintenant » jusqu'au vendredi 14:00 : la clé change à ce moment.
    const measured = measurePoint(mondayOf(zonedIsoDate(now.getTime()))) <= now.getTime() ? 'mesuree' : 'en-cours';
    const cacheKey = `${CACHE_PREFIX}${from}:${to}:${statusKey}:${boardIds.join(',')}:${measured}`;
    const cached = globalCache.get<Omit<WipWeeklyResult, 'settings'>>(cacheKey);
    if (cached) return { ...cached, settings };

    const jiraClient = container().jiraClient;
    const teamField = (process.env.JIRA_TEAM_FIELD || 'customfield_10001').trim();
    const projectKeys = this.getProjectKeys();
    const boards = await this.getTeamBoards(boardIds);
    const [issueTypes, jiraStatuses] = await Promise.all([
      this.keepExistingIssueTypes(parseStatusList(process.env.JIRA_WIP_ISSUE_TYPES, DEFAULT_WIP_ISSUE_TYPES)),
      this.getJiraStatuses(),
    ]);
    // « In Progress » saisi doit aussi viser « --In Progress-- » des workflows décorés (cf. normalizeStatusName).
    const jiraStatusNames = jiraStatuses.map((s) => s.name);
    const startStatuses = resolveStatusNames(settings.startStatuses, jiraStatusNames);
    const endStatuses = resolveStatusNames(settings.endStatuses, jiraStatusNames);
    const weeks = listWeeks(from, to);
    // Les terminés de la 1re semaine partent du vendredi précédent ; marge d'un jour de chaque côté
    // car les dates JQL sont lues dans le fuseau du compte Jira.
    const jqlFor = (scopeJql: string | null) =>
      buildWipJql({
        scopeJql,
        projectKeys,
        issueTypes,
        startStatuses,
        endStatuses,
        from: shiftDate(weeks[0]?.weekStart ?? from, -4),
        toExclusive: shiftDate(weeks[weeks.length - 1]?.weekEnd ?? to, 2),
      });
    const fields = `key,issuetype,status,created,${teamField}`;

    // Une requête par board ; un ticket présent sur plusieurs boards est lu une fois et compte pour chacun.
    // Sans board exploitable : périmètre projet, équipe lue dans le champ équipe Jira.
    const searchIssues = async () => {
      if (boards.length === 0) return { issues: await jiraClient.searchAllIssuesByJql(jqlFor(null), fields), boardsById: new Map<string, string[]>() };
      const perBoard = await Promise.all(boards.map(async (b) => ({ b, issues: await jiraClient.searchAllIssuesByJql(jqlFor(b.scopeJql), fields) })));
      const byId = new Map<string, (typeof perBoard)[number]['issues'][number]>();
      const boardsById = new Map<string, string[]>();
      for (const { b, issues: list } of perBoard) {
        for (const i of list) {
          const id = String(i.id);
          byId.set(id, i);
          boardsById.set(id, [...(boardsById.get(id) ?? []), b.name]);
        }
      }
      return { issues: Array.from(byId.values()), boardsById };
    };

    const { issues, boardsById } = await searchIssues();
    // Statuts de catégorie « terminé » : ils sortent un ticket du WIP sans le compter terminé.
    const closedStatuses = jiraStatuses.filter((s) => s.category === 'done').map((s) => s.name);
    const tracked = issues.filter((i) =>
      isWipEligibleIssueType(i.fields.issuetype as { name?: string; subtask?: boolean } | undefined, issueTypes)
    );
    const changelogs = tracked.length > 0 ? await jiraClient.getFieldChangelogs(tracked.map((i) => String(i.id)), 'status') : new Map();

    const config = { startStatuses, endStatuses, closedStatuses };
    const tickets = tracked.map((i) =>
      computeWipTicket(
        {
          key: i.key,
          team: readTeamField(i.fields[teamField]),
          teams: boardsById.get(String(i.id)),
          created: (i.fields.created as string) ?? null,
          currentStatus: (i.fields.status as { name?: string } | undefined)?.name ?? null,
          transitions: extractStatusTransitions(changelogs.get(String(i.id)) ?? []),
        },
        config
      )
    );
    const boardNames = boards.map((b) => b.name);
    const { weeks: byWeek, teams } = aggregateWipByWeek(tickets, from, to, now, undefined, boardNames);

    const result = { from, to, weeks: byWeek, teams, projectKeys: boards.length > 0 ? [] : projectKeys, boards: boardNames, ticketCount: tracked.length };
    logger.info(
      `getWipWeekly: ${tracked.length} tickets, ${byWeek.length} semaines, ` +
        (boards.length > 0 ? `boards [${boardNames.join(', ')}]` : `projets [${projectKeys.join(', ')}]`)
    );
    globalCache.set(cacheKey, result, cacheTtlMinutes());
    return { ...result, settings };
  }

  /**
   * Statuts saisis absents de Jira (comparaison souple, cf. normalizeStatusName). Liste vide si Jira ne répond
   * pas : la vérification est alors sautée plutôt que de bloquer l'enregistrement.
   */
  async findUnknownStatuses(names: string[]): Promise<string[]> {
    const known = await this.getJiraStatuses();
    if (known.length === 0) return [];
    const normalized = new Set(known.map((s) => normalizeStatusName(s.name)));
    return names.filter((n) => !normalized.has(normalizeStatusName(n)));
  }

  /** Statuts Jira (nom et catégorie), mis en cache ; liste vide si Jira ne répond pas. */
  private async getJiraStatuses(): Promise<Array<{ name: string; category: string | null }>> {
    const cached = globalCache.get<Array<{ name: string; category: string | null }>>(JIRA_STATUSES_CACHE_KEY);
    if (cached) return cached;
    try {
      const statuses = await container().jiraClient.get<Array<{ name?: string; statusCategory?: { key?: string } }>>(
        '/rest/api/3/status'
      );
      const out = (statuses ?? [])
        .filter((s) => s.name)
        .map((s) => ({ name: s.name as string, category: s.statusCategory?.key ?? null }));
      globalCache.set(JIRA_STATUSES_CACHE_KEY, out, 60);
      return out;
    } catch (err) {
      logger.warn(`WIP : liste des statuts Jira indisponible: ${err}`);
      return [];
    }
  }

  /**
   * Types suivis réellement présents dans Jira : un type absent ferait échouer toute la requête JQL.
   * Si Jira ne répond pas, la liste configurée est gardée telle quelle.
   */
  private async keepExistingIssueTypes(types: string[]): Promise<string[]> {
    try {
      const all = await container().jiraClient.get<Array<{ name?: string }>>('/rest/api/3/issuetype');
      const known = new Set((all ?? []).map((t) => (t.name ?? '').toLowerCase()));
      const kept = types.filter((t) => known.has(t.toLowerCase()));
      const missing = types.filter((t) => !known.has(t.toLowerCase()));
      if (missing.length > 0) logger.warn(`WIP : types absents de Jira ignorés : ${missing.join(', ')}`);
      return kept.length > 0 ? kept : types;
    } catch (err) {
      logger.warn(`WIP : liste des types Jira indisponible: ${err}`);
      return types;
    }
  }
}

export const wipService = new WipService();
