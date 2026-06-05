/** Formate des heures en min / h / j (base 8 h = 1 jour ouvré). */
export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 8) return `${hours.toFixed(1)}h`;
  return `${(hours / 8).toFixed(1)}j`;
}
