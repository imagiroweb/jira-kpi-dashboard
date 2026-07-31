/**
 * TU — Préférences User : constantes et schéma Roadmap Adoria 2026
 */
import {
  DEFAULT_ROADMAP_ADORIA_2026_FILTERS,
  ROADMAP_ADORIA_QUARTER_FILTERS,
  User,
} from './User';

describe('User preferences Roadmap Adoria 2026 (TU)', () => {
  it('expose les trimestres autorisés', () => {
    expect(ROADMAP_ADORIA_QUARTER_FILTERS).toEqual(['all', 'Q1', 'Q2', 'Q3', 'Q4']);
  });

  it('expose les filtres par défaut (trimestre all, statut/team vides)', () => {
    expect(DEFAULT_ROADMAP_ADORIA_2026_FILTERS).toEqual({
      trimestre: 'all',
      statut: [],
      team: [],
    });
  });

  it('définit preferences.roadmapAdoria2026Filters sur le schéma', () => {
    const schema = User.schema;
    expect(schema.path('preferences.roadmapAdoria2026Filters.trimestre')).toBeDefined();
    expect(schema.path('preferences.roadmapAdoria2026Filters.statut')).toBeDefined();
    expect(schema.path('preferences.roadmapAdoria2026Filters.team')).toBeDefined();
    expect(
      schema.path('preferences.roadmapAdoria2026Filters.trimestre').options.enum
    ).toEqual(ROADMAP_ADORIA_QUARTER_FILTERS);
  });
});
