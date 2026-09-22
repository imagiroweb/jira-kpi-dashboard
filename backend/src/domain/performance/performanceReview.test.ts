/**
 * TU — logique métier pure de la fiche de performance
 */
import {
  appendKeyResultProgress,
  applyGeneralSelfAssessment,
  applyManagerAssessment,
  applyObjectivesDefinition,
  applySelfAssessment,
  computeGeneralAssessmentAxisScore,
  computeGeneralAssessmentGlobalScore,
  computeGeneralAssessmentGlobalScoreOrNull,
  computeKeyResultProgressStatus,
  computeObjectiveProgress,
  computeObjectiveWeightedScore,
  computeCoachingStatus,
  computeCyclePace,
  computeReviewCoaching,
  computeReviewScore,
  completeGeneralSelfAssessment,
  completeQualitative,
  canCompleteReview,
  computeReviewStatus,
  isGeneralManagerAssessmentComplete,
  GENERAL_ASSESSMENT_REFERENTIAL,
  GeneralSelfAssessmentInput,
  isPlausibleEvidenceUrl,
  ObjectiveDefinitionInput,
  suggestCompetencyAxes,
  sumWeights,
  validateGeneralSelfAssessment,
  validateObjectivesDefinition,
  weightsAreBalanced
} from './performanceReview';
import { IKeyResult, IObjective, IQualitative, IGeneralAssessmentAxes, IReviewAuthor } from './entities/PerformanceReview';

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

describe('computeObjectiveWeightedScore', () => {
  it('multiplie l’avancement par le poids de l’objectif', () => {
    const objective = makeObjective({
      weight: 0.3,
      krs: [makeKr({ weight: 1, progress: 50 })]
    });
    expect(computeObjectiveWeightedScore(objective)).toBeCloseTo(15);
  });
});

describe('computeCyclePace / computeCoachingStatus', () => {
  const start = '2026-07-01';
  const end = '2026-12-31';

  it('attend 50 % à mi-semestre', () => {
    const pace = computeCyclePace(start, end, new Date('2026-10-01T00:00:00.000Z'));
    expect(pace.expectedProgress).toBeCloseTo(50.27, 0);
    expect(pace.monthIndex).toBe(4);
  });

  it('classe performant / en progression / action à mener autour de la bande de 8 pts', () => {
    expect(computeCoachingStatus(60, 50)).toBe('performant');
    expect(computeCoachingStatus(50, 50)).toBe('en_progression');
    expect(computeCoachingStatus(40, 50)).toBe('action_a_mener');
  });

  it('agrège le score pondéré de la fiche pour le statut d’accompagnement total', () => {
    const coaching = computeReviewCoaching(
      [
        makeObjective({
          id: 'o1',
          weight: 0.4,
          krs: [makeKr({ weight: 1, progress: 20 })]
        }),
        makeObjective({
          id: 'o2',
          weight: 0.6,
          krs: [makeKr({ id: 'kr2', weight: 1, progress: 20 })]
        })
      ],
      { startDate: start, endDate: end },
      new Date('2026-10-01T00:00:00.000Z')
    );
    expect(coaching.weightedScore).toBeCloseTo(20);
    expect(coaching.status).toBe('action_a_mener');
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

describe('computeGeneralAssessmentAxisScore', () => {
  it('retourne 0 pour un axe sans sous-critère', () => {
    expect(computeGeneralAssessmentAxisScore([])).toBe(0);
  });

  it('reprend le cas réel Excel : 3 sous-critères à 5/5/5 => moyenne 5', () => {
    const subCriteria = [
      { label: 'Qualité du code & revues', score: 5 },
      { label: 'Autonomie & résolution de bugs', score: 5 },
      { label: 'Conception & architecture', score: 5 }
    ];
    expect(computeGeneralAssessmentAxisScore(subCriteria)).toBe(5);
  });

  it('moyenne des sous-critères quand ils diffèrent (cas réel Alexandre Parjouet, axe Impact : 4/4/3)', () => {
    const subCriteria = [
      { label: 'Livraison (delivery)', score: 4 },
      { label: 'Contribution aux OKR', score: 4 },
      { label: "Périmètre d'influence", score: 3 }
    ];
    expect(computeGeneralAssessmentAxisScore(subCriteria)).toBeCloseTo(3.6666666666666665);
  });
});

describe('computeGeneralAssessmentGlobalScore', () => {
  function emptyAxes(): IGeneralAssessmentAxes {
    return { technique: [], impact: [], collaboration: [], leadership: [] };
  }

  it('retourne 0 quand aucun axe n\'a de sous-critère', () => {
    expect(computeGeneralAssessmentGlobalScore(emptyAxes())).toBe(0);
  });

  it('reprend le cas réel Excel (Bruno Deguil-Robin) : axes 5/4.667/5/5 => moyenne ~4.917', () => {
    const axes: IGeneralAssessmentAxes = {
      technique: [
        { label: 'Qualité du code & revues', score: 5 },
        { label: 'Autonomie & résolution de bugs', score: 5 },
        { label: 'Conception & architecture', score: 5 }
      ],
      impact: [
        { label: 'Livraison (delivery)', score: 4 },
        { label: 'Contribution aux OKR', score: 5 },
        { label: "Périmètre d'influence", score: 5 }
      ],
      collaboration: [
        { label: 'Communication & transparence', score: 5 },
        { label: 'Partage & documentation', score: 5 },
        { label: "Esprit d'équipe & rituels", score: 5 }
      ],
      leadership: [
        { label: 'Initiative & autonomie', score: 5 },
        { label: 'Mentorat & développement des autres', score: 5 },
        { label: 'Vision & influence', score: 5 }
      ]
    };
    // Score Technique 5, Impact 4.6667, Collaboration 5, Leadership 5 => moyenne (5+4.6667+5+5)/4
    expect(computeGeneralAssessmentGlobalScore(axes)).toBeCloseTo(4.916666666666667);
  });

  it('exclut les axes sans sous-critère de la moyenne (ne les compte pas comme 0)', () => {
    const axes: IGeneralAssessmentAxes = {
      technique: [{ label: 'Qualité du code & revues', score: 4 }],
      impact: [{ label: 'Livraison (delivery)', score: 2 }],
      collaboration: [],
      leadership: []
    };
    // Moyenne sur les 2 axes renseignés seulement : (4 + 2) / 2 = 3, pas /4
    expect(computeGeneralAssessmentGlobalScore(axes)).toBe(3);
  });
});

describe('validateGeneralSelfAssessment / applyGeneralSelfAssessment / completeGeneralSelfAssessment', () => {
  function emptyAxes(): IGeneralAssessmentAxes {
    return { technique: [], impact: [], collaboration: [], leadership: [] };
  }

  describe('validateGeneralSelfAssessment', () => {
    it('valide une entrée vide (aucun axe fourni)', () => {
      expect(validateGeneralSelfAssessment({})).toEqual({ valid: true, errors: [] });
    });

    it('valide un axe avec des sous-critères correctement notés', () => {
      const input: GeneralSelfAssessmentInput = {
        technique: [
          { label: 'Qualité du code & revues', score: 5 },
          { label: 'Autonomie & résolution de bugs', score: 4 }
        ]
      };
      expect(validateGeneralSelfAssessment(input)).toEqual({ valid: true, errors: [] });
    });

    it("signale un axe inconnu (clé hors des 4 axes de COMPETENCY_AXES)", () => {
      const input = { bonus: [{ label: 'Critère mystère', score: 3 }] } as unknown as GeneralSelfAssessmentInput;
      const result = validateGeneralSelfAssessment(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(['Axe inconnu : bonus']);
    });

    it('signale un sous-critère sans libellé', () => {
      const input: GeneralSelfAssessmentInput = { impact: [{ label: '  ', score: 3 }] };
      const result = validateGeneralSelfAssessment(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(['Axe impact, sous-critère 1 : libellé requis']);
    });

    it('signale une note hors 1-5', () => {
      const input: GeneralSelfAssessmentInput = { leadership: [{ label: 'Vision & influence', score: 7 }] };
      const result = validateGeneralSelfAssessment(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(['Axe leadership, sous-critère 1 : note requise entre 1 et 5']);
    });
  });

  describe('applyGeneralSelfAssessment', () => {
    it("remplace entièrement les sous-critères d'un axe fourni, sans fusion par id", () => {
      const current: IGeneralAssessmentAxes = {
        ...emptyAxes(),
        technique: [{ label: 'Ancien critère', score: 2 }]
      };
      const result = applyGeneralSelfAssessment(current, {
        technique: [
          { label: 'Qualité du code & revues', score: 5 },
          { label: 'Conception & architecture', score: 4 }
        ]
      });
      expect(result.technique).toEqual([
        { label: 'Qualité du code & revues', score: 5 },
        { label: 'Conception & architecture', score: 4 }
      ]);
    });

    it("ne touche pas aux axes absents de l'entrée", () => {
      const current: IGeneralAssessmentAxes = {
        technique: [{ label: 'Qualité du code & revues', score: 5 }],
        impact: [{ label: 'Livraison (delivery)', score: 4 }],
        collaboration: [{ label: 'Communication & transparence', score: 3 }],
        leadership: [{ label: 'Vision & influence', score: 5 }]
      };
      const result = applyGeneralSelfAssessment(current, { impact: [{ label: 'Livraison (delivery)', score: 5 }] });

      expect(result.impact).toEqual([{ label: 'Livraison (delivery)', score: 5 }]);
      expect(result.technique).toEqual(current.technique);
      expect(result.collaboration).toEqual(current.collaboration);
      expect(result.leadership).toEqual(current.leadership);
    });

    it("reporte la réponse verbeuse (answer) quand elle est fournie en entrée (évaluation manager)", () => {
      const current: IGeneralAssessmentAxes = emptyAxes();
      const result = applyGeneralSelfAssessment(current, {
        technique: [{ label: 'Qualité du code & revues', score: 4, answer: 'Réponse correcte' }]
      });
      expect(result.technique).toEqual([{ label: 'Qualité du code & revues', score: 4, answer: 'Réponse correcte' }]);
    });

    it("n'ajoute pas de champ answer quand il est absent de l'entrée (auto-évaluation)", () => {
      const current: IGeneralAssessmentAxes = emptyAxes();
      const result = applyGeneralSelfAssessment(current, {
        technique: [{ label: 'Qualité du code & revues', score: 4 }]
      });
      expect(result.technique[0]).not.toHaveProperty('answer');
    });
  });

  describe('completeGeneralSelfAssessment', () => {
    it('complète les 4 axes à partir de undefined/null (mêmes garanties que completeQualitative)', () => {
      expect(completeGeneralSelfAssessment(undefined)).toEqual(emptyAxes());
      expect(completeGeneralSelfAssessment(null)).toEqual(emptyAxes());
    });

    it('complète les axes manquants sans toucher à ceux fournis', () => {
      const result = completeGeneralSelfAssessment({ technique: [{ label: 'X', score: 3 }] });
      expect(result).toEqual({ ...emptyAxes(), technique: [{ label: 'X', score: 3 }] });
    });
  });
});

describe('GENERAL_ASSESSMENT_REFERENTIEL', () => {
  it('liste 3 sous-critères pour chacun des 4 axes', () => {
    (['technique', 'impact', 'collaboration', 'leadership'] as const).forEach((axis) => {
      expect(GENERAL_ASSESSMENT_REFERENTIAL[axis]).toHaveLength(3);
    });
  });
});

describe('computeGeneralAssessmentGlobalScoreOrNull', () => {
  function emptyAxes(): IGeneralAssessmentAxes {
    return { technique: [], impact: [], collaboration: [], leadership: [] };
  }

  it("renvoie null si aucun axe n'a de sous-critère noté (au lieu de 0)", () => {
    expect(computeGeneralAssessmentGlobalScoreOrNull(emptyAxes())).toBeNull();
  });

  it('renvoie le score global dès qu’un axe au moins est noté', () => {
    const axes = { ...emptyAxes(), technique: [{ label: 'X', score: 4 }] };
    expect(computeGeneralAssessmentGlobalScoreOrNull(axes)).toBe(computeGeneralAssessmentGlobalScore(axes));
  });
});

describe('computeKeyResultProgressStatus', () => {
  it('"on_track" à partir de 80%', () => {
    expect(computeKeyResultProgressStatus(80)).toBe('on_track');
    expect(computeKeyResultProgressStatus(100)).toBe('on_track');
  });

  it('"in_progress" entre 50% (inclus) et 80%', () => {
    expect(computeKeyResultProgressStatus(50)).toBe('in_progress');
    expect(computeKeyResultProgressStatus(79)).toBe('in_progress');
  });

  it('"at_risk" en dessous de 50%', () => {
    expect(computeKeyResultProgressStatus(49)).toBe('at_risk');
    expect(computeKeyResultProgressStatus(0)).toBe('at_risk');
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

  it("reprend les axes de compétence de la définition (remplacement, comme le titre/poids)", () => {
    const existing: IObjective[] = [
      { id: 'obj-1', title: 'X', weight: 1, competencyAxes: ['leadership'], krs: [], selfAssessment: {}, managerAssessment: {} }
    ];

    const result = applyObjectivesDefinition(existing, [
      objectiveDef({ competencyAxes: ['technique', 'impact'] })
    ]);

    expect(result[0].competencyAxes).toEqual(['technique', 'impact']);
  });

  it('utilise un tableau vide quand la définition ne précise pas d\'axes de compétence', () => {
    const result = applyObjectivesDefinition([], [objectiveDef()]);
    expect(result[0].competencyAxes).toEqual([]);
  });
});

describe('suggestCompetencyAxes', () => {
  it('suggère un axe unique à partir d\'un mot-clé du titre', () => {
    expect(suggestCompetencyAxes('Refactoriser l\'architecture technique')).toEqual(['technique']);
  });

  it('suggère un axe à partir de la description quand le titre ne matche rien', () => {
    expect(suggestCompetencyAxes('Objectif Q3', 'Améliorer la satisfaction client et le delivery')).toEqual(['impact']);
  });

  it('classe par nombre de correspondances et limite à 2 axes', () => {
    const result = suggestCompetencyAxes(
      'Mentorer l\'équipe technique',
      'Vision, encadrement, recrutement et collaboration transverse avec le code et l\'architecture'
    );
    expect(result).toHaveLength(2);
    expect(result).toEqual(['leadership', 'technique']);
  });

  it('ne suggère rien quand aucun mot-clé ne correspond', () => {
    expect(suggestCompetencyAxes('Titre neutre sans mot-clé particulier')).toEqual([]);
  });

  it('départage une égalité par l\'ordre de COMPETENCY_AXES', () => {
    // "technique" (1er de COMPETENCY_AXES) et "impact" ont chacun 1 correspondance ;
    // "collaboration" et "leadership" n'en ont aucune ici.
    expect(suggestCompetencyAxes('code et client')).toEqual(['technique', 'impact']);
  });
});

function baseQualitative(): IQualitative {
  return { successes: {}, challenges: {}, growthAreas: {}, overallReview: {} };
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
      { objectives, qualitative: baseQualitative() },
      { objectives: [{ id: 'obj-1', status: 'depasse', comment: 'Bravo' }] }
    );

    expect(result.objectives[0].managerAssessment).toEqual({ status: 'depasse', comment: 'Bravo' });
    expect(result.objectives[0].selfAssessment).toEqual({ status: 'atteint', comment: 'Auto-évaluation' });
  });

  it("persiste l'action d'accompagnement saisie par le manager", () => {
    const objectives: IObjective[] = [
      {
        id: 'obj-1',
        title: 'X',
        weight: 1,
        krs: [],
        selfAssessment: {},
        managerAssessment: { status: 'partiellement_atteint' }
      }
    ];

    const result = applyManagerAssessment(
      { objectives, qualitative: baseQualitative() },
      { objectives: [{ id: 'obj-1', coachingAction: 'Prioriser le KR incidents cette semaine' }] }
    );

    expect(result.objectives[0].managerAssessment).toEqual({
      status: 'partiellement_atteint',
      coachingAction: 'Prioriser le KR incidents cette semaine'
    });
  });

  it("efface l'action d'accompagnement quand le manager envoie une chaîne vide", () => {
    const objectives: IObjective[] = [
      {
        id: 'obj-1',
        title: 'X',
        weight: 1,
        krs: [],
        selfAssessment: {},
        managerAssessment: { coachingAction: 'Ancienne action' }
      }
    ];

    const result = applyManagerAssessment(
      { objectives, qualitative: baseQualitative() },
      { objectives: [{ id: 'obj-1', coachingAction: '   ' }] }
    );

    expect(result.objectives[0].managerAssessment.coachingAction).toBeUndefined();
  });

  it('ignore une évaluation dont l\'id ne correspond à aucun objectif', () => {
    const objectives: IObjective[] = [
      { id: 'obj-1', title: 'X', weight: 1, krs: [], selfAssessment: {}, managerAssessment: {} }
    ];
    const result = applyManagerAssessment(
      { objectives, qualitative: baseQualitative() },
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
      { objectives: [], qualitative },
      { qualitative: { successes: 'Manager : bonne collaboration' } }
    );

    expect(result.qualitative.successes).toEqual({
      self: 'Auto : livraison à temps',
      manager: 'Manager : bonne collaboration'
    });
    expect(result.qualitative.challenges).toEqual({});
  });

  it('ne mute pas les objets reçus', () => {
    const qualitative = baseQualitative();
    applyManagerAssessment({ objectives: [], qualitative }, { qualitative: { successes: 'X' } });
    expect(qualitative.successes).toEqual({});
  });

  it('tolère une fiche dont qualitative est absente (défaut Mongoose {})', () => {
    const result = applyManagerAssessment(
      { objectives: [], qualitative: undefined as unknown as IQualitative },
      { qualitative: { successes: 'Manager : ok' } }
    );
    expect(result.qualitative.successes).toEqual({ manager: 'Manager : ok' });
    expect(result.qualitative.challenges).toEqual({});
  });
});

describe('isGeneralManagerAssessmentComplete', () => {
  function emptyAxes(): IGeneralAssessmentAxes {
    return { technique: [], impact: [], collaboration: [], leadership: [] };
  }

  it('est fausse quand les 4 axes sont vides', () => {
    expect(isGeneralManagerAssessmentComplete(emptyAxes())).toBe(false);
  });

  it("est fausse quand il manque un seul axe (les 3 autres ont un sous-critère)", () => {
    const axes: IGeneralAssessmentAxes = {
      ...emptyAxes(),
      technique: [{ label: 'Qualité du code', score: 4, answer: 'Bon' }],
      impact: [{ label: 'Delivery', score: 3, answer: 'Correct' }],
      collaboration: [{ label: 'Entraide', score: 5, answer: 'Excellent' }]
      // leadership reste vide
    };
    expect(isGeneralManagerAssessmentComplete(axes)).toBe(false);
  });

  it('est vraie dès que les 4 axes ont chacun au moins un sous-critère noté', () => {
    const axes: IGeneralAssessmentAxes = {
      technique: [{ label: 'Qualité du code', score: 4, answer: 'Bon' }],
      impact: [{ label: 'Delivery', score: 3, answer: 'Correct' }],
      collaboration: [{ label: 'Entraide', score: 5, answer: 'Excellent' }],
      leadership: [{ label: 'Mentorat', score: 2, answer: 'Faible' }]
    };
    expect(isGeneralManagerAssessmentComplete(axes)).toBe(true);
  });
});

describe('computeReviewStatus', () => {
  function emptyAxes(): IGeneralAssessmentAxes {
    return { technique: [], impact: [], collaboration: [], leadership: [] };
  }

  function fullAxes(): IGeneralAssessmentAxes {
    return {
      technique: [{ label: 'Qualité du code', score: 4, answer: 'Bon' }],
      impact: [{ label: 'Delivery', score: 3, answer: 'Correct' }],
      collaboration: [{ label: 'Entraide', score: 5, answer: 'Excellent' }],
      leadership: [{ label: 'Mentorat', score: 2, answer: 'Faible' }]
    };
  }

  it('reste "dossier_manquant" sans objectif', () => {
    expect(computeReviewStatus([], emptyAxes(), 'dossier_manquant')).toBe('dossier_manquant');
  });

  it('passe à "en_cours" dès qu\'un objectif existe sans évaluation manager', () => {
    expect(computeReviewStatus([{ managerAssessment: {} }], emptyAxes(), 'dossier_manquant')).toBe('en_cours');
  });

  it('reste "en_cours" même si tous les objectifs et la grille manager sont complets (la clôture est un CTA dédié)', () => {
    expect(
      computeReviewStatus(
        [{ managerAssessment: { status: 'atteint' } }, { managerAssessment: { status: 'depasse' } }],
        fullAxes(),
        'en_cours'
      )
    ).toBe('en_cours');
  });

  it('autorise la validation du semestre seulement quand objectifs et grille manager sont complets', () => {
    expect(
      canCompleteReview(
        [{ managerAssessment: { status: 'atteint' } }, { managerAssessment: { status: 'depasse' } }],
        fullAxes()
      )
    ).toEqual({ valid: true, errors: [] });
    expect(canCompleteReview([{ managerAssessment: { status: 'atteint' } }], emptyAxes()).valid).toBe(false);
    expect(canCompleteReview([], fullAxes()).valid).toBe(false);
  });

  it("reste \"en_cours\" si tous les objectifs sont évalués mais que la grille générale manager n'est pas complète", () => {
    expect(
      computeReviewStatus(
        [{ managerAssessment: { status: 'atteint' } }, { managerAssessment: { status: 'depasse' } }],
        emptyAxes(),
        'en_cours'
      )
    ).toBe('en_cours');
  });

  it("reste \"en_cours\" si la grille générale manager est complète mais qu'un objectif n'a pas d'évaluation manager", () => {
    expect(
      computeReviewStatus([{ managerAssessment: { status: 'atteint' } }, { managerAssessment: {} }], fullAxes(), 'en_cours')
    ).toBe('en_cours');
  });

  it('reste "en_cours" si au moins un objectif n\'a pas d\'évaluation manager', () => {
    expect(
      computeReviewStatus([{ managerAssessment: { status: 'atteint' } }, { managerAssessment: {} }], emptyAxes(), 'en_cours')
    ).toBe('en_cours');
  });

  it('ne revient jamais en arrière depuis "complete"', () => {
    expect(computeReviewStatus([{ managerAssessment: {} }], emptyAxes(), 'complete')).toBe('complete');
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
      { objectives, qualitative: baseQualitative() },
      { objectives: [{ id: 'obj-1', status: 'depasse', comment: 'Je suis fier du résultat' }] }
    );

    expect(result.objectives[0].selfAssessment).toEqual({ status: 'depasse', comment: 'Je suis fier du résultat' });
    expect(result.objectives[0].managerAssessment).toEqual({ status: 'atteint', comment: 'Évaluation manager' });
  });

  it("n'écrit pas l'action d'accompagnement envoyée côté self et ne touche pas à celle du manager", () => {
    const objectives: IObjective[] = [
      {
        id: 'obj-1',
        title: 'X',
        weight: 1,
        krs: [],
        selfAssessment: {},
        managerAssessment: { coachingAction: 'Prioriser le KR incidents' }
      }
    ];

    const result = applySelfAssessment(
      { objectives, qualitative: baseQualitative() },
      { objectives: [{ id: 'obj-1', status: 'atteint', coachingAction: 'Je m’assigne une autre action' }] }
    );

    expect(result.objectives[0].selfAssessment).toEqual({ status: 'atteint' });
    expect(result.objectives[0].managerAssessment).toEqual({ coachingAction: 'Prioriser le KR incidents' });
  });

  it('fusionne le bilan qualitatif côté self sans écraser le manager', () => {
    const qualitative: IQualitative = {
      successes: { manager: 'Manager : bonne collaboration' },
      challenges: {},
      growthAreas: {},
      overallReview: {}
    };

    const result = applySelfAssessment(
      { objectives: [], qualitative },
      { qualitative: { successes: 'Auto : livraison à temps' } }
    );

    expect(result.qualitative.successes).toEqual({
      manager: 'Manager : bonne collaboration',
      self: 'Auto : livraison à temps'
    });
  });

  it('ne mute pas les objets reçus', () => {
    const qualitative = baseQualitative();
    applySelfAssessment({ objectives: [], qualitative }, { qualitative: { successes: 'X' } });
    expect(qualitative.successes).toEqual({});
  });
});

describe('completeQualitative', () => {
  it('remplit les sous-clés absentes d’un payload Mongoose vide', () => {
    expect(completeQualitative({})).toEqual({
      successes: {},
      challenges: {},
      growthAreas: {},
      overallReview: {}
    });
  });
});
