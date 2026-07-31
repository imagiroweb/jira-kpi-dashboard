/**
 * TU — Validation / normalisation des filtres Roadmap Adoria 2026
 */
import { parseRoadmapAdoria2026Filters } from './parseRoadmapAdoria2026Filters';

describe('parseRoadmapAdoria2026Filters (TU)', () => {
  it('accepte un payload valide (trimestre + statut + team)', () => {
    expect(
      parseRoadmapAdoria2026Filters({
        trimestre: 'Q2',
        statut: ['En cours'],
        team: ['Team Cook'],
      })
    ).toEqual({
      trimestre: 'Q2',
      statut: ['En cours'],
      team: ['Team Cook'],
    });
  });

  it('accepte trimestre "all" et listes vides', () => {
    expect(parseRoadmapAdoria2026Filters({ trimestre: 'all', statut: [], team: [] })).toEqual({
      trimestre: 'all',
      statut: [],
      team: [],
    });
  });

  it('normalise statut et team (trim, unicité, tri fr)', () => {
    expect(
      parseRoadmapAdoria2026Filters({
        trimestre: 'Q1',
        statut: [' B ', 'A', 'A', '', '  '],
        team: [' Softcam ', 'IA', 'IA', ''],
      })
    ).toEqual({
      trimestre: 'Q1',
      statut: ['A', 'B'],
      team: ['IA', 'Softcam'],
    });
  });

  it('retourne null si body absent ou non objet', () => {
    expect(parseRoadmapAdoria2026Filters(null)).toBeNull();
    expect(parseRoadmapAdoria2026Filters(undefined)).toBeNull();
    expect(parseRoadmapAdoria2026Filters('Q1')).toBeNull();
  });

  it('retourne null si trimestre invalide', () => {
    expect(parseRoadmapAdoria2026Filters({ trimestre: 'Q5', statut: [], team: [] })).toBeNull();
    expect(parseRoadmapAdoria2026Filters({ trimestre: 1, statut: [], team: [] })).toBeNull();
    expect(parseRoadmapAdoria2026Filters({ statut: [], team: [] })).toBeNull();
  });

  it('retourne null si statut ou team n’est pas un tableau de chaînes', () => {
    expect(parseRoadmapAdoria2026Filters({ trimestre: 'all', statut: 'Done', team: [] })).toBeNull();
    expect(parseRoadmapAdoria2026Filters({ trimestre: 'all', statut: [1, 2], team: [] })).toBeNull();
    expect(parseRoadmapAdoria2026Filters({ trimestre: 'all', statut: [], team: 'Cook' })).toBeNull();
    expect(parseRoadmapAdoria2026Filters({ trimestre: 'all', statut: [] })).toBeNull();
    expect(parseRoadmapAdoria2026Filters({ trimestre: 'all', team: [] })).toBeNull();
  });

  it('retourne null si une chaîne statut ou team dépasse 200 caractères', () => {
    expect(
      parseRoadmapAdoria2026Filters({
        trimestre: 'all',
        statut: ['x'.repeat(201)],
        team: [],
      })
    ).toBeNull();
    expect(
      parseRoadmapAdoria2026Filters({
        trimestre: 'all',
        statut: [],
        team: ['y'.repeat(201)],
      })
    ).toBeNull();
  });

  it('retourne null si plus de 100 entrées statut ou team', () => {
    expect(
      parseRoadmapAdoria2026Filters({
        trimestre: 'all',
        statut: Array.from({ length: 101 }, (_, i) => `s${i}`),
        team: [],
      })
    ).toBeNull();
    expect(
      parseRoadmapAdoria2026Filters({
        trimestre: 'all',
        statut: [],
        team: Array.from({ length: 101 }, (_, i) => `t${i}`),
      })
    ).toBeNull();
  });
});
