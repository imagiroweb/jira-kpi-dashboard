import {
  IObjective,
  IObjectiveAction,
  IReviewAuthor,
  OBJECTIVE_ACTION_STATUSES,
  ObjectiveActionStatus
} from './entities/PerformanceReview';

/**
 * Logique métier pure des "actions à mener" rattachées à un objectif (voir `IObjectiveAction`) :
 * création / modification / suppression par le lead ou le CTO, changement de statut par le
 * collaborateur, et agrégats affichés dans la synthèse (nombre d'actions, avancement, retards).
 * Aucune fonction ne mute ses arguments.
 */

export const MAX_ACTION_LABEL_LENGTH = 500;
export const MAX_ACTIONS_PER_OBJECTIVE = 20;

export function isObjectiveActionStatus(value: unknown): value is ObjectiveActionStatus {
  return typeof value === 'string' && (OBJECTIVE_ACTION_STATUSES as readonly string[]).includes(value);
}

/** Id stable de l'action issue de la reprise de l'ancien champ texte `coachingAction`. */
export function legacyCoachingActionId(objectiveId: string): string {
  return `act-legacy-${objectiveId}`;
}

/**
 * Reprise de l'ancien champ texte unique `managerAssessment.coachingAction` : s'il est renseigné
 * et que l'objectif n'a encore aucune action, il devient une action "à faire" (id stable, voir
 * `legacyCoachingActionId`, pour que le frontend puisse déjà l'afficher et la cibler avant cette
 * reprise) et le champ texte est vidé. Sans effet sinon.
 */
export function migrateLegacyCoachingAction(objective: IObjective, now: Date = new Date()): IObjective {
  const legacy = objective.managerAssessment?.coachingAction?.trim();
  if (!legacy || (objective.actions ?? []).length > 0) return objective;
  const { coachingAction: _dropped, ...managerAssessment } = objective.managerAssessment;
  return {
    ...objective,
    managerAssessment,
    actions: [
      {
        id: legacyCoachingActionId(objective.id),
        label: legacy,
        status: 'a_faire',
        createdBy: { id: 'legacy', name: 'Reprise action à suivre' },
        createdAt: now
      }
    ]
  };
}

export interface ObjectiveActionInput {
  label?: unknown;
  /** Date ISO ; `null` ou chaîne vide efface l'échéance (modification uniquement). */
  dueDate?: unknown;
  status?: unknown;
}

export type ActionResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 404; message: string };

function parseLabel(raw: unknown): ActionResult<string> {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, status: 400, message: "Le libellé de l'action est obligatoire" };
  }
  if (raw.trim().length > MAX_ACTION_LABEL_LENGTH) {
    return {
      ok: false,
      status: 400,
      message: `Le libellé de l'action ne doit pas dépasser ${MAX_ACTION_LABEL_LENGTH} caractères`
    };
  }
  return { ok: true, value: raw.trim() };
}

/** `undefined` = absent (ne pas toucher) ; `null` = effacer. */
function parseDueDate(raw: unknown): ActionResult<Date | null | undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string' && !(raw instanceof Date)) {
    return { ok: false, status: 400, message: "L'échéance de l'action est invalide" };
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, status: 400, message: "L'échéance de l'action est invalide" };
  }
  return { ok: true, value: date };
}

function withStatus(
  action: IObjectiveAction,
  status: ObjectiveActionStatus,
  now: Date
): IObjectiveAction {
  if (status === action.status) return action;
  const next: IObjectiveAction = { ...action, status };
  if (status === 'termine') {
    next.completedAt = now;
  } else {
    delete next.completedAt;
  }
  return next;
}

/** Ajoute une action "à faire" (ou au statut fourni) à un objectif — réservé au lead/CTO. */
export function addObjectiveAction(
  objective: IObjective,
  input: ObjectiveActionInput & { id: string },
  who: IReviewAuthor,
  now: Date = new Date()
): ActionResult<{ objective: IObjective; action: IObjectiveAction }> {
  const base = migrateLegacyCoachingAction(objective, now);
  const actions = base.actions ?? [];
  if (actions.length >= MAX_ACTIONS_PER_OBJECTIVE) {
    return {
      ok: false,
      status: 400,
      message: `Un objectif ne peut pas porter plus de ${MAX_ACTIONS_PER_OBJECTIVE} actions`
    };
  }
  const label = parseLabel(input.label);
  if (!label.ok) return label;
  const dueDate = parseDueDate(input.dueDate);
  if (!dueDate.ok) return dueDate;
  if (input.status !== undefined && !isObjectiveActionStatus(input.status)) {
    return { ok: false, status: 400, message: "Statut d'action invalide" };
  }

  let action: IObjectiveAction = {
    id: input.id,
    label: label.value,
    status: 'a_faire',
    ...(dueDate.value ? { dueDate: dueDate.value } : {}),
    createdBy: who,
    createdAt: now
  };
  if (input.status) action = withStatus(action, input.status as ObjectiveActionStatus, now);

  return { ok: true, value: { objective: { ...base, actions: [...actions, action] }, action } };
}

/**
 * Modifie une action existante. `allowedFields` restreint ce que l'appelant peut toucher : le
 * collaborateur ne peut changer que le statut (`['status']`), le lead/CTO tout.
 */
export function updateObjectiveAction(
  objective: IObjective,
  actionId: string,
  input: ObjectiveActionInput,
  who: IReviewAuthor,
  now: Date = new Date(),
  allowedFields: ReadonlyArray<keyof ObjectiveActionInput> = ['label', 'dueDate', 'status']
): ActionResult<{ objective: IObjective; action: IObjectiveAction }> {
  const base = migrateLegacyCoachingAction(objective, now);
  const actions = base.actions ?? [];
  const index = actions.findIndex((a) => a.id === actionId);
  if (index === -1) return { ok: false, status: 404, message: 'Action introuvable' };

  const provided = (Object.keys(input) as (keyof ObjectiveActionInput)[]).filter(
    (key) => input[key] !== undefined
  );
  const forbidden = provided.filter((key) => !allowedFields.includes(key));
  if (forbidden.length > 0) {
    return { ok: false, status: 400, message: `Champ(s) non modifiable(s) : ${forbidden.join(', ')}` };
  }
  if (provided.length === 0) {
    return { ok: false, status: 400, message: 'Aucune modification fournie' };
  }

  let next: IObjectiveAction = { ...actions[index] };
  if (input.label !== undefined) {
    const label = parseLabel(input.label);
    if (!label.ok) return label;
    next.label = label.value;
  }
  if (input.dueDate !== undefined) {
    const dueDate = parseDueDate(input.dueDate);
    if (!dueDate.ok) return dueDate;
    if (dueDate.value) {
      next.dueDate = dueDate.value;
    } else {
      delete next.dueDate;
    }
  }
  if (input.status !== undefined) {
    if (!isObjectiveActionStatus(input.status)) {
      return { ok: false, status: 400, message: "Statut d'action invalide" };
    }
    next = withStatus(next, input.status, now);
  }
  next.updatedBy = who;
  next.updatedAt = now;

  const nextActions = [...actions];
  nextActions[index] = next;
  return { ok: true, value: { objective: { ...base, actions: nextActions }, action: next } };
}

/** Supprime une action — réservé au lead/CTO. */
export function removeObjectiveAction(
  objective: IObjective,
  actionId: string,
  now: Date = new Date()
): ActionResult<IObjective> {
  const base = migrateLegacyCoachingAction(objective, now);
  const actions = base.actions ?? [];
  if (!actions.some((a) => a.id === actionId)) {
    return { ok: false, status: 404, message: 'Action introuvable' };
  }
  return { ok: true, value: { ...base, actions: actions.filter((a) => a.id !== actionId) } };
}

export function isObjectiveActionOverdue(
  action: Pick<IObjectiveAction, 'status' | 'dueDate'>,
  now: Date = new Date()
): boolean {
  if (action.status === 'termine' || !action.dueDate) return false;
  const due = new Date(action.dueDate);
  // Échéance au jour près : en retard à partir du lendemain de la date d'échéance.
  due.setHours(23, 59, 59, 999);
  return due.getTime() < now.getTime();
}

export interface ObjectiveActionsSummary {
  total: number;
  aFaire: number;
  enCours: number;
  termine: number;
  overdue: number;
  /** Part des actions terminées (0-100), `null` si aucune action. */
  completionRate: number | null;
}

/** Agrège les actions de tous les objectifs d'une fiche (synthèse collaborateur / équipe). */
export function summarizeObjectiveActions(
  objectives: Pick<IObjective, 'id' | 'actions' | 'managerAssessment'>[],
  now: Date = new Date()
): ObjectiveActionsSummary {
  const summary: ObjectiveActionsSummary = {
    total: 0,
    aFaire: 0,
    enCours: 0,
    termine: 0,
    overdue: 0,
    completionRate: null
  };
  for (const objective of objectives) {
    const actions = migrateLegacyCoachingAction(objective as IObjective, now).actions ?? [];
    for (const action of actions) {
      summary.total += 1;
      if (action.status === 'termine') summary.termine += 1;
      else if (action.status === 'en_cours') summary.enCours += 1;
      else summary.aFaire += 1;
      if (isObjectiveActionOverdue(action, now)) summary.overdue += 1;
    }
  }
  summary.completionRate = summary.total > 0 ? (summary.termine / summary.total) * 100 : null;
  return summary;
}
