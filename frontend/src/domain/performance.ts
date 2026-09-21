/**
 * Types du domaine "Performance & OKR" côté frontend — miroir des types
 * backend (`backend/src/domain/performance/entities/PerformanceReview.ts`,
 * `PerformanceCycle.ts`, `performanceReview.ts`). La validation et la fusion
 * des objectifs restent côté backend (seule source de vérité) ; ce fichier
 * ne décrit que les formes de données échangées avec l'API.
 */

export const OBJECTIVE_ASSESSMENT_STATUSES = [
  'non_atteint',
  'partiellement_atteint',
  'atteint',
  'depasse'
] as const;
export type ObjectiveAssessmentStatus = (typeof OBJECTIVE_ASSESSMENT_STATUSES)[number];

export const PERFORMANCE_REVIEW_STATUSES = ['dossier_manquant', 'en_cours', 'complete'] as const;
export type PerformanceReviewStatus = (typeof PERFORMANCE_REVIEW_STATUSES)[number];

export const COMPETENCY_AXES = ['technique', 'impact', 'collaboration', 'leadership'] as const;
export type CompetencyAxis = (typeof COMPETENCY_AXES)[number];

export const REVIEW_AUTHOR_ROLES = ['collaborateur', 'lead', 'cto'] as const;
export type ReviewAuthorRole = (typeof REVIEW_AUTHOR_ROLES)[number];

export const PERFORMANCE_CYCLE_STATUSES = ['draft', 'active', 'closed'] as const;
export type PerformanceCycleStatus = (typeof PERFORMANCE_CYCLE_STATUSES)[number];

/** Auteur d'une action sur la fiche (définition d'objectif, mise à jour, évaluation). */
export interface ReviewAuthor {
  id: string;
  name: string;
  role?: ReviewAuthorRole;
}

/** Une mise à jour d'avancement d'un KR, conservée dans l'historique (pas seulement la dernière valeur). */
export interface ProgressUpdate {
  value: number;
  note?: string;
  evidenceUrl?: string;
  updatedBy: ReviewAuthor;
  updatedAt: string;
}

export interface KeyResult {
  id: string;
  label: string;
  weight: number;
  /** Valeur actuelle (dernière entrée de progressHistory, dupliquée ici pour un accès direct). */
  progress: number;
  progressHistory: ProgressUpdate[];
}

export interface ObjectiveAssessment {
  status?: ObjectiveAssessmentStatus;
  comment?: string;
}

export interface Objective {
  id: string;
  title: string;
  description?: string;
  weight: number;
  /** Jusqu'à 2 axes de compétence associés à cet objectif (rapprochement OKR / grille de compétences). */
  competencyAxes?: CompetencyAxis[];
  krs: KeyResult[];
  selfAssessment: ObjectiveAssessment;
  managerAssessment: ObjectiveAssessment;
}

/** Un champ texte du bilan qualitatif, rempli des deux côtés (self / manager). */
export interface QualitativeEntry {
  self?: string;
  manager?: string;
}

export interface Qualitative {
  successes: QualitativeEntry;
  challenges: QualitativeEntry;
  growthAreas: QualitativeEntry;
  overallReview: QualitativeEntry;
}

export interface CompetencyScore {
  self?: number;
  manager?: number;
}

export type CompetencyScores = Record<CompetencyAxis, CompetencyScore>;

/** Utilisateur tel que renvoyé quand la fiche est peuplée (listes/détail lead-CTO). */
export interface PerformanceReviewUserRef {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface PerformanceReview {
  id: string;
  /** ObjectId brut sur `GET/PATCH .../me...` ; objet peuplé sur les listes/détail lead-CTO. */
  user: string | PerformanceReviewUserRef;
  cycle: string;
  /** Équipe au moment du cycle — recopiée à la création, indépendante d'un changement d'équipe ultérieur. */
  team?: string;
  teamNameSnapshot?: string;
  objectives: Objective[];
  qualitative: Qualitative;
  competencyScores: CompetencyScores;
  status: PerformanceReviewStatus;
  /** Qui a défini les objectifs de cette fiche (un lead pour son équipe, ou le CTO). */
  definedBy?: ReviewAuthor;
  createdBy: ReviewAuthor;
  updatedBy?: ReviewAuthor;
  createdAt: string;
  updatedAt: string;
}

/** Cycle de performance (semestre), ex. "S2-2026". Un seul `active` à la fois. */
export interface PerformanceCycle {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: PerformanceCycleStatus;
  createdAt: string;
  updatedAt: string;
}

// --- Payloads d'écriture (miroir de src/domain/performance/performanceReview.ts côté backend) ---

export interface KeyResultDefinitionInput {
  id: string;
  label: string;
  weight: number;
}

/** Un objectif tel que défini par un lead/CTO — `PATCH /reviews/:userId/objectives`. */
export interface ObjectiveDefinitionInput {
  id: string;
  title: string;
  description?: string;
  weight: number;
  /** Jusqu'à 2 axes de compétence associés (voir `suggestCompetencyAxes`), librement modifiables. */
  competencyAxes?: CompetencyAxis[];
  krs: KeyResultDefinitionInput[];
}

/** Évaluation (self ou manager) d'un objectif, par id d'objectif. */
export interface ObjectiveAssessmentInput {
  id: string;
  status?: ObjectiveAssessmentStatus;
  comment?: string;
}

/** Champs qualitatifs remplis d'un côté (self ou manager) — un champ omis n'est pas modifié. */
export interface QualitativeAssessmentInput {
  successes?: string;
  challenges?: string;
  growthAreas?: string;
  overallReview?: string;
}

/** Payload commun à `PATCH /reviews/:userId/manager-assessment` et `PATCH /reviews/me/self-assessment`. */
export interface AssessmentInput {
  objectives?: ObjectiveAssessmentInput[];
  qualitative?: QualitativeAssessmentInput;
  competencyScores?: Partial<Record<CompetencyAxis, number>>;
}

/** Payload de `POST /reviews/me/objectives/:objectiveId/krs/:krId/progress`. */
export interface ProgressUpdateInput {
  value: number;
  note?: string;
  evidenceUrl?: string;
}

export interface CreatePerformanceCycleInput {
  label: string;
  startDate: string;
  endDate: string;
  status?: PerformanceCycleStatus;
}

export interface UpdatePerformanceCycleInput {
  label?: string;
  startDate?: string;
  endDate?: string;
  status?: PerformanceCycleStatus;
}

/** Un membre d'équipe (résultat de `GET /performance/team-members`), avec ou sans fiche ouverte. */
export interface PerformanceTeamMember {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  teamId: string;
}

export interface OkrImportPlanEntry {
  name: string;
  team: string;
  relativePath: string;
  outcome: 'unrecognized_filename' | 'no_match' | 'worksheet_not_found' | 'read_error' | 'invalid' | 'ready';
  email: string | null;
  warnings: string[];
  errors: string[];
  objectiveTitles: string[];
}

export interface OkrImportResult {
  success: boolean;
  dryRun: boolean;
  cycle: { id: string; label: string; status: string };
  entries: OkrImportPlanEntry[];
  writes: { name: string; email: string; ok: boolean; error?: string }[];
}

// --- Aides d'affichage pures (miroir de src/domain/performance/performanceReview.ts côté backend). ---
// Le backend reste la seule source de vérité : ces fonctions ne font qu'anticiper le même calcul
// côté client (barres de progression, validation immédiate d'un formulaire) avant l'appel API, qui
// revalide de toute façon. Aucune n'écrit ni ne décide d'un accès.

const WEIGHT_TOLERANCE = 0.01;
const MAX_OBJECTIVES = 4;

/** Somme des poids d'une liste d'objectifs ou de KR (0 si la liste est vide). */
export function sumWeights(items: { weight: number }[]): number {
  return items.reduce((sum, item) => sum + (item.weight || 0), 0);
}

/** Les poids d'une liste totalisent-ils bien 1 (à la tolérance près) ? Une liste vide est équilibrée. */
export function weightsAreBalanced(items: { weight: number }[], tolerance: number = WEIGHT_TOLERANCE): boolean {
  if (items.length === 0) return true;
  return Math.abs(sumWeights(items) - 1) <= tolerance;
}

/** Avancement d'un objectif (0-100) : moyenne pondérée de l'avancement de ses KR. */
export function computeObjectiveProgress(objective: Pick<Objective, 'krs'>): number {
  const totalWeight = sumWeights(objective.krs);
  if (totalWeight <= 0) return 0;
  const weightedSum = objective.krs.reduce((sum, kr) => sum + kr.weight * kr.progress, 0);
  return weightedSum / totalWeight;
}

/** Score global d'une fiche (0-100) : moyenne pondérée de l'avancement des objectifs. */
export function computeReviewScore(objectives: Pick<Objective, 'weight' | 'krs'>[]): number {
  const totalWeight = sumWeights(objectives);
  if (totalWeight <= 0) return 0;
  const weightedSum = objectives.reduce(
    (sum, objective) => sum + objective.weight * computeObjectiveProgress(objective),
    0
  );
  return weightedSum / totalWeight;
}

export interface ObjectivesDefinitionValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Valide une définition d'objectifs avant envoi (retour immédiat côté formulaire) : au plus 4
 * objectifs, poids d'objectifs et de KR équilibrés (somme à 1), identifiants uniques, titres
 * renseignés. Miroir exact de `validateObjectivesDefinition` côté backend, qui revalide à l'arrivée.
 */
export function validateObjectivesDefinition(objectives: ObjectiveDefinitionInput[]): ObjectivesDefinitionValidation {
  const errors: string[] = [];

  if (objectives.length === 0) {
    errors.push('Au moins un objectif est requis');
  }
  if (objectives.length > MAX_OBJECTIVES) {
    errors.push(`Un maximum de ${MAX_OBJECTIVES} objectifs est autorisé`);
  }
  if (!weightsAreBalanced(objectives)) {
    errors.push('La somme des poids des objectifs doit être égale à 1');
  }

  const seenObjectiveIds = new Set<string>();
  for (const objective of objectives) {
    if (!objective.id?.trim()) {
      errors.push('Chaque objectif doit avoir un identifiant');
    } else if (seenObjectiveIds.has(objective.id)) {
      errors.push(`Identifiant d'objectif en double : ${objective.id}`);
    } else {
      seenObjectiveIds.add(objective.id);
    }

    if (!objective.title?.trim()) {
      errors.push(`L'objectif ${objective.id || '(sans id)'} doit avoir un titre`);
    }

    if (objective.krs.length > 0 && !weightsAreBalanced(objective.krs)) {
      errors.push(
        `La somme des poids des résultats clés de l'objectif "${objective.title || objective.id}" doit être égale à 1`
      );
    }

    const seenKrIds = new Set<string>();
    for (const kr of objective.krs) {
      if (!kr.id?.trim()) {
        errors.push(`Chaque résultat clé de l'objectif ${objective.id || '(sans id)'} doit avoir un identifiant`);
      } else if (seenKrIds.has(kr.id)) {
        errors.push(`Identifiant de résultat clé en double dans l'objectif ${objective.id} : ${kr.id}`);
      } else {
        seenKrIds.add(kr.id);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Mots-clés associés à chaque axe de compétence, utilisés par
 * `suggestCompetencyAxes` — miroir exact de `COMPETENCY_AXIS_KEYWORDS` côté
 * backend (`src/domain/performance/performanceReview.ts`), à garder
 * synchronisé si la table évolue.
 */
const COMPETENCY_AXIS_KEYWORDS: Record<CompetencyAxis, string[]> = {
  technique: ['code', 'architecture', 'technique', 'technologie', 'dette technique', 'infrastructure', 'infra', 'sécurité'],
  impact: ['client', 'business', 'arr', 'delivery', 'livraison', "chiffre d'affaires", 'roadmap produit', 'produit'],
  collaboration: ['équipe', 'collaborat', 'communication', 'coordination', 'transverse'],
  leadership: ['mentor', 'vision', 'manager', 'leadership', 'encadrement', 'recrutement']
};

/**
 * Suggère jusqu'à 2 axes de compétence pour un objectif, par mots-clés sur
 * son titre + sa description — pure fonction, miroir exact de
 * `suggestCompetencyAxes` côté backend, qui reste la seule source de vérité
 * (cette fonction anticipe le même calcul côté client pour un aperçu
 * instantané dans le formulaire ; le lead/CTO reste libre de modifier la
 * sélection avant enregistrement).
 */
export function suggestCompetencyAxes(title: string, description?: string): CompetencyAxis[] {
  const haystack = `${title} ${description ?? ''}`.toLowerCase();

  return COMPETENCY_AXES.map((axis) => ({
    axis,
    matchCount: COMPETENCY_AXIS_KEYWORDS[axis].filter((keyword) => haystack.includes(keyword)).length
  }))
    .filter((entry) => entry.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 2)
    .map((entry) => entry.axis);
}

// --- Libellés d'affichage partagés (français) ---

export const OBJECTIVE_STATUS_LABELS: Record<ObjectiveAssessmentStatus, string> = {
  non_atteint: 'Non atteint',
  partiellement_atteint: 'Partiellement atteint',
  atteint: 'Atteint',
  depasse: 'Dépassé'
};

export const REVIEW_STATUS_LABELS: Record<PerformanceReviewStatus, string> = {
  dossier_manquant: 'Dossier manquant',
  en_cours: 'En cours',
  complete: 'Complète'
};

export const REVIEW_STATUS_BADGE_CLASS: Record<PerformanceReviewStatus, string> = {
  dossier_manquant: 'badge-danger',
  en_cours: 'badge-warning',
  complete: 'badge-success'
};

export const CYCLE_STATUS_LABELS: Record<PerformanceCycleStatus, string> = {
  draft: 'Brouillon',
  active: 'Actif',
  closed: 'Clos'
};

export const COMPETENCY_AXIS_LABELS: Record<CompetencyAxis, string> = {
  technique: 'Technique',
  impact: 'Impact',
  collaboration: 'Collaboration',
  leadership: 'Leadership'
};

export const QUALITATIVE_KEYS = ['successes', 'challenges', 'growthAreas', 'overallReview'] as const;
export type QualitativeKey = (typeof QUALITATIVE_KEYS)[number];

export const QUALITATIVE_FIELDS: {
  key: QualitativeKey;
  label: string;
}[] = [
  { key: 'successes', label: 'Réussites' },
  { key: 'challenges', label: 'Difficultés rencontrées' },
  { key: 'growthAreas', label: 'Axes de progression' },
  { key: 'overallReview', label: 'Bilan général' }
];

/** Fiche API incomplète (Mongoose `default: () => ({})`) : sous-objets qualitative / scores absents. */
export function emptyQualitative(): Qualitative {
  return { successes: {}, challenges: {}, growthAreas: {}, overallReview: {} };
}

export function emptyCompetencyScores(): CompetencyScores {
  return { technique: {}, impact: {}, collaboration: {}, leadership: {} };
}

export function normalizeQualitative(raw?: Partial<Qualitative> | null): Qualitative {
  const base = emptyQualitative();
  if (!raw) return base;
  return {
    successes: raw.successes ?? {},
    challenges: raw.challenges ?? {},
    growthAreas: raw.growthAreas ?? {},
    overallReview: raw.overallReview ?? {}
  };
}

export function normalizeCompetencyScores(raw?: Partial<CompetencyScores> | null): CompetencyScores {
  const base = emptyCompetencyScores();
  if (!raw) return base;
  return {
    technique: raw.technique ?? {},
    impact: raw.impact ?? {},
    collaboration: raw.collaboration ?? {},
    leadership: raw.leadership ?? {}
  };
}

export function normalizePerformanceReview(review: PerformanceReview): PerformanceReview {
  return {
    ...review,
    objectives: (review.objectives ?? []).map((objective) => ({
      ...objective,
      krs: objective.krs ?? [],
      selfAssessment: objective.selfAssessment ?? {},
      managerAssessment: objective.managerAssessment ?? {}
    })),
    qualitative: normalizeQualitative(review.qualitative),
    competencyScores: normalizeCompetencyScores(review.competencyScores)
  };
}

