/** Formate des heures en min / h / j (base 8 h = 1 jour ouvré). */
export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 8) return `${hours.toFixed(1)}h`;
  return `${(hours / 8).toFixed(1)}j`;
}

/** Durée en secondes affichée toujours en heures (et minutes si < 1h), sans jours. */
export function formatHoursOnly(seconds: number): string {
  if (!seconds || seconds <= 0) return '0h';
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  return `${hours.toFixed(1)}h`;
}

const EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Montant en euros arrondi à l'euro (ex. « 1 525 € »). */
export function formatEuros(amount: number): string {
  return EUROS.format(amount);
}
