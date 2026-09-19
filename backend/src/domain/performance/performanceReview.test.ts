/**
 * TU — logique métier pure de la fiche de performance
 */
import {
  appendKeyResultProgress,
  applyManagerAssessment,
  applyObjectivesDefinition,
  applySelfAssessment,
  computeObjectiveProgress,
  computeReviewScore,
  computeReviewStatus,
  isPlausibleEvidenceUrl,
  ObjectiveDefinitionInput,
  sumWeights,
  validateObjectivesDefinition,
  weightsAreBalanced
} from './performanceReview';
import { IKeyResult, IObjective, IQualitative, ICompetencyScores, IReviewAuthor } from './entities/PerformanceReview';

function makeKr(overrides: Partial<IKeyResult> = {}): IKeyResult {
  return {
    id: 'kr-1',
    label: 'KR',
    weight: 0.5,
    progress: 0,
    progressHistory: [],
    ...overrides
  };
}

function makeObjective(overrides: Partial<IObjective> = {}): IObjective {
  return {
    id: 'obj-1',
    title: 'Objectif',
    weight: 0.5,
    krs: [],
    selfAssessment: {},
    managerAssessment: {},
    ...overrides
  };
}

const author: IReviewAuthor = { id: 'u1', name: 'Maxime Andres', role: 'collaborateur' };

describe('sumWeights / weightsAreBalanced', () => {
  it('somme les poids', () => {
    expect(sumWeights([{ weight: 0.4 }, { weight: 0.4 }, { weight: 0.2 }])).toBeCloseTo(1);
  });

  it('considère une liste vide comme équilibrée', () => {
    expect(weightsAreBalanced([])).toBe(true);
  });

  it('accepte 0.4 / 0.4 / 0.2 (cas réel des fichiers Excel)', () => {
    expect(weightsAreBalanced([{ weight: 0.4 }, { weight: 0.4 }, { weight: 0.2 }])).toBe(true);
  });

  it('refuse des poids qui ne totalisent pas 1', () => {
    expect(weightsAreBalanced([{ weight: 0.4 }, { weight: 0.4 }])).toBe(false);
  });
});

describe('computeObjectiveProgress', () => {
  it('retourne 0 si aucun KR', () => {
    expect(computeObjectiveProgress(makeObjective({ krs: [] }))).toBe(0);
  });

  it('retourne 0 si tous les poids de KR sont nuls (pas de division par zéro)', () => {
    const objective = makeObjective({
      krs: [makeKr({ weight: 0, progress: 80 }), makeKr({ weight: 0, progress: 40 })]
    });
    expect(computeObjectiveProgress(objective)).toBe(0);
  });

  it('calcule la moyenne pondérée des KR', () => {
    const objective = makeObjective({
      krs: [
        makeKr({ id: 'kr1', weight: 0.5, progress: 100 }),
        makeKr({ id: 'kr2', weight: 0.5, progress: 0 })
      ]
    });
    expect(computeObjectiveProgress(objective)).toBe(50);
  });

  it('pondère correctement des poids inégaux', () => {
    const objective = makeObjective({
      krs: [
        makeKr({ id: 'kr1', weight: 0.8, progress: 100 }),
        makeKr({ id: 'kr2', weight: 0.2, progress: 0 })
      ]
    });
    expect(computeObjectiveProgress(objective)).toBe(80);
  });
});

describe('computeReviewScore', () => {
  it('retourne 0 sans objectif', () => {
    expect(computeReviewScore([])).toBe(0);
  });

  it('reprend le cas réel Excel : 3 objectifs 0.4/0.4/0.2, avancements 60/40/100 => score pondéré', () => {
    const objectives = [
      makeObjective({
        id: 'o1',
        weight: 0.4,
        krs: [makeKr({ weight: 1, progress: 60 })]
      }),
      makeObjective({
        id: 'o2',
        weight: 0.4,
        krs: [makeKr({ weight: 1, progress: 40 })]
      }),
      makeObjective({
        id: 'o3',
        weight: 0.2,
        krs: [makeKr({ weight: 1, progress: 100 })]
      })
    ];
    // 0.4*60 + 0.4*40 + 0.2*100 = 24 + 16 + 20 = 60
    expect(computeReviewScore(objectives)).toBeCloseTo(60);
  });
});

describe('isPlausibleEvidenceUrl', () => {
  it('accepte une URL http(s)', () => {
    expect(isPlausibleEvidenceUrl('https://adoria.atlassian.net/browse/DEV-123')).toBe(true);
    expect(isPlausibleEvidenceUrl('http://confluence.adoria.local/page')).toBe(true);
  });

  it('refuse ce qui ne ressemble pas à une URL', () => {
    expect(isPlausibleEvidenceUrl('DEV-123')).toBe(false);
    expect(isPlausibleEvidenceUrl('')).toBe(false);
  });
});

describe('appendKeyResultProgress', () => {
  it('ne mute pas le KR reçu et ajoute une entrée à l\'historique', () => {
    const kr = makeKr({ progress: 20, progressHistory: [] });
    const updated = appendKeyResultProgress(kr, { value: 55 }, author, new Date('2026-09-19'));

    expect(kr.progress).toBe(20); // original inchangé
    expect(kr.progressHistory).toHaveLength(0);
    expect(updated.progress).toBe(55);
    expect(updated.progressHistory).toHaveLength(1);
    expect(updated.progressHistory[0]).toEqual({
      value: 55,
      updatedBy: author,
      updatedAt: new Date('2026-09-19')
    });
  });

  it('borne la valeur entre 0 et 100', () => {
    const kr = makeKr();
    expect(appendKeyResultProgress(kr, { value: 150 }, author).progress).toBe(100);
    expect(appendKeyResultProgress(kr, { value: -10 }, author).progress).toBe(0);
  });

  it('conserve une note et un lien de preuve quand ils sont fournis', () => {
    const kr = makeKr();
    const updated = appendKeyResultProgress(
      kr,
      { value: 70, note: '  US livrée  ', evidenceUrl: '  https://jira.adoria.fr/DEV-42  ' },
      author
    );
    expect(updated.progressHistory[0].note).toBe('US livrée');
    expect(updated.progressHistory[0].evidenceUrl).toBe('https://jira.adoria.fr/DEV-42');
  });

  it('omet note/evidenceUrl du tout si absents ou vides (pas de preuve requise)', () => {
    const kr = makeKr();
    const updated = appendKeyResultProgress(kr, { value: 30, note: '   ' }, author);
    expect(updated.progressHistory[0].note).toBeUndefined();
    expect(updated.progressHistory[0].evidenceUrl).toBeUndefined();
  });

  it('accumule l\'historique sur plusieurs mises à jour successives', () => {
    let kr = makeKr();
    kr = appendKeyResultProgress(kr, { value: 10 }, author);
    kr = appendKeyResultProgress(kr, { value: 40 }, author);
    kr = appendKeyResultProgress(kr, { value: 90, evidenceUrl: 'https://jira.adoria.fr/DEV-1' }, author);
    expect(kr.progress).toBe(90);
    expect(kr.progressHistory.map((h) => h.value)).toEqual([10, 40, 90]);
  });
});

function objectiveDef(overrides: Partial<ObjectiveDefinitionInput> = {}): ObjectiveDefinitionInput {
  return {
    id: 'obj-1',
    title: 'Delivery produit',
    weight: 1,
    krs: [{ id: 'kr-1', label: '100% des US en temps', weight: 1 }],
    ...overrides
  };
}

describe('validateObjectivesDefinition', () => {
  it('refuse une liste vide', () => {
    const result = validateObjectivesDefinition([]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /au moins un objectif/i.test(e))).toBe(true);
  });

  it('refuse plus de 4 objectifs', () => {
    const objectives = Array.from({ length: 5 }, (_, i) =>
      objectiveDef({ id: `obj-${i}`, weight: 0.2, krs: [{ id: `kr-${i}`, label: 'KR', weight: 1 }] })
    );
    const result = validateObjectivesDefinition(objectives);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /maximum de 4/i.test(e))).toBe(true);
  });

  it("refuse des poids d'objectifs qui ne totalisent pas 1", () => {
    const result = validateObjectivesDefinition([objectiveDef({ weight: 0.5 })]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /poids des objectifs/i.test(e))).toBe(true);
  });

  it('refuse des poids de KR qui ne totalisent pas 1 au sein d\'un objectif', () => {
    const result = validateObjectivesDefinition([
      objectiveDef({
        krs: [
          { id: 'kr-1', label: 'A', weight: 0.3 },
          { id: 'kr-2', label: 'B', weight: 0.3 }
        ]
      })
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /résultats clés/i.test(e))).toBe(true);
  });

  it('refuse un id d\'objectif en double', () => {
    const result = validateObjectivesDefinition([
      objectiveDef({ id: 'obj-1', weight: 0.5 }),
      objectiveDef({ id: 'obj-1', weight: 0.5 })
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /en double/i.test(e))).toBe(true);
  });

  it('refuse un objectif sans titre', () => {
    const result = validateObjectivesDefinition([objectiveDef({ title: '' })]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /doit avoir un titre/i.test(e))).toBe(true);
  });

  it('accepte une définition valide (3 objectifs, 0.4/0.4/0.2, cas réel Excel)', () => {
    const result = validateObjectivesDefinition([
      objectiveDef({ id: 'obj-1', weight: 0.4 }),
      objectiveDef({ id: 'obj-2', weight: 0.4 }),
      objectiveDef({ id: 'obj-3', weight: 0.2 })
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('applyObjectivesDefinition', () => {
  it('crée les objectifs/KR à zéro quand la fiche est vide', () => {
    const result = applyObjectivesDefinition([], [objectiveDef()]);
    expect(result).toHaveLength(1);
    expect(result[0].krs[0].progress).toBe(0);
    expect(result[0].krs[0].progressHistory).toEqual([]);
    expect(result[0].selfAssessment).toEqual({});
    expect(result[0].managerAssessment).toEqual({});
  });

  it("conserve l'avancement d'un KR dont l'id est repris (changement de libellé/poids)", () => {
    const existingKr = makeKr({ id: 'kr-1', progress: 70, progressHistory: [{ value: 70, updatedBy: { id: 'u1', name: 'A' }, updatedAt: new Date() }] });
    const existing: IObjective[] = [
      { id: 'obj-1', title: 'Ancien titre', weight: 1, krs: [existingKr], selfAssessment: { status: 'atteint' }, managerAssessment: {} }
    ];

    const result = applyObjectivesDefinition(existing, [
      objectiveDef({ title: 'Nouveau titre', krs: [{ id: 'kr-1', label: 'Nouveau libellé', weight: 1 }] })
    ]);

    expect(result[0].title).toBe('Nouveau titre');
    expect(result[0].krs[0].label).toBe('Nouveau libellé');
    expect(result[0].krs[0].progress).toBe(70);
    expect(result[0].krs[0].progressHistory).toHaveLength(1);
    expect(result[0].selfAssessment).toEqual({ status: 'atteint' });
  });

  it("démarre à 0 un nouveau KR ajouté à un objectif existant", () => {
    const existing: IObjective[] = [
      { id: 'obj-1', title: 'X', weight: 1, krs: [makeKr({ id: 'kr-1', progress: 50 })], selfAssessment: {}, managerAssessment: {} }
    ];

    const result = applyObjectivesDefinition(existing, [
      objectiveDef({
        krs: [
          { id: 'kr-1', label: 'A', weight: 0.5 },
          { id: 'kr-2', label: 'B (nouveau)', weight: 0.5 }
        ]
      })
    ]);

    expect(result[0].krs.find((k) => k.id === 'kr-1')?.progress).toBe(50);
    expect(result[0].krs.find((k) => k.id === 'kr-2')?.progress).toBe(0);
  });

  it('retire un objectif dont l\'id ne figure plus dans la nouvelle définition', () => {
    const existing: IObjective[] = [
      { id: 'obj-1', title: 'A', weight: 0.5, krs: [], selfAssessment: {}, managerAssessment: {} },
      { id: 'obj-2', title: 'B', weight: 0.5, krs: [], selfAssessment: {}, managerAssessment: {} }
    ];

    const result = applyObjectivesDefinition(existing, [objectiveDef({ id: 'obj-1', title: 'A' })]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('obj-1');
  });

  it('ne mute pas les objectifs/KR reçus', () => {
    const existingKr = makeKr({ id: 'kr-1', progress: 30 });
    const existing: IObjective[] = [
      { id: 'obj-1', title: 'X', weight: 1, krs: [existingKr], selfAssessment: {}, managerAssessment: {} }
    ];

    applyObjectivesDefinition(existing, [objectiveDef({ krs: [{ id: 'kr-1', label: 'Y', weight: 1 }] })]);

    expect(existingKr.label).toBe('KR');
    expect(existing[0].title).toBe('X');
  });
});

function baseQualitative(): IQualitative {
  return { successes: {}, challenges: {}, growthAreas: {}, overallReview: {} };
}

function baseCompetencyScores(): ICompetencyScores {
  return {
    technique: {},
    impact: {},
    collaboration: {},
    leadership: {}
  };
}

describe('applyManagerAssessment', () => {
  it("applique l'évaluation manager d'un objectif sans toucher au self", () => {
    const objectives: IObjective[] = [
      {
        id: 'obj-1',
        title: 'X',
        weight: 1,
        krs: [],
        selfAssessment: { status: 'atteint', comment: 'Auto-évaluation' },
        managerAssessment: {}
      }
    ];

    const result = applyManagerAssessment(
      { objectives, qualitative: baseQualitative(), competencyScores: baseCompetencyScores() },
      { objectives: [{ id: 'obj-1', status: 'depasse', comment: 'Bravo' }] }
    );

    expect(result.objectives[0].managerAssessment).toEqual({ status: 'depasse', comment: 'Bravo' });
    expect(result.objectives[0].selfAssessment).toEqual({ status: 'atteint', comment: 'Auto-évaluation' });
  });

  it('ignore une évaluation dont l\'id ne correspond à aucun objectif', () => {
    const objectives: IObjective[] = [
      { id: 'obj-1', title: 'X', weight: 1, krs: [], selfAssessment: {}, managerAssessment: {} }
    ];
    const result = applyManagerAssessment(
      { objectives, qualitative: baseQualitative(), competencyScores: baseCompetencyScores() },
      { objectives: [{ id: 'obj-inconnu', status: 'atteint' }] }
    );
    expect(result.objectives[0].managerAssessment).toEqual({});
  });

  it("fusionne le bilan qualitatif côté manager sans écraser le self", () => {
    const qualitative: IQualitative = {
      successes: { self: 'Auto : livraison à temps' },
      challenges: {},
      growthAreas: {},
      overallReview: {}
    };

    const result = applyManagerAssessment(
      { objectives: [], qualitative, competencyScores: baseCompetencyScores() },
      { qualitative: { successes: 'Manager : bonne collaboration' } }
    );

    expect(result.qualitative.successes).toEqual({
      self: 'Auto : livraison à temps',
      manager: 'Manager : bonne collaboration'
    });
    expect(result.qualitative.challenges).toEqual({});
  });

  it('met à jour la grille de compétences manager par axe, sans toucher aux autres', () => {
    const competencyScores: ICompetencyScores = {
      technique: { self: 4 },
      impact: {},
      collaboration: {},
      leadership: {}
    };

    const result = applyManagerAssessment(
      { objectives: [], qualitative: baseQualitative(), competencyScores },
      { competencyScores: { technique: 3, impact: 5 } }
    );

    expect(result.competencyScores.technique).toEqual({ self: 4, manager: 3 });
    expect(result.competencyScores.impact).toEqual({ manager: 5 });
    expect(result.competencyScores.collaboration).toEqual({});
  });

  it('ne mute pas les objets reçus', () => {
    const qualitative = baseQualitative();
    const competencyScores = baseCompetencyScores();
    applyManagerAssessment(
      { objectives: [], qualitative, competencyScores },
      { qualitative: { successes: 'X' }, competencyScores: { technique: 5 } }
    );
    expect(qualitative.successes).toEqual({});
    expect(competencyScores.technique).toEqual({});
  });
});

describe('computeReviewStatus', () => {
  it('reste "dossier_manquant" sans objectif', () => {
    expect(computeReviewStatus([], 'dossier_manquant')).toBe('dossier_manquant');
  });

  it('passe à "en_cours" dès qu\'un objectif existe sans évaluation manager', () => {
    expect(computeReviewStatus([{ managerAssessment: {} }], 'dossier_manquant')).toBe('en_cours');
  });

  it('passe à "complete" quand tous les objectifs ont une évaluation manager', () => {
    expect(
      computeReviewStatus(
        [{ managerAssessment: { status: 'atteint' } }, { managerAssessment: { status: 'depasse' } }],
        'en_cours'
      )
    ).toBe('complete');
  });

  it('reste "en_cours" si au moins un objectif n\'a pas d\'évaluation manager', () => {
    expect(
      computeReviewStatus([{ managerAssessment: { status: 'atteint' } }, { managerAssessment: {} }], 'en_cours')
    ).toBe('en_cours');
  });

  it('ne revient jamais en arrière depuis "complete"', () => {
    expect(computeReviewStatus([{ managerAssessment: {} }], 'complete')).toBe('complete');
  });
});

describe('applySelfAssessment', () => {
  it("applique l'auto-évaluation d'un objectif sans toucher au manager", () => {
    const objectives: IObjective[] = [
      {
        id: 'obj-1',
        title: 'X',
        weight: 1,
        krs: [],
        selfAssessment: {},
        managerAssessment: { status: 'atteint', comment: 'Évaluation manager' }
      }
    ];

    const result = applySelfAssessment(
      { objectives, qualitative: baseQualitative(), competencyScores: baseCompetencyScores() },
      { objectives: [{ id: 'obj-1', status: 'depasse', comment: 'Je suis fier du résultat' }] }
    );

    expect(result.objectives[0].selfAssessment).toEqual({ status: 'depasse', comment: 'Je suis fier du résultat' });
    expect(result.objectives[0].managerAssessment).toEqual({ status: 'atteint', comment: 'Évaluation manager' });
  });

  it('fusionne le bilan qualitatif côté self sans écraser le manager', () => {
    const qualitative: IQualitative = {
      successes: { manager: 'Manager : bonne collaboration' },
      challenges: {},
      growthAreas: {},
      overallReview: {}
    };

    const result = applySelfAssessment(
      { objectives: [], qualitative, competencyScores: baseCompetencyScores() },
      { qualitative: { successes: 'Auto : livraison à temps' } }
    );

    expect(result.qualitative.successes).toEqual({
      manager: 'Manager : bonne collaboration',
      self: 'Auto : livraison à temps'
    });
  });

  it('met à jour la grille de compétences self par axe, sans toucher au manager', () => {
    const competencyScores: ICompetencyScores = {
      technique: { manager: 3 },
      impact: {},
      collaboration: {},
      leadership: {}
    };

    const result = applySelfAssessment(
      { objectives: [], qualitative: baseQualitative(), competencyScores },
      { competencyScores: { technique: 4 } }
    );

    expect(result.competencyScores.technique).toEqual({ manager: 3, self: 4 });
  });

  it('ne mute pas les objets reçus', () => {
    const qualitative = baseQualitative();
    applySelfAssessment({ objectives: [], qualitative, competencyScores: baseCompetencyScores() }, { qualitative: { successes: 'X' } });
    expect(qualitative.successes).toEqual({});
  });
});
