/**
 * TU — Burndown fidèle : replay GreenHopper (ajout, retrait, résolution).
 */
import {
  applyScopeChangeEvent,
  buildFaithfulBurndown,
  emptyIssueState,
  isWorkingDay,
  listDaysInclusive,
  ScopeChangeChart,
  ScopeChangeEvent
} from './sprintBurndown';

describe('listDaysInclusive / isWorkingDay', () => {
  it('liste les jours bornes incluses', () => {
    expect(listDaysInclusive('2026-09-07', '2026-09-09')).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09'
    ]);
  });

  it('reconnaît les jours ouvrés', () => {
    expect(isWorkingDay('2026-09-07')).toBe(true);
    expect(isWorkingDay('2026-09-12')).toBe(false);
  });
});

describe('applyScopeChangeEvent', () => {
  it('entre dans le sprint, met à jour les points et passe en done', () => {
    let state = emptyIssueState();
    state = applyScopeChangeEvent(state, { key: 'A-1', added: true, statC: { newValue: 5 } });
    expect(state).toEqual({ inSprint: true, done: false, points: 5 });

    state = applyScopeChangeEvent(state, { key: 'A-1', column: { done: true, notDone: false } });
    expect(state.done).toBe(true);

    state = applyScopeChangeEvent(state, { key: 'A-1', added: false });
    expect(state.inSprint).toBe(false);
  });

  it('notDone: false compte comme terminé ; notDone: true réouvre', () => {
    let state = applyScopeChangeEvent(emptyIssueState(), { key: 'A-1', column: { notDone: false } });
    expect(state.done).toBe(true);
    state = applyScopeChangeEvent(state, { key: 'A-1', column: { notDone: true } });
    expect(state.done).toBe(false);
  });

  it('un statC vide ne remet pas les points à zéro', () => {
    const state = applyScopeChangeEvent(
      { inSprint: true, done: false, points: 8 },
      { key: 'A-1', statC: {} }
    );
    expect(state.points).toBe(8);
  });
});

describe('buildFaithfulBurndown', () => {
  // Lundi 31 août → dimanche 13 septembre 2026
  const dateRange = { from: '2026-08-31', to: '2026-09-13' };
  const startTime = Date.parse('2026-08-31T09:30:00.000Z');

  function chart(eventsByIso: Record<string, ScopeChangeEvent[]>): ScopeChangeChart {
    const changes: Record<string, ScopeChangeEvent[]> = {};
    for (const [iso, events] of Object.entries(eventsByIso)) {
      changes[String(Date.parse(iso))] = events;
    }
    return { changes, startTime, now: Date.parse('2026-09-12T12:00:00.000Z') };
  }

  it('part de zéro puis monte quand les tickets sont ajoutés au start', () => {
    const burndown = buildFaithfulBurndown({
      chart: chart({
        '2026-08-31T09:30:40.000Z': [
          { key: 'A-1', added: true, statC: { newValue: 5 } },
          { key: 'A-2', added: true, statC: { newValue: 3 } }
        ]
      }),
      dateRange,
      unit: 'points',
      today: '2026-08-31'
    });

    expect(burndown.days[0].scope).toBe(8);
    expect(burndown.days[0].remaining).toBe(8);
    expect(burndown.remainingPoints).toBe(8);
    expect(burndown.scopePoints).toBe(8);
  });

  it('fait remonter le reste à faire quand on ajoute en cours de sprint', () => {
    const burndown = buildFaithfulBurndown({
      chart: chart({
        '2026-08-31T09:30:40.000Z': [{ key: 'A-1', added: true, statC: { newValue: 10 } }],
        '2026-09-04T10:00:00.000Z': [{ key: 'A-2', added: true, statC: { newValue: 4 } }]
      }),
      dateRange,
      unit: 'points',
      today: '2026-09-04'
    });

    const byDate = new Map(burndown.days.map((d) => [d.date, d]));
    expect(byDate.get('2026-08-31')?.remaining).toBe(10);
    expect(byDate.get('2026-08-31')?.scope).toBe(10);
    expect(byDate.get('2026-09-04')?.remaining).toBe(14);
    expect(byDate.get('2026-09-04')?.scope).toBe(14);
  });

  it('fait descendre le reste quand un ticket est terminé, sans changer le périmètre', () => {
    const burndown = buildFaithfulBurndown({
      chart: chart({
        '2026-08-31T09:30:40.000Z': [{ key: 'A-1', added: true, statC: { newValue: 10 } }],
        '2026-09-02T16:00:00.000Z': [{ key: 'A-1', column: { done: true, notDone: false } }]
      }),
      dateRange,
      unit: 'points',
      today: '2026-09-02'
    });

    const byDate = new Map(burndown.days.map((d) => [d.date, d]));
    expect(byDate.get('2026-09-01')?.remaining).toBe(10);
    expect(byDate.get('2026-09-02')?.remaining).toBe(0);
    expect(byDate.get('2026-09-02')?.scope).toBe(10);
  });

  it('fait descendre reste et périmètre quand un ticket est retiré du sprint', () => {
    const burndown = buildFaithfulBurndown({
      chart: chart({
        '2026-08-31T09:30:40.000Z': [
          { key: 'A-1', added: true, statC: { newValue: 5 } },
          { key: 'A-2', added: true, statC: { newValue: 5 } }
        ],
        '2026-09-03T11:00:00.000Z': [{ key: 'A-2', added: false }]
      }),
      dateRange,
      unit: 'points',
      today: '2026-09-03'
    });

    const byDate = new Map(burndown.days.map((d) => [d.date, d]));
    expect(byDate.get('2026-09-02')?.remaining).toBe(10);
    expect(byDate.get('2026-09-03')?.remaining).toBe(5);
    expect(byDate.get('2026-09-03')?.scope).toBe(5);
  });

  it('compte 1 par ticket en unité tickets, indépendamment des story points', () => {
    const burndown = buildFaithfulBurndown({
      chart: chart({
        '2026-08-31T09:30:40.000Z': [
          { key: 'Q-1', added: true, statC: { newValue: 8 } },
          { key: 'Q-2', added: true }
        ],
        '2026-09-01T10:00:00.000Z': [{ key: 'Q-3', added: true }],
        '2026-09-01T15:00:00.000Z': [{ key: 'Q-1', column: { done: true } }]
      }),
      dateRange,
      unit: 'tickets',
      today: '2026-09-01'
    });

    const byDate = new Map(burndown.days.map((d) => [d.date, d]));
    expect(byDate.get('2026-08-31')?.remaining).toBe(2);
    expect(byDate.get('2026-09-01')?.scope).toBe(3);
    expect(byDate.get('2026-09-01')?.remaining).toBe(2);
  });

  it('fige la guideline sur le périmètre de début, pas sur les ajouts ultérieurs', () => {
    const burndown = buildFaithfulBurndown({
      chart: chart({
        '2026-08-31T09:30:40.000Z': [{ key: 'A-1', added: true, statC: { newValue: 10 } }],
        '2026-09-04T10:00:00.000Z': [{ key: 'A-2', added: true, statC: { newValue: 20 } }]
      }),
      dateRange,
      unit: 'points',
      today: '2026-09-13'
    });

    // 10 SP sur les jours ouvrés du 31/08 au 13/09 ; l'ajout du 4 ne change pas l'idéal.
    expect(burndown.days[0].ideal).toBeLessThan(10);
    expect(burndown.days[0].ideal).toBeGreaterThan(8);
    const late = burndown.days.find((d) => d.date === '2026-09-04');
    expect(late?.remaining).toBe(30);
    expect(late?.ideal).toBeLessThan(10);
  });

  it('laisse les jours à venir sans reste à faire', () => {
    const burndown = buildFaithfulBurndown({
      chart: chart({
        '2026-08-31T09:30:40.000Z': [{ key: 'A-1', added: true, statC: { newValue: 5 } }]
      }),
      dateRange,
      unit: 'points',
      today: '2026-09-02'
    });

    expect(burndown.days.find((d) => d.date === '2026-09-02')?.remaining).toBe(5);
    expect(burndown.days.find((d) => d.date === '2026-09-03')?.remaining).toBeNull();
  });

  it('rejoue l\'historique antérieur au sprint (points déjà connus à l\'ajout)', () => {
    const burndown = buildFaithfulBurndown({
      chart: chart({
        '2026-06-01T10:00:00.000Z': [{ key: 'A-1', statC: { newValue: 8 } }],
        '2026-08-31T09:30:40.000Z': [{ key: 'A-1', added: true }]
      }),
      dateRange,
      unit: 'points',
      today: '2026-08-31'
    });

    expect(burndown.days[0].remaining).toBe(8);
  });
});
