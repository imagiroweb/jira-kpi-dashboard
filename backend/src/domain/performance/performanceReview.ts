/**
 * Logique métier pure de la fiche de performance : calcul de scores
 * pondérés et application d'une mise à jour d'avancement de KR.
 * Extraite des entités Mongoose pour rester testable sans base de
 * données, dans l'esprit de `roadmapAdoriaKpi.ts` / `weeklySprintMeeting.ts`.
 */
import { IKeyResult, IObjective, IProgressUpdate, IReviewAuthor } from './entities/PerformanceReview';

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
