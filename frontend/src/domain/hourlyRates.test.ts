import { describe, expect, it } from 'vitest';
import { formatRates, parseDrafts, toDrafts } from './hourlyRates';

describe('toDrafts', () => {
  it('propose une ligne de coût initial vide sans coût enregistré', () => {
    expect(toDrafts([])).toEqual([{ startDate: '', rate: '' }]);
    expect(toDrafts([{ startDate: null, rate: 50 }, { startDate: '2026-07-01', rate: 60 }])).toEqual([
      { startDate: '', rate: '50' },
      { startDate: '2026-07-01', rate: '60' },
    ]);
  });
});

describe('parseDrafts', () => {
  it('convertit la saisie (virgule acceptée) et ignore la date du coût initial', () => {
    expect(
      parseDrafts([
        { startDate: 'ignoré', rate: '50,5' },
        { startDate: '2026-07-01', rate: '60' },
      ])
    ).toEqual({
      ok: true,
      rates: [
        { startDate: null, rate: 50.5 },
        { startDate: '2026-07-01', rate: 60 },
      ],
    });
  });

  it('traite un coût initial vide seul comme « aucun coût »', () => {
    expect(parseDrafts([{ startDate: '', rate: ' ' }])).toEqual({ ok: true, rates: [] });
  });

  it('refuse un coût invalide, une date manquante ou des dates non croissantes, et plus de 3 coûts', () => {
    expect(parseDrafts([{ startDate: '', rate: '-2' }])).toEqual({ ok: false, error: 'Coût initial invalide' });
    expect(parseDrafts([{ startDate: '', rate: '50' }, { startDate: '', rate: '60' }])).toEqual({
      ok: false,
      error: 'Date de début de la période 1 manquante',
    });
    expect(
      parseDrafts([
        { startDate: '', rate: '50' },
        { startDate: '2026-07-01', rate: '60' },
        { startDate: '2026-07-01', rate: '65' },
      ])
    ).toMatchObject({ ok: false, error: expect.stringMatching(/croissantes/) });
    expect(parseDrafts(Array.from({ length: 4 }, () => ({ startDate: '', rate: '1' })))).toMatchObject({ ok: false });
  });
});

describe('formatRates', () => {
  it('résume le coût initial et les changements datés', () => {
    expect(formatRates([{ startDate: null, rate: 50 }, { startDate: '2026-07-01', rate: 60 }])).toBe('50 €/h · 60 €/h dès le 01/07/2026');
  });
});
