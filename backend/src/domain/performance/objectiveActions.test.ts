import { IObjective } from './entities/PerformanceReview';
import {
  addObjectiveAction,
  isObjectiveActionOverdue,
  legacyCoachingActionId,
  migrateLegacyCoachingAction,
  removeObjectiveAction,
  summarizeObjectiveActions,
  updateObjectiveAction,
  MAX_ACTIONS_PER_OBJECTIVE
} from './objectiveActions';

const NOW = new Date('2026-09-24T10:00:00Z');
const LEAD = { id: 'lead-1', name: 'lead', role: 'lead' as const };
const SELF = { id: 'user-1', name: 'collab', role: 'collaborateur' as const };

function objective(overrides: Partial<IObjective> = {}): IObjective {
  return {
    id: 'obj-1',
    title: 'Delivery',
    weight: 1,
    krs: [],
    actions: [],
    selfAssessment: {},
    managerAssessment: {},
    ...overrides
  };
}

function withOneAction(status: 'a_faire' | 'en_cours' | 'termine' = 'a_faire') {
  const res = addObjectiveAction(objective(), { id: 'act-1', label: 'Pair-programming', status }, LEAD, NOW);
  if (!res.ok) throw new Error(res.message);
  return res.value.objective;
}

describe('migrateLegacyCoachingAction', () => {
  it("reprend l'ancien texte coachingAction en une action à faire et vide le champ", () => {
    const result = migrateLegacyCoachingAction(
      objective({ managerAssessment: { status: 'atteint', coachingAction: '  Suivre la formation  ' } }),
      NOW
    );
    expect(result.managerAssessment).toEqual({ status: 'atteint' });
    expect(result.actions).toHaveLength(1);
    expect(result.actions![0]).toMatchObject({
      id: legacyCoachingActionId('obj-1'),
      label: 'Suivre la formation',
      status: 'a_faire'
    });
  });

  it('ne fait rien si des actions existent déjà ou si le texte est vide', () => {
    const existing = withOneAction();
    const withLegacy = { ...existing, managerAssessment: { coachingAction: 'x' } };
    expect(migrateLegacyCoachingAction(withLegacy, NOW)).toBe(withLegacy);
    const empty = objective({ managerAssessment: { coachingAction: '   ' } });
    expect(migrateLegacyCoachingAction(empty, NOW)).toBe(empty);
  });
});

describe('addObjectiveAction', () => {
  it('ajoute une action à faire avec auteur, date et échéance', () => {
    const res = addObjectiveAction(
      objective(),
      { id: 'act-1', label: ' Revue de code ', dueDate: '2026-10-15' },
      LEAD,
      NOW
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.action).toMatchObject({ id: 'act-1', label: 'Revue de code', status: 'a_faire', createdBy: LEAD });
    expect(res.value.action.dueDate).toEqual(new Date('2026-10-15'));
    expect(res.value.objective.actions).toHaveLength(1);
  });

  it('refuse un libellé vide, une échéance invalide ou un statut inconnu', () => {
    expect(addObjectiveAction(objective(), { id: 'a', label: '  ' }, LEAD, NOW)).toMatchObject({ ok: false, status: 400 });
    expect(addObjectiveAction(objective(), { id: 'a', label: 'x', dueDate: 'demain' }, LEAD, NOW)).toMatchObject({
      ok: false,
      status: 400
    });
    expect(addObjectiveAction(objective(), { id: 'a', label: 'x', status: 'fini' }, LEAD, NOW)).toMatchObject({
      ok: false,
      status: 400
    });
  });

  it('plafonne le nombre d’actions par objectif', () => {
    const full = objective({
      actions: Array.from({ length: MAX_ACTIONS_PER_OBJECTIVE }, (_, i) => ({
        id: `a${i}`,
        label: 'x',
        status: 'a_faire' as const,
        createdBy: LEAD,
        createdAt: NOW
      }))
    });
    expect(addObjectiveAction(full, { id: 'new', label: 'x' }, LEAD, NOW)).toMatchObject({ ok: false, status: 400 });
  });

  it("conserve l'action reprise de l'ancien champ texte en plus de la nouvelle", () => {
    const res = addObjectiveAction(
      objective({ managerAssessment: { coachingAction: 'Ancienne action' } }),
      { id: 'act-2', label: 'Nouvelle' },
      LEAD,
      NOW
    );
    expect(res.ok && res.value.objective.actions!.map((a) => a.label)).toEqual(['Ancienne action', 'Nouvelle']);
  });
});

describe('updateObjectiveAction', () => {
  it('passe une action à terminé (completedAt) puis la rouvre (completedAt effacé)', () => {
    const done = updateObjectiveAction(withOneAction(), 'act-1', { status: 'termine' }, SELF, NOW, ['status']);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.value.action).toMatchObject({ status: 'termine', completedAt: NOW, updatedBy: SELF });

    const reopened = updateObjectiveAction(done.value.objective, 'act-1', { status: 'en_cours' }, SELF, NOW, ['status']);
    expect(reopened.ok && reopened.value.action.completedAt).toBeUndefined();
    expect(reopened.ok && reopened.value.action.status).toBe('en_cours');
  });

  it('interdit au collaborateur de modifier autre chose que le statut', () => {
    const res = updateObjectiveAction(withOneAction(), 'act-1', { label: 'Autre' }, SELF, NOW, ['status']);
    expect(res).toMatchObject({ ok: false, status: 400 });
  });

  it("permet au lead de changer le libellé et d'effacer l'échéance", () => {
    const withDue = addObjectiveAction(objective(), { id: 'act-1', label: 'x', dueDate: '2026-10-01' }, LEAD, NOW);
    if (!withDue.ok) throw new Error();
    const res = updateObjectiveAction(withDue.value.objective, 'act-1', { label: 'y', dueDate: null }, LEAD, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.action.label).toBe('y');
    expect(res.value.action.dueDate).toBeUndefined();
  });

  it('404 sur une action inconnue, 400 sans modification', () => {
    expect(updateObjectiveAction(withOneAction(), 'nope', { status: 'termine' }, LEAD, NOW)).toMatchObject({
      ok: false,
      status: 404
    });
    expect(updateObjectiveAction(withOneAction(), 'act-1', {}, LEAD, NOW)).toMatchObject({ ok: false, status: 400 });
  });

  it("peut cibler l'action reprise de l'ancien champ texte par son id stable", () => {
    const res = updateObjectiveAction(
      objective({ managerAssessment: { coachingAction: 'Legacy' } }),
      legacyCoachingActionId('obj-1'),
      { status: 'en_cours' },
      SELF,
      NOW,
      ['status']
    );
    expect(res.ok && res.value.action).toMatchObject({ label: 'Legacy', status: 'en_cours' });
  });
});

describe('removeObjectiveAction', () => {
  it('supprime une action existante, 404 sinon', () => {
    const res = removeObjectiveAction(withOneAction(), 'act-1', NOW);
    expect(res.ok && res.value.actions).toEqual([]);
    expect(removeObjectiveAction(withOneAction(), 'nope', NOW)).toMatchObject({ ok: false, status: 404 });
  });
});

describe('isObjectiveActionOverdue / summarizeObjectiveActions', () => {
  it("n'est en retard qu'après le jour d'échéance et si non terminée", () => {
    expect(isObjectiveActionOverdue({ status: 'a_faire', dueDate: new Date('2026-09-23') }, NOW)).toBe(true);
    expect(isObjectiveActionOverdue({ status: 'a_faire', dueDate: new Date('2026-09-24') }, NOW)).toBe(false);
    expect(isObjectiveActionOverdue({ status: 'termine', dueDate: new Date('2026-01-01') }, NOW)).toBe(false);
    expect(isObjectiveActionOverdue({ status: 'en_cours' }, NOW)).toBe(false);
  });

  it('compte les actions par statut, les retards et le taux de réalisation, legacy inclus', () => {
    const summary = summarizeObjectiveActions(
      [
        objective({
          actions: [
            { id: 'a', label: 'a', status: 'termine', createdBy: LEAD, createdAt: NOW },
            { id: 'b', label: 'b', status: 'en_cours', createdBy: LEAD, createdAt: NOW, dueDate: new Date('2026-09-01') },
            { id: 'c', label: 'c', status: 'a_faire', createdBy: LEAD, createdAt: NOW }
          ]
        }),
        objective({ id: 'obj-2', managerAssessment: { coachingAction: 'Legacy' } })
      ],
      NOW
    );
    expect(summary).toEqual({ total: 4, aFaire: 2, enCours: 1, termine: 1, overdue: 1, completionRate: 25 });
  });

  it('completionRate null sans action', () => {
    expect(summarizeObjectiveActions([objective()], NOW).completionRate).toBeNull();
  });
});
