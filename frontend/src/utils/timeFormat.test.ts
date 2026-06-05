import { describe, expect, it } from 'vitest';
import { formatHours } from './timeFormat';

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
