import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate, getDefaultDateRange } from './dateUtils';

describe('dateUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-05T15:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatDate', () => {
    it('formate une date en YYYY-MM-DD (UTC)', () => {
      expect(formatDate(new Date('2025-03-14T10:00:00.000Z'))).toBe('2025-03-14');
    });

    it('utilise la partie date ISO sans l’heure', () => {
      expect(formatDate(new Date('2025-12-31T23:59:59.999Z'))).toBe('2025-12-31');
    });
  });

  describe('getDefaultDateRange', () => {
    it('retourne une plage de 8 jours se terminant aujourd’hui', () => {
      const range = getDefaultDateRange();

      expect(range.to).toBe('2025-06-05');
      expect(range.from).toBe('2025-05-28');
    });

    it('from est antérieur à to de exactement 8 jours calendaires', () => {
      const { from, to } = getDefaultDateRange();
      const fromDate = new Date(`${from}T00:00:00.000Z`);
      const toDate = new Date(`${to}T00:00:00.000Z`);
      const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);

      expect(diffDays).toBe(8);
    });
  });
});
