import ExcelJS from 'exceljs';
import { findGeneralAssessmentWorksheet, parseGeneralAssessmentFromWorksheet } from './importGeneralAssessment';

/**
 * Construit un onglet d'auto-évaluation générale reproduisant le gabarit réel :
 * `B3` = nom du collaborateur, puis lignes 7 à 18 = 12 sous-critères (colonne A = axe,
 * colonne B = sous-critère, colonne F = note repliée 1-5). `rows` ne renseigne que les lignes
 * qu'on veut remplir pour le test, dans l'ordre (ligne 7 = rows[0], etc.).
 */
function buildGeneralAssessmentWorksheet(
  rows: { axis?: string; label?: string; score?: number | string; rawScore?: boolean }[],
  opts: { sheetName?: string; name?: string } = {}
): ExcelJS.Worksheet {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(opts.sheetName ?? 'Collaborateur Test');
  if (opts.name !== undefined) worksheet.getCell('B3').value = opts.name;
  else worksheet.getCell('B3').value = 'Collaborateur Test';

  rows.forEach((row, index) => {
    const r = 7 + index;
    if (row.axis !== undefined) worksheet.getCell(`A${r}`).value = row.axis;
    if (row.label !== undefined) worksheet.getCell(`B${r}`).value = row.label;
    if (row.score !== undefined) {
      // Sur les fichiers réels, la colonne F est une formule mise en cache
      // (`IFERROR(MATCH(...),"")`) : `cell.value` est un objet `{ formula, result }`, pas un
      // nombre brut. On reproduit cette forme par défaut ; `rawScore: true` teste le cas d'un
      // nombre écrit en dur, toujours supporté en repli.
      worksheet.getCell(`F${r}`).value = row.rawScore
        ? row.score
        : ({
            formula: "IFERROR(MATCH(C7,'Référentiel évaluation'!$D6:$H6,0),\"\")",
            result: row.score
          } as ExcelJS.CellFormulaValue);
    }
  });

  return worksheet;
}

/** Les 12 lignes réelles de `evaluations-individuelles/deguil-robin.xlsx` (Bruno Deguil-Robin, CTO). */
const BRUNO_DEGUIL_ROBIN_ROWS = [
  { axis: 'Technique', label: 'Qualité du code & revues', score: 5 },
  { axis: 'Technique', label: 'Autonomie & résolution de bugs', score: 5 },
  { axis: 'Technique', label: 'Conception & architecture', score: 5 },
  { axis: 'Impact', label: 'Livraison (delivery)', score: 4 },
  { axis: 'Impact', label: 'Contribution aux OKR', score: 5 },
  { axis: 'Impact', label: "Périmètre d'influence", score: 5 },
  { axis: 'Collaboration', label: 'Communication & transparence', score: 5 },
  { axis: 'Collaboration', label: 'Partage & documentation', score: 5 },
  { axis: 'Collaboration', label: 'Esprit d\'équipe & rituels', score: 5 },
  { axis: 'Leadership', label: 'Initiative & autonomie', score: 5 },
  { axis: 'Leadership', label: 'Mentorat & développement des autres', score: 5 },
  { axis: 'Leadership', label: 'Vision & influence', score: 5 }
];

/** Les 12 lignes réelles de `evaluations-individuelles/parjouet.xlsx` (Alexandre Parjouet, Dev Front). */
const ALEXANDRE_PARJOUET_ROWS = [
  { axis: 'Technique', label: 'Qualité du code & revues', score: 3 },
  { axis: 'Technique', label: 'Autonomie & résolution de bugs', score: 4 },
  { axis: 'Technique', label: 'Conception & architecture', score: 3 },
  { axis: 'Impact', label: 'Livraison (delivery)', score: 4 },
  { axis: 'Impact', label: 'Contribution aux OKR', score: 4 },
  { axis: 'Impact', label: "Périmètre d'influence", score: 3 },
  { axis: 'Collaboration', label: 'Communication & transparence', score: 4 },
  { axis: 'Collaboration', label: 'Partage & documentation', score: 2 },
  { axis: 'Collaboration', label: 'Esprit d\'équipe & rituels', score: 5 },
  { axis: 'Leadership', label: 'Initiative & autonomie', score: 4 },
  { axis: 'Leadership', label: 'Mentorat & développement des autres', score: 2 },
  { axis: 'Leadership', label: 'Vision & influence', score: 4 }
];

describe('parseGeneralAssessmentFromWorksheet', () => {
  it("extrait les 12 sous-critères du cas réel Bruno Deguil-Robin, sans avertissement", () => {
    const worksheet = buildGeneralAssessmentWorksheet(BRUNO_DEGUIL_ROBIN_ROWS, { name: 'Bruno Deguil-Robin' });

    const { collaboratorName, axes, warnings } = parseGeneralAssessmentFromWorksheet(worksheet);

    expect(collaboratorName).toBe('Bruno Deguil-Robin');
    expect(warnings).toEqual([]);
    expect(axes.technique).toEqual([
      { label: 'Qualité du code & revues', score: 5 },
      { label: 'Autonomie & résolution de bugs', score: 5 },
      { label: 'Conception & architecture', score: 5 }
    ]);
    expect(axes.impact.map((c) => c.score)).toEqual([4, 5, 5]);
    expect(axes.collaboration).toHaveLength(3);
    expect(axes.leadership.map((c) => c.score)).toEqual([5, 5, 5]);
  });

  it('extrait les 12 sous-critères du cas réel Alexandre Parjouet, sans avertissement', () => {
    const worksheet = buildGeneralAssessmentWorksheet(ALEXANDRE_PARJOUET_ROWS, { name: 'Alexandre Parjouet' });

    const { collaboratorName, axes, warnings } = parseGeneralAssessmentFromWorksheet(worksheet);

    expect(collaboratorName).toBe('Alexandre Parjouet');
    expect(warnings).toEqual([]);
    expect(axes.technique.map((c) => c.score)).toEqual([3, 4, 3]);
    expect(axes.impact.map((c) => c.score)).toEqual([4, 4, 3]);
    expect(axes.collaboration.map((c) => c.score)).toEqual([4, 2, 5]);
    expect(axes.leadership.map((c) => c.score)).toEqual([4, 2, 4]);
  });

  it('signale une cellule B3 vide mais continue à lire les sous-critères', () => {
    const worksheet = buildGeneralAssessmentWorksheet(BRUNO_DEGUIL_ROBIN_ROWS, { name: '' });

    const { collaboratorName, axes, warnings } = parseGeneralAssessmentFromWorksheet(worksheet);

    expect(collaboratorName).toBe('');
    expect(warnings).toEqual(['Cellule B3 (nom du collaborateur) vide.']);
    expect(axes.technique).toHaveLength(3);
  });

  it('ignore silencieusement une ligne totalement vide (pas de trou dans la grille)', () => {
    const worksheet = buildGeneralAssessmentWorksheet([
      { axis: 'Technique', label: 'Qualité du code & revues', score: 5 },
      {},
      { axis: 'Technique', label: 'Conception & architecture', score: 4 }
    ]);

    const { axes, warnings } = parseGeneralAssessmentFromWorksheet(worksheet);

    expect(warnings).toEqual([]);
    expect(axes.technique).toEqual([
      { label: 'Qualité du code & revues', score: 5 },
      { label: 'Conception & architecture', score: 4 }
    ]);
  });

  it('signale et ignore un axe non reconnu', () => {
    const worksheet = buildGeneralAssessmentWorksheet([{ axis: 'Bonus', label: 'Critère mystère', score: 3 }]);

    const { axes, warnings } = parseGeneralAssessmentFromWorksheet(worksheet);

    expect(axes.technique).toEqual([]);
    expect(warnings).toEqual(['Ligne 7 : axe "Bonus" non reconnu — ignorée.']);
  });

  it('signale et ignore un sous-critère sans libellé', () => {
    const worksheet = buildGeneralAssessmentWorksheet([{ axis: 'Impact', score: 4 }]);

    const { axes, warnings } = parseGeneralAssessmentFromWorksheet(worksheet);

    expect(axes.impact).toEqual([]);
    expect(warnings).toEqual(['Ligne 7 (axe Impact) : sous-critère sans libellé — ignorée.']);
  });

  it('signale et ignore une note manquante ou non numérique', () => {
    const worksheet = buildGeneralAssessmentWorksheet([{ axis: 'Collaboration', label: 'Sans note' }]);

    const { axes, warnings } = parseGeneralAssessmentFromWorksheet(worksheet);

    expect(axes.collaboration).toEqual([]);
    expect(warnings).toEqual([
      'Ligne 7 (Collaboration — Sans note) : note manquante ou non numérique — ignorée.'
    ]);
  });

  it('signale et ignore une note hors plage 1-5', () => {
    const worksheet = buildGeneralAssessmentWorksheet([{ axis: 'Leadership', label: 'Note aberrante', score: 7 }]);

    const { axes, warnings } = parseGeneralAssessmentFromWorksheet(worksheet);

    expect(axes.leadership).toEqual([]);
    expect(warnings).toEqual(['Ligne 7 (Leadership — Note aberrante) : note 7 hors plage 1-5 — ignorée.']);
  });

  it('lit une note écrite en dur (sans formule), en repli', () => {
    const worksheet = buildGeneralAssessmentWorksheet([
      { axis: 'Technique', label: 'Qualité du code & revues', score: 4, rawScore: true }
    ]);

    const { axes, warnings } = parseGeneralAssessmentFromWorksheet(worksheet);

    expect(warnings).toEqual([]);
    expect(axes.technique).toEqual([{ label: 'Qualité du code & revues', score: 4 }]);
  });

  it("signale et ignore une note vide issue d'un IFERROR sans correspondance (niveau non reconnu par le référentiel)", () => {
    const worksheet = new ExcelJS.Workbook().addWorksheet('Collaborateur Test');
    worksheet.getCell('B3').value = 'Collaborateur Test';
    worksheet.getCell('A7').value = 'Technique';
    worksheet.getCell('B7').value = 'Qualité du code & revues';
    worksheet.getCell('F7').value = {
      formula: "IFERROR(MATCH(C7,'Référentiel évaluation'!$D6:$H6,0),\"\")",
      result: ''
    } as ExcelJS.CellFormulaValue;

    const { axes, warnings } = parseGeneralAssessmentFromWorksheet(worksheet);

    expect(axes.technique).toEqual([]);
    expect(warnings).toEqual([
      'Ligne 7 (Technique — Qualité du code & revues) : note manquante ou non numérique — ignorée.'
    ]);
  });
});

describe('findGeneralAssessmentWorksheet', () => {
  it("trouve l'onglet propre au collaborateur quand seul l'onglet référentiel l'accompagne", () => {
    const workbook = new ExcelJS.Workbook();
    const own = workbook.addWorksheet('Bruno Deguil-Robin');
    workbook.addWorksheet('Référentiel évaluation');

    expect(findGeneralAssessmentWorksheet(workbook)).toBe(own);
  });

  it("ignore aussi un onglet Manager s'il est présent", () => {
    const workbook = new ExcelJS.Workbook();
    const own = workbook.addWorksheet('Alexandre Parjouet');
    workbook.addWorksheet('Référentiel évaluation');
    workbook.addWorksheet('Manager');

    expect(findGeneralAssessmentWorksheet(workbook)).toBe(own);
  });

  it('renvoie undefined si aucun onglet ne correspond', () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Référentiel évaluation');

    expect(findGeneralAssessmentWorksheet(workbook)).toBeUndefined();
  });

  it('renvoie undefined en cas d\'ambiguïté (plusieurs onglets candidats)', () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Untel');
    workbook.addWorksheet('Une Autre Personne');
    workbook.addWorksheet('Référentiel évaluation');

    expect(findGeneralAssessmentWorksheet(workbook)).toBeUndefined();
  });
});
