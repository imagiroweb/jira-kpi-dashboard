import {
  buildSupportTicketTimeline,
  resolveSupportTimelineRange,
} from './supportTicketTimeline';

describe('resolveSupportTimelineRange', () => {
  it('clamp la fin du sprint actif à aujourd’hui', () => {
    expect(
      resolveSupportTimelineRange({
        apiRange: { from: '2026-09-01', to: '2026-09-30' },
        useActiveSprint: true,
        selectedRange: { from: '2026-01-01', to: '2026-01-31' },
        today: '2026-09-17',
      })
    ).toEqual({ from: '2026-09-01', to: '2026-09-17' });
  });

  it('utilise from/to de la page en période personnalisée si l’API n’envoie pas dateRange', () => {
    expect(
      resolveSupportTimelineRange({
        apiRange: null,
        useActiveSprint: false,
        selectedRange: { from: '2026-03-01', to: '2026-03-10' },
        today: '2026-09-17',
      })
    ).toEqual({ from: '2026-03-01', to: '2026-03-10' });
  });
});

describe('buildSupportTicketTimeline', () => {
  const range = { from: '2026-04-01', to: '2026-04-03' };

  it('remplit tous les jours de la plage, y compris les zéros', () => {
    const points = buildSupportTicketTimeline([], range);
    expect(points.map((p) => p.date)).toEqual(['2026-04-01', '2026-04-02', '2026-04-03']);
    expect(points.every((p) => p.created === 0 && p.resolved === 0)).toBe(true);
  });

  it('ignore les créations / résolutions hors plage', () => {
    const points = buildSupportTicketTimeline(
      [
        { created: '2026-03-01T08:00:00.000Z', resolved: '2026-04-02T10:00:00.000Z', ponderation: 12 },
        { created: '2026-04-01T09:00:00.000Z', resolved: '2026-05-01T10:00:00.000Z', ponderation: 5 },
      ],
      range
    );
    expect(points).toEqual([
      expect.objectContaining({ date: '2026-04-01', created: 1, resolved: 0, ponderation: 5 }),
      expect.objectContaining({ date: '2026-04-02', created: 0, resolved: 1, ponderation: 0 }),
      expect.objectContaining({ date: '2026-04-03', created: 0, resolved: 0, ponderation: 0 }),
    ]);
  });
});
