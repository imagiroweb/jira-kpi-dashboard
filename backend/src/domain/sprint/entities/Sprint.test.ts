import { Sprint } from './Sprint';

describe('Sprint', () => {
  it('dateRange est null si une date manque', () => {
    const s = Sprint.create({
      id: 1,
      name: 'S',
      state: 'active',
      startDate: '2026-04-01',
      endDate: null,
      boardId: 1
    });
    expect(s.dateRange).toBeNull();
    expect(s.plannedDurationDays).toBeNull();
  });

  it('plannedDurationDays et progressPercent quand les deux bornes existent', () => {
    const s = Sprint.create({
      id: 2,
      name: 'S2',
      state: 'active',
      startDate: '2026-04-01',
      endDate: '2026-04-11',
      boardId: 1
    });
    expect(s.plannedDurationDays).toBe(10);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-06T12:00:00.000Z'));
    expect(s.elapsedDays).toBeGreaterThanOrEqual(5);
    expect(s.progressPercent).not.toBeNull();
    jest.useRealTimers();
  });

  it('actualDurationDays pour sprint fermé avec completeDate', () => {
    const s = Sprint.create({
      id: 3,
      name: 'S3',
      state: 'closed',
      startDate: '2026-04-01',
      endDate: '2026-04-15',
      completeDate: '2026-04-14',
      boardId: 1
    });
    expect(s.actualDurationDays).toBe(13);
    expect(s.isClosed).toBe(true);
    expect(s.isFuture).toBe(false);
  });

  it('remainingDays null si sprint non actif ou sans endDate', () => {
    const closed = Sprint.create({
      id: 4,
      name: 'S4',
      state: 'closed',
      startDate: '2026-04-01',
      endDate: '2026-04-10',
      boardId: 1
    });
    expect(closed.remainingDays).toBeNull();

    const activeNoEnd = Sprint.create({
      id: 5,
      name: 'S5',
      state: 'active',
      startDate: '2026-04-01',
      endDate: null,
      boardId: 1
    });
    expect(activeNoEnd.remainingDays).toBeNull();
  });

  it('isOverdue et progressPercent null si pas de durée planifiée', () => {
    const s = Sprint.create({
      id: 6,
      name: 'S6',
      state: 'future',
      boardId: 1
    });
    expect(s.isOverdue).toBe(false);
    expect(s.progressPercent).toBeNull();
  });

  it('equals compare les ids', () => {
    const a = Sprint.create({ id: 7, name: 'A', state: 'active', boardId: 1 });
    const b = Sprint.create({ id: 7, name: 'B', state: 'closed', boardId: 2 });
    const c = Sprint.create({ id: 8, name: 'C', state: 'active', boardId: 1 });
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('toJSON expose les champs principaux', () => {
    const s = Sprint.create({
      id: 9,
      name: 'S9',
      state: 'active',
      startDate: '2026-04-01T00:00:00.000Z',
      endDate: '2026-04-20T00:00:00.000Z',
      goal: 'G',
      boardId: 3
    });
    const j = s.toJSON() as Record<string, unknown>;
    expect(j.id).toBe(9);
    expect(j.goal).toBe('G');
    expect(j.boardId).toBe(3);
  });
});
