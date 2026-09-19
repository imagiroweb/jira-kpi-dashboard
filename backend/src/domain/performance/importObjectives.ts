import type ExcelJS from 'exceljs';

/**
 * Import ponctuel des objectifs S2-2026 depuis les fichiers Excel d'entretien existants
 * (`OKR-entretien/Entretiens-eval-perf/**`). Structure du gabarit constatée identique sur les
 * 14 fichiers lisibles inspectés : onglet "OBJECTIFS S2-26", 5 emplacements d'objectif à des
 * lignes fixes, chacun avec titre + poids sur la ligne suivante puis jusqu'à 5 KPI/KR juste
 * après un saut d'une ligne. Cette fonction ne fait que LIRE ce que contient la feuille ; la
 * validation agrégée (somme des poids, nombre d'objectifs par rapport au modèle applicatif) et
 * l'écriture via l'API restent dans le script d'import (voir `backend/src/scripts/import-okr/`).
 */

export interface ParsedKeyResult {
  label: string;
  weight: number;
}

export interface ParsedObjective {
  title: string;
  weight: number;
  krs: ParsedKeyResult[];
}

export interface ParseObjectivesResult {
  objectives: ParsedObjective[];
  warnings: string[];
}

const OBJECTIVE_HEADER_ROWS = [3, 14, 25, 36, 47];
const TITLE_ROW_OFFSET = 1;
const FIRST_KR_ROW_OFFSET = 3;
const KR_SLOTS_PER_OBJECTIVE = 5;
const TITLE_COL = 'C';
const WEIGHT_COL = 'E';
const KR_LABEL_COL = 'D';
const KR_WEIGHT_COL = 'E';

/** Nombre maximum d'objectifs accepté par le modèle applicatif (voir `MAX_OBJECTIVES` côté routes/UI). */
export const MAX_SUPPORTED_OBJECTIVES = 4;

function cellText(worksheet: ExcelJS.Worksheet, address: string): string {
  const value = worksheet.getCell(address).value;
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim();
  // Valeur "riche" (texte enrichi, formule, lien...) — non observée dans les fichiers réels
  // inspectés ; on la rend lisible sans tenter de l'interpréter finement.
  return String(value).trim();
}

function cellNumber(worksheet: ExcelJS.Worksheet, address: string): number | null {
  const value = worksheet.getCell(address).value;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

/**
 * Trouve l'onglet "OBJECTIFS S2-26", en tolérant les variations de nommage observées après
 * conversion LibreOffice d'un fichier .ods (les espaces deviennent des underscores).
 */
export function findObjectivesWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  const target = 'objectifs s2-26';
  return workbook.worksheets.find((ws) => ws.name.trim().toLowerCase().replace(/_/g, ' ') === target);
}

/**
 * Extrait les objectifs et KR d'un onglet "OBJECTIFS S2-26". Ignore tout emplacement d'objectif
 * sans titre — y compris s'il porte un poids résiduel (anomalie constatée sur un fichier réel) —
 * et tout KR sans libellé.
 */
export function parseObjectivesFromWorksheet(worksheet: ExcelJS.Worksheet): ParseObjectivesResult {
  const objectives: ParsedObjective[] = [];
  const warnings: string[] = [];

  for (const headerRow of OBJECTIVE_HEADER_ROWS) {
    const titleRow = headerRow + TITLE_ROW_OFFSET;
    const title = cellText(worksheet, `${TITLE_COL}${titleRow}`);
    const weight = cellNumber(worksheet, `${WEIGHT_COL}${titleRow}`);

    if (!title) {
      if (weight != null && weight !== 0) {
        warnings.push(`Ligne ${titleRow} : poids ${weight} renseigné sans titre d'objectif — ignoré.`);
      }
      continue;
    }

    const krs: ParsedKeyResult[] = [];
    for (let slot = 0; slot < KR_SLOTS_PER_OBJECTIVE; slot++) {
      const krRow = headerRow + FIRST_KR_ROW_OFFSET + slot;
      const label = cellText(worksheet, `${KR_LABEL_COL}${krRow}`);
      if (!label) continue;
      const krWeight = cellNumber(worksheet, `${KR_WEIGHT_COL}${krRow}`) ?? 0;
      krs.push({ label, weight: krWeight });
    }

    objectives.push({ title, weight: weight ?? 0, krs });
  }

  if (objectives.length > MAX_SUPPORTED_OBJECTIVES) {
    warnings.push(
      `${objectives.length} objectifs avec un titre trouvés, mais le modèle applicatif en accepte au plus ${MAX_SUPPORTED_OBJECTIVES} — à fusionner ou écarter manuellement avant import.`
    );
  }

  return { objectives, warnings };
}
