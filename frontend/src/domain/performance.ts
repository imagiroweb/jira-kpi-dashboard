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
