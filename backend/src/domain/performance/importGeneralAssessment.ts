import type ExcelJS from 'exceljs';
import { COMPETENCY_AXES, CompetencyAxis, IGeneralAssessmentAxes } from './entities/PerformanceReview';

/**
 * Import de l'auto-évaluation générale depuis les fichiers Excel individuels
 * (`OKR-entretien/evaluations-individuelles/<nom>.xlsx`). Distincte du "Bilan du cycle" (import
 * objectifs + entretien, voir `importObjectives.ts`) : cette auto-évaluation couvre 4 axes de
 * compétence (technique / impact / collaboration / leadership), 3 sous-critères chacun, sur
 * l'onglet propre au collaborateur (structure constatée identique sur les fichiers réels
 * inspectés : lignes 7 à 18, colonne A = axe, colonne B = sous-critère, colonne F = note 1-5).
 * Cette fonction ne fait que LIRE ce que contient la feuille ; le rapprochement avec le roster
 * et l'écriture via l'API restent dans le script d'import (voir `backend/src/scripts/import-okr/`).
 */

export interface ParseGeneralAssessmentResult {
  collaboratorName: string;
  axes: IGeneralAssessmentAxes;
  warnings: string[];
}

const NAME_CELL = 'B3';
const FIRST_SUB_CRITERION_ROW = 7;
const LAST_SUB_CRITERION_ROW = 18;
const AXIS_COL = 'A';
const LABEL_COL = 'B';
const SCORE_COL = 'F';

/** Onglets à ignorer lors de la recherche de l'onglet propre au collaborateur. */
const NON_ASSESSMENT_WORKSHEET_NAMES = new Set(['référentiel évaluation']);

function cellText(worksheet: ExcelJS.Worksheet, address: string): string {
  const value = worksheet.getCell(address).value;
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim();
  // Valeur "riche" (texte enrichi, formule, lien...) — non observée dans les fichiers réels
  // inspectés ; on la rend lisible sans tenter de l'interpréter finement.
  return String(value).trim();
}

function numericLeaf(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

/**
 * La colonne F des fichiers réels contient une formule mise en cache
 * (`IFERROR(MATCH(...),"")`) : `cell.value` est alors un objet `{ formula, result }`, pas un
 * nombre brut — `result` peut lui-même être une chaîne vide si `MATCH` n'a rien trouvé (niveau
 * non reconnu dans le référentiel). On lit le résultat mis en cache plutôt que la formule.
 */
function cellNumber(worksheet: ExcelJS.Worksheet, address: string): number | null {
  const value = worksheet.getCell(address).value;
  const direct = numericLeaf(value);
  if (direct != null) return direct;
  if (value && typeof value === 'object' && 'result' in value) {
    return numericLeaf((value as { result: unknown }).result);
  }
  return null;
}

function emptyAxes(): IGeneralAssessmentAxes {
  return { technique: [], impact: [], collaboration: [], leadership: [] };
}

/**
 * Trouve l'onglet propre au collaborateur dans un fichier `evaluations-individuelles/<nom>.xlsx` :
 * ni l'onglet "Référentiel évaluation" (légende, commun à tous les fichiers), ni un onglet
 * "Manager" (présent sur certains fichiers, hors périmètre de l'auto-évaluation). `undefined`
 * si aucun onglet ne correspond, ou si plusieurs correspondent (ambiguïté à signaler côté script
 * d'import plutôt que de deviner).
 */
export function findGeneralAssessmentWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  const candidates = workbook.worksheets.filter((ws) => {
    const name = ws.name.trim().toLowerCase();
    return !NON_ASSESSMENT_WORKSHEET_NAMES.has(name) && !/manager/i.test(ws.name);
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * Extrait le nom du collaborateur et les 12 sous-critères (4 axes × 3) d'un onglet d'auto-
 * évaluation générale. Ignore silencieusement les lignes totalement vides ; signale (sans
 * bloquer) tout axe non reconnu, tout sous-critère sans libellé, et toute note absente ou hors
 * plage 1-5 — ces lignes-là sont exclues du résultat plutôt que de fausser la moyenne par axe.
 */
export function parseGeneralAssessmentFromWorksheet(worksheet: ExcelJS.Worksheet): ParseGeneralAssessmentResult {
  const warnings: string[] = [];
  const collaboratorName = cellText(worksheet, NAME_CELL);
  if (!collaboratorName) {
    warnings.push(`Cellule ${NAME_CELL} (nom du collaborateur) vide.`);
  }

  const axes = emptyAxes();

  for (let row = FIRST_SUB_CRITERION_ROW; row <= LAST_SUB_CRITERION_ROW; row++) {
    const axisLabel = cellText(worksheet, `${AXIS_COL}${row}`);
    const label = cellText(worksheet, `${LABEL_COL}${row}`);

    if (!axisLabel && !label) continue;

    const axis = axisLabel.trim().toLowerCase();
    if (!(COMPETENCY_AXES as readonly string[]).includes(axis)) {
      warnings.push(`Ligne ${row} : axe "${axisLabel}" non reconnu — ignorée.`);
      continue;
    }
    if (!label) {
      warnings.push(`Ligne ${row} (axe ${axisLabel}) : sous-critère sans libellé — ignorée.`);
      continue;
    }

    const score = cellNumber(worksheet, `${SCORE_COL}${row}`);
    if (score == null) {
      warnings.push(`Ligne ${row} (${axisLabel} — ${label}) : note manquante ou non numérique — ignorée.`);
      continue;
    }
    if (score < 1 || score > 5) {
      warnings.push(`Ligne ${row} (${axisLabel} — ${label}) : note ${score} hors plage 1-5 — ignorée.`);
      continue;
    }

    axes[axis as CompetencyAxis].push({ label, score });
  }

  return { collaboratorName, axes, warnings };
}
