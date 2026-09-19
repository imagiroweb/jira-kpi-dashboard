/**
 * TU — logique métier pure de la fiche de performance
 */
import {
  appendKeyResultProgress,
  computeObjectiveProgress,
  computeReviewScore,
  isPlausibleEvidenceUrl,
  sumWeights,
  weightsAreBalanced
} from './performanceReview';
import { IKeyResult, IObjective, IReviewAuthor } from './entities/PerformanceReview';

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
