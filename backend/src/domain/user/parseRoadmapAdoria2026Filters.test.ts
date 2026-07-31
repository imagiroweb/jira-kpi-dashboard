/**
 * TU — Validation / normalisation des filtres Roadmap Adoria 2026
 */
import { parseRoadmapAdoria2026Filters } from './parseRoadmapAdoria2026Filters';

describe('parseRoadmapAdoria2026Filters (TU)', () => {
  it('accepte un payload valide (trimestre + statut)', () => {
    expect(parseRoadmapAdoria2026Filters({ trimestre: 'Q2', statut: ['En cours'] })).toEqual({
      trimestre: 'Q2',
      statut: ['En cours'],
    });
  });

  it('accepte trimestre "all" et statut vide', () => {
    expect(parseRoadmapAdoria2026Filters({ trimestre: 'all', statut: [] })).toEqual({
      trimestre: 'all',
      statut: [],
    });
  });

  it('normalise statut (trim, unicité, tri fr)', () => {
    expect(
      parseRoadmapAdoria2026Filters({
        trimestre: 'Q1',
        statut: [' B ', 'A', 'A', '', '  '],
      })
    ).toEqual({
      trimestre: 'Q1',
      statut: ['A', 'B'],
    });
  });

  it('retourne null si body absent ou non objet', () => {
    expect(parseRoadmapAdoria2026Filters(null)).toBeNull();
    expect(parseRoadmapAdoria2026Filters(undefined)).toBeNull();
    expect(parseRoadmapAdoria2026Filters('Q1')).toBeNull();
  });

  it('retourne null si trimestre invalide', () => {
    expect(parseRoadmapAdoria2026Filters({ trimestre: 'Q5', statut: [] })).toBeNull();
    expect(parseRoadmapAdoria2026Filters({ trimestre: 1, statut: [] })).toBeNull();
    expect(parseRoadmapAdoria2026Filters({ statut: [] })).toBeNull();
  });

  it('retourne null si statut n’est pas un tableau de chaînes', () => {
    expect(parseRoadmapAdoria2026Filters({ trimestre: 'all', statut: 'Done' })).toBeNull();
    expect(parseRoadmapAdoria2026Filters({ trimestre: 'all', statut: [1, 2] })).toBeNull();
    expect(parseRoadmapAdoria2026Filters({ trimestre: 'all' })).toBeNull();
  });

  it('retourne null si une chaîne statut dépasse 200 caractères', () => {
    expect(
      parseRoadmapAdoria2026Filters({
        trimestre: 'all',
        statut: ['x'.repeat(201)],
      })
    ).toBeNull();
  });

  it('retourne null si plus de 100 statuts', () => {
    expect(
      parseRoadmapAdoria2026Filters({
        trimestre: 'all',
        statut: Array.from({ length: 101 }, (_, i) => `s${i}`),
      })
    ).toBeNull();
  });
});
