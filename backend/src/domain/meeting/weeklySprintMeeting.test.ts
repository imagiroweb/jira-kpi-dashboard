/**
 * TU — Logique pure du point hebdo : structure par défaut, reconduction, validation.
 */
import {
  applyMeetingPatch,
  buildDefaultMeeting,
  buildNextMeetingDraft,
  createMeetingRowId,
  DEFAULT_DEV_METRIC_LABELS,
  DEFAULT_QA_METRIC_LABELS,
  mergeMeetingRows,
  parseWeeklyMeetingPatch,
  stampMeetingPatchAuthors,
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
        { id: 'b2', severity: 'Faible', text: 'Doc à jour', need: '', owner: '', resolved: true },
      ],
      interactions: [
        { id: 'i1', from: 'Dev', to: 'QA', subject: 'Build', status: 'En cours' },
        { id: 'i2', from: 'QA', to: 'Dev', subject: 'Specs validées', status: 'OK' },
      ],
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

  it('ne reconduit que les blocages non levés', () => {
    const next = buildNextMeetingDraft(previousMeeting(), '2026-09-08');

    expect(next.blockers.map((b) => [b.text, b.resolved, b.severity, b.need, b.owner])).toEqual([
      ['Env. de recette KO', false, 'Critique', 'Ops', 'Léa'],
    ]);
  });

  it('reconduit l\'auteur du blocage non levé', () => {
    const previous = previousMeeting();
    previous.blockers[0].createdBy = { id: 'u1', name: 'lea' };

    expect(buildNextMeetingDraft(previous, '2026-09-08').blockers[0].createdBy).toEqual({
      id: 'u1',
      name: 'lea',
    });
  });

  it('ne reconduit que les interactions non OK', () => {
    const next = buildNextMeetingDraft(previousMeeting(), '2026-09-08');

    expect(next.interactions.map((i) => [i.from, i.to, i.subject, i.status])).toEqual([
      ['Dev', 'QA', 'Build', 'En cours'],
    ]);
  });

  it('repart de zéro sur la rétro', () => {
    const next = buildNextMeetingDraft(previousMeeting(), '2026-09-08');

    expect(next.retro).toEqual({ keep: [], stop: [], try: [] });
  });

  it('régénère des identifiants distincts de ceux du point précédent', () => {
    const previous = previousMeeting();
    const next = buildNextMeetingDraft(previous, '2026-09-08');

    expect(next.teams[0].id).not.toBe(previous.teams[0].id);
    expect(next.teams[0].metrics[0].id).not.toBe(previous.teams[0].metrics[0].id);
    expect(next.actions[0].id).not.toBe(previous.actions[0].id);
    expect(next.blockers[0].id).not.toBe(previous.blockers[0].id);
    expect(next.interactions[0].id).not.toBe(previous.interactions[0].id);
  });
});

describe('parseWeeklyMeetingPatch', () => {
  it('ne retourne que les sections présentes dans le corps de la requête', () => {
    const patch = parseWeeklyMeetingPatch({
      actions: [{ id: 'a1', text: 'Faire X', owner: 'Sam', due: '2026-09-15', status: 'En cours' }],
    });

    expect(patch).toEqual({
      actions: {
        upsert: [{ id: 'a1', text: 'Faire X', owner: 'Sam', due: '2026-09-15', status: 'En cours' }],
        remove: [],
      },
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

    expect(patch?.blockers).toEqual({
      upsert: [{ id: 'b1', severity: 'Moyen', text: '', need: '', owner: '', resolved: false }],
      remove: [],
    });
  });

  it('accepte une échéance d\'action vide mais refuse une date mal formée', () => {
    expect(parseWeeklyMeetingPatch({ actions: [{ id: 'a1', due: '' }] })?.actions?.upsert[0].due).toBe('');
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

    expect(patch?.retro).toEqual({
      keep: { upsert: [{ id: 'r1', text: 'ok' }], remove: [] },
      stop: { upsert: [], remove: [] },
      try: { upsert: [], remove: [] },
    });
  });

  it('accepte le format ops upsert/remove', () => {
    const patch = parseWeeklyMeetingPatch({
      blockers: { upsert: [{ id: 'b3', text: 'Nouveau' }], remove: ['b1'] },
    });

    expect(patch?.blockers).toEqual({
      upsert: [
        { id: 'b3', severity: 'Moyen', text: 'Nouveau', need: '', owner: '', resolved: false },
      ],
      remove: ['b1'],
    });
  });
});

describe('mergeMeetingRows', () => {
  const row = (id: string, text: string) => ({ id, text });

  it('ajoute les nouvelles lignes à la fin sans retirer les absentes', () => {
    expect(
      mergeMeetingRows([row('a', 'A'), row('b', 'B')], { upsert: [row('c', 'C')], remove: [] })
    ).toEqual([row('a', 'A'), row('b', 'B'), row('c', 'C')]);
  });

  it('remplace une ligne existante et retire uniquement les ids demandés', () => {
    expect(
      mergeMeetingRows([row('a', 'A'), row('b', 'B'), row('c', 'C')], {
        upsert: [row('b', 'B2')],
        remove: ['c'],
      })
    ).toEqual([row('a', 'A'), row('b', 'B2')]);
  });
});

describe('applyMeetingPatch', () => {
  it('conserve les blocages non envoyés quand on n\'upsert qu\'une ligne', () => {
    const current = buildDefaultMeeting('2026-09-08');
    current.blockers = [
      { id: 'b1', severity: 'Critique', text: 'Env. KO', need: 'Ops', owner: 'Léa', resolved: false },
    ];

    const next = applyMeetingPatch(current, {
      blockers: {
        upsert: [
          { id: 'b2', severity: 'Moyen', text: 'Accès', need: '', owner: 'Sam', resolved: false },
        ],
        remove: [],
      },
    });

    expect(next.blockers.map((blocker) => blocker.id)).toEqual(['b1', 'b2']);
  });
});

describe('stampMeetingPatchAuthors', () => {
  it('pose createdBy sur une nouvelle ligne et le conserve à l\'édition', () => {
    const current = buildDefaultMeeting('2026-09-08');
    current.blockers = [
      {
        id: 'b1',
        severity: 'Moyen',
        text: 'Existant',
        need: '',
        owner: '',
        resolved: false,
        createdBy: { id: 'u1', name: 'lea' },
      },
    ];

    const stamped = stampMeetingPatchAuthors(
      current,
      {
        blockers: {
          upsert: [
            { id: 'b1', severity: 'Moyen', text: 'Existant v2', need: '', owner: '', resolved: false },
            { id: 'b2', severity: 'Faible', text: 'Nouveau', need: '', owner: '', resolved: false },
          ],
          remove: [],
        },
      },
      { id: 'u2', name: 'sam' }
    );

    expect(stamped.blockers?.upsert[0].createdBy).toEqual({ id: 'u1', name: 'lea' });
    expect(stamped.blockers?.upsert[0].updatedBy).toEqual({ id: 'u2', name: 'sam' });
    expect(stamped.blockers?.upsert[1].createdBy).toEqual({ id: 'u2', name: 'sam' });
  });
});
