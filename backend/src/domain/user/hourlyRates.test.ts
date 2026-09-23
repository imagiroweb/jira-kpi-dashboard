import { costOfDailySeconds, MAX_HOURLY_RATES, rateAt, validateHourlyRates } from './hourlyRates';

const RATES = [
  { startDate: null, rate: 50 },
  { startDate: '2026-07-01', rate: 60 },
  { startDate: '2026-10-01', rate: 65 },
];

describe('validateHourlyRates', () => {
  it('accepte une liste vide, un coût initial seul, ou des périodes croissantes', () => {
    expect(validateHourlyRates([])).toEqual({ ok: true, rates: [] });
    expect(validateHourlyRates([{ rate: 50 }])).toEqual({ ok: true, rates: [{ startDate: null, rate: 50 }] });
    expect(validateHourlyRates(RATES)).toEqual({ ok: true, rates: RATES });
  });

  it(`limite à ${MAX_HOURLY_RATES} coûts par utilisateur`, () => {
    expect(validateHourlyRates([...RATES, { startDate: '2026-12-01', rate: 70 }])).toMatchObject({ ok: false });
  });

  it('refuse une date sur le coût initial, une date absente ou invalide ensuite', () => {
    expect(validateHourlyRates([{ startDate: '2026-01-01', rate: 50 }])).toMatchObject({ ok: false });
    expect(validateHourlyRates([{ rate: 50 }, { rate: 60 }])).toMatchObject({ ok: false });
    expect(validateHourlyRates([{ rate: 50 }, { startDate: '2026-02-30', rate: 60 }])).toMatchObject({ ok: false });
    expect(validateHourlyRates([{ rate: 50 }, { startDate: '01/07/2026', rate: 60 }])).toMatchObject({ ok: false });
  });

  it('refuse des dates non croissantes ou identiques, et un coût invalide', () => {
    expect(
      validateHourlyRates([{ rate: 50 }, { startDate: '2026-07-01', rate: 60 }, { startDate: '2026-07-01', rate: 65 }])
    ).toMatchObject({ ok: false, error: expect.stringMatching(/croissantes/) });
    expect(
      validateHourlyRates([{ rate: 50 }, { startDate: '2026-07-01', rate: 60 }, { startDate: '2026-03-01', rate: 65 }])
    ).toMatchObject({ ok: false });
    expect(validateHourlyRates([{ rate: -1 }])).toMatchObject({ ok: false });
    expect(validateHourlyRates([{ rate: '50' }])).toMatchObject({ ok: false });
    expect(validateHourlyRates('50')).toMatchObject({ ok: false });
  });
});

describe('rateAt', () => {
  it('applique le coût initial avant le premier changement, puis le dernier changement commencé', () => {
    expect(rateAt(RATES, '2026-01-15')).toBe(50);
    expect(rateAt(RATES, '2026-06-30')).toBe(50);
    expect(rateAt(RATES, '2026-07-01')).toBe(60);
    expect(rateAt(RATES, '2026-12-31')).toBe(65);
    expect(rateAt([], '2026-01-01')).toBeNull();
  });
});

describe('costOfDailySeconds', () => {
  it('valorise chaque jour au coût en vigueur ce jour-là', () => {
    // 10 h en mars à 50 €/h + 5 h en août à 60 €/h + 1 h en novembre à 65 €/h
    expect(costOfDailySeconds(RATES, { '2026-03-02': 36000, '2026-08-10': 18000, '2026-11-03': 3600 })).toBe(865);
  });

  it('retourne null sans coût horaire', () => {
    expect(costOfDailySeconds([], { '2026-03-02': 3600 })).toBeNull();
  });
});
