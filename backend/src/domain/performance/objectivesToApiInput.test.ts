import { objectivesToApiInput } from './objectivesToApiInput';
import { validateObjectivesDefinition } from './performanceReview';
import type { ParsedObjective } from './importObjectives';

describe('objectivesToApiInput', () => {
  it('génère des id positionnels stables pour les objectifs et leurs KR', () => {
    const parsed: ParsedObjective[] = [
      { title: 'Objectif A', weight: 0.6, krs: [{ label: 'KR A1', weight: 0.5 }, { label: 'KR A2', weight: 0.5 }] },
      { title: 'Objectif B', weight: 0.4, krs: [] }
    ];

    expect(objectivesToApiInput(parsed)).toEqual([
      {
        id: 'obj-1',
        title: 'Objectif A',
        weight: 0.6,
        competencyAxes: [],
        krs: [
          { id: 'obj-1-kr-1', label: 'KR A1', weight: 0.5 },
          { id: 'obj-1-kr-2', label: 'KR A2', weight: 0.5 }
        ]
      },
      { id: 'obj-2', title: 'Objectif B', weight: 0.4, competencyAxes: [], krs: [] }
    ]);
  });

  it("suggère les axes de compétence à partir du titre de l'objectif (suggestCompetencyAxes)", () => {
    const parsed: ParsedObjective[] = [
      { title: "Refactoriser l'architecture technique", weight: 0.5, krs: [] },
      { title: 'Objectif neutre sans mot-clé', weight: 0.5, krs: [] }
    ];

    const result = objectivesToApiInput(parsed);
    expect(result[0].competencyAxes).toEqual(['technique']);
    expect(result[1].competencyAxes).toEqual([]);
  });

  it('produit toujours les mêmes id pour la même liste (idempotent entre deux exécutions)', () => {
    const parsed: ParsedObjective[] = [{ title: 'Objectif A', weight: 1, krs: [] }];
    expect(objectivesToApiInput(parsed)).toEqual(objectivesToApiInput(parsed));
  });

  it('produit un résultat accepté par validateObjectivesDefinition quand les poids sont équilibrés', () => {
    const parsed: ParsedObjective[] = [
      { title: 'Objectif A', weight: 0.4, krs: [{ label: 'KR A1', weight: 1 }] },
      { title: 'Objectif B', weight: 0.4, krs: [] },
      { title: 'Objectif C', weight: 0.2, krs: [] }
    ];

    const validation = validateObjectivesDefinition(objectivesToApiInput(parsed));
    expect(validation).toEqual({ valid: true, errors: [] });
  });

  it('remonte via validateObjectivesDefinition une somme de poids déséquilibrée', () => {
    const parsed: ParsedObjective[] = [
      { title: 'Objectif A', weight: 0.5, krs: [] },
      { title: 'Objectif B', weight: 0.2, krs: [] }
    ];

    const validation = validateObjectivesDefinition(objectivesToApiInput(parsed));
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('La somme des poids des objectifs doit être égale à 1');
  });
});
