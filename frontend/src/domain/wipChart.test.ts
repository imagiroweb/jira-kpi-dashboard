/**
 * Séries, période et seuils du graphique WIP (plan docs/qa/plans/suivi-wip.md, CT-27 à CT-43).
 */
import { describe, expect, it } from 'vitest';
import {
  buildWipRows,
  combinedThreshold,
  defaultWipPeriod,
  effectiveTeams,
  formatMeasuredAt,
  formatWeekRange,
  listWeeks,
  parseTeamDrafts,
  teamThreshold,
  thresholdLabel,
  validateWipPeriod,
  WIP_WORKFLOW_CHANGE_DATE,
  wipByAssignee,
  wipByStatus,
  wipChartSeries,
  WIP_PER_PERSON_LIMIT,
} from './wipChart';
import { WIP_DATA, WIP_SETTINGS, WIP_TEAMS } from '@/test/fixtures/wip';

const NOW = new Date(2026, 9, 21, 15, 0); // mercredi 21/10/2026, heure locale

describe('buildWipRows', () => {
  it('CT-27 : sélection vide → somme de toutes les équipes, « Sans équipe » comprise', () => {
    const { rows, teams } = buildWipRows(WIP_DATA, [], NOW);
    expect(teams).toEqual(WIP_TEAMS);
    expect(rows[0]).toMatchObject({ wip: 12, done: 3 });
  });

  it('CT-79 : « Toutes » → total du serveur ; équipes cochées → somme de leurs tickets', () => {
    const weeks = WIP_DATA.weeks.map((w, i) => (i === 0 ? { ...w, total: { wip: 10, done: 3 } } : w));
    const { rows } = buildWipRows({ ...WIP_DATA, weeks }, [], NOW);
    expect(rows[0]).toMatchObject({ wip: 10, done: 3 });
    expect(buildWipRows({ ...WIP_DATA, weeks }, ['Brigade', 'Supply'], NOW).rows[0]).toMatchObject({ wip: 9 });
    expect(buildWipRows({ ...WIP_DATA, weeks }, WIP_TEAMS, NOW).rows[0]).toMatchObject({ wip: 12, threshold: 21 });
  });

  it('CT-28 : deux équipes → somme et une série par équipe, la troisième absente', () => {
    const { rows, teams } = buildWipRows(WIP_DATA, ['Brigade', 'Supply'], NOW);
    expect(teams).toEqual(['Brigade', 'Supply']);
    expect(rows[0]).toMatchObject({ wip: 9, done: 3, teams: { Brigade: 5, Supply: 4 } });
    expect(rows[0].teams).not.toHaveProperty('Choco');
  });

  it('CT-29 : une seule équipe → son seuil, sans mention partielle', () => {
    const { threshold, rows } = buildWipRows(WIP_DATA, ['Brigade'], NOW);
    expect(threshold).toEqual({ value: 12, partial: false });
    expect(rows.every((r) => r.threshold === 12)).toBe(true);
  });

  it('CT-34 : une semaine absente de la réponse apparaît à 0, sans trou', () => {
    const { rows } = buildWipRows(WIP_DATA, ['Brigade'], NOW);
    expect(rows).toHaveLength(12);
    expect(rows.find((r) => r.weekStart === '2026-09-07')).toMatchObject({ wip: 0, done: 0, label: '07/09' });
  });

  it('marque la semaine qui contient le 12/10/2026', () => {
    const { rows } = buildWipRows(WIP_DATA, [], NOW);
    expect(rows.find((r) => r.workflowChange)?.weekStart).toBe(WIP_WORKFLOW_CHANGE_DATE);
    expect(rows.filter((r) => r.workflowChange)).toHaveLength(1);
  });

  it('pas de semaine future ajoutée', () => {
    const { rows } = buildWipRows({ ...WIP_DATA, to: '2026-11-15' }, [], NOW);
    expect(rows[rows.length - 1].weekStart).toBe('2026-10-19');
  });

  it('ignore une équipe sélectionnée absente des données', () => {
    expect(effectiveTeams(WIP_TEAMS, ['Inconnue'])).toEqual(WIP_TEAMS);
    expect(effectiveTeams(WIP_TEAMS, ['Inconnue', 'Supply'])).toEqual(['Supply']);
  });

  it('CT-36 / CT-37 : dépassement strictement au-dessus du seuil, avec l\'écart', () => {
    const { rows } = buildWipRows(WIP_DATA, ['Brigade'], NOW);
    expect(rows[1]).toMatchObject({ wip: 13, over: true, gap: 1 });
    expect(rows[2]).toMatchObject({ wip: 12, over: false, gap: 0 });
    expect(rows[4]).toMatchObject({ wip: 3, over: false, gap: -9 });
  });

  it('CT-38 : seuils 12 + 9 → 21, dépassement évalué contre 21', () => {
    const { threshold, rows } = buildWipRows(WIP_DATA, ['Brigade', 'Supply'], NOW);
    expect(threshold).toEqual({ value: 21, partial: false });
    expect(thresholdLabel(threshold, true)).toBe('Somme des seuils : 21');
    expect(rows[1]).toMatchObject({ wip: 13, over: false, gap: -8 });
  });

  it('CT-43 : sans seuil → pas de dépassement, écart absent', () => {
    const { rows } = buildWipRows(WIP_DATA, ['Choco'], NOW);
    expect(rows[0]).toMatchObject({ threshold: null, over: false, gap: null });
  });
});

describe('seuils', () => {
  it('CT-35 : 4 devs × 3 → 12, seulement Brigade et Supply', () => {
    expect(teamThreshold(WIP_SETTINGS, 'Brigade')).toBe(12);
    expect(teamThreshold(WIP_SETTINGS, 'supply')).toBe(9);
    expect(teamThreshold(WIP_SETTINGS, 'Choco')).toBeNull();
  });

  it('CT-39 : équipe sans réglage ou hors seuil → non défini', () => {
    expect(teamThreshold(WIP_SETTINGS, 'Cook')).toBeNull();
    expect(teamThreshold(WIP_SETTINGS, 'Team Z')).toBeNull();
    expect(thresholdLabel(combinedThreshold(WIP_SETTINGS, ['Choco']))).toBe('Seuil non défini');
  });

  it('CT-40 : Choco et « Sans équipe » ne rendent pas le seuil partiel ; Supply sans réglage, oui', () => {
    expect(combinedThreshold(WIP_SETTINGS, ['Brigade', 'Choco'])).toEqual({ value: 12, partial: false });
    expect(combinedThreshold(WIP_SETTINGS, ['Brigade', 'Sans équipe'])).toEqual({ value: 12, partial: false });
    expect(combinedThreshold(WIP_SETTINGS, ['Sans équipe'])).toEqual({ value: null, partial: false });
    expect(combinedThreshold({ ...WIP_SETTINGS, teams: [{ team: 'Brigade', devCount: 4, maxPerDev: null }] }, ['Brigade', 'Supply'])).toEqual({
      value: 12,
      partial: true,
    });
    expect(thresholdLabel({ value: 12, partial: true })).toBe('Seuil partiel : 12');
    expect(thresholdLabel({ value: 21, partial: false })).toBe('Seuil : 21');
  });

  it('CT-41 : vue globale → somme Brigade + Supply, Choco ignoré', () => {
    expect(buildWipRows(WIP_DATA, [], NOW).threshold).toEqual({ value: 21, partial: false });
  });
});

describe('période', () => {
  it('CT-30 : 12 dernières semaines, semaine en cours comprise', () => {
    expect(defaultWipPeriod(NOW)).toEqual({ from: '2026-08-03', to: '2026-10-25' });
  });

  it('CT-31 / CT-32 : semaines touchées, bornes comprises', () => {
    const weeks = listWeeks('2026-09-01', '2026-10-20');
    expect(weeks).toHaveLength(8);
    expect(weeks[0].weekStart).toBe('2026-08-31');
    expect(weeks[7].weekEnd).toBe('2026-10-25');
    expect(listWeeks('2026-09-13', '2026-09-13')).toEqual([{ weekStart: '2026-09-07', weekEnd: '2026-09-13' }]);
  });

  it('CT-33 : 52 semaines acceptées, 53 refusées, dates incohérentes refusées', () => {
    expect(validateWipPeriod('2025-10-27', '2026-10-25')).toBeNull();
    expect(validateWipPeriod('2025-10-20', '2026-10-25')).toBe('Période trop longue (53 semaines) : réduisez-la à 52 semaines maximum');
    expect(validateWipPeriod('2026-10-20', '2026-09-01')).toBe('La date de début doit précéder la date de fin');
    expect(validateWipPeriod('', '2026-09-01')).toBe('Choisissez une date de début et une date de fin');
  });

  it('CT-42 : dates de l\'infobulle', () => {
    expect(formatWeekRange('2026-09-07', '2026-09-13')).toBe('07/09 – 13/09');
  });
});

describe('wipByAssignee', () => {
  const tickets = [
    { key: 'AD-3', assignee: 'Alice Martin', teams: ['Team A'], status: '--Code Review--' },
    { key: 'AD-1', assignee: 'Alice Martin', teams: ['Team A', 'Team B'], status: '--In Progress--' },
    { key: 'AD-2', assignee: 'Alice Martin', teams: ['Team A'], status: '--Go Recette--' },
    { key: 'AD-4', assignee: 'Bob', teams: ['Team B'], status: '--QA TestX--' },
    { key: 'AD-5', assignee: 'Bob', teams: ['Team B'], status: '--In Progress--' },
    { key: 'AD-6', assignee: '  ', teams: ['Team C'], status: '' },
  ];

  it('regroupe par assigné, une fois par ticket, et signale plus de 2', () => {
    const rows = wipByAssignee(tickets, [], ['Team A', 'Team B', 'Team C']);
    expect(rows[0]).toEqual({
      assignee: 'Alice Martin',
      count: 3,
      tickets: [
        { key: 'AD-1', status: '--In Progress--' },
        { key: 'AD-2', status: '--Go Recette--' },
        { key: 'AD-3', status: '--Code Review--' },
      ],
      over: true,
    });
    expect(rows.find((r) => r.assignee === 'Bob')).toMatchObject({ count: 2, over: false });
    expect(rows.find((r) => r.assignee === 'Non assigné')?.tickets).toEqual([{ key: 'AD-6', status: 'Statut inconnu' }]);
    expect(WIP_PER_PERSON_LIMIT).toBe(2);
  });

  it('filtre sur les équipes choisies', () => {
    const rows = wipByAssignee(tickets, ['Team B'], ['Team A', 'Team B', 'Team C']);
    expect(rows.map((r) => r.assignee)).toEqual(['Bob', 'Alice Martin']);
    expect(rows.find((r) => r.assignee === 'Alice Martin')).toMatchObject({
      count: 1,
      tickets: [{ key: 'AD-1', status: '--In Progress--' }],
      over: false,
    });
  });
});

describe('wipChartSeries', () => {
  const teams = ['Cook', 'Brigade', 'Supply'];

  it('« Toutes » : une courbe globale, sans courbe par équipe', () => {
    expect(wipChartSeries([], teams)).toEqual({ aggregateName: 'WIP global', aggregateTeam: null, teamLines: [] });
  });

  it('une équipe : une courbe à son nom', () => {
    expect(wipChartSeries(['Brigade'], teams)).toEqual({
      aggregateName: 'WIP Brigade',
      aggregateTeam: 'Brigade',
      teamLines: [],
    });
  });

  it('plusieurs équipes : une courbe par équipe, sans somme', () => {
    expect(wipChartSeries(['Brigade', 'Supply'], teams)).toEqual({
      aggregateName: null,
      aggregateTeam: null,
      teamLines: ['Brigade', 'Supply'],
    });
  });
});

describe('wipByStatus', () => {
  const tickets = [
    { key: 'AD-1', assignee: 'Alice Martin', teams: ['Team A', 'Team B'], status: '--In Progress--' },
    { key: 'AD-2', assignee: 'Alice Martin', teams: ['Team A'], status: '--In Progress--' },
    { key: 'AD-3', assignee: 'Bob', teams: ['Team B'], status: '--Go Prod--' },
    { key: 'AD-1', assignee: 'Alice Martin', teams: ['Team A'], status: '--In Progress--' },
  ];

  it('compte les tickets par statut, une fois par clé', () => {
    expect(wipByStatus(tickets, [], ['Team A', 'Team B', 'Team C'])).toEqual([
      { status: '--In Progress--', count: 2 },
      { status: '--Go Prod--', count: 1 },
    ]);
  });

  it('filtre sur les équipes choisies', () => {
    expect(wipByStatus(tickets, ['Team B'], ['Team A', 'Team B', 'Team C'])).toEqual([
      { status: '--Go Prod--', count: 1 },
      { status: '--In Progress--', count: 1 },
    ]);
  });
});

describe('parseTeamDrafts', () => {
  it('convertit les saisies, ignore les lignes sans devs', () => {
    expect(
      parseTeamDrafts([
        { team: 'A', devCount: '4', maxPerDev: '' },
        { team: 'B', devCount: '', maxPerDev: '' },
        { team: 'C', devCount: '2', maxPerDev: '5' },
      ])
    ).toEqual({ ok: true, teams: [{ team: 'A', devCount: 4, maxPerDev: null }, { team: 'C', devCount: 2, maxPerDev: 5 }] });
  });

  it('refuse les saisies hors bornes avant envoi', () => {
    expect(parseTeamDrafts([{ team: 'A', devCount: '51', maxPerDev: '' }])).toEqual({
      ok: false,
      error: 'A : le nombre de devs doit être un entier entre 0 et 50',
    });
    expect(parseTeamDrafts([{ team: 'A', devCount: '2', maxPerDev: '21' }])).toEqual({
      ok: false,
      error: 'A : le maximum de tickets par dev doit être un entier entre 1 et 20',
    });
    expect(parseTeamDrafts([{ team: 'A', devCount: '1.5', maxPerDev: '' }]).ok).toBe(false);
  });
});

describe('formatMeasuredAt', () => {
  it('libellé du point de mesure en heure de Paris', () => {
    expect(formatMeasuredAt('2026-09-11T12:00:00.000Z')).toBe('vendredi 11/09 à 14:00');
  });
});
