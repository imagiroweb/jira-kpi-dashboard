import { describe, expect, it } from 'vitest';
import { formatEuros, formatHours, formatHoursOnly } from './timeFormat';

describe('formatHours', () => {
  it('affiche des minutes sous 1 h', () => {
    expect(formatHours(0.5)).toBe('30min');
  });

  it('affiche des heures entre 1 h et 8 h', () => {
    expect(formatHours(3.25)).toBe('3.3h');
  });

  it('convertit en jours ouvrés à partir de 8 h', () => {
    expect(formatHours(16)).toBe('2.0j');
  });
});

describe('formatHoursOnly', () => {
  it('affiche des heures sans jamais passer en jours', () => {
    expect(formatHoursOnly(0)).toBe('0h');
    expect(formatHoursOnly(1800)).toBe('30min');
    expect(formatHoursOnly(37800)).toBe('10.5h');
    expect(formatHoursOnly(315000)).toBe('87.5h');
  });
});

describe('formatEuros', () => {
  it("arrondit à l'euro avec le format français", () => {
    expect(formatEuros(1525.4).replace(/\s/g, ' ')).toBe('1 525 €');
    expect(formatEuros(0).replace(/\s/g, ' ')).toBe('0 €');
  });
});
