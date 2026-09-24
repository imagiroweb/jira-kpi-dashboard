import { useState } from 'react';
import { Loader2, Plus, Trash2, CalendarClock, ListChecks, Check, X, Pencil } from 'lucide-react';
import {
  ObjectiveAction,
  ObjectiveActionInput,
  ObjectiveActionStatus,
  ObjectiveActionsSummary,
  OBJECTIVE_ACTION_STATUSES,
  OBJECTIVE_ACTION_STATUS_LABELS,
  OBJECTIVE_ACTION_STATUS_BADGE_CLASS,
  isObjectiveActionOverdue
} from '../domain/performance';

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR');
}

function toDateInput(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/**
 * Synthèse compacte de l'avancement des actions à mener d'un collaborateur :
 * "x/y terminées", barre de réalisation, répartition par statut et retards.
 */
export function ObjectiveActionsSummaryBadges({
  summary,
  compact = false,
  audience = 'manager'
}: {
  summary: ObjectiveActionsSummary;
  compact?: boolean;
  audience?: 'self' | 'manager';
}) {
  if (summary.total === 0) {
    return <span className="text-surface-500">{compact ? '—' : 'Aucune action requise'}</span>;
  }
  const rate = Math.round(summary.completionRate ?? 0);
  return (
    <div className={`flex flex-col gap-1 ${compact ? 'min-w-[140px]' : ''}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {!compact && (
          <span className="text-sm text-surface-300">
            {audience === 'self' ? 'Mes actions requises' : 'Actions requises'}
          </span>
        )}
        <span className="text-surface-200 font-medium">
          {summary.termine}/{summary.total} terminée{summary.termine > 1 ? 's' : ''}
        </span>
        {summary.overdue > 0 && (
          <span className="badge badge-danger">
            {summary.overdue} en retard
          </span>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-surface-800 overflow-hidden" title={`${rate}% des actions terminées`}>
        <div className="h-full bg-success-500" style={{ width: `${rate}%` }} />
      </div>
      <div className="flex flex-wrap gap-1">
        {summary.aFaire > 0 && (
          <span className={`badge ${OBJECTIVE_ACTION_STATUS_BADGE_CLASS.a_faire}`}>
            {summary.aFaire} {OBJECTIVE_ACTION_STATUS_LABELS.a_faire.toLowerCase()}
          </span>
        )}
        {summary.enCours > 0 && (
          <span className={`badge ${OBJECTIVE_ACTION_STATUS_BADGE_CLASS.en_cours}`}>
            {summary.enCours} {OBJECTIVE_ACTION_STATUS_LABELS.en_cours.toLowerCase()}
          </span>
        )}
      </div>
    </div>
  );
}

interface ObjectiveActionsPanelProps {
  actions: ObjectiveAction[];
  /** manager : ajout / modification / suppression ; self : changement de statut uniquement. */
  mode: 'manager' | 'self';
  disabled?: boolean;
  /** Retourner `false` en cas d'échec (la saisie en cours est alors conservée). */
  onAdd?: (input: ObjectiveActionInput) => Promise<boolean | void>;
  onUpdate: (actionId: string, input: ObjectiveActionInput) => Promise<boolean | void>;
  onDelete?: (actionId: string) => Promise<boolean | void>;
}

/**
 * Liste des actions à mener d'un objectif. Chaque modification est enregistrée immédiatement
 * (pas de brouillon), comme la saisie d'avancement des KR.
 */
export function ObjectiveActionsPanel({
  actions,
  mode,
  disabled = false,
  onAdd,
  onUpdate,
  onDelete
}: ObjectiveActionsPanelProps) {
  const [newLabel, setNewLabel] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editDueDate, setEditDueDate] = useState('');

  const isManager = mode === 'manager';
  const doneCount = actions.filter((a) => a.status === 'termine').length;

  if (!isManager && actions.length === 0) return null;

  async function run(actionId: string, fn: () => Promise<boolean | void>): Promise<boolean> {
    setBusyId(actionId);
    try {
      return (await fn()) !== false;
    } catch {
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdd() {
    if (!onAdd || !newLabel.trim()) return;
    setAdding(true);
    try {
      const ok = (await onAdd({ label: newLabel.trim(), dueDate: newDueDate || undefined })) !== false;
      if (ok) {
        setNewLabel('');
        setNewDueDate('');
      }
    } catch {
      // l'appelant notifie l'erreur ; on garde la saisie
    } finally {
      setAdding(false);
    }
  }

  function startEdit(action: ObjectiveAction) {
    setEditingId(action.id);
    setEditLabel(action.label);
    setEditDueDate(toDateInput(action.dueDate));
  }

  async function saveEdit(action: ObjectiveAction) {
    if (!editLabel.trim()) return;
    const ok = await run(action.id, () =>
      onUpdate(action.id, { label: editLabel.trim(), dueDate: editDueDate ? editDueDate : null })
    );
    if (ok) setEditingId(null);
  }

  return (
    <div className="rounded-xl border border-surface-700/50 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-surface-200">
        <ListChecks className="w-4 h-4 text-accent-400" />
        {isManager ? 'Actions à mener' : 'Actions requises'}
        {actions.length > 0 && (
          <span className="text-xs font-normal text-surface-400">
            {actions.length} action{actions.length > 1 ? 's' : ''} · {doneCount} terminée{doneCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {actions.length === 0 && (
        <p className="text-xs text-surface-500">Aucune action pour cet objectif.</p>
      )}

      <ul className="space-y-1.5">
        {actions.map((action) => {
          const overdue = isObjectiveActionOverdue(action);
          const busy = busyId === action.id;
          const editing = editingId === action.id;
          return (
            <li
              key={action.id}
              className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 ${
                overdue ? 'bg-danger-500/10' : 'bg-surface-800/60'
              }`}
            >
              {editing ? (
                <>
                  <input
                    type="text"
                    className="input flex-1 min-w-[200px] py-1"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                  />
                  <input
                    type="date"
                    className="input w-auto py-1"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1"
                    disabled={busy || !editLabel.trim()}
                    onClick={() => saveEdit(action)}
                    aria-label="Enregistrer l'action"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1"
                    onClick={() => setEditingId(null)}
                    aria-label="Annuler"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <span
                    className={`flex-1 min-w-[200px] text-sm ${
                      action.status === 'termine' ? 'text-surface-500 line-through' : 'text-surface-200'
                    }`}
                  >
                    {action.label}
                  </span>
                  {action.dueDate && (
                    <span
                      className={`inline-flex items-center gap-1 text-xs ${
                        overdue ? 'text-danger-400' : 'text-surface-400'
                      }`}
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                      {overdue ? 'En retard — ' : 'Échéance '}
                      {formatDate(action.dueDate)}
                    </span>
                  )}
                  <select
                    className={`input w-auto py-1 text-xs ${OBJECTIVE_ACTION_STATUS_BADGE_CLASS[action.status]}`}
                    value={action.status}
                    disabled={disabled || busy}
                    aria-label={`Statut de l'action ${action.label}`}
                    onChange={(e) =>
                      run(action.id, () => onUpdate(action.id, { status: e.target.value as ObjectiveActionStatus }))
                    }
                  >
                    {OBJECTIVE_ACTION_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {OBJECTIVE_ACTION_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                  {busy && <Loader2 className="w-4 h-4 animate-spin text-accent-500" />}
                  {isManager && !disabled && (
                    <>
                      <button
                        type="button"
                        className="btn-ghost px-2 py-1"
                        onClick={() => startEdit(action)}
                        aria-label="Modifier l'action"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {onDelete && (
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1 text-danger-400"
                          disabled={busy}
                          onClick={() => run(action.id, () => onDelete(action.id))}
                          aria-label="Supprimer l'action"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {isManager && !disabled && onAdd && (
        <div className="grid sm:grid-cols-[1fr_160px_auto] gap-2 pt-1">
          <input
            type="text"
            className="input"
            placeholder="Nouvelle action à mener par le collaborateur"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAdd();
              }
            }}
          />
          <input
            type="date"
            className="input"
            aria-label="Échéance (optionnel)"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={adding || !newLabel.trim()}
            onClick={handleAdd}
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Ajouter
          </button>
        </div>
      )}
    </div>
  );
}
