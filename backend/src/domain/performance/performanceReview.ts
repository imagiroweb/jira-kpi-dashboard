/**
 * Logique métier pure de la fiche de performance : calcul de scores
 * pondérés et application d'une mise à jour d'avancement de KR.
 * Extraite des entités Mongoose pour rester testable sans base de
 * données, dans l'esprit de `roadmapAdoriaKpi.ts` / `weeklySprintMeeting.ts`.
 */
import {
  IKeyResult,
  IObjective,
  IObjectiveAssessment,
  IProgressUpdate,
  IQualitative,
  ICompetencyScores,
  IReviewAuthor,
  ObjectiveAssessmentStatus,
  PerformanceReviewStatus,
  CompetencyAxis,
  COMPETENCY_AXES
} from './entities/PerformanceReview';

const WEIGHT_TOLERANCE = 0.01;
const EVIDENCE_URL_PATTERN = /^https?:\/\//i;

/** Somme des poids d'une liste d'objectifs ou de KR (0 si la liste est vide). */
export function sumWeights(items: { weight: number }[]): number {
  return items.reduce((sum, item) => sum + (item.weight || 0), 0);
}

/**
 * Les poids d'une liste (objectifs d'une fiche, ou KR d'un objectif) totalisent-ils
 * bien 1 (à la tolérance près) ? Une liste vide est considérée équilibrée (rien à
 * calculer). Reprend la contrainte déjà observée dans les fichiers Excel (0.4/0.4/0.2).
 */
export function weightsAreBalanced(
  items: { weight: number }[],
  tolerance: number = WEIGHT_TOLERANCE
): boolean {
  if (items.length === 0) return true;
  return Math.abs(sumWeights(items) - 1) <= tolerance;
}

/**
 * Avancement d'un objectif (0-100) : moyenne de l'avancement de ses KR,
 * pondérée par le poids de chaque KR. 0 si l'objectif n'a pas de KR ou que
 * leurs poids sont tous nuls (évite une division par zéro).
 */
export function computeObjectiveProgress(objective: Pick<IObjective, 'krs'>): number {
  const totalWeight = sumWeights(objective.krs);
  if (totalWeight <= 0) return 0;
  const weightedSum = objective.krs.reduce((sum, kr) => sum + kr.weight * kr.progress, 0);
  return weightedSum / totalWeight;
}

/**
 * Score global d'une fiche (0-100) : moyenne de l'avancement des objectifs,
 * pondérée par le poids de chaque objectif. 0 si aucun objectif ou poids tous nuls.
 */
export function computeReviewScore(objectives: Pick<IObjective, 'weight' | 'krs'>[]): number {
  const totalWeight = sumWeights(objectives);
  if (totalWeight <= 0) return 0;
  const weightedSum = objectives.reduce(
    (sum, objective) => sum + objective.weight * computeObjectiveProgress(objective),
    0
  );
  return weightedSum / totalWeight;
}

/**
 * Un lien de preuve « plausible » : une URL http(s). Volontairement permissif
 * (pas de restriction aux seuls domaines Jira/Confluence) — la preuve reste
 * optionnelle et non bloquante, comme demandé.
 */
export function isPlausibleEvidenceUrl(url: string): boolean {
  return EVIDENCE_URL_PATTERN.test(url.trim());
}

export interface ProgressUpdateInput {
  value: number;
  note?: string;
  evidenceUrl?: string;
}

/**
 * Applique une nouvelle mise à jour d'avancement à un KR : pure fonction,
 * ne mute pas le KR reçu, retourne un nouveau KR avec la valeur bornée à
 * [0, 100] et l'historique complété. Toujours appelée avec l'auteur =
 * le collaborateur lui-même (c'est lui qui met à jour son avancement).
 */
export function appendKeyResultProgress(
  kr: IKeyResult,
  input: ProgressUpdateInput,
  author: IReviewAuthor,
  now: Date = new Date()
): IKeyResult {
  const value = Math.max(0, Math.min(100, Math.round(input.value)));
  const note = input.note?.trim();
  const evidenceUrl = input.evidenceUrl?.trim();

  const update: IProgressUpdate = {
    value,
    ...(note ? { note } : {}),
    ...(evidenceUrl ? { evidenceUrl } : {}),
    updatedBy: author,
    updatedAt: now
  };

  return {
    ...kr,
    progress: value,
    progressHistory: [...kr.progressHistory, update]
  };
}

const MAX_OBJECTIVES = 4;

/** Un résultat clé tel que défini par un lead/CTO (sans avancement — voir `applyObjectivesDefinition`). */
export interface KeyResultDefinitionInput {
  id: string;
  label: string;
  weight: number;
}

/** Un objectif tel que défini par un lead/CTO. */
export interface ObjectiveDefinitionInput {
  id: string;
  title: string;
  description?: string;
  weight: number;
  krs: KeyResultDefinitionInput[];
}

export interface ObjectivesDefinitionValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Valide une définition d'objectifs (avant application) : au plus
 * `MAX_OBJECTIVES` objectifs, poids d'objectifs et de KR équilibrés (somme à
 * 1, comme les fichiers Excel), identifiants uniques et titres renseignés.
 * Ne mute rien, ne consulte pas la base — utilisable côté route ET côté
 * frontend pour une validation immédiate.
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
 * Applique une (re)définition d'objectifs à la fiche : fusion par id avec les
 * objectifs/KR existants pour ne JAMAIS perdre l'avancement déjà saisi par le
 * collaborateur — un KR dont l'id est repris conserve `progress` et
 * `progressHistory` ; un nouvel id démarre à 0 sans historique ; un objectif
 * repris conserve ses auto/manager-évaluations. Un objectif ou KR dont l'id
 * disparaît de la nouvelle définition est simplement retiré (la définition
 * remplace l'ensemble courant). Ne valide pas — appeler
 * `validateObjectivesDefinition` avant.
 */
export function applyObjectivesDefinition(
  currentObjectives: IObjective[],
  definition: ObjectiveDefinitionInput[]
): IObjective[] {
  const currentObjectivesById = new Map(currentObjectives.map((objective) => [objective.id, objective]));

  return definition.map((objectiveDef) => {
    const existingObjective = currentObjectivesById.get(objectiveDef.id);
    const existingKrsById = new Map((existingObjective?.krs ?? []).map((kr) => [kr.id, kr]));

    const krs: IKeyResult[] = objectiveDef.krs.map((krDef) => {
      const existingKr = existingKrsById.get(krDef.id);
      return {
        id: krDef.id,
        label: krDef.label,
        weight: krDef.weight,
        progress: existingKr?.progress ?? 0,
        progressHistory: existingKr?.progressHistory ?? []
      };
    });

    return {
      id: objectiveDef.id,
      title: objectiveDef.title,
      description: objectiveDef.description,
      weight: objectiveDef.weight,
      krs,
      selfAssessment: existingObjective?.selfAssessment ?? {},
      managerAssessment: existingObjective?.managerAssessment ?? {}
    };
  });
}

/** Évaluation (self ou manager) d'un objectif, par id d'objectif. */
export interface ObjectiveAssessmentInput {
  id: string;
  status?: ObjectiveAssessmentStatus;
  comment?: string;
}

/** Champs qualitatifs remplis d'un côté (self ou manager) — undefined = ne pas toucher au champ. */
export interface QualitativeAssessmentInput {
  successes?: string;
  challenges?: string;
  growthAreas?: string;
  overallReview?: string;
}

export interface AssessmentInput {
  objectives?: ObjectiveAssessmentInput[];
  qualitative?: QualitativeAssessmentInput;
  competencyScores?: Partial<Record<CompetencyAxis, number>>;
}

export interface AssessmentTarget {
  objectives: IObjective[];
  qualitative: IQualitative;
  competencyScores: ICompetencyScores;
}

/** Alias conservés pour compatibilité — l'évaluation manager est un cas particulier de `AssessmentInput`/`AssessmentTarget`. */
export type ObjectiveManagerAssessmentInput = ObjectiveAssessmentInput;
export type QualitativeManagerInput = QualitativeAssessmentInput;
export type ManagerAssessmentInput = AssessmentInput;
export type ManagerAssessmentTarget = AssessmentTarget;

/**
 * Applique une évaluation (`side`: "self" ou "manager") — par objectif,
 * bilan qualitatif, grille de compétences — sans jamais toucher au contenu
 * de l'autre côté ; pure fonction, ne mute rien. Un objectif dont l'id ne
 * correspond à aucun objectif existant est ignoré (l'évaluation porte sur
 * des objectifs déjà définis).
 */
function applyAssessment(
  target: AssessmentTarget,
  input: AssessmentInput,
  side: 'self' | 'manager'
): AssessmentTarget {
  const assessmentField = side === 'self' ? 'selfAssessment' : 'managerAssessment';
  const assessmentsByObjectiveId = new Map((input.objectives ?? []).map((a) => [a.id, a]));

  const objectives = target.objectives.map((objective) => {
    const assessment = assessmentsByObjectiveId.get(objective.id);
    if (!assessment) return objective;
    const currentAssessment = objective[assessmentField];
    const nextAssessment: IObjectiveAssessment = {
      status: assessment.status ?? currentAssessment?.status,
      comment: assessment.comment ?? currentAssessment?.comment
    };
    return { ...objective, [assessmentField]: nextAssessment };
  });

  const qualitativeInput = input.qualitative ?? {};
  const mergeQualitativeEntry = (entry: IQualitative[keyof IQualitative], value: string | undefined) =>
    value !== undefined ? { ...entry, [side]: value } : entry;

  const qualitative: IQualitative = {
    successes: mergeQualitativeEntry(target.qualitative.successes, qualitativeInput.successes),
    challenges: mergeQualitativeEntry(target.qualitative.challenges, qualitativeInput.challenges),
    growthAreas: mergeQualitativeEntry(target.qualitative.growthAreas, qualitativeInput.growthAreas),
    overallReview: mergeQualitativeEntry(target.qualitative.overallReview, qualitativeInput.overallReview)
  };

  const competencyScoresInput = input.competencyScores ?? {};
  const competencyScores = { ...target.competencyScores };
  for (const axis of COMPETENCY_AXES) {
    const score = competencyScoresInput[axis];
    if (score !== undefined) {
      competencyScores[axis] = { ...competencyScores[axis], [side]: score };
    }
  }

  return { objectives, qualitative, competencyScores };
}

/**
 * Applique l'évaluation manager (par objectif, bilan qualitatif "manager",
 * grille de compétences "manager") sans jamais toucher au contenu "self"
 * (auto-évaluation du collaborateur).
 */
export function applyManagerAssessment(target: AssessmentTarget, input: AssessmentInput): AssessmentTarget {
  return applyAssessment(target, input, 'manager');
}

/**
 * Applique l'auto-évaluation du collaborateur (par objectif, bilan
 * qualitatif "self", grille de compétences "self") sans jamais toucher au
 * contenu "manager".
 */
export function applySelfAssessment(target: AssessmentTarget, input: AssessmentInput): AssessmentTarget {
  return applyAssessment(target, input, 'self');
}

/**
 * Statut dérivé de la fiche après une action (définition d'objectifs ou
 * évaluation manager) : passe à "complete" dès que tous les objectifs ont
 * reçu un statut d'évaluation manager ; sinon fait avancer
 * "dossier_manquant" vers "en_cours" dès qu'il y a du contenu à évaluer.
 * Ne revient jamais en arrière (un statut "complete" existant est conservé
 * même si, par exemple, un nouvel objectif sans évaluation est ajouté —
 * cette régression éventuelle est un choix produit à trancher séparément).
 */
export function computeReviewStatus(
  objectives: Pick<IObjective, 'managerAssessment'>[],
  currentStatus: PerformanceReviewStatus
): PerformanceReviewStatus {
  if (currentStatus === 'complete') return currentStatus;
  if (objectives.length === 0) return currentStatus;
  if (objectives.every((o) => !!o.managerAssessment?.status)) {
    return 'complete';
  }
  if (currentStatus === 'dossier_manquant') {
    return 'en_cours';
  }
  return currentStatus;
}
