import {
  IRoadmapAdoria2026Filters,
  ROADMAP_ADORIA_QUARTER_FILTERS,
  RoadmapAdoriaQuarterFilter,
} from './entities/User';

function normalizeStringList(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || !raw.every((s) => typeof s === 'string' && s.length <= 200)) {
    return null;
  }
  if (raw.length > 100) return null;
  return [...new Set(raw.map((s: string) => s.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'fr')
  );
}

/**
 * Normalise et valide le payload des filtres Roadmap Adoria 2026.
 * Retourne null si invalide.
 */
export function parseRoadmapAdoria2026Filters(body: unknown): IRoadmapAdoria2026Filters | null {
  if (!body || typeof body !== 'object') return null;
  const { trimestre, statut, team } = body as {
    trimestre?: unknown;
    statut?: unknown;
    team?: unknown;
  };
  if (
    typeof trimestre !== 'string' ||
    !(ROADMAP_ADORIA_QUARTER_FILTERS as string[]).includes(trimestre)
  ) {
    return null;
  }
  const uniqueStatut = normalizeStringList(statut);
  const uniqueTeam = normalizeStringList(team);
  if (uniqueStatut == null || uniqueTeam == null) return null;
  return {
    trimestre: trimestre as RoadmapAdoriaQuarterFilter,
    statut: uniqueStatut,
    team: uniqueTeam,
  };
}
