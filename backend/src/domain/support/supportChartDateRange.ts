/**
 * Plage affichée par le graphe « Évolution des tickets » (page Support).
 * Sprint actif : début du sprint → min(fin du sprint, aujourd’hui).
 * Période personnalisée : from/to demandés, sans clamp.
 */
export function resolveSupportChartDateRange(input: {
  activeSprint: boolean;
  from?: string;
  to?: string;
  sprintRange: { from: string; to: string } | null;
  today: string;
}): { from: string; to: string } | null {
  if (input.activeSprint) {
    if (!input.sprintRange?.from || !input.sprintRange?.to) return null;
    return {
      from: input.sprintRange.from,
      to: input.sprintRange.to < input.today ? input.sprintRange.to : input.today,
    };
  }
  if (input.from && input.to) {
    return { from: input.from, to: input.to };
  }
  return null;
}
