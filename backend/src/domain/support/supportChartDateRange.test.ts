import { resolveSupportChartDateRange } from './supportChartDateRange';

describe('resolveSupportChartDateRange', () => {
  it('borne le sprint actif à aujourd’hui si la fin est dans le futur', () => {
    expect(
      resolveSupportChartDateRange({
        activeSprint: true,
        sprintRange: { from: '2026-09-01', to: '2026-09-30' },
        today: '2026-09-17',
      })
    ).toEqual({ from: '2026-09-01', to: '2026-09-17' });
  });

  it('conserve la fin du sprint si elle est déjà passée', () => {
    expect(
      resolveSupportChartDateRange({
        activeSprint: true,
        sprintRange: { from: '2026-04-01', to: '2026-04-15' },
        today: '2026-09-17',
      })
    ).toEqual({ from: '2026-04-01', to: '2026-04-15' });
  });

  it('reprend from/to pour une période personnalisée, sans clamp', () => {
    expect(
      resolveSupportChartDateRange({
        activeSprint: false,
        from: '2026-03-01',
        to: '2026-03-31',
        sprintRange: { from: '2026-09-01', to: '2026-09-30' },
        today: '2026-09-17',
      })
    ).toEqual({ from: '2026-03-01', to: '2026-03-31' });
  });

  it('retourne null si le sprint actif n’a pas de dates', () => {
    expect(
      resolveSupportChartDateRange({
        activeSprint: true,
        sprintRange: null,
        today: '2026-09-17',
      })
    ).toBeNull();
  });
});
