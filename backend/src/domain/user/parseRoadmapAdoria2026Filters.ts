import {
  IRoadmapAdoria2026Filters,
  ROADMAP_ADORIA_QUARTER_FILTERS,
  RoadmapAdoriaQuarterFilter,
} from './entities/User';

/**
 * Normalise et valide le payload des filtres Roadmap Adoria 2026.
 * Retourne null si invalide.
 */
export function parseRoadmapAdoria2026Filters(body: unknown): IRoadmapAdoria2026Filters | null {
  if (!body || typeof body !== 'object') return null;
  const { trimestre, statut } = body as { trimestre?: unknown; statut?: unknown };
  if (
    typeof trimestre !== 'string' ||
    !(ROADMAP_ADORIA_QUARTER_FILTERS as string[]).includes(trimestre)
  ) {
    return null;
  }
  if (!Array.isArray(statut) || !statut.every((s) => typeof s === 'string' && s.length <= 200)) {
    return null;
  }
  if (statut.length > 100) return null;
  const uniqueStatut = [...new Set(statut.map((s: string) => s.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'fr')
  );
  return {
    trimestre: trimestre as RoadmapAdoriaQuarterFilter,
    statut: uniqueStatut,
  };
}
