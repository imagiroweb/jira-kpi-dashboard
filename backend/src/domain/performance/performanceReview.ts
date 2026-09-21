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
  IGeneralAssessmentSubCriterion,
  IGeneralAssessmentAxes,
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
 * Score d'un axe de l'auto-évaluation générale (0-5) : moyenne des scores de ses sous-critères,
 * 0 si l'axe n'en a aucun — même logique que `computeObjectiveProgress`. Reprend la formule
 * `AVERAGE(...)` déjà présente dans les fichiers `evaluations-individuelles/*.xlsx` (une par
 * axe, sur ses 3 sous-critères).
 */
export function computeGeneralAssessmentAxisScore(subCriteria: IGeneralAssessmentSubCriterion[]): number {
  if (subCriteria.length === 0) return 0;
  const sum = subCriteria.reduce((total, subCriterion) => total + subCriterion.score, 0);
  return sum / subCriteria.length;
}

/**
 * Score global de l'auto-évaluation générale (0-5) : moyenne des scores des 4 axes — même
 * formule que le "Score Global" trouvé dans `dashboard-all.xlsx` (grille de réconciliation
 * auto-évaluation / évaluation manager), appliquée ici côté auto-évaluation. Un axe sans
 * sous-critère renseigné est exclu de la moyenne plutôt que compté comme 0 ; 0 si aucun axe n'a
 * de sous-critère.
 */
export function computeGeneralAssessmentGlobalScore(axes: IGeneralAssessmentAxes): number {
  const axisScores = COMPETENCY_AXES.map((axis) => axes[axis]).filter((subCriteria) => subCriteria.length > 0);

  if (axisScores.length === 0) return 0;

  const sum = axisScores.reduce((total, subCriteria) => total + computeGeneralAssessmentAxisScore(subCriteria), 0);
  return sum / axisScores.length;
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
  /** Jusqu'à 2 axes de compétence associés (voir `suggestCompetencyAxes`), librement modifiables par le lead/CTO. */
  competencyAxes?: CompetencyAxis[];
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
      competencyAxes: objectiveDef.competencyAxes ?? [],
      krs,
      selfAssessment: existingObjective?.selfAssessment ?? {},
      managerAssessment: existingObjective?.managerAssessment ?? {}
    };
  });
}

/**
 * Mots-clés associés à chaque axe de compétence, utilisés par
 * `suggestCompetencyAxes` pour rapprocher automatiquement un objectif de la
 * grille de compétences (voir `COMPETENCY_AXES`). Recherche insensible à la
 * casse sur le titre + la description de l'objectif.
 */
const COMPETENCY_AXIS_KEYWORDS: Record<CompetencyAxis, string[]> = {
  technique: ['code', 'architecture', 'technique', 'technologie', 'dette technique', 'infrastructure', 'infra', 'sécurité'],
  impact: ['client', 'business', 'arr', 'delivery', 'livraison', "chiffre d'affaires", 'roadmap produit', 'produit'],
  collaboration: ['équipe', 'collaborat', 'communication', 'coordination', 'transverse'],
  leadership: ['mentor', 'vision', 'manager', 'leadership', 'encadrement', 'recrutement']
};

/**
 * Suggère jusqu'à 2 axes de compétence pour un objectif, à partir de
 * correspondances par mots-clés sur son titre + sa description (pure
 * fonction, pas d'appel externe — voir `COMPETENCY_AXIS_KEYWORDS`). Les axes
 * sont classés par nombre de mots-clés trouvés (le plus pertinent en
 * premier) ; en cas d'égalité, l'ordre de `COMPETENCY_AXES` départage. Ne
 * renvoie que des axes ayant au moins une correspondance — une suggestion
 * purement indicative, librement modifiable par le lead/CTO.
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

/** Mongoose `default: () => ({})` omet les sous-clés : l'API doit toujours les exposer. */
export function completeQualitative(raw?: Partial<IQualitative> | null): IQualitative {
  return {
    successes: raw?.successes ?? {},
    challenges: raw?.challenges ?? {},
    growthAreas: raw?.growthAreas ?? {},
    overallReview: raw?.overallReview ?? {}
  };
}

export function completeCompetencyScores(raw?: Partial<ICompetencyScores> | null): ICompetencyScores {
  return {
    technique: raw?.technique ?? {},
    impact: raw?.impact ?? {},
    collaboration: raw?.collaboration ?? {},
    leadership: raw?.leadership ?? {}
  };
}

/** Un sous-critère noté tel que fourni en entrée (import Excel, ou futur formulaire de saisie). */
export interface GeneralAssessmentSubCriterionInput {
  label: string;
  score: number;
}

/**
 * (Re)définition de l'auto-évaluation générale, axe par axe. Un axe absent du corps de la
 * requête n'est pas modifié — voir `applyGeneralSelfAssessment`. Distinct de `AssessmentInput` :
 * pas de notion self/manager ici (l'auto-évaluation générale n'a qu'un seul auteur, le
 * collaborateur, même quand c'est un lead/CTO qui saisit ou importe pour son compte).
 */
export type GeneralSelfAssessmentInput = Partial<Record<CompetencyAxis, GeneralAssessmentSubCriterionInput[]>>;

export interface GeneralSelfAssessmentValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Valide une (re)définition de l'auto-évaluation générale, axe par axe : uniquement les 4 axes
 * connus (voir `COMPETENCY_AXES`), un libellé non vide et une note 1-5 pour chaque sous-critère.
 * Ne mute rien, ne consulte pas la base — même esprit que `validateObjectivesDefinition`.
 */
export function validateGeneralSelfAssessment(input: GeneralSelfAssessmentInput): GeneralSelfAssessmentValidation {
  const errors: string[] = [];

  for (const key of Object.keys(input)) {
    if (!(COMPETENCY_AXES as readonly string[]).includes(key)) {
      errors.push(`Axe inconnu : ${key}`);
    }
  }

  for (const axis of COMPETENCY_AXES) {
    const subCriteria = input[axis];
    if (subCriteria === undefined) continue;
    if (!Array.isArray(subCriteria)) {
      errors.push(`L'axe ${axis} doit être un tableau de sous-critères`);
      continue;
    }
    subCriteria.forEach((subCriterion, index) => {
      if (!subCriterion?.label?.trim()) {
        errors.push(`Axe ${axis}, sous-critère ${index + 1} : libellé requis`);
      }
      if (typeof subCriterion?.score !== 'number' || subCriterion.score < 1 || subCriterion.score > 5) {
        errors.push(`Axe ${axis}, sous-critère ${index + 1} : note requise entre 1 et 5`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Applique une (re)définition de l'auto-évaluation générale : remplace entièrement la liste de
 * sous-critères d'un axe fourni en entrée (pas de fusion par id, contrairement aux objectifs —
 * l'auto-évaluation générale n'a pas d'avancement à préserver d'un sous-critère à l'autre) ; un
 * axe absent de l'entrée conserve sa valeur actuelle. Ne valide pas — appeler
 * `validateGeneralSelfAssessment` avant.
 */
export function applyGeneralSelfAssessment(
  current: IGeneralAssessmentAxes,
  input: GeneralSelfAssessmentInput
): IGeneralAssessmentAxes {
  const next = { ...current };
  for (const axis of COMPETENCY_AXES) {
    const subCriteria = input[axis];
    if (subCriteria !== undefined) {
      next[axis] = subCriteria.map((subCriterion) => ({ label: subCriterion.label, score: subCriterion.score }));
    }
  }
  return next;
}

/** Le défaut Mongoose couvre déjà les 4 axes, mais on protège l'API de la même façon que `completeQualitative`. */
export function completeGeneralSelfAssessment(raw?: Partial<IGeneralAssessmentAxes> | null): IGeneralAssessmentAxes {
  return {
    technique: raw?.technique ?? [],
    impact: raw?.impact ?? [],
    collaboration: raw?.collaboration ?? [],
    leadership: raw?.leadership ?? []
  };
}
