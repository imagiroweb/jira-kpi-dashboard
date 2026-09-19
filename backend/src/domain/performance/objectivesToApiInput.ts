import type { ObjectiveDefinitionInput } from './performanceReview';
import type { ParseObjectivesResult } from './importObjectives';

/**
 * Convertit les objectifs parsés depuis un fichier Excel d'entretien (sans identifiant, voir
 * `parseObjectivesFromWorksheet`) vers le format attendu par
 * `PATCH /api/performance/reviews/:userId/objectives`, en générant des identifiants purement
 * positionnels (`obj-1`, `obj-1-kr-1`, ...). Ces id sont stables tant que le fichier source ne
 * change pas — une ré-exécution du script d'import sur le même fichier régénère les mêmes id,
 * donc la fusion faite par `applyObjectivesDefinition` ne réinitialise pas un avancement déjà
 * saisi par le collaborateur entre deux exécutions.
 */
export function objectivesToApiInput(parsed: ParseObjectivesResult['objectives']): ObjectiveDefinitionInput[] {
  return parsed.map((objective, index) => ({
    id: `obj-${index + 1}`,
    title: objective.title,
    weight: objective.weight,
    krs: objective.krs.map((kr, krIndex) => ({
      id: `obj-${index + 1}-kr-${krIndex + 1}`,
      label: kr.label,
      weight: kr.weight
    }))
  }));
}
