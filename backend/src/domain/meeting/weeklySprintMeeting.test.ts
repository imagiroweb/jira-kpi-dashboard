/**
 * TU — Logique pure du point hebdo : structure par défaut, reconduction, validation.
 */
import {
  buildDefaultMeeting,
  buildNextMeetingDraft,
  createMeetingRowId,
  DEFAULT_DEV_METRIC_LABELS,
  DEFAULT_QA_METRIC_LABELS,
  parseWeeklyMeetingPatch,
  WeeklyMeetingDraft,
} from './weeklySprintMeeting';

describe('buildDefaultMeeting', () => {
  it('crée un point avec une équipe Dev et une équipe QA et leurs indicateurs par défaut', () => {
    const meeting = buildDefaultMeeting('2026-09-08');

    expect(meeting.sprint).toEqual({ name: 'Sprint', number: '1', goal: '', date: '2026-09-08' });
    expect(meeting.teams).toHaveLength(2);
    expect(meeting.teams[0].role).toBe('dev');
    expect(meeting.teams[1].role).toBe('qa');
    expect(meeting.teams[0].metrics.map((m) => m.label)).toEqual([...DEFAULT_DEV_METRIC_LABELS]);
    expect(meeting.teams[1].metrics.map((m) => m.label)).toEqual([...DEFAULT_QA_METRIC_LABELS]);
  });

  it('démarre avec toutes les sections vides', () => {
    const meeting = buildDefaultMeeting('2026-09-08');

    expect(meeting.blockers).toEqual([]);
    expect(meeting.interactions).toEqual([]);
    expect(meeting.actions).toEqual([]);
    expect(meeting.retro).toEqual({ keep: [], stop: [], try: [] });
  });
});

describe('createMeetingRowId', () => {
  it('génère des identifiants uniques', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createMeetingRowId()));
    expect(ids.size).toBe(200);
  });
});

describe('buildNextMeetingDraft', () => {
  function previousMeeting(): WeeklyMeetingDraft {
    return {
      sprint: { name: 'Sprint', number: '12', goal: 'Livrer la facturation', date: '2026-09-01' },
      teams: [
        {
          id: 't1',
          name: 'Équipe Dev',
          role: 'dev',
          boardId: 7,
          metrics: [
            { id: 'm1', label: 'Points engagés', value: '30', target: '35', source: 'jira' },
            { id: 'm2', label: 'Bugs ouverts', value: '4', target: '', source: 'manual' },
          ],
        },
      ],
      blockers: [
        { id: 'b1', severity: 'Critique', text: 'Env. de recette KO', need: 'Ops', owner: 'Léa', resolved: false },
      ],
      interactions: [{ id: 'i1', from: 'Dev', to: 'QA', subject: 'Build', status: 'En cours' }],
      retro: { keep: [{ id: 'r1', text: 'Daily efficace' }], stop: [], try: [] },
      actions: [
        { id: 'a1', text: 'Automatiser le déploiement', owner: 'Sam', due: '2026-09-15', status: 'En cours' },
        { id: 'a2', text: 'Documenter la recette', owner: 'Léa', due: '', status: 'Fait' },
        { id: 'a3', text: 'Revoir les estimations', owner: '', due: '', status: 'À faire' },
      ],
    };
  }

  it('incrémente le numéro de sprint et vide l\'objectif', () => {
    const next = buildNextMeetingDraft(previousMeeting(), '2026-09-08');

    expect(next.sprint).toEqual({ name: 'Sprint', number: '13', goal: '', date: '2026-09-08' });
  });

  it('conserve le numéro tel quel s\'il n\'est pas numérique', () => {
    const previous = previousMeeting();
    previous.sprint.number = 'PI-4';

    expect(buildNextMeetingDraft(previous, '2026-09-08').sprint.number).toBe('PI-4');
  });

  it('reconduit les équipes, les libellés et les cibles mais remet les valeurs à zéro', () => {
    const next = buildNextMeetingDraft(previousMeeting(), '2026-09-08');

    expect(next.teams).toHaveLength(1);
    expect(next.teams[0].name).toBe('Équipe Dev');
    expect(next.teams[0].boardId).toBe(7);
    expect(next.teams[0].metrics.map((m) => [m.label, m.value, m.target])).toEqual([
      ['Points engagés', '', '35'],
      ['Bugs ouverts', '', ''],
    ]);
  });

  it('ne reconduit que les actions non terminées', () => {
    const next = buildNextMeetingDraft(previousMeeting(), '2026-09-08');

    expect(next.actions.map((a) => a.text)).toEqual([
      'Automatiser le déploiement',
      'Revoir les estimations',
    ]);
  });

  it('repart de zéro sur les blocages, interactions et rétro', () => {
    const next = buildNextMeetingDraft(previousMeeting(), '2026-09-08');

    expect(next.blockers).toEqual([]);
    expect(next.interactions).toEqual([]);
    expect(next.retro).toEqual({ keep: [], stop: [], try: [] });
  });

  it('régénère des identifiants distincts de ceux du point précédent', () => {
    const previous = previousMeeting();
    const next = buildNextMeetingDraft(previous, '2026-09-08');

    expect(next.teams[0].id).not.toBe(previous.teams[0].id);
    expect(next.teams[0].metrics[0].id).not.toBe(previous.teams[0].metrics[0].id);
    expect(next.actions[0].id).not.toBe(previous.actions[0].id);
  });
});

describe('parseWeeklyMeetingPatch', () => {
  it('ne retourne que les sections présentes dans le corps de la requête', () => {
    const patch = parseWeeklyMeetingPatch({
      actions: [{ id: 'a1', text: 'Faire X', owner: 'Sam', due: '2026-09-15', status: 'En cours' }],
    });

    expect(patch).toEqual({
      actions: [{ id: 'a1', text: 'Faire X', owner: 'Sam', due: '2026-09-15', status: 'En cours' }],
    });
  });

  it('accepte un sprint complet', () => {
    const patch = parseWeeklyMeetingPatch({
      sprint: { name: 'Sprint', number: '13', goal: 'Objectif', date: '2026-09-08' },
    });

    expect(patch?.sprint).toEqual({
      name: 'Sprint',
      number: '13',
      goal: 'Objectif',
      date: '2026-09-08',
    });
  });

  it('applique les valeurs par défaut des champs absents', () => {
    const patch = parseWeeklyMeetingPatch({ blockers: [{ id: 'b1' }] });

    expect(patch?.blockers).toEqual([
      { id: 'b1', severity: 'Moyen', text: '', need: '', owner: '', resolved: false },
    ]);
  });

  it('accepte une échéance d\'action vide mais refuse une date mal formée', () => {
    expect(parseWeeklyMeetingPatch({ actions: [{ id: 'a1', due: '' }] })?.actions?.[0].due).toBe('');
    expect(parseWeeklyMeetingPatch({ actions: [{ id: 'a1', due: '15/09/2026' }] })).toBeNull();
  });

  it('refuse un corps vide, non objet ou sans section connue', () => {
    expect(parseWeeklyMeetingPatch(null)).toBeNull();
    expect(parseWeeklyMeetingPatch('nope')).toBeNull();
    expect(parseWeeklyMeetingPatch([])).toBeNull();
    expect(parseWeeklyMeetingPatch({})).toBeNull();
    expect(parseWeeklyMeetingPatch({ inconnu: true })).toBeNull();
  });

  it('refuse les valeurs hors énumération', () => {
    expect(parseWeeklyMeetingPatch({ blockers: [{ id: 'b1', severity: 'Bloquant' }] })).toBeNull();
    expect(parseWeeklyMeetingPatch({ interactions: [{ id: 'i1', status: 'Fini' }] })).toBeNull();
    expect(parseWeeklyMeetingPatch({ actions: [{ id: 'a1', status: 'Terminé' }] })).toBeNull();
    expect(parseWeeklyMeetingPatch({ teams: [{ id: 't1', role: 'ops' }] })).toBeNull();
  });

  it('refuse une ligne sans identifiant ou un texte trop long', () => {
    expect(parseWeeklyMeetingPatch({ actions: [{ text: 'sans id' }] })).toBeNull();
    expect(parseWeeklyMeetingPatch({ actions: [{ id: 'a1', text: 'x'.repeat(2001) }] })).toBeNull();
  });

  it('refuse une section trop volumineuse', () => {
    const actions = Array.from({ length: 201 }, (_, i) => ({ id: `a${i}` }));

    expect(parseWeeklyMeetingPatch({ actions })).toBeNull();
  });

  it('normalise la rétro sur ses trois colonnes', () => {
    const patch = parseWeeklyMeetingPatch({ retro: { keep: [{ id: 'r1', text: 'ok' }] } });

    expect(patch?.retro).toEqual({ keep: [{ id: 'r1', text: 'ok' }], stop: [], try: [] });
  });
});
