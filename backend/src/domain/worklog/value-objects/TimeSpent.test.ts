import { TimeSpent } from './TimeSpent';

describe('TimeSpent', () => {
  it('refuse une valeur négative', () => {
    expect(() => TimeSpent.fromSeconds(-1)).toThrow('TimeSpent cannot be negative');
  });

  it('construit depuis secondes/minutes/heures', () => {
    expect(TimeSpent.zero().toSeconds).toBe(0);
    expect(TimeSpent.fromSeconds(61.7).toSeconds).toBe(62);
    expect(TimeSpent.fromMinutes(1.5).toSeconds).toBe(90);
    expect(TimeSpent.fromHours(1.25).toSeconds).toBe(4500);
  });

  it('expose les conversions', () => {
    const t = TimeSpent.fromHours(2);
    expect(t.toMinutes).toBe(120);
    expect(t.toHours).toBe(2);
    expect(t.toDays).toBe(0.25);
  });

  it('gère add/subtract/multiply et comparaisons', () => {
    const a = TimeSpent.fromMinutes(90);
    const b = TimeSpent.fromMinutes(30);

    expect(a.add(b).toSeconds).toBe(7200);
    expect(a.subtract(b).toSeconds).toBe(3600);
    expect(b.subtract(a).toSeconds).toBe(0);
    expect(b.multiply(1.5).toSeconds).toBe(2700);
    expect(a.isGreaterThan(b)).toBe(true);
    expect(b.isLessThan(a)).toBe(true);
    expect(a.equals(TimeSpent.fromMinutes(90))).toBe(true);
    expect(TimeSpent.zero().isZero()).toBe(true);
  });

  it('formatte les valeurs en texte et décimal', () => {
    expect(TimeSpent.fromMinutes(45).format()).toBe('45m');
    expect(TimeSpent.fromHours(2).format()).toBe('2h');
    expect(TimeSpent.fromMinutes(90).format()).toBe('1h 30m');
    expect(TimeSpent.fromMinutes(90).formatDecimal()).toBe('1.50');
    expect(TimeSpent.fromMinutes(90).formatDecimal(1)).toBe('1.5');
    expect(TimeSpent.fromMinutes(90).toString()).toBe('1h 30m');
  });
});
