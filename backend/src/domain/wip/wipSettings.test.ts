/**
 * Réglages et seuils WIP (plan de tests docs/qa/plans/suivi-wip.md, CT-44 à CT-48).
 */
import { DEFAULT_WIP_SETTINGS, teamWipThreshold, validateWipSettings, type WipSettingsValue } from './wipSettings';

const base = { startStatuses: ['In Progress'], endStatuses: ['Go Prod'], defaultMaxPerDev: 3 };

describe('validateWipSettings', () => {
  it('CT-44 : nouvelle équipe sans maximum par dev → 3 par défaut, seuil 12', () => {
    const r = validateWipSettings({ ...base, teams: [{ team: ' Team A ', devCount: 4 }] });
    expect(r).toEqual({ ok: true, value: { ...base, teams: [{ team: 'Team A', devCount: 4, maxPerDev: null }] } });
    if (r.ok) expect(teamWipThreshold(r.value, 'team a')).toBe(12);
  });

  it('valeurs par défaut si le corps est vide', () => {
    expect(validateWipSettings(undefined)).toEqual({ ok: true, value: DEFAULT_WIP_SETTINGS });
  });

  it.each([
    [{ devCount: -1 }, 'Team A : le nombre de devs doit être un entier entre 0 et 50'],
    [{ devCount: 2.5 }, 'Team A : le nombre de devs doit être un entier entre 0 et 50'],
    [{ devCount: 51 }, 'Team A : le nombre de devs doit être un entier entre 0 et 50'],
    [{ devCount: '4' }, 'Team A : le nombre de devs doit être un entier entre 0 et 50'],
    [{ devCount: null }, 'Team A : le nombre de devs doit être un entier entre 0 et 50'],
    [{ devCount: 4, maxPerDev: 0 }, 'Team A : le maximum de tickets par dev doit être un entier entre 1 et 20'],
    [{ devCount: 4, maxPerDev: 21 }, 'Team A : le maximum de tickets par dev doit être un entier entre 1 et 20'],
    [{ devCount: 4, maxPerDev: 1.5 }, 'Team A : le maximum de tickets par dev doit être un entier entre 1 et 20'],
  ])('CT-45 : %j refusé', (row, message) => {
    expect(validateWipSettings({ ...base, teams: [{ team: 'Team A', ...row }] })).toEqual({ ok: false, errors: [message] });
  });

  it('CT-45 : maximum par défaut hors bornes refusé', () => {
    const r = validateWipSettings({ ...base, defaultMaxPerDev: 21 });
    expect(r.ok).toBe(false);
  });

  it('CT-46 : bornes acceptées ; 0 dev → seuil non défini', () => {
    const r = validateWipSettings({
      ...base,
      teams: [
        { team: 'A', devCount: 0 },
        { team: 'B', devCount: 50, maxPerDev: 1 },
        { team: 'C', devCount: 1, maxPerDev: 20 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(teamWipThreshold(r.value, 'A')).toBeNull();
    expect(teamWipThreshold(r.value, 'B')).toBe(50);
    expect(teamWipThreshold(r.value, 'C')).toBe(20);
    expect(teamWipThreshold(r.value, 'Inconnue')).toBeNull();
  });

  it('CT-47 : doublon, nom vide et « Sans équipe » refusés', () => {
    const r = validateWipSettings({
      ...base,
      teams: [
        { team: 'Team A', devCount: 1 },
        { team: 'team a', devCount: 2 },
        { team: '', devCount: 1 },
        { team: 'Sans équipe', devCount: 1 },
      ],
    });
    expect(r).toEqual({
      ok: false,
      errors: ['Équipe en double : team a', 'Équipe n°3 : le nom est obligatoire', '« Sans équipe » ne peut pas avoir de seuil'],
    });
    expect(validateWipSettings({ ...base, teams: 'x' })).toEqual({ ok: false, errors: ['teams doit être une liste'] });
  });

  it('CT-48 : statuts nettoyés et dédoublonnés ; liste vide, chevauchement ou guillemet refusés', () => {
    const ok = validateWipSettings({ ...base, startStatuses: [' In Progress ', 'In Progress', 'Dev'] });
    expect(ok.ok && ok.value.startStatuses).toEqual(['In Progress', 'Dev']);
    expect(validateWipSettings({ ...base, startStatuses: [] })).toEqual({
      ok: false,
      errors: ['Statuts de départ : au moins un statut est obligatoire'],
    });
    expect(validateWipSettings({ ...base, endStatuses: 'Go Prod' })).toEqual({
      ok: false,
      errors: ["Statuts d'arrivée doit être une liste de statuts"],
    });
    expect(validateWipSettings({ ...base, endStatuses: ['in progress'] })).toEqual({
      ok: false,
      errors: ["Un statut ne peut pas être à la fois de départ et d'arrivée : In Progress"],
    });
    expect(validateWipSettings({ ...base, endStatuses: ['Go "Prod'] }).ok).toBe(false);
  });
});

describe('bornes des équipes', () => {
  it('refuse plus de 200 équipes et les noms de plus de 100 caractères', () => {
    const many = Array.from({ length: 201 }, (_, i) => ({ team: `T${i}`, devCount: 1 }));
    expect(validateWipSettings({ ...base, teams: many })).toEqual({ ok: false, errors: ['200 équipes au maximum'] });
    expect(validateWipSettings({ ...base, teams: [{ team: 'x'.repeat(101), devCount: 1 }] })).toEqual({
      ok: false,
      errors: ['Équipe n°1 : nom trop long (100 caractères au maximum)'],
    });
  });
});

describe('teamWipThreshold', () => {
  it('utilise le maximum propre à l\'équipe, sinon le défaut', () => {
    const s: WipSettingsValue = { ...base, defaultMaxPerDev: 2, teams: [{ team: 'A', devCount: 3, maxPerDev: null }, { team: 'B', devCount: 3, maxPerDev: 4 }] };
    expect(teamWipThreshold(s, 'A')).toBe(6);
    expect(teamWipThreshold(s, 'B')).toBe(12);
  });
});
