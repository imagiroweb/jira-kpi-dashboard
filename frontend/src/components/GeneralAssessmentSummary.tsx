import {
  CompetencyAxis,
  COMPETENCY_AXES,
  COMPETENCY_AXIS_LABELS,
  GeneralAssessmentAxes,
  Objective,
  computeGeneralAssessmentAxisScore,
  computeGeneralAssessmentGlobalScore
} from '../domain/performance';

interface GeneralAssessmentSummaryProps {
  axes: GeneralAssessmentAxes;
  /** Objectifs du cycle courant, pour la réconciliation par axe (`competencyAxes`). */
  objectives: Objective[];
}

function objectivesForAxis(objectives: Objective[], axis: CompetencyAxis): Objective[] {
  return objectives.filter((o) => (o.competencyAxes ?? []).includes(axis));
}

/**
 * Résumé en lecture seule de l'auto-évaluation générale (4 axes × sous-critères notés 1-5,
 * distincte du "Bilan du cycle" ci-dessous) — alimentée aujourd'hui par l'import Excel (voir
 * `backend/src/scripts/import-okr/runGeneralAssessmentImport.ts`), pas encore par une UI de
 * saisie. Affiche pour chaque axe renseigné son score moyen, le détail des sous-critères, et une
 * première réconciliation avec les objectifs du cycle tagués de ce même axe
 * (`objective.competencyAxes`). Partagé entre `MyPerformancePage` (sa propre fiche) et
 * `TeamPerformancePage` (fiche d'un collaborateur, lead/CTO).
 */
export function GeneralAssessmentSummary({ axes, objectives }: GeneralAssessmentSummaryProps) {
  const hasAnyScore = COMPETENCY_AXES.some((axis) => axes[axis].length > 0);

  if (!hasAnyScore) {
    return (
      <div className="card-glass p-6 space-y-2">
        <h3 className="text-base font-semibold text-surface-100">Auto-évaluation générale</h3>
        <p className="text-sm text-surface-400">Aucune auto-évaluation générale importée pour ce cycle.</p>
      </div>
    );
  }

  const globalScore = computeGeneralAssessmentGlobalScore(axes);

  return (
    <div className="card-glass p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-base font-semibold text-surface-100">Auto-évaluation générale</h3>
        <span className="badge badge-info">Score global {globalScore.toFixed(1)}/5</span>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {COMPETENCY_AXES.map((axis) => {
          const subCriteria = axes[axis];
          const linkedObjectives = objectivesForAxis(objectives, axis);

          if (subCriteria.length === 0) {
            return (
              <div key={axis} className="border border-surface-700/50 rounded-xl p-4">
                <p className="font-medium text-surface-200 mb-1">{COMPETENCY_AXIS_LABELS[axis]}</p>
                <p className="text-xs text-surface-500">Non renseigné</p>
              </div>
            );
          }

          const axisScore = computeGeneralAssessmentAxisScore(subCriteria);

          return (
            <div key={axis} className="border border-surface-700/50 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium text-surface-200">{COMPETENCY_AXIS_LABELS[axis]}</p>
                <span className="badge bg-surface-700/60 text-surface-300">{axisScore.toFixed(1)}/5</span>
              </div>
              <ul className="text-xs text-surface-400 space-y-0.5">
                {subCriteria.map((subCriterion, index) => (
                  <li key={`${subCriterion.label}-${index}`} className="flex items-center justify-between gap-2">
                    <span>{subCriterion.label}</span>
                    <span className="text-surface-300">{subCriterion.score}/5</span>
                  </li>
                ))}
              </ul>
              {linkedObjectives.length > 0 && (
                <p className="text-xs text-surface-500 pt-1 border-t border-surface-700/50">
                  Objectifs liés : {linkedObjectives.map((o) => o.title).join(', ')}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
