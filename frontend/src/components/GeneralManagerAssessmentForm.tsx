import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import {
  CompetencyAxis,
  COMPETENCY_AXES,
  COMPETENCY_AXIS_LABELS,
  GENERAL_ASSESSMENT_REFERENTIAL,
  GeneralAssessmentAxes,
  GeneralAssessmentAxesInput
} from '../domain/performance';

/** Écart (en points, sur 5) à partir duquel une note manager est signalée comme un désaccord avec l'auto-évaluation. */
const DISAGREEMENT_THRESHOLD = 2;

interface GeneralManagerAssessmentFormProps {
  /** Auto-évaluation du collaborateur, affichée en regard de chaque champ pour repérer les désaccords. */
  selfAxes: GeneralAssessmentAxes;
  /** Grille manager déjà enregistrée, sert de valeur initiale du formulaire. */
  managerAxes: GeneralAssessmentAxes;
  disabled?: boolean;
  saving?: boolean;
  onSave: (axes: GeneralAssessmentAxesInput) => void;
}

/** Une entrée de brouillon par ligne du référentiel (même ordre/longueur que `GENERAL_ASSESSMENT_REFERENTIAL[axis]`). */
type Draft = Record<CompetencyAxis, string[]>;

function scoreForLabel(axes: GeneralAssessmentAxes, axis: CompetencyAxis, label: string): number | undefined {
  return axes[axis].find((subCriterion) => subCriterion.label === label)?.score;
}

function buildDraft(managerAxes: GeneralAssessmentAxes): Draft {
  return Object.fromEntries(
    COMPETENCY_AXES.map((axis) => [
      axis,
      GENERAL_ASSESSMENT_REFERENTIAL[axis].map((label) => {
        const score = scoreForLabel(managerAxes, axis, label);
        return score != null ? String(score) : '';
      })
    ])
  ) as Draft;
}

/**
 * Formulaire de notation manager sur la grille générale (4 axes × 3 sous-critères, référentiel
 * fixe partagé avec l'auto-évaluation). Affiche la note du collaborateur en regard de chaque
 * champ et signale un désaccord notable (écart ≥ 2 points), pour que le manager puisse repérer
 * les sous-critères à discuter en entretien avant d'enregistrer sa propre grille.
 */
export function GeneralManagerAssessmentForm({
  selfAxes,
  managerAxes,
  disabled,
  saving,
  onSave
}: GeneralManagerAssessmentFormProps) {
  const [draft, setDraft] = useState<Draft>(() => buildDraft(managerAxes));

  useEffect(() => {
    setDraft(buildDraft(managerAxes));
  }, [managerAxes]);

  function updateScore(axis: CompetencyAxis, index: number, value: string) {
    setDraft((prev) => ({
      ...prev,
      [axis]: prev[axis].map((current, i) => (i === index ? value : current))
    }));
  }

  const hasInvalidScore = COMPETENCY_AXES.some((axis) =>
    draft[axis].some((raw) => raw.trim() !== '' && (Number(raw) < 1 || Number(raw) > 5))
  );

  function handleSave() {
    if (hasInvalidScore) return;
    const axes: GeneralAssessmentAxesInput = Object.fromEntries(
      COMPETENCY_AXES.map((axis) => [
        axis,
        GENERAL_ASSESSMENT_REFERENTIAL[axis]
          .map((label, index) => {
            const raw = draft[axis][index];
            return raw.trim() === '' ? null : { label, score: Number(raw) };
          })
          .filter((entry): entry is { label: string; score: number } => entry != null)
      ])
    );
    onSave(axes);
  }

  return (
    <div className="card-glass p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-base font-semibold text-surface-100">Évaluation manager — grille détaillée</h3>
        <span className="text-xs text-surface-500">
          Note de 1 à 5 par sous-critère, même référentiel que l&apos;auto-évaluation
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {COMPETENCY_AXES.map((axis) => (
          <div key={axis} className="border border-surface-700/50 rounded-xl p-4 space-y-3">
            <p className="font-medium text-surface-200">{COMPETENCY_AXIS_LABELS[axis]}</p>
            {GENERAL_ASSESSMENT_REFERENTIAL[axis].map((label, index) => {
              const selfScore = scoreForLabel(selfAxes, axis, label);
              const rawManager = draft[axis][index];
              const managerScore = rawManager.trim() !== '' ? Number(rawManager) : undefined;
              const disagree =
                selfScore != null &&
                managerScore != null &&
                Math.abs(selfScore - managerScore) >= DISAGREEMENT_THRESHOLD;

              return (
                <div key={label} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-surface-300 truncate">{label}</p>
                    <p className="text-xs text-surface-500">
                      Collaborateur : {selfScore != null ? `${selfScore}/5` : '—'}
                    </p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    aria-label={label}
                    className="input w-20"
                    value={rawManager}
                    disabled={disabled}
                    onChange={(e) => updateScore(axis, index, e.target.value)}
                  />
                  {disagree && (
                    <span
                      className="badge badge-warning flex items-center gap-1 whitespace-nowrap"
                      title="Écart notable avec l'auto-évaluation"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Désaccord
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {hasInvalidScore && <p className="text-xs text-danger-400">Les notes doivent être comprises entre 1 et 5.</p>}

      {!disabled && (
        <button type="button" className="btn-primary" disabled={saving || hasInvalidScore} onClick={handleSave}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer la grille manager
        </button>
      )}
    </div>
  );
}
