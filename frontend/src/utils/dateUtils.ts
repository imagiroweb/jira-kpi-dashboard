export interface DateRange {
  from: string;
  to: string;
}

/** Format date as YYYY-MM-DD */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Default date range: last 8 days */
export function getDefaultDateRange(): DateRange {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 8);
  return {
    from: formatDate(from),
    to: formatDate(today),
  };
}
