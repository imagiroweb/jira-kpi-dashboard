import { useEffect, useState } from 'react';
import {
  Loader2,
  AlertTriangle,
  Target,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  Save,
  Lock
} from 'lucide-react';
import { performanceApi } from '../services/api';
import { useSocketOptional } from '../hooks/useSocketContext';
import { GeneralAssessmentSummary } from './GeneralAssessmentSummary';
import {
  PerformanceReview,
  PerformanceCycle,
  Objective,
  KeyResult,
  CompetencyAxis,
  ObjectiveAssessmentStatus,
  AssessmentInput,
  OBJECTIVE_ASSESSMENT_STATUSES,
  COMPETENCY_AXES,
  computeObjectiveProgress,
  normalizePerformanceReview,
  OBJECTIVE_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_BADGE_CLASS,
  CYCLE_STATUS_LABELS,
  COMPETENCY_AXIS_LABELS,
  QUALITATIVE_FIELDS
} from '../domain/performance';

function extractApiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string }; status?: number }; message?: string };
  return e?.response?.data?.message || e?.message || fallback;
}

function extractApiErrorStatus(err: unknown): number | undefined {
  const e = err as { response?: { status?: number } };
  return e?.response?.status;
}

interface KrDraft {
  value: string;
  note: string;
  evidenceUrl: string;
}

interface SelfObjectiveDraft {
  status: ObjectiveAssessmentStatus | '';
  comment: string;
}

interface SelfDraft {
  objectives: Record<string, SelfObjectiveDraft>;
  qualitative: Record<'successes' | 'challenges' | 'growthAreas' | 'overallReview', string>;
  competencyScores: Record<CompetencyAxis, string>;
}

function buildSelfDraft(review: PerformanceReview): SelfDraft {
  const normalized = normalizePerformanceReview(review);
  return {
    objectives: Object.fromEntries(
      normalized.objectives.map((o) => [
        o.id,
        { status: o.selfAssessment.status ?? '', comment: o.selfAssessment.comment ?? '' }
      ])
    ),
    qualitative: {
      successes: normalized.qualitative.successes.self ?? '',
      challenges: normalized.qualitative.challenges.self ?? '',
      growthAreas: normalized.qualitative.growthAreas.self ?? '',
      overallReview: normalized.qualitative.overallReview.self ?? ''
    },
    competencyScores: {
      technique:
        normalized.competencyScores.technique.self != null
          ? String(normalized.competencyScores.technique.self)
          : '',
      impact:
        normalized.competencyScores.impact.self != null ? String(normalized.competencyScores.impact.self) : '',
      collaboration:
        normalized.competencyScores.collaboration.self != null
          ? String(normalized.competencyScores.collaboration.self)
          : '',
      leadership:
        normalized.competencyScores.leadership.self != null
          ? String(normalized.competencyScores.leadership.self)
          : ''
    }
  };
}

export function MyPerformancePage() {
  const socket = useSocketOptional();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [review, setReview] = useState<PerformanceReview | null>(null);
  const [cycle, setCycle] = useState<PerformanceCycle | null>(null);

  const [krDrafts, setKrDrafts] = useState<Record<string, KrDraft>>({});
  const [savingKr, setSavingKr] = useState<Record<string, boolean>>({});
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  const [selfDraft, setSelfDraft] = useState<SelfDraft | null>(null);
  const [savingSelf, setSavingSelf] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setEmptyMessage(null);

      const [reviewResult, cyclesResult] = await Promise.allSettled([
        performanceApi.getMyReview(),
        performanceApi.getCycles()
      ]);

      if (cancelled) return;

      let loadedReview: PerformanceReview | null = null;

      if (reviewResult.status === 'fulfilled' && reviewResult.value.success) {
        loadedReview = normalizePerformanceReview(reviewResult.value.review);
        setReview(loadedReview);
        setSelfDraft(buildSelfDraft(loadedReview));
      } else if (reviewResult.status === 'rejected') {
        const status = extractApiErrorStatus(reviewResult.reason);
        const message = extractApiErrorMessage(
          reviewResult.reason,
          'Impossible de charger votre fiche de performance'
        );
        if (status === 404) {
          setEmptyMessage(message);
        } else {
          setError(message);
        }
      }

      if (cyclesResult.status === 'fulfilled' && cyclesResult.value.success && loadedReview) {
        const matching = cyclesResult.value.cycles.find((c) => c.id === loadedReview!.cycle);
        setCycle(matching ?? null);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const isReadOnly = cycle != null && cycle.status !== 'active';

  function krKey(objectiveId: string, krId: string) {
    return `${objectiveId}::${krId}`;
  }

  function updateKrDraft(objectiveId: string, krId: string, patch: Partial<KrDraft>) {
    const key = krKey(objectiveId, krId);
    setKrDrafts((prev) => {
      const base: KrDraft = prev[key] ?? { value: '', note: '', evidenceUrl: '' };
      return { ...prev, [key]: { ...base, ...patch } };
    });
  }

  async function handleAddProgress(objectiveId: string, krId: string) {
    const key = krKey(objectiveId, krId);
    const draft = krDrafts[key] ?? { value: '', note: '', evidenceUrl: '' };
    const numValue = Number(draft.value);

    if (draft.value.trim() === '' || !Number.isFinite(numValue)) {
      socket?.notify?.error('Avancement invalide', "La valeur d'avancement doit être un nombre entre 0 et 100");
      return;
    }

    setSavingKr((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await performanceApi.updateKeyResultProgress(objectiveId, krId, {
        value: numValue,
        note: draft.note.trim() || undefined,
        evidenceUrl: draft.evidenceUrl.trim() || undefined
      });
      setReview(normalizePerformanceReview(res.review));
      setKrDrafts((prev) => ({ ...prev, [key]: { value: '', note: '', evidenceUrl: '' } }));
      socket?.notify?.success('Avancement enregistré', 'La mise à jour a bien été prise en compte');
    } catch (err) {
      socket?.notify?.error(
        'Échec de la mise à jour',
        extractApiErrorMessage(err, "Erreur lors de l'enregistrement de l'avancement")
      );
    } finally {
      setSavingKr((prev) => ({ ...prev, [key]: false }));
    }
  }

  function toggleHistory(objectiveId: string, krId: string) {
    const key = krKey(objectiveId, krId);
    setExpandedHistory((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function updateSelfObjectiveDraft(objectiveId: string, patch: Partial<SelfObjectiveDraft>) {
    setSelfDraft((prev) => {
      if (!prev) return prev;
      const current = prev.objectives[objectiveId] ?? { status: '', comment: '' };
      return { ...prev, objectives: { ...prev.objectives, [objectiveId]: { ...current, ...patch } } };
    });
  }

  function updateSelfQualitative(field: (typeof QUALITATIVE_FIELDS)[number]['key'], value: string) {
    setSelfDraft((prev) => (prev ? { ...prev, qualitative: { ...prev.qualitative, [field]: value } } : prev));
  }

  function updateSelfCompetency(axis: CompetencyAxis, value: string) {
    setSelfDraft((prev) =>
      prev ? { ...prev, competencyScores: { ...prev.competencyScores, [axis]: value } } : prev
    );
  }

  async function handleSaveSelfAssessment() {
    if (!review || !selfDraft) return;

    const input: AssessmentInput = {
      objectives: review.objectives.map((o) => {
        const draft = selfDraft.objectives[o.id];
        return {
          id: o.id,
          status: draft?.status || undefined,
          comment: draft?.comment.trim() ? draft.comment.trim() : undefined
        };
      }),
      qualitative: {
        successes: selfDraft.qualitative.successes.trim() || undefined,
        challenges: selfDraft.qualitative.challenges.trim() || undefined,
        growthAreas: selfDraft.qualitative.growthAreas.trim() || undefined,
        overallReview: selfDraft.qualitative.overallReview.trim() || undefined
      },
      competencyScores: Object.fromEntries(
        COMPETENCY_AXES.filter((axis) => selfDraft.competencyScores[axis].trim() !== '').map((axis) => [
          axis,
          Number(selfDraft.competencyScores[axis])
        ])
      )
    };

    setSavingSelf(true);
    try {
      const res = await performanceApi.updateSelfAssessment(input);
      setReview(normalizePerformanceReview(res.review));
      setSelfDraft(buildSelfDraft(res.review));
      socket?.notify?.success('Auto-évaluation enregistrée', 'Votre auto-évaluation a bien été sauvegardée');
    } catch (err) {
      socket?.notify?.error(
        "Échec de l'enregistrement",
        extractApiErrorMessage(err, "Erreur lors de l'enregistrement de l'auto-évaluation")
      );
    } finally {
      setSavingSelf(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-accent-500 animate-spin mx-auto mb-3" />
          <p className="text-surface-400">Chargement de votre fiche de performance...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
          <Target className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-surface-100">Ma performance</h1>
          <p className="text-sm text-surface-400">Objectifs OKR et auto-évaluation</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {!error && emptyMessage && (
        <div className="alert alert-info">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>{emptyMessage}</p>
        </div>
      )}

      {review && (
        <>
          <div className="card-glass p-6 flex flex-wrap items-center gap-3">
            {cycle && (
              <span className="badge badge-info">{cycle.label} — {CYCLE_STATUS_LABELS[cycle.status]}</span>
            )}
            <span className={`badge ${REVIEW_STATUS_BADGE_CLASS[review.status]}`}>
              {REVIEW_STATUS_LABELS[review.status]}
            </span>
            {isReadOnly && (
              <span className="flex items-center gap-1.5 text-sm text-surface-400">
                <Lock className="w-3.5 h-3.5" />
                Ce cycle est clos, lecture seule
              </span>
            )}
          </div>

          {review.objectives.length === 0 ? (
            <div className="alert alert-info">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>Vos objectifs n'ont pas encore été définis pour ce cycle par votre lead ou le CTO.</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {review.objectives.map((objective) => (
                  <ObjectiveCard
                    key={objective.id}
                    objective={objective}
                    isReadOnly={isReadOnly}
                    krDrafts={krDrafts}
                    savingKr={savingKr}
                    expandedHistory={expandedHistory}
                    onDraftChange={updateKrDraft}
                    onSubmitProgress={handleAddProgress}
                    onToggleHistory={toggleHistory}
                  />
                ))}
              </div>

              <GeneralAssessmentSummary axes={review.generalSelfAssessment} objectives={review.objectives} />

              {selfDraft && (
                <div className="card-glass p-6 space-y-6">
                  <h2 className="text-lg font-semibold text-surface-100">Bilan du cycle</h2>

                  <div className="space-y-4">
                    {review.objectives.map((objective) => {
                      const draft = selfDraft.objectives[objective.id] ?? { status: '', comment: '' };
                      return (
                        <div key={objective.id} className="border border-surface-700/50 rounded-xl p-4">
                          <div className="flex items-center gap-2 flex-wrap mb-3">
                            <p className="font-medium text-surface-200">{objective.title}</p>
                            {(objective.competencyAxes ?? []).map((axis) => (
                              <span key={axis} className="badge bg-surface-700/60 text-surface-300">
                                {COMPETENCY_AXIS_LABELS[axis]}
                              </span>
                            ))}
                          </div>
                          <div className="grid sm:grid-cols-[220px_1fr] gap-3">
                            <select
                              className="input"
                              value={draft.status}
                              disabled={isReadOnly}
                              onChange={(e) =>
                                updateSelfObjectiveDraft(objective.id, {
                                  status: e.target.value as ObjectiveAssessmentStatus | ''
                                })
                              }
                            >
                              <option value="">Statut non renseigné</option>
                              {OBJECTIVE_ASSESSMENT_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {OBJECTIVE_STATUS_LABELS[status]}
                                </option>
                              ))}
                            </select>
                            <textarea
                              className="input min-h-[38px]"
                              placeholder="Votre commentaire sur cet objectif"
                              value={draft.comment}
                              disabled={isReadOnly}
                              onChange={(e) => updateSelfObjectiveDraft(objective.id, { comment: e.target.value })}
                            />
                          </div>
                          {objective.managerAssessment.status && (
                            <p className="mt-2 text-xs text-surface-500">
                              Évaluation manager : {OBJECTIVE_STATUS_LABELS[objective.managerAssessment.status]}
                              {objective.managerAssessment.comment ? ` — ${objective.managerAssessment.comment}` : ''}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    {QUALITATIVE_FIELDS.map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-sm font-medium text-surface-300 mb-1.5">{label}</label>
                        <textarea
                          className="input min-h-[80px]"
                          value={selfDraft.qualitative[key]}
                          disabled={isReadOnly}
                          onChange={(e) => updateSelfQualitative(key, e.target.value)}
                        />
                        {review.qualitative[key].manager && (
                          <p className="mt-1 text-xs text-surface-500">
                            Manager : {review.qualitative[key].manager}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div>
                    <p className="text-sm font-medium text-surface-300 mb-2">Grille de compétences (1 à 5)</p>
                    <div className="grid sm:grid-cols-4 gap-3">
                      {COMPETENCY_AXES.map((axis) => (
                        <div key={axis}>
                          <label className="block text-xs text-surface-400 mb-1">{COMPETENCY_AXIS_LABELS[axis]}</label>
                          <input
                            type="number"
                            min={1}
                            max={5}
                            className="input"
                            value={selfDraft.competencyScores[axis]}
                            disabled={isReadOnly}
                            onChange={(e) => updateSelfCompetency(axis, e.target.value)}
                          />
                          {review.competencyScores[axis].manager != null && (
                            <p className="mt-1 text-xs text-surface-500">
                              Manager : {review.competencyScores[axis].manager}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-primary"
                    disabled={isReadOnly || savingSelf}
                    onClick={handleSaveSelfAssessment}
                  >
                    {savingSelf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Enregistrer mon auto-évaluation
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

interface ObjectiveCardProps {
  objective: Objective;
  isReadOnly: boolean;
  krDrafts: Record<string, KrDraft>;
  savingKr: Record<string, boolean>;
  expandedHistory: Record<string, boolean>;
  onDraftChange: (objectiveId: string, krId: string, patch: Partial<KrDraft>) => void;
  onSubmitProgress: (objectiveId: string, krId: string) => void;
  onToggleHistory: (objectiveId: string, krId: string) => void;
}

function ObjectiveCard({
  objective,
  isReadOnly,
  krDrafts,
  savingKr,
  expandedHistory,
  onDraftChange,
  onSubmitProgress,
  onToggleHistory
}: ObjectiveCardProps) {
  const progress = Math.round(computeObjectiveProgress(objective));

  return (
    <div className="card-glass p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold text-surface-100">{objective.title}</h3>
            {(objective.competencyAxes ?? []).map((axis) => (
              <span key={axis} className="badge bg-surface-700/60 text-surface-300">
                {COMPETENCY_AXIS_LABELS[axis]}
              </span>
            ))}
          </div>
          {objective.description && <p className="text-sm text-surface-400 mt-1">{objective.description}</p>}
        </div>
        <span className="badge badge-info flex-shrink-0">Poids {Math.round(objective.weight * 100)}%</span>
      </div>

      <div className="mt-3 mb-5">
        <div className="flex items-center justify-between text-xs text-surface-400 mb-1">
          <span>Avancement de l'objectif</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-surface-800 overflow-hidden">
          <div className="h-full bg-primary-500" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      </div>

      <div className="space-y-4">
        {objective.krs.map((kr) => (
          <KeyResultRow
            key={kr.id}
            objectiveId={objective.id}
            kr={kr}
            isReadOnly={isReadOnly}
            draft={krDrafts[`${objective.id}::${kr.id}`]}
            saving={!!savingKr[`${objective.id}::${kr.id}`]}
            expanded={!!expandedHistory[`${objective.id}::${kr.id}`]}
            onDraftChange={onDraftChange}
            onSubmitProgress={onSubmitProgress}
            onToggleHistory={onToggleHistory}
          />
        ))}
      </div>
    </div>
  );
}

interface KeyResultRowProps {
  objectiveId: string;
  kr: KeyResult;
  isReadOnly: boolean;
  draft?: KrDraft;
  saving: boolean;
  expanded: boolean;
  onDraftChange: (objectiveId: string, krId: string, patch: Partial<KrDraft>) => void;
  onSubmitProgress: (objectiveId: string, krId: string) => void;
  onToggleHistory: (objectiveId: string, krId: string) => void;
}

function KeyResultRow({
  objectiveId,
  kr,
  isReadOnly,
  draft,
  saving,
  expanded,
  onDraftChange,
  onSubmitProgress,
  onToggleHistory
}: KeyResultRowProps) {
  const value = draft?.value ?? '';
  const note = draft?.note ?? '';
  const evidenceUrl = draft?.evidenceUrl ?? '';

  return (
    <div className="border border-surface-700/50 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-surface-200">{kr.label}</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-surface-800 overflow-hidden">
              <div className="h-full bg-accent-500" style={{ width: `${Math.min(100, kr.progress)}%` }} />
            </div>
            <span className="text-xs text-surface-400 w-10 text-right">{kr.progress}%</span>
          </div>
        </div>
        <span className="text-xs text-surface-500 flex-shrink-0">Poids {Math.round(kr.weight * 100)}%</span>
      </div>

      {!isReadOnly && (
        <div className="mt-3 grid sm:grid-cols-[100px_1fr_1fr_auto] gap-2">
          <input
            type="number"
            min={0}
            max={100}
            placeholder="0-100"
            className="input"
            value={value}
            onChange={(e) => onDraftChange(objectiveId, kr.id, { value: e.target.value })}
          />
          <input
            type="text"
            placeholder="Note (optionnel)"
            className="input"
            value={note}
            onChange={(e) => onDraftChange(objectiveId, kr.id, { note: e.target.value })}
          />
          <input
            type="text"
            placeholder="Lien de preuve (Jira, Confluence...)"
            className="input"
            value={evidenceUrl}
            onChange={(e) => onDraftChange(objectiveId, kr.id, { evidenceUrl: e.target.value })}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={saving}
            onClick={() => onSubmitProgress(objectiveId, kr.id)}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ajouter'}
          </button>
        </div>
      )}

      {kr.progressHistory.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            className="btn-ghost text-xs px-2 py-1"
            onClick={() => onToggleHistory(objectiveId, kr.id)}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Historique ({kr.progressHistory.length})
          </button>
          {expanded && (
            <ul className="mt-2 space-y-1.5">
              {[...kr.progressHistory].reverse().map((update, index) => (
                <li key={index} className="text-xs text-surface-400 flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-surface-300">{update.value}%</span>
                  <span>par {update.updatedBy.name}</span>
                  <span>le {new Date(update.updatedAt).toLocaleString('fr-FR')}</span>
                  {update.note && <span>— {update.note}</span>}
                  {update.evidenceUrl && (
                    <a
                      href={update.evidenceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-accent-400 hover:text-accent-300"
                    >
                      <LinkIcon className="w-3 h-3" />
                      Preuve
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
