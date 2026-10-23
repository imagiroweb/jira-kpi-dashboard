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
} from './wipChart';
import { WIP_DATA, WIP_SETTINGS, WIP_TEAMS } from '@/test/fixtures/wip';

const NOW = new Date(2026, 9, 21, 15, 0); // mercredi 21/10/2026, heure locale

describe('buildWipRows', () => {
  it('CT-27 : sélection vide → somme de toutes les équipes, « Sans équipe » comprise', () => {
    const { rows, teams } = buildWipRows(WIP_DATA, [], NOW);
    expect(teams).toEqual(WIP_TEAMS);
    expect(rows[0]).toMatchObject({ wip: 12, done: 3 });
  });

  it('CT-79 : toutes les équipes → total du serveur (ticket sur deux boards compté une fois)', () => {
    const weeks = WIP_DATA.weeks.map((w, i) => (i === 0 ? { ...w, total: { wip: 10, done: 3 } } : w));
    const { rows } = buildWipRows({ ...WIP_DATA, weeks }, [], NOW);
    expect(rows[0]).toMatchObject({ wip: 10, done: 3 });
    expect(buildWipRows({ ...WIP_DATA, weeks }, ['Team A', 'Team B'], NOW).rows[0]).toMatchObject({ wip: 9 });
  });

  it('CT-28 : deux équipes → somme et une série par équipe, la troisième absente', () => {
    const { rows, teams } = buildWipRows(WIP_DATA, ['Team A', 'Team B'], NOW);
    expect(teams).toEqual(['Team A', 'Team B']);
    expect(rows[0]).toMatchObject({ wip: 9, done: 3, teams: { 'Team A': 5, 'Team B': 4 } });
    expect(rows[0].teams).not.toHaveProperty('Team C');
  });

  it('CT-29 : une seule équipe → son seuil, sans mention partielle', () => {
    const { threshold, rows } = buildWipRows(WIP_DATA, ['Team A'], NOW);
    expect(threshold).toEqual({ value: 12, partial: false });
    expect(rows.every((r) => r.threshold === 12)).toBe(true);
  });

  it('CT-34 : une semaine absente de la réponse apparaît à 0, sans trou', () => {
    const { rows } = buildWipRows(WIP_DATA, ['Team A'], NOW);
    expect(rows).toHaveLength(12);
    expect(rows.find((r) => r.weekStart === '2026-09-07')).toMatchObject({ wip: 0, done: 0, label: '07/09' });
  });

  it('pas de semaine future ajoutée', () => {
    const { rows } = buildWipRows({ ...WIP_DATA, to: '2026-11-15' }, [], NOW);
    expect(rows[rows.length - 1].weekStart).toBe('2026-10-19');
  });

  it('ignore une équipe sélectionnée absente des données', () => {
    expect(effectiveTeams(WIP_TEAMS, ['Inconnue'])).toEqual(WIP_TEAMS);
    expect(effectiveTeams(WIP_TEAMS, ['Inconnue', 'Team B'])).toEqual(['Team B']);
  });

  it('CT-36 / CT-37 : dépassement strictement au-dessus du seuil, avec l\'écart', () => {
    const { rows } = buildWipRows(WIP_DATA, ['Team A'], NOW);
    expect(rows[1]).toMatchObject({ wip: 13, over: true, gap: 1 });
    expect(rows[2]).toMatchObject({ wip: 12, over: false, gap: 0 });
    expect(rows[4]).toMatchObject({ wip: 3, over: false, gap: -9 });
  });

  it('CT-38 : seuils 12 + 9 → 21, dépassement évalué contre 21', () => {
    const { threshold, rows } = buildWipRows(WIP_DATA, ['Team A', 'Team B'], NOW);
    expect(threshold).toEqual({ value: 21, partial: false });
    expect(rows[1]).toMatchObject({ wip: 13, over: false, gap: -8 });
  });

  it('CT-43 : sans seuil → pas de dépassement, écart absent', () => {
    const { rows } = buildWipRows(WIP_DATA, ['Team C'], NOW);
    expect(rows[0]).toMatchObject({ threshold: null, over: false, gap: null });
  });
});

describe('seuils', () => {
  it('CT-35 : 4 devs × 3 → 12', () => {
    expect(teamThreshold(WIP_SETTINGS, 'Team A')).toBe(12);
    expect(teamThreshold(WIP_SETTINGS, 'team b')).toBe(9);
  });

  it('CT-39 : équipe sans réglage ou à 0 dev → non défini', () => {
    expect(teamThreshold(WIP_SETTINGS, 'Team C')).toBeNull();
    expect(teamThreshold(WIP_SETTINGS, 'Team Z')).toBeNull();
    expect(thresholdLabel(combinedThreshold(WIP_SETTINGS, ['Team C']))).toBe('Seuil non défini');
  });

  it('CT-40 : seuil partiel quand une équipe n\'a pas de seuil ; « Sans équipe » seule → non défini', () => {
    expect(combinedThreshold(WIP_SETTINGS, ['Team A', 'Team C'])).toEqual({ value: 12, partial: true });
    expect(combinedThreshold(WIP_SETTINGS, ['Team A', 'Sans équipe'])).toEqual({ value: 12, partial: true });
    expect(combinedThreshold(WIP_SETTINGS, ['Sans équipe'])).toEqual({ value: null, partial: false });
    expect(thresholdLabel({ value: 12, partial: true })).toBe('Seuil partiel : 12');
    expect(thresholdLabel({ value: 21, partial: false })).toBe('Seuil : 21');
  });

  it('CT-41 : vue globale avec « Sans équipe » → somme des seuils définis, partielle', () => {
    expect(buildWipRows(WIP_DATA, [], NOW).threshold).toEqual({ value: 21, partial: true });
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
