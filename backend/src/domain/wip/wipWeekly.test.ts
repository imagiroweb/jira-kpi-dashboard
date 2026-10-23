/**
 * Calcul hebdomadaire du WIP (plan de tests docs/qa/plans/suivi-wip.md, CT-01 à CT-26).
 * S = semaine du lundi 2026-09-07 au dimanche 2026-09-13, mesurée le vendredi 11/09 à 14:00 ;
 * dates en heure de Paris (UTC+2).
 */
import {
  aggregateWipByWeek,
  computeWipTicket,
  countWeeks,
  extractStatusTransitions,
  isWipEligibleIssueType,
  listWeeks,
  measurePoint,
  mondayOf,
  NO_TEAM,
  normalizeStatusName,
  parseStatusList,
  readTeamField,
  resolveStatusNames,
  sortTeams,
  zonedIsoDate,
  zonedMidnight,
  type WipIssueInput,
  type WipStatusConfig,
} from './wipWeekly';

const CONFIG: WipStatusConfig = { startStatuses: ['In Progress'], endStatuses: ['Go Prod'], closedStatuses: ['Annulé', 'Go Prod'] };
const NOW = new Date('2026-10-21T15:00:00+02:00');

const issue = (key: string, transitions: Array<[string, string]>, over: Partial<WipIssueInput> = {}): WipIssueInput => ({
  key,
  team: 'Team A',
  transitions: transitions.map(([at, to]) => ({ at, to })),
  ...over,
});

/** WIP et terminés du ticket, semaine par semaine, de `from` à `to`. */
function weekly(input: WipIssueInput, from: string, to: string, config = CONFIG, now = NOW) {
  const { weeks } = aggregateWipByWeek([computeWipTicket(input, config)], from, to, now);
  return { wip: weeks.map((w) => w.total.wip), done: weeks.map((w) => w.total.done) };
}

describe('parseStatusList', () => {
  it('découpe, retire guillemets et doublons ; liste vide → défaut', () => {
    expect(parseStatusList('In Progress, "Go Prod", In Progress', [])).toEqual(['In Progress', 'Go Prod']);
    expect(parseStatusList(['  Dev ', ''], ['X'])).toEqual(['Dev']);
    expect(parseStatusList('', ['X'])).toEqual(['X']);
    expect(parseStatusList(undefined, ['X'])).toEqual(['X']);
  });
});

describe('statuts décorés des workflows Jira', () => {
  it('normalizeStatusName ignore casse, accents, espaces et ponctuation', () => {
    expect(normalizeStatusName('--In Progress--')).toBe(normalizeStatusName('In Progress'));
    expect(normalizeStatusName('GO-PROD')).toBe(normalizeStatusName('Go Prod'));
    expect(normalizeStatusName('Livré')).toBe('livre');
    expect(normalizeStatusName('Dev In Progress')).not.toBe(normalizeStatusName('In Progress'));
  });

  it('resolveStatusNames ajoute les noms Jira équivalents et garde les noms saisis', () => {
    const jira = ['In Progress', '--In Progress--', 'Dev In Progress', '--Go Prod--', 'GO PROD'];
    expect(resolveStatusNames(['In Progress'], jira)).toEqual(['In Progress', '--In Progress--']);
    expect(resolveStatusNames(['Go Prod'], jira)).toEqual(['Go Prod', '--Go Prod--', 'GO PROD']);
    expect(resolveStatusNames(['Inconnu'], jira)).toEqual(['Inconnu']);
  });

  it('un ticket passé par « --In Progress-- » compte dans le WIP réglé sur « In Progress »', () => {
    const res = weekly(issue('AD-1', [['2026-09-08T10:00:00+02:00', '--In Progress--']]), '2026-09-07', '2026-09-13');
    expect(res.wip).toEqual([1]);
  });
});

describe('extractStatusTransitions (CT-14)', () => {
  it('ne garde que les changements de statut, triés par date, sans plantage sur toString nul', () => {
    const out = extractStatusTransitions([
      { created: '2026-09-10T10:00:00+02:00', items: [{ fieldId: 'status', toString: 'Go Prod' }, { fieldId: 'labels', toString: 'x' }] },
      { created: '2026-09-08T10:00:00+02:00', items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress' }] },
      { created: '2026-09-09T10:00:00+02:00', items: [{ fieldId: 'status', toString: null }] },
    ]);
    expect(out).toEqual([
      { at: '2026-09-08T10:00:00+02:00', to: 'In Progress', from: 'To Do' },
      { at: '2026-09-10T10:00:00+02:00', to: 'Go Prod', from: null },
    ]);
  });
});

describe('computeWipTicket : entrée, sortie, retours', () => {
  it('CT-01 : en cours le dimanche → compté dans le WIP de S, 0 terminé', () => {
    const t = issue('KPI-1', [['2026-09-08T10:00:00+02:00', 'In Progress'], ['2026-09-11T10:00:00+02:00', 'QA']]);
    expect(weekly(t, '2026-09-07', '2026-09-13')).toEqual({ wip: [1], done: [0] });
  });

  it('CT-02 : Go Prod dans S → pas de WIP, un seul terminé', () => {
    const t = issue('KPI-2', [['2026-09-08T10:00:00+02:00', 'In Progress'], ['2026-09-10T10:00:00+02:00', 'Go Prod']]);
    expect(weekly(t, '2026-09-07', '2026-09-13')).toEqual({ wip: [0], done: [1] });
  });

  it('CT-03 : Go Prod en S+2 → WIP S et S+1, terminé S+2', () => {
    const t = issue('KPI-3', [['2026-09-08T10:00:00+02:00', 'In Progress'], ['2026-09-23T10:00:00+02:00', 'Go Prod']]);
    expect(weekly(t, '2026-09-07', '2026-09-27')).toEqual({ wip: [1, 1, 0], done: [0, 0, 1] });
  });

  it('CT-04 : jamais passé par un statut de départ → ni WIP ni terminé', () => {
    const viaQa = issue('KPI-4', [['2026-09-08T10:00:00+02:00', 'QA'], ['2026-09-10T10:00:00+02:00', 'Go Prod']]);
    expect(weekly(viaQa, '2026-09-07', '2026-10-04')).toEqual({ wip: [0, 0, 0, 0], done: [0, 0, 0, 0] });
    const untouched = issue('KPI-4b', [], { currentStatus: 'To Do', created: '2026-09-01T10:00:00+02:00' });
    expect(weekly(untouched, '2026-09-07', '2026-09-13')).toEqual({ wip: [0], done: [0] });
  });

  it('CT-05 : un aller-retour en To Do ne sort pas du WIP, l\'entrée reste le premier passage', () => {
    const t = computeWipTicket(
      issue('KPI-5', [
        ['2026-09-08T10:00:00+02:00', 'In Progress'],
        ['2026-09-09T10:00:00+02:00', 'To Do'],
        ['2026-09-15T10:00:00+02:00', 'In Progress'],
      ]),
      CONFIG
    );
    expect(t.periods).toEqual([{ start: Date.parse('2026-09-08T10:00:00+02:00'), end: null }]);
  });

  const reopened = issue('KPI-6', [
    ['2026-09-08T10:00:00+02:00', 'In Progress'],
    ['2026-09-16T10:00:00+02:00', 'Go Prod'],
    ['2026-09-22T10:00:00+02:00', 'In Progress'],
    ['2026-10-07T10:00:00+02:00', 'Go Prod'],
  ]);

  it('CT-06 : revenu de Go Prod → de nouveau au WIP', () => {
    expect(weekly(reopened, '2026-09-07', '2026-10-11').wip).toEqual([1, 0, 1, 1, 0]);
  });

  it('CT-07 : deux passages en Go Prod → seul le dernier compte', () => {
    expect(weekly(reopened, '2026-09-07', '2026-10-11').done).toEqual([0, 0, 0, 0, 1]);
  });

  it('CT-08 : le dernier passage hors période reste le seul compté ; sans retour, le Go Prod compte', () => {
    expect(weekly(reopened, '2026-09-07', '2026-09-27').done).toEqual([0, 0, 0]);
    const once = issue('KPI-6b', [['2026-09-08T10:00:00+02:00', 'In Progress'], ['2026-09-16T10:00:00+02:00', 'Go Prod']]);
    expect(weekly(once, '2026-09-07', '2026-09-27').done).toEqual([0, 1, 0]);
  });

  it('CT-09 : fermé sans Go Prod (catégorie terminé) → sort du WIP, jamais terminé', () => {
    const t = issue('KPI-7', [['2026-09-08T10:00:00+02:00', 'In Progress'], ['2026-09-17T10:00:00+02:00', 'Annulé']]);
    expect(weekly(t, '2026-09-07', '2026-09-20')).toEqual({ wip: [1, 0], done: [0, 0] });
  });

  it('CT-10 : réouverture après annulation → revient au WIP', () => {
    const t = issue('KPI-8', [
      ['2026-09-08T10:00:00+02:00', 'In Progress'],
      ['2026-09-09T10:00:00+02:00', 'Annulé'],
      ['2026-09-15T10:00:00+02:00', 'In Progress'],
    ]);
    expect(weekly(t, '2026-09-07', '2026-09-20').wip).toEqual([0, 1]);
  });

  it('CT-11 : Go Prod puis QA (statut non terminé) → revient au WIP', () => {
    const t = issue('KPI-9', [
      ['2026-09-08T10:00:00+02:00', 'In Progress'],
      ['2026-09-09T10:00:00+02:00', 'Go Prod'],
      ['2026-09-15T10:00:00+02:00', 'QA'],
    ]);
    expect(weekly(t, '2026-09-07', '2026-09-20').wip).toEqual([0, 1]);
  });

  it('CT-12 : casse et espaces des statuts ignorés', () => {
    const t = issue('KPI-10', [['2026-09-08T10:00:00+02:00', ' in progress'], ['2026-09-10T10:00:00+02:00', 'Go prod ']]);
    expect(weekly(t, '2026-09-07', '2026-09-13')).toEqual({ wip: [0], done: [1] });
  });

  it('CT-13 : créé directement en In Progress → entrée à la création', () => {
    const t = computeWipTicket(issue('KPI-11', [], { currentStatus: 'In Progress', created: '2026-09-08T09:00:00+02:00' }), CONFIG);
    expect(t.periods).toEqual([{ start: Date.parse('2026-09-08T09:00:00+02:00'), end: null }]);
  });

  it('CT-13 bis : créé en In Progress puis passé en QA et Go Prod → WIP depuis la création, puis terminé', () => {
    const t = issue('KPI-11b', [], {
      created: '2026-09-08T09:00:00+02:00',
      currentStatus: 'Go Prod',
      transitions: [
        { at: '2026-09-15T10:00:00+02:00', to: 'QA', from: 'In Progress' },
        { at: '2026-09-23T10:00:00+02:00', to: 'Go Prod', from: 'QA' },
      ],
    });
    expect(weekly(t, '2026-09-07', '2026-09-27')).toEqual({ wip: [1, 1, 0], done: [0, 0, 1] });
  });

  it('CT-49 : statuts de départ configurés → le calcul les suit', () => {
    const t = issue('KPI-1', [['2026-09-08T10:00:00+02:00', 'In Progress'], ['2026-09-11T10:00:00+02:00', 'QA']]);
    expect(weekly(t, '2026-09-07', '2026-09-13', { ...CONFIG, startStatuses: ['Dev'] }).wip).toEqual([0]);
    expect(weekly(t, '2026-09-07', '2026-09-13', { ...CONFIG, startStatuses: ['In Progress', 'Dev'] }).wip).toEqual([1]);
  });

  it('ignore les dates invalides et sans statuts de fermeture configurés', () => {
    const t = computeWipTicket(issue('KPI-12', [['pas une date', 'In Progress']]), { startStatuses: ['In Progress'], endStatuses: ['Go Prod'] });
    expect(t.periods).toEqual([]);
  });
});

describe('semaines en heure de Paris', () => {
  it('zonedIsoDate : jour calendaire à Paris', () => {
    expect(zonedIsoDate(Date.parse('2026-09-06T22:30:00Z'))).toBe('2026-09-07');
  });

  it('zonedMidnight : minuit de Paris en été et en hiver', () => {
    expect(new Date(zonedMidnight('2026-09-07')).toISOString()).toBe('2026-09-06T22:00:00.000Z');
    expect(new Date(zonedMidnight('2026-11-02')).toISOString()).toBe('2026-11-01T23:00:00.000Z');
  });

  it('CT-15 / CT-16 : point de mesure le vendredi 14:00 Paris (13:30 → semaine S, 14:30 → semaine S+1)', () => {
    const start: [string, string] = ['2026-09-01T10:00:00+02:00', 'In Progress'];
    const before = issue('KPI-13', [start, ['2026-09-11T13:30:00+02:00', 'Go Prod']]);
    const after = issue('KPI-14', [start, ['2026-09-11T14:30:00+02:00', 'Go Prod']]);
    expect(weekly(before, '2026-09-07', '2026-09-20')).toEqual({ wip: [0, 0], done: [1, 0] });
    expect(weekly(after, '2026-09-07', '2026-09-20')).toEqual({ wip: [1, 0], done: [0, 1] });
    const sunday = issue('KPI-14b', [start, ['2026-09-13T23:30:00+02:00', 'Go Prod']]);
    expect(weekly(sunday, '2026-09-07', '2026-09-20').done).toEqual([0, 1]);
  });

  it('CT-17 : entrée juste avant ou juste après le vendredi 14:00', () => {
    const justBefore = issue('KPI-15', [['2026-09-11T13:59:00+02:00', 'In Progress']]);
    const justAfter = issue('KPI-16', [['2026-09-11T14:01:00+02:00', 'In Progress']]);
    expect(weekly(justBefore, '2026-09-07', '2026-09-13').wip).toEqual([1]);
    expect(weekly(justAfter, '2026-09-07', '2026-09-13').wip).toEqual([0]);
  });

  it('measurePoint : vendredi 14:00 Paris en été et en hiver', () => {
    expect(new Date(measurePoint('2026-09-07')).toISOString()).toBe('2026-09-11T12:00:00.000Z');
    expect(new Date(measurePoint('2026-10-26')).toISOString()).toBe('2026-10-30T13:00:00.000Z');
  });

  it('CT-18 : changements d\'heure sans semaine dupliquée ni manquante', () => {
    expect(listWeeks('2026-10-19', '2026-11-01')).toEqual([
      { weekStart: '2026-10-19', weekEnd: '2026-10-25' },
      { weekStart: '2026-10-26', weekEnd: '2026-11-01' },
    ]);
    expect(listWeeks('2027-03-22', '2027-04-04').map((w) => w.weekStart)).toEqual(['2027-03-22', '2027-03-29']);
    const t = issue('KPI-17', [['2026-10-20T10:00:00+02:00', 'In Progress'], ['2026-10-30T13:30:00+01:00', 'Go Prod']]);
    expect(weekly(t, '2026-10-19', '2026-11-01', CONFIG, new Date('2026-11-05T12:00:00Z'))).toEqual({ wip: [1, 0], done: [0, 1] });
  });

  it('CT-19 : semaine en cours mesurée maintenant, terminés depuis le vendredi précédent 14:00', () => {
    const tickets = [
      issue('A', [['2026-10-19T10:00:00+02:00', 'In Progress'], ['2026-10-20T10:00:00+02:00', 'Go Prod']]),
      issue('B', [['2026-10-20T10:00:00+02:00', 'In Progress']]),
      issue('C', [['2026-10-15T10:00:00+02:00', 'In Progress'], ['2026-10-22T10:00:00+02:00', 'Go Prod']]),
    ].map((i) => computeWipTicket(i, CONFIG));
    const { weeks } = aggregateWipByWeek(tickets, '2026-10-19', '2026-10-25', NOW);
    expect(weeks[0].total).toEqual({ wip: 2, done: 1 });
    expect(weeks[0].measuredAt).toBe(NOW.toISOString());
  });

  it('CT-20 : aucune semaine future', () => {
    const { weeks } = aggregateWipByWeek([], '2026-10-12', '2026-11-08', NOW);
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-10-12', '2026-10-19']);
  });

  it('CT-31 / CT-32 : semaines touchées par la période, bornes comprises', () => {
    const weeks = listWeeks('2026-09-01', '2026-10-20');
    expect(weeks).toHaveLength(8);
    expect(weeks[0]).toEqual({ weekStart: '2026-08-31', weekEnd: '2026-09-06' });
    expect(weeks[7]).toEqual({ weekStart: '2026-10-19', weekEnd: '2026-10-25' });
    expect(listWeeks('2026-09-09', '2026-09-09')).toHaveLength(1);
    expect(listWeeks('2026-09-07', '2026-09-13')).toHaveLength(1);
    expect(listWeeks('2026-09-13', '2026-09-13')).toEqual([{ weekStart: '2026-09-07', weekEnd: '2026-09-13' }]);
  });

  it('mondayOf et countWeeks', () => {
    expect(mondayOf('2026-09-13')).toBe('2026-09-07');
    expect(mondayOf('2026-09-07')).toBe('2026-09-07');
    expect(countWeeks('2026-09-01', '2026-10-20')).toBe(8);
    expect(countWeeks('2026-10-20', '2026-09-01')).toBe(0);
  });
});

describe('périmètre et équipes', () => {
  it('CT-21 : sous-tâches, épics et légendes exclus, US gardée', () => {
    expect(isWipEligibleIssueType({ name: 'Sous-tâche', subtask: true })).toBe(false);
    expect(isWipEligibleIssueType({ name: 'Epic' })).toBe(false);
    expect(isWipEligibleIssueType({ name: 'Légende' })).toBe(false);
    expect(isWipEligibleIssueType({ name: 'US' })).toBe(true);
    expect(isWipEligibleIssueType(undefined)).toBe(true);
  });

  it('types suivis : US, Tâche Tech, Bug et Bug dev seulement', () => {
    const types = ['US', 'Tâche Tech', 'Bug', 'Bug dev'];
    expect(isWipEligibleIssueType({ name: 'tâche tech' }, types)).toBe(true);
    expect(isWipEligibleIssueType({ name: 'Bug' }, types)).toBe(true);
    expect(isWipEligibleIssueType({ name: 'Story' }, types)).toBe(false);
  });

  it('CT-23 : équipe vide → « Sans équipe », placée en dernier', () => {
    const tickets = [null, '', '  ', 'Team B', 'Team A'].map((team, i) =>
      computeWipTicket(issue(`K-${i}`, [['2026-09-08T10:00:00+02:00', 'In Progress']], { team }), CONFIG)
    );
    const { teams, weeks } = aggregateWipByWeek(tickets, '2026-09-07', '2026-09-13', NOW);
    expect(teams).toEqual(['Team A', 'Team B', NO_TEAM]);
    expect(weeks[0].byTeam[NO_TEAM]).toEqual({ wip: 3, done: 0 });
    expect(sortTeams([NO_TEAM, 'b', 'a'])).toEqual(['a', 'b', NO_TEAM]);
  });

  it('CT-24 : compté dans l\'équipe actuelle uniquement', () => {
    const t = computeWipTicket(issue('KPI-11', [['2026-09-08T10:00:00+02:00', 'In Progress']], { team: 'Team B' }), CONFIG);
    const { weeks, teams } = aggregateWipByWeek([t], '2026-09-07', '2026-09-20', NOW);
    expect(teams).toEqual(['Team B']);
    expect(weeks.map((w) => w.byTeam['Team B'].wip)).toEqual([1, 1]);
  });

  it('CT-77 : équipes = boards ; un ticket sur deux boards compte pour chacun, une fois au total', () => {
    const t = computeWipTicket(
      { ...issue('KPI-12', [['2026-09-08T10:00:00+02:00', 'In Progress']], { team: 'Team A' }), teams: ['Supply', ' Brigade ', 'Supply'] },
      CONFIG
    );
    expect(t.teams).toEqual(['Supply', 'Brigade']);
    const { weeks, teams } = aggregateWipByWeek([t], '2026-09-07', '2026-09-13', NOW, undefined, ['Calson', 'Supply']);
    expect(teams).toEqual(['Brigade', 'Calson', 'Supply']);
    expect(weeks[0].total).toEqual({ wip: 1, done: 0 });
    expect(weeks[0].byTeam).toEqual({ Brigade: { wip: 1, done: 0 }, Calson: { wip: 0, done: 0 }, Supply: { wip: 1, done: 0 } });
  });

  it('CT-25 : lecture du champ équipe (texte, objet, tableau)', () => {
    expect(readTeamField({ name: ' Team A ' })).toBe('Team A');
    expect(readTeamField({ value: 'Team B' })).toBe('Team B');
    expect(readTeamField([{ value: 'Team C' }])).toBe('Team C');
    expect(readTeamField('Team D')).toBe('Team D');
    expect(readTeamField([])).toBeNull();
    expect(readTeamField({})).toBeNull();
    expect(readTeamField(null)).toBeNull();
  });

  it('CT-26 : gros volume, totaux = somme des équipes', () => {
    const tickets = Array.from({ length: 5000 }, (_, i) =>
      computeWipTicket(
        issue(`V-${i}`, [
          [new Date(Date.parse('2025-11-03T10:00:00Z') + (i % 300) * 86400000).toISOString(), 'In Progress'],
          [new Date(Date.parse('2025-11-03T10:00:00Z') + ((i % 300) + (i % 40)) * 86400000).toISOString(), 'Go Prod'],
        ], { team: `T${i % 10}` }),
        CONFIG
      )
    );
    const t0 = Date.now();
    const { weeks } = aggregateWipByWeek(tickets, '2025-10-27', '2026-10-19', NOW);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(weeks).toHaveLength(52);
    for (const w of weeks) {
      const sum = Object.values(w.byTeam).reduce((acc, c) => ({ wip: acc.wip + c.wip, done: acc.done + c.done }), { wip: 0, done: 0 });
      expect(sum).toEqual(w.total);
    }
  });
});
