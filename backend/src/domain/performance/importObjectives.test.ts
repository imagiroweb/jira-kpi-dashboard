import ExcelJS from 'exceljs';
import {
  findObjectivesWorksheet,
  parseObjectivesFromWorksheet,
  MAX_SUPPORTED_OBJECTIVES
} from './importObjectives';

/**
 * Construit un onglet "OBJECTIFS S2-26" reproduisant le gabarit réel : en-tête "OBJECTIF n" /
 * "Description" / "Poids (%)" à des lignes fixes (3, 14, 25, 36, 47), titre + poids sur la ligne
 * suivante, puis jusqu'à 5 KPI/KR juste après un saut d'une ligne. `slots` ne renseigne que les
 * emplacements qu'on veut remplir pour le test (indices 0 à 4).
 */
function buildObjectivesWorksheet(
  slots: Record<number, { title?: string; weight?: number; krs?: { label?: string; weight?: number }[] }>,
  sheetName = 'OBJECTIFS S2-26'
): ExcelJS.Worksheet {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  const headerRows = [3, 14, 25, 36, 47];

  headerRows.forEach((headerRow, index) => {
    worksheet.getCell(`C${headerRow}`).value = `OBJECTIF ${index + 1}`;
    worksheet.getCell(`D${headerRow}`).value = 'Description';
    worksheet.getCell(`E${headerRow}`).value = 'Poids (%)';

    const slot = slots[index];
    if (!slot) return;

    const titleRow = headerRow + 1;
    if (slot.title !== undefined) worksheet.getCell(`C${titleRow}`).value = slot.title;
    if (slot.weight !== undefined) worksheet.getCell(`E${titleRow}`).value = slot.weight;

    (slot.krs ?? []).forEach((kr, krIndex) => {
      const krRow = headerRow + 3 + krIndex;
      worksheet.getCell(`C${krRow}`).value = `KPI/KR ${krIndex + 1}`;
      if (kr.label !== undefined) worksheet.getCell(`D${krRow}`).value = kr.label;
      if (kr.weight !== undefined) worksheet.getCell(`E${krRow}`).value = kr.weight;
    });
  });

  return worksheet;
}

describe('parseObjectivesFromWorksheet', () => {
  it('extrait les 3 objectifs remplis avec leurs KR, dans le cas standard (0.4/0.4/0.2)', () => {
    const worksheet = buildObjectivesWorksheet({
      0: {
        title: 'Delivery produit',
        weight: 0.4,
        krs: [
          { label: 'Livrer la partie front en fin de Q3', weight: 0.4 },
          { label: 'Taux de respect des délais', weight: 0.4 },
          { label: 'PR mergées sans aller-retour majeur', weight: 0.2 }
        ]
      },
      1: {
        title: "Déploiement & industrialisation IA",
        weight: 0.4,
        krs: [{ label: "Mise en place d'un agent IA", weight: 1 }]
      },
      2: {
        title: "Structurer l'équipe",
        weight: 0.2,
        krs: [{ label: 'Initier 2 ADR', weight: 0.5 }, { label: '80% des MR', weight: 0.5 }]
      }
    });

    const { objectives, warnings } = parseObjectivesFromWorksheet(worksheet);

    expect(warnings).toEqual([]);
    expect(objectives).toHaveLength(3);
    expect(objectives[0]).toEqual({
      title: 'Delivery produit',
      weight: 0.4,
      krs: [
        { label: 'Livrer la partie front en fin de Q3', weight: 0.4 },
        { label: 'Taux de respect des délais', weight: 0.4 },
        { label: 'PR mergées sans aller-retour majeur', weight: 0.2 }
      ]
    });
    expect(objectives[2].krs).toHaveLength(2);
  });

  it('ignore les emplacements vides sans avertissement', () => {
    const worksheet = buildObjectivesWorksheet({
      0: { title: 'Seul objectif', weight: 1, krs: [{ label: 'Seul KR', weight: 1 }] }
    });

    const { objectives, warnings } = parseObjectivesFromWorksheet(worksheet);

    expect(objectives).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('ignore un objectif sans titre mais signale un poids résiduel (anomalie réelle constatée)', () => {
    const worksheet = buildObjectivesWorksheet({
      0: { title: 'Objectif normal', weight: 0.6, krs: [{ label: 'KR', weight: 1 }] },
      3: { weight: 0.1 },
      4: { weight: 0.3 }
    });

    const { objectives, warnings } = parseObjectivesFromWorksheet(worksheet);

    expect(objectives).toHaveLength(1);
    expect(warnings).toEqual([
      "Ligne 37 : poids 0.1 renseigné sans titre d'objectif — ignoré.",
      "Ligne 48 : poids 0.3 renseigné sans titre d'objectif — ignoré."
    ]);
  });

  it('ignore un KR sans libellé même si un poids est présent, sans avertissement', () => {
    const worksheet = buildObjectivesWorksheet({
      0: {
        title: 'Objectif',
        weight: 1,
        krs: [{ label: 'KR rempli', weight: 0.5 }, { weight: 0.5 }]
      }
    });

    const { objectives, warnings } = parseObjectivesFromWorksheet(worksheet);

    expect(objectives[0].krs).toEqual([{ label: 'KR rempli', weight: 0.5 }]);
    expect(warnings).toEqual([]);
  });

  it(`signale un dépassement quand plus de ${MAX_SUPPORTED_OBJECTIVES} objectifs ont un titre`, () => {
    const worksheet = buildObjectivesWorksheet({
      0: { title: 'Obj 1', weight: 0.2 },
      1: { title: 'Obj 2', weight: 0.2 },
      2: { title: 'Obj 3', weight: 0.2 },
      3: { title: 'Obj 4', weight: 0.2 },
      4: { title: 'Obj 5', weight: 0.2 }
    });

    const { objectives, warnings } = parseObjectivesFromWorksheet(worksheet);

    expect(objectives).toHaveLength(5);
    expect(warnings).toEqual([
      `5 objectifs avec un titre trouvés, mais le modèle applicatif en accepte au plus ${MAX_SUPPORTED_OBJECTIVES} — à fusionner ou écarter manuellement avant import.`
    ]);
  });

  it('renvoie 0 par défaut pour le poids d\'un objectif ou d\'un KR quand la cellule est vide', () => {
    const worksheet = buildObjectivesWorksheet({
      0: { title: 'Objectif sans poids saisi', krs: [{ label: 'KR sans poids saisi' }] }
    });

    const { objectives } = parseObjectivesFromWorksheet(worksheet);

    expect(objectives[0].weight).toBe(0);
    expect(objectives[0].krs[0].weight).toBe(0);
  });
});

describe('findObjectivesWorksheet', () => {
  it("trouve l'onglet par son nom exact", () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('OBJECTIFS S1-26');
    const target = workbook.addWorksheet('OBJECTIFS S2-26');
    workbook.addWorksheet('BILAN S1-26');

    expect(findObjectivesWorksheet(workbook)).toBe(target);
  });

  it('tolère les underscores (conversion LibreOffice d\'un fichier .ods)', () => {
    const workbook = new ExcelJS.Workbook();
    const target = workbook.addWorksheet('OBJECTIFS_S2-26');

    expect(findObjectivesWorksheet(workbook)).toBe(target);
  });

  it("renvoie undefined si l'onglet est absent", () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Autre chose');

    expect(findObjectivesWorksheet(workbook)).toBeUndefined();
  });
});
