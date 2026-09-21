import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  AlertTriangle,
  Users2,
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Lock
} from 'lucide-react';
import { performanceApi, teamApi } from '../services/api';
import { TeamsCyclesAdminPanel } from './TeamsCyclesAdminPanel';
import { GeneralAssessmentSummary } from './GeneralAssessmentSummary';
import { GeneralManagerAssessmentForm, GeneralManagerAssessmentSaveInput } from './GeneralManagerAssessmentForm';
import { useSocketOptional } from '../hooks/useSocketContext';
import { useStore } from '../store/useStore';
import type { Team } from '../domain/team';
import {
  PerformanceReview,
  PerformanceReviewUserRef,
  PerformanceCycle,
  ObjectiveDefinitionInput,
  AssessmentInput,
  GeneralAssessmentReferentialProfile,
  ObjectiveAssessmentStatus,
  PerformanceReviewStatus,
  CompetencyAxis,
  PERFORMANCE_REVIEW_STATUSES,
  OBJECTIVE_ASSESSMENT_STATUSES,
  COMPETENCY_AXES,
  computeReviewScore,
  computeGeneralAssessmentGlobalScore,
  validateObjectivesDefinition,
  suggestCompetencyAxes,
  OBJECTIVE_STATUS_LABELS,
  OBJECTIVE_STATUS_BADGE_CLASS,
  summarizeObjectiveStatuses,
  summarizeTeamReviews,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_BADGE_CLASS,
  CYCLE_STATUS_LABELS,
  COMPETENCY_AXIS_LABELS,
  QUALITATIVE_FIELDS,
  PerformanceTeamMember,
  normalizePerformanceReview
} from '../domain/performance';

function extractApiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message || e?.message || fallback;
}

function reviewUserId(review: PerformanceReview): string {
  return typeof review.user === 'string' ? review.user : review.user._id;
}

function reviewUserLabel(review: PerformanceReview): string {
  if (typeof review.user === 'string') return review.user;
  const user = review.user as PerformanceReviewUserRef;
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return name || user.email || user._id;
}

/** Score global (0-5) de la grille générale, formaté pour l'affichage — utilisé pour la colonne self ET manager (même forme `GeneralAssessmentAxes` des deux côtés). */
function formatGeneralAssessmentScore(axes: PerformanceReview['generalSelfAssessment']): string {
  const score = computeGeneralAssessmentGlobalScore(axes);
  if (score <= 0) return '—';
  return `${score.toFixed(1)} / 5`;
}

/** Formate une moyenne déjà calculée par `summarizeTeamReviews` (null = rien à afficher). */
function formatAvgScore(score: number | null, suffix: string): string {
  if (score == null) return '—';
  return `${score.toFixed(1)}${suffix}`;
}

function memberLabel(member: PerformanceTeamMember): string {
  const name = `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim();
  return name || member.email;
}

/**
 * Résumé compact de la répartition des statuts d'objectifs d'une fiche (colonne "Objectifs" du
 * tableau récap d'équipe) : un badge par statut présent avec son nombre d'objectifs, dans l'ordre
 * du moins bon au meilleur (voir `summarizeObjectiveStatuses`). Aucun objectif statué (des deux
 * côtés) -> tiret, pour rester cohérent avec les autres colonnes du tableau.
 */
function ObjectiveStatusBadges({ objectives }: { objectives: PerformanceReview['objectives'] }) {
  const summary = summarizeObjectiveStatuses(objectives);
  if (summary.length === 0) return <span className="text-surface-500">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {summary.map(({ status, count }) => (
        <span key={status} className={`badge ${OBJECTIVE_STATUS_BADGE_CLASS[status]}`}>
          {count} {OBJECTIVE_STATUS_LABELS[status]}
        </span>
      ))}
    </div>
  );
}

/**
 * Résumé compact de la répartition des fiches par statut au sein d'une équipe (carte "Répartition
 * par équipe") — un badge par statut représenté, dans l'ordre `PERFORMANCE_REVIEW_STATUSES`. Un
 * statut à 0 fiche n'est pas affiché, pour ne pas surcharger la ligne.
 */
function ReviewStatusCountBadges({ statusCounts }: { statusCounts: Record<PerformanceReviewStatus, number> }) {
  const present = PERFORMANCE_REVIEW_STATUSES.filter((status) => statusCounts[status] > 0);
  if (present.length === 0) return <span className="text-surface-500">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {present.map((status) => (
        <span key={status} className={`badge ${REVIEW_STATUS_BADGE_CLASS[status]}`}>
          {statusCounts[status]} {REVIEW_STATUS_LABELS[status]}
        </span>
      ))}
    </div>
  );
}

function buildEmptyReviewForMember(member: PerformanceTeamMember, cycleId: string): PerformanceReview {
  return {
    id: '',
    user: { _id: member.id, firstName: member.firstName, lastName: member.lastName, email: member.email },
    cycle: cycleId,
    team: member.teamId,
    objectives: [],
    qualitative: {
      successes: {},
      challenges: {},
      growthAreas: {},
      overallReview: {}
    },
    competencyScores: {
      technique: {},
      impact: {},
      collaboration: {},
      leadership: {}
    },
    generalSelfAssessment: { technique: [], impact: [], collaboration: [], leadership: [] },
    generalManagerAssessment: { technique: [], impact: [], collaboration: [], leadership: [] },
    status: 'dossier_manquant',
    createdBy: { id: member.id, name: memberLabel(member) },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const MAX_OBJECTIVES = 4;

interface KrDraft {
  id: string;
  label: string;
  weightPct: string;
}

interface ObjectiveDraft {
  id: string;
  title: string;
  description: string;
  weightPct: string;
  krs: KrDraft[];
  competencyAxes: CompetencyAxis[];
  /** true dès que le lead/CTO a modifié les axes à la main — bloque alors la re-suggestion automatique au fil de la saisie. */
  competencyAxesTouched: boolean;
}

function buildObjectivesDraft(objectives: PerformanceReview['objectives']): ObjectiveDraft[] {
  return objectives.map((o) => ({
    id: o.id,
    title: o.title,
    description: o.description ?? '',
    weightPct: String(Math.round(o.weight * 100)),
    krs: o.krs.map((kr) => ({ id: kr.id, label: kr.label, weightPct: String(Math.round(kr.weight * 100)) })),
    competencyAxes: o.competencyAxes ?? [],
    // Un objectif déjà défini a déjà des axes (éventuellement vides) choisis délibérément — on ne les re-suggère pas.
    competencyAxesTouched: true
  }));
}

function draftToDefinitionInput(objectives: ObjectiveDraft[]): ObjectiveDefinitionInput[] {
  return objectives.map((o) => ({
    id: o.id,
    title: o.title.trim(),
    description: o.description.trim() || undefined,
    weight: (Number(o.weightPct) || 0) / 100,
    competencyAxes: o.competencyAxes,
    krs: o.krs.map((kr) => ({
      id: kr.id,
      label: kr.label.trim(),
      weight: (Number(kr.weightPct) || 0) / 100
    }))
  }));
}

type QualitativeKey = 'successes' | 'challenges' | 'growthAreas' | 'overallReview';

interface ManagerObjectiveDraft {
  status: ObjectiveAssessmentStatus | '';
  comment: string;
}

interface ManagerDraft {
  objectives: Record<string, ManagerObjectiveDraft>;
  qualitative: Record<QualitativeKey, string>;
  competencyScores: Record<CompetencyAxis, string>;
}

function buildManagerDraft(review: PerformanceReview): ManagerDraft {
  const normalized = normalizePerformanceReview(review);
  return {
    objectives: Object.fromEntries(
      normalized.objectives.map((o) => [
        o.id,
        { status: o.managerAssessment.status ?? '', comment: o.managerAssessment.comment ?? '' }
      ])
    ),
    qualitative: {
      successes: normalized.qualitative.successes.manager ?? '',
      challenges: normalized.qualitative.challenges.manager ?? '',
      growthAreas: normalized.qualitative.growthAreas.manager ?? '',
      overallReview: normalized.qualitative.overallReview.manager ?? ''
    },
    competencyScores: {
      technique:
        normalized.competencyScores.technique.manager != null
          ? String(normalized.competencyScores.technique.manager)
          : '',
      impact:
        normalized.competencyScores.impact.manager != null
          ? String(normalized.competencyScores.impact.manager)
          : '',
      collaboration:
        normalized.competencyScores.collaboration.manager != null
          ? String(normalized.competencyScores.collaboration.manager)
          : '',
      leadership:
        normalized.competencyScores.leadership.manager != null
          ? String(normalized.competencyScores.leadership.manager)
          : ''
    }
  };
}

export function TeamPerformancePage() {
  const socket = useSocketOptional();
  const user = useStore((state) => state.user);
  const isGlobal = !!user?.performanceGlobalAccess;
  const leadTeamIds = useMemo(() => user?.leadTeamIds ?? [], [user?.leadTeamIds]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cycles, setCycles] = useState<PerformanceCycle[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<PerformanceTeamMember[]>([]);
  const [activeTab, setActiveTab] = useState<'suivi' | 'gestion'>('suivi');

  const [teamFilter, setTeamFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<PerformanceReviewStatus | ''>('');
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PerformanceReview | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [objectivesDraft, setObjectivesDraft] = useState<ObjectiveDraft[]>([]);
  const [savingObjectives, setSavingObjectives] = useState(false);

  const [managerDraft, setManagerDraft] = useState<ManagerDraft | null>(null);
  const [savingManager, setSavingManager] = useState(false);
  const [savingGeneralManager, setSavingGeneralManager] = useState(false);

  const [referentialProfiles, setReferentialProfiles] = useState<GeneralAssessmentReferentialProfile[]>([]);
  const [loadingReferential, setLoadingReferential] = useState(true);

  const cycle = useMemo(() => cycles.find((c) => c.status === 'active') ?? null, [cycles]);
  const isReadOnly = cycle != null && cycle.status !== 'active';

  const teamsById = useMemo(() => new Map(teams.map((t) => [String(t.id), t.name])), [teams]);
  const membersById = useMemo(() => new Map(members.map((m) => [String(m.id), m])), [members]);
  const filterableTeams = useMemo(
    () => (isGlobal ? teams : teams.filter((t) => leadTeamIds.includes(t.id))),
    [teams, isGlobal, leadTeamIds]
  );

  function teamLabelForReview(review: PerformanceReview): string {
    const reviewTeamId = review.team ? String(review.team) : '';
    if (reviewTeamId && teamsById.get(reviewTeamId)) return teamsById.get(reviewTeamId)!;
    if (review.teamNameSnapshot) return review.teamNameSnapshot;
    const userId = String(reviewUserId(review));
    const member = membersById.get(userId);
    if (member?.teamId && teamsById.get(String(member.teamId))) return teamsById.get(String(member.teamId))!;
    const leadTeam = teams.find((team) =>
      (team.leadIds ?? []).some((id) => String(id) === userId)
    );
    if (leadTeam) return leadTeam.name;
    return '—';
  }

  const reviewedUserIds = useMemo(() => new Set(reviews.map((r) => String(reviewUserId(r)))), [reviews]);
  // Collaborateurs de la portée sans fiche encore ouverte pour ce cycle (jamais créée en base) :
  // on ne les affiche que si le filtre de statut ne les exclut pas explicitement.
  const virtualMembers = useMemo(
    () =>
      statusFilter === '' || statusFilter === 'dossier_manquant'
        ? members.filter((m) => !reviewedUserIds.has(String(m.id)))
        : [],
    [members, reviewedUserIds, statusFilter]
  );

  // Vue agrégée par équipe (carte "Répartition par équipe") : regroupe les fiches actuellement
  // chargées (déjà scopées par teamFilter/statusFilter côté API) par équipe, et résume chaque
  // groupe via `summarizeTeamReviews`. Recalculé à chaque render (liste courte, pas besoin de
  // dépendre de `teamLabelForReview` dans un useMemo).
  const teamSummaries = (() => {
    const grouped = new Map<string, PerformanceReview[]>();
    for (const review of reviews) {
      const label = teamLabelForReview(review);
      const bucket = grouped.get(label);
      if (bucket) {
        bucket.push(review);
      } else {
        grouped.set(label, [review]);
      }
    }
    return Array.from(grouped.entries())
      .map(([label, teamReviews]) => ({ label, summary: summarizeTeamReviews(teamReviews) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  })();

  const loadTeamsAndCycles = useCallback(async () => {
    const [cyclesResult, teamsResult] = await Promise.allSettled([performanceApi.getCycles(), teamApi.list()]);
    if (cyclesResult.status === 'fulfilled' && cyclesResult.value.success) {
      setCycles(cyclesResult.value.cycles);
    }
    if (teamsResult.status === 'fulfilled' && teamsResult.value.success) {
      setTeams(teamsResult.value.teams);
    }
  }, []);

  // Référentiels de notation détaillée (un par profil de poste) : chargés une fois, indépendamment
  // du cycle/de l'équipe — alimentent le formulaire de notation manager de la grille générale.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingReferential(true);
      try {
        const res = await performanceApi.getGeneralAssessmentReferential();
        if (!cancelled && res.success) {
          setReferentialProfiles(res.profiles);
        }
      } finally {
        if (!cancelled) setLoadingReferential(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      await loadTeamsAndCycles();
      if (cancelled) return;
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTeamsAndCycles]);

  useEffect(() => {
    // Rien à charger côté "suivi" si aucun cycle actif, ou si l'onglet "gestion" (CTO) est affiché.
    if (!cycle || (isGlobal && activeTab !== 'suivi')) return;
    let cancelled = false;
    (async () => {
      setListLoading(true);
      setError(null);
      const [reviewsResult, membersResult] = await Promise.allSettled([
        performanceApi.listReviews({
          cycleId: cycle.id,
          teamId: teamFilter || undefined,
          status: statusFilter || undefined
        }),
        performanceApi.getTeamMembers({ teamId: teamFilter || undefined })
      ]);
      if (cancelled) return;

      if (reviewsResult.status === 'fulfilled') {
        if (reviewsResult.value.success) {
          setReviews(reviewsResult.value.reviews.map(normalizePerformanceReview));
        }
      } else {
        setError(extractApiErrorMessage(reviewsResult.reason, 'Impossible de charger les fiches de performance'));
      }

      // Le croisement avec la liste des membres n'est qu'un complément d'affichage (collaborateurs
      // sans fiche encore ouverte) : un échec ici ne doit pas bloquer l'affichage des fiches existantes.
      setMembers(
        membersResult.status === 'fulfilled' && membersResult.value.success ? membersResult.value.members : []
      );

      setListLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [cycle, teamFilter, statusFilter, isGlobal, activeTab]);

  async function handleOpenDetail(userId: string) {
    if (!cycle) return;
    setSelectedUserId(userId);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await performanceApi.getReview(userId, cycle.id);
      if (res.success) {
        setDetail(normalizePerformanceReview(res.review));
        setObjectivesDraft(buildObjectivesDraft(res.review.objectives));
        setManagerDraft(buildManagerDraft(res.review));
      }
    } catch (err) {
      setDetailError(extractApiErrorMessage(err, 'Impossible de charger cette fiche de performance'));
    } finally {
      setDetailLoading(false);
    }
  }

  function handleOpenNewMember(member: PerformanceTeamMember) {
    if (!cycle) return;
    const synthetic = buildEmptyReviewForMember(member, cycle.id);
    setSelectedUserId(member.id);
    setDetail(synthetic);
    setDetailError(null);
    setDetailLoading(false);
    setObjectivesDraft(buildObjectivesDraft(synthetic.objectives));
    setManagerDraft(buildManagerDraft(synthetic));
  }

  function handleBackToList() {
    setSelectedUserId(null);
    setDetail(null);
    setDetailError(null);
    setObjectivesDraft([]);
    setManagerDraft(null);
  }

  function upsertReviewInList(updated: PerformanceReview) {
    setReviews((prev) => {
      const idx = prev.findIndex((r) => reviewUserId(r) === reviewUserId(updated));
      if (idx === -1) return [...prev, updated];
      const next = [...prev];
      next[idx] = { ...updated, user: prev[idx].user };
      return next;
    });
  }

  function addObjective() {
    setObjectivesDraft((prev) => [
      ...prev,
      {
        id: generateId('obj'),
        title: '',
        description: '',
        weightPct: '0',
        krs: [],
        competencyAxes: [],
        competencyAxesTouched: false
      }
    ]);
  }

  function removeObjective(objectiveId: string) {
    setObjectivesDraft((prev) => prev.filter((o) => o.id !== objectiveId));
  }

  function updateObjective(objectiveId: string, patch: Partial<Omit<ObjectiveDraft, 'krs'>>) {
    setObjectivesDraft((prev) =>
      prev.map((o) => {
        if (o.id !== objectiveId) return o;
        const next = { ...o, ...patch };
        // Re-suggère les axes tant que le lead/CTO n'y a pas touché lui-même (voir competencyAxesTouched).
        if (!o.competencyAxesTouched && (patch.title !== undefined || patch.description !== undefined)) {
          next.competencyAxes = suggestCompetencyAxes(next.title, next.description);
        }
        return next;
      })
    );
  }

  function toggleObjectiveCompetencyAxis(objectiveId: string, axis: CompetencyAxis) {
    setObjectivesDraft((prev) =>
      prev.map((o) => {
        if (o.id !== objectiveId) return o;
        const alreadySelected = o.competencyAxes.includes(axis);
        if (!alreadySelected && o.competencyAxes.length >= 2) return o; // plafond à 2 axes
        const competencyAxes = alreadySelected
          ? o.competencyAxes.filter((a) => a !== axis)
          : [...o.competencyAxes, axis];
        return { ...o, competencyAxes, competencyAxesTouched: true };
      })
    );
  }

  function addKeyResult(objectiveId: string) {
    setObjectivesDraft((prev) =>
      prev.map((o) =>
        o.id === objectiveId
          ? { ...o, krs: [...o.krs, { id: generateId('kr'), label: '', weightPct: '0' }] }
          : o
      )
    );
  }

  function removeKeyResult(objectiveId: string, krId: string) {
    setObjectivesDraft((prev) =>
      prev.map((o) => (o.id === objectiveId ? { ...o, krs: o.krs.filter((kr) => kr.id !== krId) } : o))
    );
  }

  function updateKeyResult(objectiveId: string, krId: string, patch: Partial<KrDraft>) {
    setObjectivesDraft((prev) =>
      prev.map((o) =>
        o.id === objectiveId
          ? { ...o, krs: o.krs.map((kr) => (kr.id === krId ? { ...kr, ...patch } : kr)) }
          : o
      )
    );
  }

  const objectivesValidation = useMemo(
    () => validateObjectivesDefinition(draftToDefinitionInput(objectivesDraft)),
    [objectivesDraft]
  );

  async function handleSaveObjectives() {
    if (!detail || !cycle) return;
    if (!objectivesValidation.valid) {
      socket?.notify?.error('Définition invalide', objectivesValidation.errors.join(' — '));
      return;
    }
    setSavingObjectives(true);
    try {
      const res = await performanceApi.defineObjectives(
        reviewUserId(detail),
        draftToDefinitionInput(objectivesDraft),
        cycle.id
      );
      const merged: PerformanceReview = { ...res.review, user: detail.user };
      setDetail(merged);
      setObjectivesDraft(buildObjectivesDraft(merged.objectives));
      setManagerDraft(buildManagerDraft(merged));
      upsertReviewInList(merged);
      socket?.notify?.success('Objectifs enregistrés', 'La définition des objectifs a été mise à jour');
    } catch (err) {
      socket?.notify?.error('Échec', extractApiErrorMessage(err, "Erreur lors de l'enregistrement des objectifs"));
    } finally {
      setSavingObjectives(false);
    }
  }

  function updateManagerObjectiveDraft(objectiveId: string, patch: Partial<ManagerObjectiveDraft>) {
    setManagerDraft((prev) => {
      if (!prev) return prev;
      const current = prev.objectives[objectiveId] ?? { status: '', comment: '' };
      return { ...prev, objectives: { ...prev.objectives, [objectiveId]: { ...current, ...patch } } };
    });
  }

  function updateManagerQualitative(field: QualitativeKey, value: string) {
    setManagerDraft((prev) => (prev ? { ...prev, qualitative: { ...prev.qualitative, [field]: value } } : prev));
  }

  function updateManagerCompetency(axis: CompetencyAxis, value: string) {
    setManagerDraft((prev) =>
      prev ? { ...prev, competencyScores: { ...prev.competencyScores, [axis]: value } } : prev
    );
  }

  async function handleSaveManagerAssessment() {
    if (!detail || !managerDraft) return;

    const input: AssessmentInput = {
      objectives: detail.objectives.map((o) => {
        const draft = managerDraft.objectives[o.id];
        return {
          id: o.id,
          status: draft?.status || undefined,
          comment: draft?.comment.trim() ? draft.comment.trim() : undefined
        };
      }),
      qualitative: {
        successes: managerDraft.qualitative.successes.trim() || undefined,
        challenges: managerDraft.qualitative.challenges.trim() || undefined,
        growthAreas: managerDraft.qualitative.growthAreas.trim() || undefined,
        overallReview: managerDraft.qualitative.overallReview.trim() || undefined
      },
      competencyScores: Object.fromEntries(
        COMPETENCY_AXES.filter((axis) => managerDraft.competencyScores[axis].trim() !== '').map((axis) => [
          axis,
          Number(managerDraft.competencyScores[axis])
        ])
      )
    };

    setSavingManager(true);
    try {
      const res = await performanceApi.updateManagerAssessment(reviewUserId(detail), input);
      const merged: PerformanceReview = { ...res.review, user: detail.user };
      setDetail(merged);
      setManagerDraft(buildManagerDraft(merged));
      upsertReviewInList(merged);
      socket?.notify?.success('Évaluation enregistrée', "L'évaluation manager a bien été sauvegardée");
    } catch (err) {
      socket?.notify?.error(
        "Échec de l'enregistrement",
        extractApiErrorMessage(err, "Erreur lors de l'enregistrement de l'évaluation")
      );
    } finally {
      setSavingManager(false);
    }
  }

  async function handleSaveGeneralManagerAssessment({ axes, roleProfile }: GeneralManagerAssessmentSaveInput) {
    if (!detail) return;
    setSavingGeneralManager(true);
    try {
      const res = await performanceApi.updateGeneralManagerAssessment(reviewUserId(detail), { axes, roleProfile });
      const merged: PerformanceReview = { ...res.review, user: detail.user };
      setDetail(merged);
      upsertReviewInList(merged);
      socket?.notify?.success('Grille enregistrée', 'La grille manager a bien été sauvegardée');
    } catch (err) {
      socket?.notify?.error(
        "Échec de l'enregistrement",
        extractApiErrorMessage(err, "Erreur lors de l'enregistrement de la grille manager")
      );
    } finally {
      setSavingGeneralManager(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-accent-500 animate-spin mx-auto mb-3" />
          <p className="text-surface-400">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
          <Users2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-surface-100">Performance équipe</h1>
          <p className="text-sm text-surface-400">Objectifs et évaluation des collaborateurs</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {isGlobal && !selectedUserId && (
        <div className="flex gap-1 border-b border-surface-700/50">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'suivi'
                ? 'border-accent-500 text-surface-100'
                : 'border-transparent text-surface-400 hover:text-surface-200'
            }`}
            onClick={() => setActiveTab('suivi')}
          >
            Suivi
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'gestion'
                ? 'border-accent-500 text-surface-100'
                : 'border-transparent text-surface-400 hover:text-surface-200'
            }`}
            onClick={() => setActiveTab('gestion')}
          >
            Gestion équipes & cycles
          </button>
        </div>
      )}

      {!error && (!isGlobal || activeTab === 'suivi') && !cycle && (
        <div className="alert alert-info">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>Aucun cycle de performance actif pour le moment.</p>
        </div>
      )}

      {!error && isGlobal && activeTab === 'gestion' && !selectedUserId && (
        <TeamsCyclesAdminPanel teams={teams} cycles={cycles} onChanged={loadTeamsAndCycles} />
      )}

      {!error && (!isGlobal || activeTab === 'suivi') && cycle && !selectedUserId && (
        <>
          <div className="card-glass p-6 flex flex-wrap items-center gap-3">
            <span className="badge badge-info">
              {cycle.label} — {CYCLE_STATUS_LABELS[cycle.status]}
            </span>
            {isReadOnly && (
              <span className="flex items-center gap-1.5 text-sm text-surface-400">
                <Lock className="w-3.5 h-3.5" />
                Ce cycle est clos, lecture seule
              </span>
            )}
          </div>

          <div className="card-glass p-4 flex flex-wrap items-center gap-3">
            <select className="input w-auto" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              <option value="">{isGlobal ? 'Toutes les équipes' : 'Toutes mes équipes'}</option>
              {filterableTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              className="input w-auto"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PerformanceReviewStatus | '')}
            >
              <option value="">Tous les statuts</option>
              {PERFORMANCE_REVIEW_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {REVIEW_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>

          {!listLoading && teamSummaries.length > 0 && (
            <div className="card-glass overflow-hidden">
              <h3 className="text-base font-semibold text-surface-100 p-4 pb-0">Répartition par équipe</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-700/50 text-left text-surface-400">
                    <th className="p-3 font-medium">Équipe</th>
                    <th className="p-3 font-medium">Fiches</th>
                    <th className="p-3 font-medium">Score objectifs (moy.)</th>
                    <th className="p-3 font-medium">Score auto-évaluation (moy.)</th>
                    <th className="p-3 font-medium">Score évaluation manager (moy.)</th>
                  </tr>
                </thead>
                <tbody>
                  {teamSummaries.map(({ label, summary }) => (
                    <tr key={label} className="border-b border-surface-800/50">
                      <td className="p-3 text-surface-200">{label}</td>
                      <td className="p-3">
                        <ReviewStatusCountBadges statusCounts={summary.statusCounts} />
                      </td>
                      <td className="p-3 text-surface-300">{formatAvgScore(summary.avgObjectivesScore, '%')}</td>
                      <td className="p-3 text-surface-300">{formatAvgScore(summary.avgSelfAssessmentScore, ' / 5')}</td>
                      <td className="p-3 text-surface-300">{formatAvgScore(summary.avgManagerAssessmentScore, ' / 5')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card-glass overflow-hidden">
            {listLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-6 h-6 text-accent-500 animate-spin mx-auto" />
              </div>
            ) : reviews.length === 0 && virtualMembers.length === 0 ? (
              <p className="p-6 text-sm text-surface-400">
                Aucune fiche de performance dans votre périmètre pour ce cycle.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-700/50 text-left text-surface-400">
                    <th className="p-3 font-medium">Collaborateur</th>
                    <th className="p-3 font-medium">Équipe</th>
                    <th className="p-3 font-medium">Statut</th>
                    <th className="p-3 font-medium">Score</th>
                    <th className="p-3 font-medium">Score auto-évaluation</th>
                    <th className="p-3 font-medium">Score évaluation manager</th>
                    <th className="p-3 font-medium">Objectifs</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((review) => (
                    <tr key={reviewUserId(review)} className="border-b border-surface-800/50">
                      <td className="p-3 text-surface-200">{reviewUserLabel(review)}</td>
                      <td className="p-3 text-surface-400">{teamLabelForReview(review)}</td>
                      <td className="p-3">
                        <span className={`badge ${REVIEW_STATUS_BADGE_CLASS[review.status]}`}>
                          {REVIEW_STATUS_LABELS[review.status]}
                        </span>
                      </td>
                      <td className="p-3 text-surface-300">{Math.round(computeReviewScore(review.objectives))}%</td>
                      <td className="p-3 text-surface-300">
                        {formatGeneralAssessmentScore(review.generalSelfAssessment)}
                      </td>
                      <td className="p-3 text-surface-300">
                        {formatGeneralAssessmentScore(review.generalManagerAssessment)}
                      </td>
                      <td className="p-3">
                        <ObjectiveStatusBadges objectives={review.objectives} />
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          className="btn-ghost text-xs px-3 py-1.5"
                          onClick={() => handleOpenDetail(reviewUserId(review))}
                        >
                          Ouvrir
                        </button>
                      </td>
                    </tr>
                  ))}
                  {virtualMembers.map((member) => (
                    <tr key={member.id} className="border-b border-surface-800/50">
                      <td className="p-3 text-surface-200">{memberLabel(member)}</td>
                      <td className="p-3 text-surface-400">{teamsById.get(String(member.teamId)) || '—'}</td>
                      <td className="p-3">
                        <span className={`badge ${REVIEW_STATUS_BADGE_CLASS.dossier_manquant}`}>
                          {REVIEW_STATUS_LABELS.dossier_manquant}
                        </span>
                      </td>
                      <td className="p-3 text-surface-300">—</td>
                      <td className="p-3 text-surface-300">—</td>
                      <td className="p-3 text-surface-300">—</td>
                      <td className="p-3 text-surface-500">—</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          className="btn-ghost text-xs px-3 py-1.5"
                          onClick={() => handleOpenNewMember(member)}
                        >
                          Ouvrir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {selectedUserId && (
        <div className="space-y-6">
          <button type="button" className="btn-ghost text-sm" onClick={handleBackToList}>
            <ArrowLeft className="w-4 h-4" />
            Retour à la liste
          </button>

          {detailLoading && (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 text-accent-500 animate-spin mx-auto" />
            </div>
          )}

          {detailError && (
            <div className="alert alert-danger">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>{detailError}</p>
            </div>
          )}

          {detail && (
            <>
              <div className="card-glass p-6 flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold text-surface-100">{reviewUserLabel(detail)}</h2>
                <span className={`badge ${REVIEW_STATUS_BADGE_CLASS[detail.status]}`}>
                  {REVIEW_STATUS_LABELS[detail.status]}
                </span>
                <span className="badge badge-info">Score {Math.round(computeReviewScore(detail.objectives))}%</span>
              </div>

              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-surface-100">Définition des objectifs</h3>
                  {!isReadOnly && (
                    <button
                      type="button"
                      className="btn-secondary text-sm"
                      disabled={objectivesDraft.length >= MAX_OBJECTIVES}
                      onClick={addObjective}
                    >
                      <Plus className="w-4 h-4" />
                      Ajouter un objectif
                    </button>
                  )}
                </div>

                {objectivesDraft.map((objective) => (
                  <div key={objective.id} className="border border-surface-700/50 rounded-xl p-4 space-y-3">
                    <div className="grid sm:grid-cols-[1fr_100px_auto] gap-2 items-start">
                      <div className="space-y-2">
                        <input
                          type="text"
                          className="input"
                          placeholder="Titre de l'objectif"
                          value={objective.title}
                          disabled={isReadOnly}
                          onChange={(e) => updateObjective(objective.id, { title: e.target.value })}
                        />
                        <input
                          type="text"
                          className="input"
                          placeholder="Description (optionnel)"
                          value={objective.description}
                          disabled={isReadOnly}
                          onChange={(e) => updateObjective(objective.id, { description: e.target.value })}
                        />
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="input"
                        placeholder="Poids %"
                        value={objective.weightPct}
                        disabled={isReadOnly}
                        onChange={(e) => updateObjective(objective.id, { weightPct: e.target.value })}
                      />
                      {!isReadOnly && (
                        <button
                          type="button"
                          className="btn-ghost text-danger-400"
                          onClick={() => removeObjective(objective.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pl-1">
                      <span className="text-xs text-surface-400">Axes de compétence (max 2) :</span>
                      {COMPETENCY_AXES.map((axis) => {
                        const checked = objective.competencyAxes.includes(axis);
                        const disabled = isReadOnly || (!checked && objective.competencyAxes.length >= 2);
                        return (
                          <label
                            key={axis}
                            className="flex items-center gap-1.5 text-sm text-surface-300"
                          >
                            <input
                              type="checkbox"
                              className="rounded border-surface-600"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleObjectiveCompetencyAxis(objective.id, axis)}
                            />
                            {COMPETENCY_AXIS_LABELS[axis]}
                          </label>
                        );
                      })}
                    </div>

                    <div className="pl-2 space-y-2">
                      {objective.krs.map((kr) => (
                        <div key={kr.id} className="grid sm:grid-cols-[1fr_100px_auto] gap-2 items-center">
                          <input
                            type="text"
                            className="input"
                            placeholder="Résultat clé"
                            value={kr.label}
                            disabled={isReadOnly}
                            onChange={(e) => updateKeyResult(objective.id, kr.id, { label: e.target.value })}
                          />
                          <input
                            type="number"
                            min={0}
                            max={100}
                            className="input"
                            placeholder="Poids %"
                            value={kr.weightPct}
                            disabled={isReadOnly}
                            onChange={(e) => updateKeyResult(objective.id, kr.id, { weightPct: e.target.value })}
                          />
                          {!isReadOnly && (
                            <button
                              type="button"
                              className="btn-ghost text-danger-400"
                              onClick={() => removeKeyResult(objective.id, kr.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      {!isReadOnly && (
                        <button
                          type="button"
                          className="btn-ghost text-xs px-2 py-1"
                          onClick={() => addKeyResult(objective.id)}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Ajouter un résultat clé
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {!objectivesValidation.valid && objectivesDraft.length > 0 && (
                  <ul className="text-xs text-danger-400 list-disc pl-4">
                    {objectivesValidation.errors.map((msg) => (
                      <li key={msg}>{msg}</li>
                    ))}
                  </ul>
                )}

                {!isReadOnly && (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={savingObjectives || !objectivesValidation.valid}
                    onClick={handleSaveObjectives}
                  >
                    {savingObjectives ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Enregistrer les objectifs
                  </button>
                )}
              </div>

              <GeneralAssessmentSummary axes={detail.generalSelfAssessment} objectives={detail.objectives} />

              <GeneralManagerAssessmentForm
                selfAxes={detail.generalSelfAssessment}
                managerAxes={detail.generalManagerAssessment}
                roleProfile={detail.generalAssessmentRoleProfile}
                referentialProfiles={referentialProfiles}
                loadingReferential={loadingReferential}
                disabled={isReadOnly}
                saving={savingGeneralManager}
                onSave={handleSaveGeneralManagerAssessment}
              />

              {managerDraft && detail.objectives.length > 0 && (
                <div className="card-glass p-6 space-y-6">
                  <h3 className="text-base font-semibold text-surface-100">Évaluation manager</h3>

                  <div className="space-y-4">
                    {detail.objectives.map((objective) => {
                      const draft = managerDraft.objectives[objective.id] ?? { status: '', comment: '' };
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
                            <div className="flex items-center gap-2">
                              <select
                                className="input"
                                value={draft.status}
                                disabled={isReadOnly}
                                onChange={(e) =>
                                  updateManagerObjectiveDraft(objective.id, {
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
                              {draft.status && (
                                <span className={`badge ${OBJECTIVE_STATUS_BADGE_CLASS[draft.status]}`}>
                                  {OBJECTIVE_STATUS_LABELS[draft.status]}
                                </span>
                              )}
                            </div>
                            <textarea
                              className="input min-h-[38px]"
                              placeholder="Votre commentaire"
                              value={draft.comment}
                              disabled={isReadOnly}
                              onChange={(e) => updateManagerObjectiveDraft(objective.id, { comment: e.target.value })}
                            />
                          </div>
                          {objective.selfAssessment.status && (
                            <p className="mt-2 flex items-center gap-1.5 text-xs text-surface-500">
                              Bilan du cycle (collaborateur) :
                              <span className={`badge ${OBJECTIVE_STATUS_BADGE_CLASS[objective.selfAssessment.status]}`}>
                                {OBJECTIVE_STATUS_LABELS[objective.selfAssessment.status]}
                              </span>
                              {objective.selfAssessment.comment ? ` — ${objective.selfAssessment.comment}` : ''}
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
                          value={managerDraft.qualitative[key]}
                          disabled={isReadOnly}
                          onChange={(e) => updateManagerQualitative(key, e.target.value)}
                        />
                        {detail.qualitative[key].self && (
                          <p className="mt-1 text-xs text-surface-500">Collaborateur : {detail.qualitative[key].self}</p>
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
                            value={managerDraft.competencyScores[axis]}
                            disabled={isReadOnly}
                            onChange={(e) => updateManagerCompetency(axis, e.target.value)}
                          />
                          {detail.competencyScores[axis].self != null && (
                            <p className="mt-1 text-xs text-surface-500">
                              Collaborateur : {detail.competencyScores[axis].self}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-primary"
                    disabled={isReadOnly || savingManager}
                    onClick={handleSaveManagerAssessment}
                  >
                    {savingManager ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Enregistrer l'évaluation
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
