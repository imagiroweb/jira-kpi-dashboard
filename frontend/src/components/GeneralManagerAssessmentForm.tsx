import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import {
  CompetencyAxis,
  COMPETENCY_AXES,
  COMPETENCY_AXIS_LABELS,
  GeneralAssessmentAxes,
  GeneralAssessmentManagerAxesInput,
  GeneralAssessmentReferentialProfile,
  RoleProfile
} from '../domain/performance';

/** Écart (en points, sur 5) à partir duquel une note manager est signalée comme un désaccord avec l'auto-évaluation. */
const DISAGREEMENT_THRESHOLD = 2;

export interface GeneralManagerAssessmentSaveInput {
  axes: GeneralAssessmentManagerAxesInput;
  roleProfile: RoleProfile;
}

interface GeneralManagerAssessmentFormProps {
  /** Auto-évaluation du collaborateur, affichée en regard de chaque champ pour repérer les désaccords. */
  selfAxes: GeneralAssessmentAxes;
  /** Grille manager déjà enregistrée, sert de valeur initiale du formulaire. */
  managerAxes: GeneralAssessmentAxes;
  /** Profil de poste déjà mémorisé sur la fiche (le cas échéant) — présélectionne le picker. */
  roleProfile?: RoleProfile;
  /** Référentiels disponibles (un par profil de poste), chargés une fois par la page parente. */
  referentialProfiles: GeneralAssessmentReferentialProfile[];
  loadingReferential?: boolean;
  disabled?: boolean;
  saving?: boolean;
  onSave: (input: GeneralManagerAssessmentSaveInput) => void;
}

/** Une réponse choisie par ligne du référentiel du profil sélectionné (même ordre/longueur que `profile.axes[axis]`), '' = non notée. */
type Draft = Record<CompetencyAxis, string[]>;

const EMPTY_DRAFT: Draft = { technique: [], impact: [], collaboration: [], leadership: [] };

function scoreForLabel(axes: GeneralAssessmentAxes, axis: CompetencyAxis, label: string): number | undefined {
  return axes[axis].find((subCriterion) => subCriterion.label === label)?.score;
}

function answerForLabel(axes: GeneralAssessmentAxes, axis: CompetencyAxis, label: string): string {
  return axes[axis].find((subCriterion) => subCriterion.label === label)?.answer ?? '';
}

function buildDraft(profile: GeneralAssessmentReferentialProfile | undefined, managerAxes: GeneralAssessmentAxes): Draft {
  if (!profile) return EMPTY_DRAFT;
  return Object.fromEntries(
    COMPETENCY_AXES.map((axis) => [
      axis,
      profile.axes[axis].map((criterion) => answerForLabel(managerAxes, axis, criterion.label))
    ])
  ) as Draft;
}

/**
 * Formulaire de notation manager sur la grille générale (4 axes × sous-critères) : le manager
 * choisit, pour chaque sous-critère, une réponse verbeuse parmi les 5 du référentiel du profil de
 * poste sélectionné — jamais une note brute, toujours résolue serveur à partir de cette réponse
 * (voir `resolveManagerAxesAnswers` côté backend). Affiche la note du collaborateur en regard de
 * chaque champ et signale un désaccord notable (écart ≥ 2 points), pour que le manager puisse
 * repérer les sous-critères à discuter en entretien avant d'enregistrer sa propre grille.
 */
export function GeneralManagerAssessmentForm({
  selfAxes,
  managerAxes,
  roleProfile,
  referentialProfiles,
  loadingReferential,
  disabled,
  saving,
  onSave
}: GeneralManagerAssessmentFormProps) {
  const [selectedRoleProfile, setSelectedRoleProfile] = useState<RoleProfile | ''>(roleProfile ?? '');

  useEffect(() => {
    setSelectedRoleProfile(roleProfile ?? '');
  }, [roleProfile]);

  const selectedProfile = useMemo(
    () => referentialProfiles.find((profile) => profile.roleProfile === selectedRoleProfile),
    [referentialProfiles, selectedRoleProfile]
  );

  const [draft, setDraft] = useState<Draft>(() => buildDraft(selectedProfile, managerAxes));

  useEffect(() => {
    setDraft(buildDraft(selectedProfile, managerAxes));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfile, managerAxes]);

  function updateAnswer(axis: CompetencyAxis, index: number, value: string) {
    setDraft((prev) => ({
      ...prev,
      [axis]: prev[axis].map((current, i) => (i === index ? value : current))
    }));
  }

  function handleSave() {
    if (!selectedProfile) return;
    const axes: GeneralAssessmentManagerAxesInput = Object.fromEntries(
      COMPETENCY_AXES.map((axis) => [
        axis,
        selectedProfile.axes[axis]
          .map((criterion, index) => {
            const answer = draft[axis][index];
            return answer ? { label: criterion.label, answer } : null;
          })
          .filter((entry): entry is { label: string; answer: string } => entry != null)
      ])
    );
    onSave({ axes, roleProfile: selectedProfile.roleProfile });
  }

  return (
    <div className="card-glass p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-base font-semibold text-surface-100">Évaluation manager — grille détaillée</h3>
        <span className="text-xs text-surface-500">
          Une réponse par sous-critère, notée à partir du référentiel du profil de poste
        </span>
      </div>

      <div>
        <label className="block text-xs text-surface-400 mb-1" htmlFor="general-manager-role-profile">
          Profil de poste
        </label>
        <select
          id="general-manager-role-profile"
          className="input"
          value={selectedRoleProfile}
          disabled={disabled || loadingReferential}
          onChange={(e) => setSelectedRoleProfile(e.target.value as RoleProfile | '')}
        >
          <option value="">— Choisir un profil de poste —</option>
          {referentialProfiles.map((profile) => (
            <option key={profile.roleProfile} value={profile.roleProfile}>
              {profile.label}
            </option>
          ))}
        </select>
        {loadingReferential && <p className="text-xs text-surface-500 mt-1">Chargement des référentiels…</p>}
        {!loadingReferential && referentialProfiles.length === 0 && (
          <p className="text-xs text-surface-500 mt-1">Aucun référentiel de notation n&apos;est encore configuré.</p>
        )}
      </div>

      {!selectedProfile && !loadingReferential && referentialProfiles.length > 0 && (
        <p className="text-sm text-surface-400">
          Choisissez un profil de poste ci-dessus pour afficher la grille de notation.
        </p>
      )}

      {selectedProfile && (
        <div className="grid sm:grid-cols-2 gap-4">
          {COMPETENCY_AXES.map((axis) => (
            <div key={axis} className="border border-surface-700/50 rounded-xl p-4 space-y-3">
              <p className="font-medium text-surface-200">{COMPETENCY_AXIS_LABELS[axis]}</p>
              {selectedProfile.axes[axis].map((criterion, index) => {
                const selfScore = scoreForLabel(selfAxes, axis, criterion.label);
                const selectedAnswer = draft[axis][index] ?? '';
                const managerScore = criterion.answers.find((answer) => answer.text === selectedAnswer)?.points;
                const disagree =
                  selfScore != null &&
                  managerScore != null &&
                  Math.abs(selfScore - managerScore) >= DISAGREEMENT_THRESHOLD;

                return (
                  <div key={criterion.label} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-surface-300">{criterion.label}</p>
                      <p className="text-xs text-surface-500 whitespace-nowrap">
                        Collaborateur : {selfScore != null ? `${selfScore}/5` : '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={criterion.label}
                        className="input flex-1"
                        value={selectedAnswer}
                        disabled={disabled}
                        onChange={(e) => updateAnswer(axis, index, e.target.value)}
                      >
                        <option value="">— Choisir une réponse —</option>
                        {criterion.answers.map((answer) => (
                          <option key={answer.text} value={answer.text}>
                            {answer.text} ({answer.points}/5)
                          </option>
                        ))}
                      </select>
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
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {!disabled && (
        <button
          type="button"
          className="btn-primary"
          disabled={saving || !selectedProfile}
          onClick={handleSave}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer la grille manager
        </button>
      )}
    </div>
  );
}
