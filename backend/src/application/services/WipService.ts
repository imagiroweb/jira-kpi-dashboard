import { container } from '../../infrastructure/Container';
import { globalCache } from '../../infrastructure/cache';
import { buildWipJql, extractTeamIdsFromJql, stripOrderBy } from '../../infrastructure/jira/jql';
import type { JiraChangeHistory, JiraIssue } from '../../infrastructure/jira/JiraClient';
import {
  aggregateWipByWeek,
  DEFAULT_WIP_ISSUE_TYPES,
  computeWipTicket,
  extractStatusTransitions,
  extractTeamTransitions,
  isWipEligibleIssueType,
  LEGACY_WIP_END_STATUSES,
  LEGACY_WIP_START_STATUSES,
  listWeeks,
  measurePoint,
  mondayOf,
  normalizeStatusName,
  parseStatusList,
  preferDecoratedDefaults,
  PREVIOUS_WIP_END_STATUSES,
  resolveStatusNames,
  WIP_END_STATUSES_SINCE_CHANGE,
  WIP_SUPPORT_END_STATUSES,
  WIP_SUPPORT_IGNORED_STATUSES,
  WIP_SUPPORT_ISSUE_TYPES,
  WIP_SUPPORT_START_STATUSES,
  WIP_WORKFLOW_CHANGE_DATE,
  zonedIsoDate,
  readAssigneeName,
  readTeamIdentity,
  listOpenWipTickets,
  type WipOpenTicket,
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
  /** Tickets dans le WIP au dernier point de mesure, avec leur assigné actuel. */
  openTickets: WipOpenTicket[];
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
      startStatuses: preferDecoratedDefaults(doc.startStatuses, LEGACY_WIP_START_STATUSES, DEFAULT_WIP_SETTINGS.startStatuses),
      endStatuses: preferDecoratedDefaults(doc.endStatuses, LEGACY_WIP_END_STATUSES, DEFAULT_WIP_SETTINGS.endStatuses),
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
    const statusKey = [
      settings.startStatuses.join('|'),
      settings.endStatuses.join('|'),
      WIP_WORKFLOW_CHANGE_DATE,
      WIP_END_STATUSES_SINCE_CHANGE.join('|'),
    ].join('>');
    const boardIds = this.getBoardIds();
    const supportKey = (process.env.JIRA_SUPPORT_PROJECT_KEY || 'SB').trim();
    const teamField = (process.env.JIRA_TEAM_FIELD || 'customfield_10001').trim();
    // La semaine en cours est mesurée « maintenant » jusqu'au vendredi 14:00 : la clé change à ce moment.
    const measured = measurePoint(mondayOf(zonedIsoDate(now.getTime()))) <= now.getTime() ? 'mesuree' : 'en-cours';
    const cacheKey = `${CACHE_PREFIX}${from}:${to}:${statusKey}:${boardIds.join(',')}:${supportKey}:${teamField}:${measured}`;
    const cached = globalCache.get<Omit<WipWeeklyResult, 'settings'>>(cacheKey);
    if (cached) return { ...cached, settings };

    const jiraClient = container().jiraClient;
    const projectKeys = this.getProjectKeys();
    const boards = await this.getTeamBoards(boardIds);
    const [issueTypes, supportTypes, jiraStatuses] = await Promise.all([
      this.keepExistingIssueTypes(parseStatusList(process.env.JIRA_WIP_ISSUE_TYPES, DEFAULT_WIP_ISSUE_TYPES)),
      this.keepExistingIssueTypes(WIP_SUPPORT_ISSUE_TYPES, { emptyIfNone: true }),
      this.getJiraStatuses(),
    ]);
    // La casse seule est ignorée : « --GO PROD-- » vise « --Go Prod-- », pas « GO PROD » ni « GO-PROD ».
    const jiraStatusNames = jiraStatuses.map((s) => s.name);
    const startStatuses = resolveStatusNames(settings.startStatuses, jiraStatusNames);
    const endStatuses = resolveStatusNames(settings.endStatuses, jiraStatusNames);
    // Depuis le 12/10, la JQL ne doit pas écarter les tickets encore en « --Go Prod-- ».
    const endStatusesSinceChange = resolveStatusNames(WIP_END_STATUSES_SINCE_CHANGE, jiraStatusNames);
    const weeks = listWeeks(from, to);
    // Les terminés de la 1re semaine partent du vendredi précédent ; marge d'un jour de chaque côté
    // car les dates JQL sont lues dans le fuseau du compte Jira.
    const jqlFor = (scopeJql: string | null) =>
      buildWipJql({
        scopeJql,
        projectKeys,
        issueTypes,
        startStatuses,
        endStatuses: endStatusesSinceChange,
        from: shiftDate(weeks[0]?.weekStart ?? from, -4),
        toExclusive: shiftDate(weeks[weeks.length - 1]?.weekEnd ?? to, 2),
      });
    const fields = `key,issuetype,status,created,assignee,project,${teamField}`;
    const boardNameByTeamId: Record<string, string> = {};
    const coveredTeamIds = new Set<string>();
    for (const board of boards) {
      const teamIds = extractTeamIdsFromJql(board.scopeJql);
      for (const teamId of teamIds) coveredTeamIds.add(teamId);
      // Un seul id : le nom actuel du board (un renommage ne coupe pas l'historique).
      // Plusieurs ids : chacun garde le nom du champ Team (Choco n'est pas Supply).
      if (teamIds.length === 1 && !boardNameByTeamId[teamIds[0]]) boardNameByTeamId[teamIds[0]] = board.name;
    }

    // Une requête par board (id du board, nom actuel) ; un ticket sur plusieurs boards est lu une fois.
    // Sans board exploitable : périmètre projet. Les Bug et Support de l'espace SB sont toujours ajoutés.
    const byId = new Map<string, JiraIssue>();
    const boardsById = new Map<string, string[]>();
    const fromBoard = new Set<string>();
    const remember = (issue: JiraIssue, boardName: string | null) => {
      const id = String(issue.id);
      if (!byId.has(id)) byId.set(id, issue);
      if (!boardName) return;
      fromBoard.add(id);
      const names = boardsById.get(id) ?? [];
      if (!names.includes(boardName)) boardsById.set(id, [...names, boardName]);
    };
    if (boards.length === 0) {
      for (const issue of await jiraClient.searchAllIssuesByJql(jqlFor(null), fields)) remember(issue, null);
    } else {
      const perBoard = await Promise.all(
        boards.map(async (board) => ({ board, issues: await jiraClient.searchAllIssuesByJql(jqlFor(board.scopeJql), fields) }))
      );
      for (const { board, issues: list } of perBoard) {
        for (const issue of list) remember(issue, board.name);
      }
    }
    const supportStartStatuses = resolveStatusNames(WIP_SUPPORT_START_STATUSES, jiraStatusNames);
    const supportEndStatuses = resolveStatusNames(WIP_SUPPORT_END_STATUSES, jiraStatusNames);
    const supportIgnoredStatuses = resolveStatusNames(WIP_SUPPORT_IGNORED_STATUSES, jiraStatusNames);
    if (supportKey && supportTypes.length > 0) {
      const supportScope = `project = "${supportKey.replace(/"/g, '')}"`;
      const supportIssues = await jiraClient.searchAllIssuesByJql(
        buildWipJql({
          scopeJql: supportScope,
          projectKeys: [],
          issueTypes: supportTypes,
          startStatuses: supportStartStatuses,
          endStatuses: [...supportEndStatuses, ...supportIgnoredStatuses],
          from: shiftDate(weeks[0]?.weekStart ?? from, -4),
          toExclusive: shiftDate(weeks[weeks.length - 1]?.weekEnd ?? to, 2),
        }),
        fields
      );
      for (const issue of supportIssues) remember(issue, null);
    }

    const supportKeyUpper = supportKey.toUpperCase();
    const isSupportSpaceIssue = (issue: JiraIssue) => {
      const projectKey = ((issue.fields.project as { key?: string } | undefined)?.key || issue.key.split('-')[0] || '').toUpperCase();
      return projectKey === supportKeyUpper && isWipEligibleIssueType(issue.fields.issuetype as { name?: string; subtask?: boolean }, supportTypes);
    };
    const eligible = (issue: JiraIssue) =>
      isWipEligibleIssueType(issue.fields.issuetype as { name?: string; subtask?: boolean } | undefined, issueTypes) ||
      isSupportSpaceIssue(issue);

    let tracked = Array.from(byId.values()).filter(eligible);
    const loadChangelogs = async (ids: string[]) => {
      if (ids.length === 0) return { status: new Map<string, JiraChangeHistory[]>(), team: new Map<string, JiraChangeHistory[]>() };
      const [status, team] = await Promise.all([
        jiraClient.getFieldChangelogs(ids, 'status'),
        teamField ? jiraClient.getFieldChangelogs(ids, teamField) : Promise.resolve(new Map<string, JiraChangeHistory[]>()),
      ]);
      return { status, team };
    };
    const logs = await loadChangelogs(tracked.map((issue) => String(issue.id)));

    // Ids Team précédents vus sur les tickets des boards : on charge aussi les tickets encore portés par ces ids.
    const previousTeamIds = new Map<string, string>();
    for (const issue of tracked) {
      const id = String(issue.id);
      if (!fromBoard.has(id)) continue;
      for (const change of extractTeamTransitions(logs.team.get(id) ?? [], teamField)) {
        const previous = change.fromId?.trim();
        if (!previous || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(previous)) continue;
        const key = previous.toLowerCase();
        if (!coveredTeamIds.has(key) && !previousTeamIds.has(key)) previousTeamIds.set(key, previous);
      }
    }
    if (previousTeamIds.size > 0) {
      const teamScope = `Team in (${Array.from(previousTeamIds.values()).join(', ')})`;
      const extra = await jiraClient.searchAllIssuesByJql(jqlFor(teamScope), fields);
      const fresh: string[] = [];
      for (const issue of extra) {
        const id = String(issue.id);
        if (byId.has(id)) continue;
        byId.set(id, issue);
        fresh.push(id);
      }
      tracked = Array.from(byId.values()).filter(eligible);
      if (fresh.length > 0) {
        const more = await loadChangelogs(fresh);
        for (const [id, histories] of more.status) logs.status.set(id, histories);
        for (const [id, histories] of more.team) logs.team.set(id, histories);
      }
    }

    // Statuts de catégorie « terminé » : ils sortent un ticket du WIP sans le compter terminé.
    const closedStatuses = jiraStatuses.filter((s) => s.category === 'done').map((s) => s.name);
    const todoStatuses = resolveStatusNames(
      ['--à faire--', ...jiraStatuses.filter((s) => s.category === 'new').map((s) => s.name)],
      jiraStatusNames
    );

    const config = {
      startStatuses,
      endStatuses,
      closedStatuses,
      todoStatuses,
      previousEndStatuses: resolveStatusNames(PREVIOUS_WIP_END_STATUSES, jiraStatusNames),
      endStatusesSinceChange,
      workflowChangeOn: WIP_WORKFLOW_CHANGE_DATE,
    };
    // L'espace Support n'a pas le flux décoré des boards : « En cours... » jusqu'à « Résolu » / « Terminé ».
    const supportConfig = {
      startStatuses: supportStartStatuses,
      endStatuses: supportEndStatuses,
      closedStatuses: [...closedStatuses, ...supportIgnoredStatuses],
      todoStatuses,
    };
    const tickets = tracked.map((i) => {
      const identity = readTeamIdentity(i.fields[teamField]);
      const teamChanges = extractTeamTransitions(logs.team.get(String(i.id)) ?? [], teamField);
      const hasTeamId = Boolean(identity.id) || teamChanges.some((change) => change.id || change.fromId);
      return computeWipTicket(
        {
          key: i.key,
          team: identity.name ?? identity.id,
          teams: boardsById.get(String(i.id)),
          ...(hasTeamId
            ? { teamId: identity.id, teamName: identity.name, teamChanges, boardNameByTeamId }
            : {}),
          created: (i.fields.created as string) ?? null,
          currentStatus: (i.fields.status as { name?: string } | undefined)?.name ?? null,
          assignee: readAssigneeName(i.fields.assignee),
          transitions: extractStatusTransitions(logs.status.get(String(i.id)) ?? []),
        },
        isSupportSpaceIssue(i) ? supportConfig : config
      );
    });
    const boardNames = boards.map((b) => b.name);
    const { weeks: byWeek, teams } = aggregateWipByWeek(tickets, from, to, now, undefined, boardNames);
    const lastMeasured = byWeek[byWeek.length - 1]?.measuredAt;
    const openTickets = lastMeasured ? listOpenWipTickets(tickets, Date.parse(lastMeasured)) : [];

    const result = {
      from,
      to,
      weeks: byWeek,
      teams,
      projectKeys: boards.length > 0 ? [] : projectKeys,
      boards: boardNames,
      ticketCount: tracked.length,
      openTickets,
    };
    logger.info(
      `getWipWeekly: ${tracked.length} tickets, ${byWeek.length} semaines, ` +
        (boards.length > 0 ? `boards [${boardNames.join(', ')}]` : `projets [${projectKeys.join(', ')}]`)
    );
    globalCache.set(cacheKey, result, cacheTtlMinutes());
    return { ...result, settings };
  }

  /**
   * Statuts saisis absents de Jira (casse et accents ignorés, tirets conservés). Liste vide si Jira ne répond
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
  private async keepExistingIssueTypes(types: string[], opts?: { emptyIfNone?: boolean }): Promise<string[]> {
    try {
      const all = await container().jiraClient.get<Array<{ name?: string }>>('/rest/api/3/issuetype');
      const known = new Set((all ?? []).map((t) => (t.name ?? '').toLowerCase()));
      const kept = types.filter((t) => known.has(t.toLowerCase()));
      const missing = types.filter((t) => !known.has(t.toLowerCase()));
      if (missing.length > 0) logger.warn(`WIP : types absents de Jira ignorés : ${missing.join(', ')}`);
      if (kept.length > 0) return kept;
      return opts?.emptyIfNone ? [] : types;
    } catch (err) {
      logger.warn(`WIP : liste des types Jira indisponible: ${err}`);
      return types;
    }
  }
}

export const wipService = new WipService();
