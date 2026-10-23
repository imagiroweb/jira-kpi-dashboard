import type { WipSettings, WipWeek, WipWeeklyData } from '@/domain/wipChart';

/** Réglages de test : Brigade seuil 12, Supply seuil 9. Choco a des devs mais n'entre pas dans le seuil. */
export const WIP_SETTINGS: WipSettings = {
  startStatuses: ['In Progress'],
  endStatuses: ['Go Prod'],
  defaultMaxPerDev: 3,
  teams: [
    { team: 'Brigade', devCount: 4, maxPerDev: null },
    { team: 'Supply', devCount: 3, maxPerDev: 3 },
    { team: 'Choco', devCount: 2, maxPerDev: null },
  ],
};

export const WIP_TEAMS = ['Brigade', 'Supply', 'Choco', 'Sans équipe'];

const week = (weekStart: string, weekEnd: string, counts: Record<string, [number, number]>): WipWeek => {
  const byTeam: WipWeek['byTeam'] = {};
  const total = { wip: 0, done: 0 };
  for (const team of WIP_TEAMS) {
    const [wip, done] = counts[team] ?? [0, 0];
    byTeam[team] = { wip, done };
    total.wip += wip;
    total.done += done;
  }
  return { weekStart, weekEnd, total, byTeam };
};

/** 12 semaines du lundi 2026-08-03 au dimanche 2026-10-25 ; la semaine du 2026-09-07 est absente. */
export const WIP_DATA: WipWeeklyData = {
  from: '2026-08-03',
  to: '2026-10-25',
  teams: WIP_TEAMS,
  projectKeys: ['AD'],
  ticketCount: 42,
  settings: WIP_SETTINGS,
  weeks: [
    week('2026-08-03', '2026-08-09', { Brigade: [5, 2], Supply: [4, 1], Choco: [2, 0], 'Sans équipe': [1, 0] }),
    week('2026-08-10', '2026-08-16', { Brigade: [13, 4] }),
    week('2026-08-17', '2026-08-23', { Brigade: [12, 1] }),
    week('2026-08-24', '2026-08-30', {}),
    week('2026-08-31', '2026-09-06', { Brigade: [3, 1] }),
    week('2026-09-14', '2026-09-20', {}),
    week('2026-09-21', '2026-09-27', {}),
    week('2026-09-28', '2026-10-04', {}),
    week('2026-10-05', '2026-10-11', {}),
    week('2026-10-12', '2026-10-18', {}),
    week('2026-10-19', '2026-10-25', { Brigade: [6, 2], Supply: [2, 1] }),
  ],
};
