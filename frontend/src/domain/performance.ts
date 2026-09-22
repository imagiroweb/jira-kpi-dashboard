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

/**
 * Profils de poste utilisés pour la notation manager de la grille générale — miroir exact de
 * `ROLE_PROFILES` côté backend (`PerformanceReview.ts`). La composante Technique du référentiel
 * varie selon le profil ; les libellés d'affichage viennent du référentiel chargé via
 * `GET /performance/general-assessment-referential` (champ `label`), pas d'une table statique ici.
 */
export const ROLE_PROFILES = ['dev_back', 'dev_front', 'qa', 'dba'] as const;
export type RoleProfile = (typeof ROLE_PROFILES)[number];

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
  /** Action d'accompagnement saisie par le manager, à suivre par le collaborateur. */
  coachingAction?: string;
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

/**
 * Un sous-critère noté (1-5) de l'auto-évaluation générale — distincte du "Bilan du cycle"
 * (`qualitative` ci-dessus, rempli à chaque cycle par le collaborateur et son manager). Reprend
 * la grille à 4 axes × 3 sous-critères des fichiers Excel importés (voir `IGeneralAssessmentAxes`
 * côté backend) ; pas encore éditable depuis l'UI, alimentée par l'import.
 */
export interface GeneralAssessmentSubCriterion {
  label: string;
  score: number;
  /**
   * Réponse verbeuse choisie — uniquement renseignée côté évaluation manager (le score est
   * toujours résolu serveur à partir de cette réponse, voir `GeneralAssessmentManagerAxesInput`).
   * Absente côté auto-évaluation (import Excel : seul le score y est connu).
   */
  answer?: string;
}

export type GeneralAssessmentAxes = Record<CompetencyAxis, GeneralAssessmentSubCriterion[]>;

/** Payload de `PATCH .../general-self-assessment` — un axe absent n'est pas modifié. */
export type GeneralAssessmentAxesInput = Partial<Record<CompetencyAxis, GeneralAssessmentSubCriterion[]>>;

/**
 * Un sous-critère tel que noté par le manager : uniquement la réponse verbeuse choisie (son
 * texte exact, tel qu'il apparaît dans le référentiel du profil de poste ciblé) — jamais de note
 * brute, résolue côté serveur (voir `GeneralAssessmentReferentialProfile`).
 */
export interface GeneralAssessmentManagerSubCriterionInput {
  label: string;
  answer: string;
}

/** Payload de `PATCH .../general-manager-assessment` — un axe absent n'est pas modifié. */
export type GeneralAssessmentManagerAxesInput = Partial<Record<CompetencyAxis, GeneralAssessmentManagerSubCriterionInput[]>>;

/** Une réponse verbeuse possible pour un sous-critère, avec ses points (1-5). */
export interface ReferentialAnswer {
  text: string;
  points: number;
}

/** Un sous-critère noté : toujours 5 réponses, de la moins bonne à la meilleure. */
export interface ReferentialCriterion {
  label: string;
  answers: ReferentialAnswer[];
}

export type ReferentialAxes = Record<CompetencyAxis, ReferentialCriterion[]>;

/**
 * Référentiel de notation détaillée d'un profil de poste (`GET /performance/general-assessment-referential`)
 * — un document par profil, les 4 axes × leurs sous-critères × leurs 5 réponses possibles. Alimente
 * le formulaire de notation manager (`GeneralManagerAssessmentForm`) : le manager choisit une
 * réponse par sous-critère, jamais une note brute.
 */
export interface GeneralAssessmentReferentialProfile {
  roleProfile: RoleProfile;
  /** Libellé d'affichage, ex. "Développeur Back", "QA". */
  label: string;
  axes: ReferentialAxes;
  updatedBy?: ReviewAuthor;
  updatedAt: string;
}

/**
 * Référentiel des 12 sous-critères (4 axes × 3), identiques quel que soit le rôle du
 * collaborateur — miroir exact de `GENERAL_ASSESSMENT_REFERENTIAL` côté backend
 * (`src/domain/performance/performanceReview.ts`). Sert de trame fixe au formulaire de notation
 * manager, pour que chaque sous-critère self soit comparable au même sous-critère manager.
 */
export const GENERAL_ASSESSMENT_REFERENTIAL: Record<CompetencyAxis, string[]> = {
  technique: ['Qualité du code & revues', 'Autonomie & résolution de bugs', 'Conception & architecture'],
  impact: ['Livraison (delivery)', 'Contribution aux OKR', "Périmètre d'influence"],
  collaboration: ['Communication & transparence', 'Partage & documentation', "Esprit d'équipe & rituels"],
  leadership: ['Initiative & autonomie', 'Mentorat & développement des autres', 'Vision & influence']
};

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
  /** Auto-évaluation générale (4 axes × sous-critères) — voir `GeneralAssessmentAxes`. */
  generalSelfAssessment: GeneralAssessmentAxes;
  /** Évaluation manager sur la même grille, pour rapprochement avec l'auto-évaluation. */
  generalManagerAssessment: GeneralAssessmentAxes;
  /** Profil de poste choisi par le lead/CTO pour la notation manager de la grille générale (mémorisé sur la fiche). */
  generalAssessmentRoleProfile?: RoleProfile;
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
  /** Action d'accompagnement — uniquement persistée côté manager. */
  coachingAction?: string;
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

export interface GeneralAssessmentImportPlanEntry {
  name: string;
  fileName: string;
  outcome: 'no_match' | 'worksheet_not_found' | 'read_error' | 'empty' | 'ready';
  email: string | null;
  warnings: string[];
  errors: string[];
  scoredAxisCount: number;
}

export interface GeneralAssessmentImportResult {
  success: boolean;
  dryRun: boolean;
  cycle: { id: string; label: string; status: string };
  entries: GeneralAssessmentImportPlanEntry[];
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

/**
 * Statut d'objectif suggéré à partir de son avancement (0-100), pour pré-remplir le select de
 * statut du bilan du cycle avant toute saisie manuelle : 0-50 % → non atteint, 50-95 % →
 * partiellement atteint, 95-100 % → atteint. "Dépassé" ne peut pas être déduit d'un avancement
 * plafonné à 100 % et reste un choix exclusivement manuel : cette fonction ne le retourne jamais.
 */
export function computeAutoObjectiveStatus(progress: number): ObjectiveAssessmentStatus {
  if (progress < 50) return 'non_atteint';
  if (progress < 95) return 'partiellement_atteint';
  return 'atteint';
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

/**
 * Score pondéré d'un objectif (0-100 de la fiche) : avancement × poids. Un objectif à 30 %
 * réalisé à 50 % contribue 15 points au score global — c'est le "réalisé par rapport au
 * pourcentage de l'objectif" affiché à côté de la barre d'avancement.
 */
export function computeObjectiveWeightedScore(objective: Pick<Objective, 'weight' | 'krs'>): number {
  return (objective.weight || 0) * computeObjectiveProgress(objective);
}

/** Un semestre de performance est réparti en 6 mois, courbe d'avancement linéaire. */
export const PERFORMANCE_CYCLE_MONTHS = 6;

/**
 * Bande (points de %) autour de la courbe attendue pour rester "en progression" :
 * un écart de moins d'un demi-mois (~8 pts sur 6 mois) est encore dans les délais.
 */
export const COACHING_ON_TRACK_TOLERANCE = 8;

export const COACHING_STATUSES = ['performant', 'en_progression', 'action_a_mener'] as const;
export type CoachingStatus = (typeof COACHING_STATUSES)[number];

/** Avancement temporel d'un cycle (0-1) et courbe attendue correspondante (0-100). */
export interface CyclePace {
  elapsedRatio: number;
  expectedProgress: number;
  elapsedMonths: number;
  remainingMonths: number;
  /** Mois courant dans le semestre (1-6), 1 au démarrage. */
  monthIndex: number;
}

/**
 * Position dans le semestre : le temps écoulé entre `startDate` et `endDate` est découpé
 * en 6 parts égales. Avant le début → 0 ; après la fin → 1. `now` est injectable pour
 * les tests (sinon la date du jour).
 */
export function computeCyclePace(
  startDate: string,
  endDate: string,
  now: Date = new Date()
): CyclePace {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const t = now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return {
      elapsedRatio: 0,
      expectedProgress: 0,
      elapsedMonths: 0,
      remainingMonths: PERFORMANCE_CYCLE_MONTHS,
      monthIndex: 1
    };
  }

  const elapsedRatio = Math.min(1, Math.max(0, (t - start) / (end - start)));
  const elapsedMonths = elapsedRatio * PERFORMANCE_CYCLE_MONTHS;
  const remainingMonths = PERFORMANCE_CYCLE_MONTHS - elapsedMonths;
  const monthIndex = Math.min(
    PERFORMANCE_CYCLE_MONTHS,
    Math.max(1, elapsedRatio <= 0 ? 1 : Math.ceil(elapsedMonths))
  );

  return {
    elapsedRatio,
    expectedProgress: elapsedRatio * 100,
    elapsedMonths,
    remainingMonths,
    monthIndex
  };
}

/**
 * Statut d'accompagnement à partir de l'avancement réel vs la courbe linéaire du semestre :
 * en avance → performant, dans la bande des délais → en progression, en retard → action à mener.
 */
export function computeCoachingStatus(actualProgress: number, expectedProgress: number): CoachingStatus {
  if (actualProgress > expectedProgress + COACHING_ON_TRACK_TOLERANCE) return 'performant';
  if (actualProgress < expectedProgress - COACHING_ON_TRACK_TOLERANCE) return 'action_a_mener';
  return 'en_progression';
}

/** Instantané d'accompagnement d'un objectif (ou de la fiche entière via `computeReviewCoaching`). */
export interface ObjectiveCoachingSnapshot {
  progress: number;
  weight: number;
  weightedScore: number;
  expectedProgress: number;
  expectedWeightedScore: number;
  remainingMonths: number;
  elapsedMonths: number;
  monthIndex: number;
  status: CoachingStatus;
}

export function computeObjectiveCoaching(
  objective: Pick<Objective, 'weight' | 'krs'>,
  cycle: Pick<PerformanceCycle, 'startDate' | 'endDate'>,
  now: Date = new Date()
): ObjectiveCoachingSnapshot {
  const pace = computeCyclePace(cycle.startDate, cycle.endDate, now);
  const progress = computeObjectiveProgress(objective);
  const weight = objective.weight || 0;
  return {
    progress,
    weight,
    weightedScore: weight * progress,
    expectedProgress: pace.expectedProgress,
    expectedWeightedScore: weight * pace.expectedProgress,
    remainingMonths: pace.remainingMonths,
    elapsedMonths: pace.elapsedMonths,
    monthIndex: pace.monthIndex,
    status: computeCoachingStatus(progress, pace.expectedProgress)
  };
}

/**
 * Accompagnement de la fiche entière : même courbe à 6 mois, avancement = score pondéré
 * global (`computeReviewScore`). Le poids affiché est 1 (100 % de la fiche).
 */
export function computeReviewCoaching(
  objectives: Pick<Objective, 'weight' | 'krs'>[],
  cycle: Pick<PerformanceCycle, 'startDate' | 'endDate'>,
  now: Date = new Date()
): ObjectiveCoachingSnapshot {
  const pace = computeCyclePace(cycle.startDate, cycle.endDate, now);
  const progress = computeReviewScore(objectives);
  return {
    progress,
    weight: 1,
    weightedScore: progress,
    expectedProgress: pace.expectedProgress,
    expectedWeightedScore: pace.expectedProgress,
    remainingMonths: pace.remainingMonths,
    elapsedMonths: pace.elapsedMonths,
    monthIndex: pace.monthIndex,
    status: computeCoachingStatus(progress, pace.expectedProgress)
  };
}

/** Jalons mensuels (1-6) : avancement attendu à la fin de chaque mois du semestre. */
export function cycleMonthCheckpoints(): number[] {
  return Array.from(
    { length: PERFORMANCE_CYCLE_MONTHS },
    (_, index) => ((index + 1) / PERFORMANCE_CYCLE_MONTHS) * 100
  );
}

/** "15 / 30 pts" : réalisé pondéré / poids de l'objectif, tous deux en points sur 100. */
export function formatWeightedScore(weightedScore: number, weight: number): string {
  const maxPoints = Math.round(weight * 100);
  const points = Math.round(weightedScore);
  return `${points} / ${maxPoints} pts`;
}

/** Une entrée du résumé de répartition des statuts d'objectifs (voir `summarizeObjectiveStatuses`). */
export interface ObjectiveStatusSummary {
  status: ObjectiveAssessmentStatus;
  count: number;
}

/**
 * Pré-conditions pour clôturer le semestre (CTA "Valider le semestre") — miroir de
 * `canCompleteReview` côté backend. L'enregistrement de l'évaluation ne passe plus la fiche
 * à "complete" tout seul.
 */
export function canCompleteReview(
  objectives: Pick<Objective, 'managerAssessment'>[],
  generalManagerAssessment: GeneralAssessmentAxes
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (objectives.length === 0) {
    errors.push('Au moins un objectif est requis pour valider le semestre');
  }
  if (objectives.some((objective) => !objective.managerAssessment?.status)) {
    errors.push("Chaque objectif doit avoir un statut d'évaluation manager");
  }
  const gridComplete = COMPETENCY_AXES.every((axis) => (generalManagerAssessment[axis]?.length ?? 0) > 0);
  if (!gridComplete) {
    errors.push("La grille d'évaluation manager doit être complète");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Résume la répartition des statuts d'objectifs d'une fiche pour un affichage compact (ex.
 * colonne "Objectifs" du tableau récap d'équipe) : le statut manager fait foi une fois renseigné,
 * sinon on retombe sur le bilan du cycle du collaborateur (self) — un objectif sans statut des
 * deux côtés n'est pas compté (rien de pertinent à afficher pour lui). Résultat trié dans l'ordre
 * de `OBJECTIVE_ASSESSMENT_STATUSES` (du moins bon au meilleur) pour un affichage stable.
 */
export function summarizeObjectiveStatuses(
  objectives: Pick<Objective, 'selfAssessment' | 'managerAssessment'>[]
): ObjectiveStatusSummary[] {
  const counts = new Map<ObjectiveAssessmentStatus, number>();
  for (const objective of objectives) {
    const status = objective.managerAssessment.status ?? objective.selfAssessment.status;
    if (!status) continue;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return OBJECTIVE_ASSESSMENT_STATUSES.filter((status) => counts.has(status)).map((status) => ({
    status,
    count: counts.get(status) as number
  }));
}

/** Résumé agrégé d'un ensemble de fiches (typiquement toutes celles d'une équipe) — voir `summarizeTeamReviews`. */
export interface TeamPerformanceSummary {
  reviewCount: number;
  statusCounts: Record<PerformanceReviewStatus, number>;
  /** Moyenne (0-100) sur les fiches ayant des objectifs définis ; null si aucune. */
  avgObjectivesScore: number | null;
  /** Moyenne (0-5) sur les fiches ayant au moins un axe noté ; null si aucune. */
  avgSelfAssessmentScore: number | null;
  /** Moyenne (0-5) sur les fiches ayant au moins un axe noté par le manager ; null si aucune. */
  avgManagerAssessmentScore: number | null;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Résume un ensemble de fiches (typiquement toutes celles d'une équipe, ou tout le périmètre
 * affiché) pour une vue agrégée : répartition des statuts de fiche, et scores moyens (objectifs,
 * auto-évaluation, évaluation manager de la grille générale). Chaque moyenne ne porte que sur les
 * fiches ayant une valeur exploitable (objectifs définis / axe noté) — une fiche vide n'est pas
 * comptée comme un 0, pour ne pas tirer artificiellement la moyenne vers le bas.
 */
export function summarizeTeamReviews(
  reviews: Pick<PerformanceReview, 'status' | 'objectives' | 'generalSelfAssessment' | 'generalManagerAssessment'>[]
): TeamPerformanceSummary {
  const statusCounts: Record<PerformanceReviewStatus, number> = {
    dossier_manquant: 0,
    en_cours: 0,
    complete: 0
  };
  for (const review of reviews) {
    statusCounts[review.status] += 1;
  }

  const objectivesScores = reviews
    .filter((review) => review.objectives.length > 0)
    .map((review) => computeReviewScore(review.objectives));
  const selfScores = reviews
    .map((review) => computeGeneralAssessmentGlobalScore(review.generalSelfAssessment))
    .filter((score) => score > 0);
  const managerScores = reviews
    .map((review) => computeGeneralAssessmentGlobalScore(review.generalManagerAssessment))
    .filter((score) => score > 0);

  return {
    reviewCount: reviews.length,
    statusCounts,
    avgObjectivesScore: objectivesScores.length > 0 ? average(objectivesScores) : null,
    avgSelfAssessmentScore: selfScores.length > 0 ? average(selfScores) : null,
    avgManagerAssessmentScore: managerScores.length > 0 ? average(managerScores) : null
  };
}

/** Score d'un axe de l'auto-évaluation générale (0-5) : moyenne des scores de ses sous-critères, 0 si aucun. */
export function computeGeneralAssessmentAxisScore(subCriteria: GeneralAssessmentSubCriterion[]): number {
  if (subCriteria.length === 0) return 0;
  const sum = subCriteria.reduce((total, subCriterion) => total + subCriterion.score, 0);
  return sum / subCriteria.length;
}

/**
 * Score global de l'auto-évaluation générale (0-5) : moyenne des scores des 4 axes, en excluant
 * un axe sans sous-critère renseigné (pas compté comme 0) — miroir exact de
 * `computeGeneralAssessmentGlobalScore` côté backend.
 */
export function computeGeneralAssessmentGlobalScore(axes: GeneralAssessmentAxes): number {
  const axisScores = COMPETENCY_AXES.map((axis) => axes[axis]).filter((subCriteria) => subCriteria.length > 0);
  if (axisScores.length === 0) return 0;
  const sum = axisScores.reduce((total, subCriteria) => total + computeGeneralAssessmentAxisScore(subCriteria), 0);
  return sum / axisScores.length;
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

/** Couleur de badge par statut d'objectif — seules 4 classes existent (success/warning/danger/info) : 'depasse' utilise 'badge-info' pour rester visuellement distinct d'un simple 'atteint'. */
export const OBJECTIVE_STATUS_BADGE_CLASS: Record<ObjectiveAssessmentStatus, string> = {
  non_atteint: 'badge-danger',
  partiellement_atteint: 'badge-warning',
  atteint: 'badge-success',
  depasse: 'badge-info'
};

/** Libellés côté manager / lead (page Performance équipe). */
export const COACHING_STATUS_LABELS: Record<CoachingStatus, string> = {
  performant: 'Performant',
  en_progression: 'En progression',
  action_a_mener: 'Action à mener'
};

/**
 * Libellés adressés au collaborateur (page Ma performance) : "Action requise" plutôt
 * qu'"Action à mener", qui s'adresse au manager.
 */
export const COACHING_STATUS_LABELS_SELF: Record<CoachingStatus, string> = {
  performant: 'Performant',
  en_progression: 'En progression',
  action_a_mener: 'Action requise'
};

export type CoachingAudience = 'self' | 'manager';

export function coachingStatusLabel(status: CoachingStatus, audience: CoachingAudience = 'manager'): string {
  return audience === 'self' ? COACHING_STATUS_LABELS_SELF[status] : COACHING_STATUS_LABELS[status];
}

export const COACHING_STATUS_BADGE_CLASS: Record<CoachingStatus, string> = {
  performant: 'badge-success',
  en_progression: 'badge-info',
  action_a_mener: 'badge-danger'
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

export function emptyGeneralAssessmentAxes(): GeneralAssessmentAxes {
  return { technique: [], impact: [], collaboration: [], leadership: [] };
}

export function normalizeGeneralAssessmentAxes(raw?: Partial<GeneralAssessmentAxes> | null): GeneralAssessmentAxes {
  const base = emptyGeneralAssessmentAxes();
  if (!raw) return base;
  return {
    technique: raw.technique ?? [],
    impact: raw.impact ?? [],
    collaboration: raw.collaboration ?? [],
    leadership: raw.leadership ?? []
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
    generalSelfAssessment: normalizeGeneralAssessmentAxes(review.generalSelfAssessment),
    generalManagerAssessment: normalizeGeneralAssessmentAxes(review.generalManagerAssessment)
  };
}

