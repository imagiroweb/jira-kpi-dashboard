/**
 * TU — logique métier pure du référentiel de notation détaillée (réponses verbeuses + points).
 */
import ExcelJS from 'exceljs';
import {
  GeneralAssessmentManagerAxesInput,
  parseReferentialFromWorksheet,
  resolveAnswerPoints,
  resolveManagerAxesAnswers,
  validateGeneralAssessmentManagerAxes,
  validateReferentialAxes
} from './generalAssessmentReferential';
import { IReferentialAxes } from './entities/GeneralAssessmentReferentialProfile';

/**
 * Construit un onglet "Référentiel évaluation" reproduisant le gabarit réel : lignes 6 à 17,
 * colonne C = libellé du sous-critère, colonnes D à H = les 5 réponses (de la moins bonne à la
 * meilleure). `rows` ne renseigne que les lignes qu'on veut remplir, dans l'ordre (ligne 6 = rows[0]).
 */
function buildReferentialWorksheet(rows: { label?: string; answers?: (string | undefined)[] }[]): ExcelJS.Worksheet {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Référentiel évaluation');

  rows.forEach((row, index) => {
    const r = 6 + index;
    if (row.label !== undefined) worksheet.getCell(`C${r}`).value = row.label;
    (row.answers ?? []).forEach((text, answerIndex) => {
      if (text !== undefined) {
        worksheet.getCell(`${String.fromCharCode('D'.charCodeAt(0) + answerIndex)}${r}`).value = text;
      }
    });
  });

  return worksheet;
}

const FIVE_ANSWERS = ['Très faible', 'Faible', 'Correct', 'Bon', 'Excellent'];

function fullRow(label: string, answers: string[] = FIVE_ANSWERS) {
  return { label, answers };
}

describe('parseReferentialFromWorksheet', () => {
  it('extrait les 12 sous-critères réels (4 axes × 3), avec 5 réponses notées 1 à 5', () => {
    const rows = [
      fullRow('Qualité du code & revues'),
      fullRow('Autonomie & résolution de bugs'),
      fullRow('Conception & architecture'),
      fullRow('Livraison (delivery)'),
      fullRow('Contribution aux OKR'),
      fullRow("Périmètre d'influence"),
      fullRow('Communication & transparence'),
      fullRow('Partage & documentation'),
      fullRow("Esprit d'équipe & rituels"),
      fullRow('Initiative & autonomie'),
      fullRow('Mentorat & développement des autres'),
      fullRow('Vision & influence')
    ];
    const worksheet = buildReferentialWorksheet(rows);

    const result = parseReferentialFromWorksheet(worksheet);

    expect(result.warnings).toEqual([]);
    expect(result.axes.technique).toHaveLength(3);
    expect(result.axes.impact).toHaveLength(3);
    expect(result.axes.collaboration).toHaveLength(3);
    expect(result.axes.leadership).toHaveLength(3);
    expect(result.axes.technique[0]).toEqual({
      label: 'Qualité du code & revues',
      answers: [
        { text: 'Très faible', points: 1 },
        { text: 'Faible', points: 2 },
        { text: 'Correct', points: 3 },
        { text: 'Bon', points: 4 },
        { text: 'Excellent', points: 5 }
      ]
    });
  });

  const FULL_VALID_ROWS = [
    fullRow('Qualité du code & revues'),
    fullRow('Autonomie & résolution de bugs'),
    fullRow('Conception & architecture'),
    fullRow('Livraison (delivery)'),
    fullRow('Contribution aux OKR'),
    fullRow("Périmètre d'influence"),
    fullRow('Communication & transparence'),
    fullRow('Partage & documentation'),
    fullRow("Esprit d'équipe & rituels"),
    fullRow('Initiative & autonomie'),
    fullRow('Mentorat & développement des autres'),
    fullRow('Vision & influence')
  ];

  it('signale et ignore un sous-critère sans libellé, sans affecter les autres lignes', () => {
    const rows = [{ answers: FIVE_ANSWERS }, ...FULL_VALID_ROWS.slice(1)];
    const worksheet = buildReferentialWorksheet(rows);

    const result = parseReferentialFromWorksheet(worksheet);

    expect(result.axes.technique).toHaveLength(2);
    expect(result.warnings).toEqual(['Ligne 6 (axe technique) : libellé de sous-critère manquant — ignorée.']);
  });

  it('signale et ignore un sous-critère avec moins de 5 réponses, sans affecter les autres lignes', () => {
    const rows = [
      { label: 'Qualité du code & revues', answers: ['Très faible', 'Faible'] },
      ...FULL_VALID_ROWS.slice(1)
    ];
    const worksheet = buildReferentialWorksheet(rows);

    const result = parseReferentialFromWorksheet(worksheet);

    expect(result.axes.technique).toHaveLength(2);
    expect(result.warnings).toEqual([
      'Ligne 6 (Qualité du code & revues) : 2/5 réponse(s) trouvée(s) — ignorée.'
    ]);
  });
});

describe('validateReferentialAxes', () => {
  function emptyAxes(): IReferentialAxes {
    return { technique: [], impact: [], collaboration: [], leadership: [] };
  }

  const validCriterion = {
    label: 'Qualité du code & revues',
    answers: FIVE_ANSWERS.map((text, index) => ({ text, points: index + 1 }))
  };

  it('valide une grille complète avec les 4 axes présents', () => {
    const axes = { ...emptyAxes(), technique: [validCriterion] };
    expect(validateReferentialAxes(axes)).toEqual({ valid: true, errors: [] });
  });

  it("refuse un payload qui n'est pas un objet", () => {
    expect(validateReferentialAxes('nope')).toEqual({ valid: false, errors: ['axes doit être un objet'] });
  });

  it('signale un axe manquant', () => {
    const { technique: _technique, ...rest } = emptyAxes();
    const result = validateReferentialAxes(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("L'axe technique est requis");
  });

  it('signale un axe inconnu', () => {
    const result = validateReferentialAxes({ ...emptyAxes(), bonus: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Axe inconnu : bonus');
  });

  it('signale un critère sans libellé', () => {
    const axes = { ...emptyAxes(), technique: [{ ...validCriterion, label: '  ' }] };
    const result = validateReferentialAxes(axes);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Axe technique, critère 1 : libellé requis');
  });

  it("signale un critère qui n'a pas exactement 5 réponses", () => {
    const axes = { ...emptyAxes(), technique: [{ ...validCriterion, answers: validCriterion.answers.slice(0, 3) }] };
    const result = validateReferentialAxes(axes);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Axe technique, critère 1 : exactement 5 réponses requises');
  });

  it('signale une réponse sans texte ou avec des points hors 1-5', () => {
    const axes = {
      ...emptyAxes(),
      technique: [
        {
          label: 'Qualité du code & revues',
          answers: [
            { text: '', points: 1 },
            { text: 'Faible', points: 7 },
            { text: 'Correct', points: 3 },
            { text: 'Bon', points: 4 },
            { text: 'Excellent', points: 5 }
          ]
        }
      ]
    };
    const result = validateReferentialAxes(axes);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Axe technique, critère 1, réponse 1 : texte requis');
    expect(result.errors).toContain('Axe technique, critère 1, réponse 2 : points requis entre 1 et 5');
  });
});

describe('resolveAnswerPoints', () => {
  const axes: IReferentialAxes = {
    technique: [
      {
        label: 'Qualité du code & revues',
        answers: FIVE_ANSWERS.map((text, index) => ({ text, points: index + 1 }))
      }
    ],
    impact: [],
    collaboration: [],
    leadership: []
  };

  it('résout les points de la réponse choisie', () => {
    expect(resolveAnswerPoints(axes, 'technique', 'Qualité du code & revues', 'Bon')).toBe(4);
  });

  it('renvoie undefined si le sous-critère est inconnu', () => {
    expect(resolveAnswerPoints(axes, 'technique', 'Sous-critère fantôme', 'Bon')).toBeUndefined();
  });

  it("renvoie undefined si la réponse n'existe pas (ou plus) pour ce sous-critère", () => {
    expect(resolveAnswerPoints(axes, 'technique', 'Qualité du code & revues', 'Réponse inconnue')).toBeUndefined();
  });
});

describe('validateGeneralAssessmentManagerAxes', () => {
  it('valide une grille manager complète (libellé + réponse pour chaque sous-critère)', () => {
    const result = validateGeneralAssessmentManagerAxes({
      technique: [{ label: 'Qualité du code & revues', answer: 'Bon' }]
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('signale un axe inconnu', () => {
    const input = { supervision: [{ label: 'X', answer: 'Y' }] } as unknown as GeneralAssessmentManagerAxesInput;
    const result = validateGeneralAssessmentManagerAxes(input);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['Axe inconnu : supervision']);
  });

  it('signale un sous-critère sans libellé', () => {
    const result = validateGeneralAssessmentManagerAxes({
      technique: [{ label: '', answer: 'Bon' }]
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['Axe technique, sous-critère 1 : libellé requis']);
  });

  it('signale un sous-critère sans réponse', () => {
    const result = validateGeneralAssessmentManagerAxes({
      technique: [{ label: 'Qualité du code & revues', answer: '' }]
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['Axe technique, sous-critère 1 : réponse requise']);
  });

  it("n'exige aucune note (score) — cette validation porte uniquement sur la forme, pas la résolution", () => {
    const result = validateGeneralAssessmentManagerAxes({
      technique: [{ label: 'Qualité du code & revues', answer: 'Réponse qui n\'existe pas dans le référentiel' }]
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });
});

describe('resolveManagerAxesAnswers', () => {
  const referentialAxes: IReferentialAxes = {
    technique: [
      {
        label: 'Qualité du code & revues',
        answers: FIVE_ANSWERS.map((text, index) => ({ text, points: index + 1 }))
      }
    ],
    impact: [
      {
        label: 'Livraison (delivery)',
        answers: FIVE_ANSWERS.map((text, index) => ({ text, points: index + 1 }))
      }
    ],
    collaboration: [],
    leadership: []
  };

  it('résout le score de chaque réponse choisie et conserve la réponse elle-même', () => {
    const result = resolveManagerAxesAnswers(
      { technique: [{ label: 'Qualité du code & revues', answer: 'Bon' }] },
      referentialAxes
    );
    expect(result.errors).toEqual([]);
    expect(result.axes.technique).toEqual([{ label: 'Qualité du code & revues', score: 4, answer: 'Bon' }]);
  });

  it("ignore les axes absents de l'entrée (même sémantique que applyGeneralAssessmentAxes)", () => {
    const result = resolveManagerAxesAnswers(
      { impact: [{ label: 'Livraison (delivery)', answer: 'Excellent' }] },
      referentialAxes
    );
    expect(result.axes.technique).toBeUndefined();
    expect(result.axes.impact).toEqual([{ label: 'Livraison (delivery)', score: 5, answer: 'Excellent' }]);
  });

  it("signale une réponse introuvable dans le référentiel, sans faire échouer les autres sous-critères", () => {
    const result = resolveManagerAxesAnswers(
      {
        technique: [
          { label: 'Qualité du code & revues', answer: 'Réponse inconnue' },
          { label: 'Sous-critère fantôme', answer: 'Bon' }
        ]
      },
      referentialAxes
    );
    expect(result.errors).toEqual([
      'Axe technique, sous-critère "Qualité du code & revues" : réponse "Réponse inconnue" introuvable dans le référentiel',
      'Axe technique, sous-critère "Sous-critère fantôme" : réponse "Bon" introuvable dans le référentiel'
    ]);
  });
});
