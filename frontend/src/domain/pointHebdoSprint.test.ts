import { describe, expect, it } from 'vitest';
import {
  applyPrefillToTeams,
  buildMeetingReport,
  computeBoardPrefill,
  computeBoardPrefillTargets,
  computeMetricProgress,
  computePhaseRemainingSeconds,
  computeTeamBurndown,
  createAction,
  createTeam,
  findEngagedPointsValue,
  formatMeetingClock,
  getMetricTargetMode,
  isWorkingDay,
  listDaysInclusive,
  MEETING_PHASES,
  MEETING_TOTAL_BUDGET_SECONDS,
  parseMetricNumber,
  readResolvedPointsForSeries,
  type MeetingMetric,
  type MeetingTeam,
  type ResolvedByDayResult,
  type SprintBoardResult,
  type WeeklyMeeting,
} from './pointHebdoSprint';

describe('MEETING_PHASES', () => {
  it('couvre une séance de 60 minutes en quatre temps', () => {
    expect(MEETING_PHASES).toHaveLength(4);
    expect(MEETING_TOTAL_BUDGET_SECONDS).toBe(60 * 60);
  });
});

describe('formatMeetingClock', () => {
  it('formate en MM:SS', () => {
    expect(formatMeetingClock(0)).toBe('00:00');
    expect(formatMeetingClock(65)).toBe('01:05');
    expect(formatMeetingClock(1200)).toBe('20:00');
  });

  it('préfixe d\'un signe moins en cas de dépassement', () => {
    expect(formatMeetingClock(-1)).toBe('-00:01');
    expect(formatMeetingClock(-125)).toBe('-02:05');
  });
});

describe('computePhaseRemainingSeconds', () => {
  it('décompte le budget de la phase courante', () => {
    expect(computePhaseRemainingSeconds(0, 0, 0)).toBe(20 * 60);
    expect(computePhaseRemainingSeconds(0, 60, 0)).toBe(19 * 60);
  });

  it('repart du budget de la phase quand on en change en cours de séance', () => {
    // Phase 2 (15 min) démarrée à 20 min de séance, on en est à 25 min.
    expect(computePhaseRemainingSeconds(1, 25 * 60, 20 * 60)).toBe(10 * 60);
  });

  it('devient négatif quand le budget est dépassé', () => {
    expect(computePhaseRemainingSeconds(0, 25 * 60, 0)).toBe(-5 * 60);
  });

  it('retourne 0 pour une phase inconnue', () => {
    expect(computePhaseRemainingSeconds(42, 0, 0)).toBe(0);
  });
});

describe('parseMetricNumber', () => {
  it('accepte les entiers, décimaux et la virgule', () => {
    expect(parseMetricNumber('12')).toBe(12);
    expect(parseMetricNumber('12.5')).toBe(12.5);
    expect(parseMetricNumber('12,5')).toBe(12.5);
  });

  it('retourne null sur une saisie vide ou non numérique', () => {
    expect(parseMetricNumber('')).toBeNull();
    expect(parseMetricNumber('   ')).toBeNull();
    expect(parseMetricNumber('n/a')).toBeNull();
  });
});

describe('computeMetricProgress', () => {
  it('calcule l\'avancement vers la cible', () => {
    expect(computeMetricProgress('15', '30')).toBe(50);
  });

  it('borne le résultat à 100 %', () => {
    expect(computeMetricProgress('60', '30')).toBe(100);
  });

  it('retourne null sans cible exploitable', () => {
    expect(computeMetricProgress('15', '')).toBeNull();
    expect(computeMetricProgress('15', '0')).toBeNull();
    expect(computeMetricProgress('', '30')).toBeNull();
  });
});

describe('computeBoardPrefill', () => {
  const board: SprintBoardResult = {
    boardId: 7,
    statusCounts: { total: 12, todo: 3, inProgress: 4, qa: 2, resolved: 3 },
    storyPointsByStatus: { total: 34, todo: 8, inProgress: 12, qa: 5, resolved: 9 },
    issues: [
      { issueType: 'Bug', statusCategoryKey: 'indeterminate' },
      { issueType: 'Bogue', statusCategoryKey: 'new' },
      { issueType: 'Bug', statusCategoryKey: 'done' },
      { issueType: 'Story', statusCategoryKey: 'new' },
    ],
  };

  it('mappe les chiffres du sprint sur les libellés d\'indicateurs', () => {
    const prefill = computeBoardPrefill(board);

    expect(prefill['points engages']).toBe('34');
    expect(prefill['points realises']).toBe('9');
    expect(prefill['tickets en cours']).toBe('4');
    expect(prefill['tickets termines']).toBe('3');
    expect(prefill['tickets en qa']).toBe('2');
  });

  it('compte les bugs ouverts hors bugs terminés', () => {
    const prefill = computeBoardPrefill(board);

    expect(prefill['bugs ouverts']).toBe('2');
    expect(prefill['bugs detectes']).toBe('3');
  });

  it('tombe à zéro sur un board sans données', () => {
    expect(computeBoardPrefill({ boardId: 1 })['points engages']).toBe('0');
  });
});

describe('computeBoardPrefillTargets', () => {
  it('suggère le nombre total de tickets comme cible de « Tickets terminés »', () => {
    const board: SprintBoardResult = {
      boardId: 7,
      statusCounts: { total: 12, todo: 3, inProgress: 4, qa: 2, resolved: 3 },
    };

    expect(computeBoardPrefillTargets(board)['tickets termines']).toBe('12');
  });

  it('tombe à zéro sur un board sans données', () => {
    expect(computeBoardPrefillTargets({ boardId: 1 })['tickets termines']).toBe('0');
  });
});

describe('getMetricTargetMode', () => {
  it('« Points réalisés » : cible dérivée des points engagés', () => {
    expect(getMetricTargetMode('Points réalisés')).toBe('auto-engaged-points');
  });

  it('« Tickets en cours » et « Bugs ouverts » : pas de cible', () => {
    expect(getMetricTargetMode('Tickets en cours')).toBe('hidden');
    expect(getMetricTargetMode('Bugs ouverts')).toBe('hidden');
  });

  it('les autres indicateurs (dont « Tickets terminés » et les personnalisés) restent en saisie libre', () => {
    expect(getMetricTargetMode('Tickets terminés')).toBe('manual');
    expect(getMetricTargetMode('Points engagés')).toBe('manual');
    expect(getMetricTargetMode('Nouvel indicateur')).toBe('manual');
  });

  it('ignore la casse et les accents', () => {
    expect(getMetricTargetMode('POINTS REALISES')).toBe('auto-engaged-points');
  });
});

describe('findEngagedPointsValue', () => {
  it('retourne la valeur de l\'indicateur « Points engagés » de l\'équipe', () => {
    const metrics: MeetingMetric[] = [
      { id: 'm1', label: 'Points engagés', value: '34', target: '', source: 'jira' },
      { id: 'm2', label: 'Points réalisés', value: '9', target: '', source: 'jira' },
    ];

    expect(findEngagedPointsValue(metrics)).toBe('34');
  });

  it('retourne une chaîne vide si l\'indicateur est absent', () => {
    expect(findEngagedPointsValue([])).toBe('');
  });
});

describe('applyPrefillToTeams', () => {
  const boards: SprintBoardResult[] = [
    {
      boardId: 7,
      statusCounts: { total: 12, todo: 3, inProgress: 4, qa: 2, resolved: 3 },
      storyPointsByStatus: { total: 34, todo: 8, inProgress: 12, qa: 5, resolved: 9 },
      issues: [],
    },
  ];

  function devTeam(overrides: Partial<MeetingTeam> = {}): MeetingTeam {
    return {
      id: 't1',
      name: 'Équipe Dev',
      role: 'dev',
      boardId: 7,
      metrics: [
        { id: 'm1', label: 'Points engagés', value: '', target: '', source: 'manual' },
        { id: 'm2', label: 'Cas de test exécutés', value: '', target: '', source: 'manual' },
      ],
      ...overrides,
    };
  }

  it('remplit les indicateurs reconnus et marque leur origine', () => {
    const [team] = applyPrefillToTeams([devTeam()], boards);

    expect(team.metrics[0]).toMatchObject({ value: '34', source: 'jira' });
  });

  it('laisse intacts les indicateurs sans équivalent Jira', () => {
    const [team] = applyPrefillToTeams([devTeam()], boards);

    expect(team.metrics[1]).toMatchObject({ value: '', source: 'manual' });
  });

  it('n\'écrase jamais une valeur saisie à la main', () => {
    const team = devTeam();
    team.metrics[0] = { ...team.metrics[0], value: '28' };

    const [result] = applyPrefillToTeams([team], boards);

    expect(result.metrics[0]).toMatchObject({ value: '28', source: 'manual' });
  });

  it('rafraîchit une valeur déjà issue de Jira', () => {
    const team = devTeam();
    team.metrics[0] = { ...team.metrics[0], value: '28', source: 'jira' };

    const [result] = applyPrefillToTeams([team], boards);

    expect(result.metrics[0].value).toBe('34');
  });

  it('ignore les équipes sans board associé ou dont le board est absent', () => {
    const withoutBoard = devTeam({ boardId: undefined });
    const unknownBoard = devTeam({ boardId: 999 });

    const [a, b] = applyPrefillToTeams([withoutBoard, unknownBoard], boards);

    expect(a.metrics[0].value).toBe('');
    expect(b.metrics[0].value).toBe('');
  });

  it('suggère la cible « Tickets terminés » depuis le total de tickets du board', () => {
    const team = devTeam({
      metrics: [{ id: 'm3', label: 'Tickets terminés', value: '', target: '', source: 'manual' }],
    });

    const [result] = applyPrefillToTeams([team], boards);

    expect(result.metrics[0]).toMatchObject({ value: '3', target: '12' });
  });

  it('n\'écrase jamais une cible déjà renseignée', () => {
    const team = devTeam({
      metrics: [{ id: 'm3', label: 'Tickets terminés', value: '', target: '10', source: 'manual' }],
    });

    const [result] = applyPrefillToTeams([team], boards);

    expect(result.metrics[0].target).toBe('10');
  });
});

describe('listDaysInclusive', () => {
  it('liste les jours bornes incluses', () => {
    expect(listDaysInclusive('2026-09-07', '2026-09-10')).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
    ]);
  });

  it('gère un intervalle d\'un seul jour', () => {
    expect(listDaysInclusive('2026-09-07', '2026-09-07')).toEqual(['2026-09-07']);
  });

  it('traverse un changement de mois', () => {
    expect(listDaysInclusive('2026-08-31', '2026-09-01')).toEqual(['2026-08-31', '2026-09-01']);
  });

  it('retourne une liste vide sur un intervalle inversé ou invalide', () => {
    expect(listDaysInclusive('2026-09-10', '2026-09-07')).toEqual([]);
    expect(listDaysInclusive('pas-une-date', '2026-09-07')).toEqual([]);
  });
});

describe('isWorkingDay', () => {
  it('reconnaît les jours ouvrés et le week-end', () => {
    expect(isWorkingDay('2026-09-07')).toBe(true); // lundi
    expect(isWorkingDay('2026-09-11')).toBe(true); // vendredi
    expect(isWorkingDay('2026-09-12')).toBe(false); // samedi
    expect(isWorkingDay('2026-09-13')).toBe(false); // dimanche
  });
});

describe('readResolvedPointsForSeries', () => {
  it('lit les séries nommées par équipe', () => {
    const row = { date: '2026-09-07', 'Board Dev': 3, 'Board Dev_points': 8 };

    expect(readResolvedPointsForSeries(row, 'Board Dev', 7)).toBe(8);
  });

  it('retombe sur les séries par board du format historique', () => {
    const row = { date: '2026-09-07', board_7: 5 };

    expect(readResolvedPointsForSeries(row, 'Board Dev', 7)).toBe(5);
  });

  it('retourne 0 quand la série est absente', () => {
    expect(readResolvedPointsForSeries({ date: '2026-09-07' }, 'Board Dev', 7)).toBe(0);
    expect(readResolvedPointsForSeries({ date: '2026-09-07', board_7: 5 }, 'Board Dev')).toBe(0);
  });
});

describe('computeTeamBurndown', () => {
  // Sprint du lundi 7 au vendredi 18 septembre 2026 : 10 jours ouvrés sur 12 jours.
  const dateRange = { from: '2026-09-07', to: '2026-09-18' };

  function resolvedWith(pointsByDate: Record<string, number>): ResolvedByDayResult {
    return {
      dateRange,
      byDay: listDaysInclusive(dateRange.from, dateRange.to).map((date) => ({
        date,
        'Board Dev_points': pointsByDate[date] ?? 0,
      })),
    };
  }

  it('part du périmètre et retire le cumul des points résolus', () => {
    const burndown = computeTeamBurndown({
      scopePoints: 40,
      seriesName: 'Board Dev',
      resolved: resolvedWith({ '2026-09-07': 5, '2026-09-08': 3 }),
      today: '2026-09-09',
    });

    expect(burndown?.days.slice(0, 3).map((d) => d.remaining)).toEqual([35, 32, 32]);
    expect(burndown?.completedPoints).toBe(8);
    expect(burndown?.remainingPoints).toBe(32);
  });

  it('laisse les jours à venir sans valeur pour arrêter la courbe à aujourd\'hui', () => {
    const burndown = computeTeamBurndown({
      scopePoints: 40,
      seriesName: 'Board Dev',
      resolved: resolvedWith({ '2026-09-07': 5 }),
      today: '2026-09-08',
    });

    expect(burndown?.days[1].remaining).toBe(35);
    expect(burndown?.days[2].remaining).toBeNull();
    expect(burndown?.days.every((d) => typeof d.ideal === 'number')).toBe(true);
  });

  it('fait décroître la trajectoire idéale sur les jours ouvrés seulement', () => {
    const burndown = computeTeamBurndown({
      scopePoints: 40,
      seriesName: 'Board Dev',
      resolved: resolvedWith({}),
      today: '2026-09-18',
    });

    // 40 SP sur 10 jours ouvrés = 4 SP par jour ouvré ; le week-end ne fait rien descendre.
    const byDate = new Map(burndown?.days.map((d) => [d.date, d.ideal]));
    expect(byDate.get('2026-09-07')).toBe(36);
    expect(byDate.get('2026-09-11')).toBe(20);
    expect(byDate.get('2026-09-12')).toBe(20); // samedi
    expect(byDate.get('2026-09-13')).toBe(20); // dimanche
    expect(byDate.get('2026-09-14')).toBe(16);
    expect(byDate.get('2026-09-18')).toBe(0);
  });

  it('mesure l\'écart à la trajectoire idéale', () => {
    const enAvance = computeTeamBurndown({
      scopePoints: 40,
      seriesName: 'Board Dev',
      resolved: resolvedWith({ '2026-09-07': 10 }),
      today: '2026-09-07',
    });
    const enRetard = computeTeamBurndown({
      scopePoints: 40,
      seriesName: 'Board Dev',
      resolved: resolvedWith({ '2026-09-07': 1 }),
      today: '2026-09-07',
    });

    expect(enAvance?.deltaPoints).toBe(6); // idéal 36, reste 30
    expect(enRetard?.deltaPoints).toBe(-3); // idéal 36, reste 39
  });

  it('se cale sur le dernier jour quand le sprint est terminé', () => {
    const burndown = computeTeamBurndown({
      scopePoints: 40,
      seriesName: 'Board Dev',
      resolved: resolvedWith({ '2026-09-07': 40 }),
      today: '2026-10-01',
    });

    expect(burndown?.remainingPoints).toBe(0);
    expect(burndown?.days.every((d) => d.remaining !== null)).toBe(true);
  });

  it('se cale sur le premier jour quand le sprint n\'a pas commencé', () => {
    const burndown = computeTeamBurndown({
      scopePoints: 40,
      seriesName: 'Board Dev',
      resolved: resolvedWith({}),
      today: '2026-09-01',
    });

    expect(burndown?.remainingPoints).toBe(40);
    expect(burndown?.days[1].remaining).toBeNull();
  });

  it('laisse la courbe passer sous zéro quand le périmètre a changé', () => {
    const burndown = computeTeamBurndown({
      scopePoints: 10,
      seriesName: 'Board Dev',
      resolved: resolvedWith({ '2026-09-07': 14 }),
      today: '2026-09-07',
    });

    expect(burndown?.remainingPoints).toBe(-4);
  });

  it('retourne null sans plage de dates exploitable', () => {
    expect(
      computeTeamBurndown({ scopePoints: 40, seriesName: 'Board Dev', resolved: null })
    ).toBeNull();
    expect(
      computeTeamBurndown({
        scopePoints: 40,
        seriesName: 'Board Dev',
        resolved: { byDay: [], dateRange: { from: '', to: '' } },
      })
    ).toBeNull();
  });
});

describe('buildMeetingReport', () => {
  function meeting(overrides: Partial<WeeklyMeeting> = {}): WeeklyMeeting {
    return {
      id: 'meeting-1',
      sprint: { name: 'Sprint', number: '12', goal: 'Livrer la facturation', date: '2026-09-08' },
      teams: [
        {
          id: 't1',
          name: 'Équipe Dev',
          role: 'dev',
          metrics: [
            { id: 'm1', label: 'Points engagés', value: '34', target: '40', source: 'jira' },
            { id: 'm2', label: 'Bugs ouverts', value: '', target: '', source: 'manual' },
          ],
        },
      ],
      blockers: [
        {
          id: 'b1',
          severity: 'Critique',
          text: 'Env. de recette KO',
          need: 'Intervention Ops',
          owner: 'Léa',
          resolved: false,
        },
      ],
      interactions: [
        { id: 'i1', from: 'Dev', to: 'QA', subject: 'Build à livrer', status: 'En cours' },
      ],
      retro: {
        keep: [{ id: 'r1', text: 'Daily efficace' }],
        stop: [{ id: 'r2', text: '   ' }],
        try: [],
      },
      actions: [
        { id: 'a1', text: 'Automatiser le déploiement', owner: 'Sam', due: '2026-09-15', status: 'En cours' },
      ],
      ...overrides,
    };
  }

  it('ouvre sur le sprint et son objectif', () => {
    const report = buildMeetingReport(meeting());

    expect(report).toContain('# Sprint n°12 — point du 2026-09-08');
    expect(report).toContain('Objectif : Livrer la facturation');
  });

  it('liste les chiffres par équipe, cible incluse', () => {
    const report = buildMeetingReport(meeting());

    expect(report).toContain('- Équipe Dev (DEV)');
    expect(report).toContain('· Points engagés : 34 / 40');
    expect(report).toContain('· Bugs ouverts : —');
  });

  it('détaille les blocages avec sévérité, besoin et responsable', () => {
    const report = buildMeetingReport(meeting());

    expect(report).toContain(
      '- [Critique] Env. de recette KO → à lever : Intervention Ops (resp. Léa)'
    );
  });

  it('signale les blocages levés', () => {
    const base = meeting();
    const report = buildMeetingReport({
      ...base,
      blockers: [{ ...base.blockers[0], resolved: true }],
    });

    expect(report).toContain('- [Critique] (levé)');
  });

  it('reprend les interactions et les actions', () => {
    const report = buildMeetingReport(meeting());

    expect(report).toContain('- Dev → QA [En cours] : Build à livrer');
    expect(report).toContain('- [En cours] Automatiser le déploiement — Sam (2026-09-15)');
  });

  it('ignore les éléments de rétro vides', () => {
    const report = buildMeetingReport(meeting());

    expect(report).toContain('Continuer :');
    expect(report).toContain('- Daily efficace');
    expect(report).not.toContain('Arrêter :');
  });

  it('indique explicitement les sections vides', () => {
    const report = buildMeetingReport(
      meeting({ blockers: [], interactions: [], actions: [] })
    );

    expect(report).toContain('## Points bloquants\n- aucun');
    expect(report).toContain('## Interactions entre équipes\n- aucune');
    expect(report).toContain('Actions :\n- aucune');
  });
});

describe('fabriques de lignes', () => {
  it('crée une équipe QA avec ses indicateurs par défaut', () => {
    const team = createTeam('qa');

    expect(team.role).toBe('qa');
    expect(team.name).toBe('QA');
    expect(team.metrics.map((m) => m.label)).toContain('Cas de test exécutés');
  });

  it('crée des lignes avec des identifiants distincts', () => {
    expect(createAction().id).not.toBe(createAction().id);
  });
});
