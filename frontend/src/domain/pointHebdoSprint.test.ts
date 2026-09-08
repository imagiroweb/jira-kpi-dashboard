import { describe, expect, it } from 'vitest';
import {
  applyPrefillToTeams,
  buildMeetingReport,
  computeBoardPrefill,
  computeMetricProgress,
  computePhaseRemainingSeconds,
  createAction,
  createTeam,
  formatMeetingClock,
  MEETING_PHASES,
  MEETING_TOTAL_BUDGET_SECONDS,
  parseMetricNumber,
  type MeetingTeam,
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
