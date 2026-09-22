import path from 'path';
import fs from 'fs';
import { matchRosterUser, rosterDisplayName, RosterCandidate } from '../../domain/performance/importCollaboratorMapping';
import {
  findGeneralAssessmentWorksheet,
  parseGeneralAssessmentFromWorksheet
} from '../../domain/performance/importGeneralAssessment';
import type { IGeneralAssessmentAxes } from '../../domain/performance/entities/PerformanceReview';
import { loadWorkbook } from './excelSource';

export type GeneralAssessmentPlanOutcome = 'no_match' | 'worksheet_not_found' | 'read_error' | 'empty' | 'ready';

export interface GeneralAssessmentPlanEntry {
  name: string;
  fileName: string;
  outcome: GeneralAssessmentPlanOutcome;
  matchedUser?: RosterCandidate;
  filePath: string;
  axes?: IGeneralAssessmentAxes;
  warnings: string[];
  errors: string[];
}

/**
 * Fichiers agrégateurs connus dans `evaluations-individuelles/` (constatés sur les fichiers réels :
 * `dashboard-all.xlsx` consolide tout le monde, `grille-evaluations.xlsx` reprend toutes les
 * grilles individuelles sur des onglets séparés) — hors périmètre de ce scan, qui ne veut que les
 * fichiers individuels `<nom>.xlsx`.
 */
const AGGREGATE_FILE_NAMES = new Set(['dashboard-all.xlsx', 'grille-evaluations.xlsx']);
const ASSESSMENT_EXTENSIONS = new Set(['.xlsx', '.ods']);

/**
 * Fichiers individuels sous `evaluations-individuelles/` : scan à plat (contrairement à
 * `collectInterviewFiles` qui descend récursivement dans `Entretiens-eval-perf/**`, ce dossier-ci
 * n'a pas de sous-dossiers par équipe), hors fichiers temporaires Excel et fichiers agrégateurs
 * connus. Lève une erreur explicite si le dossier n'existe pas, pour la même raison que
 * `collectInterviewFiles` : éviter un résumé "0 écrit(s)" trompeur en cas de chemin
 * `OKR_ENTRETIEN_DIR` erroné.
 */
export function collectGeneralAssessmentFiles(assessmentsDir: string): string[] {
  if (!fs.existsSync(assessmentsDir)) {
    throw new Error(
      `Dossier d'auto-évaluations introuvable : ${assessmentsDir} — vérifie que OKR_ENTRETIEN_DIR pointe ` +
        'sur le dossier qui contient directement "evaluations-individuelles/".'
    );
  }

  return fs
    .readdirSync(assessmentsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('~$'))
    .filter((name) => ASSESSMENT_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .filter((name) => !AGGREGATE_FILE_NAMES.has(name.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'fr'));
}

/** Plan d'import à partir d'un dossier déjà rempli de fichiers d'auto-évaluation individuels. */
export async function buildGeneralAssessmentPlanFromDir(
  assessmentsDir: string,
  roster: RosterCandidate[]
): Promise<GeneralAssessmentPlanEntry[]> {
  const plan: GeneralAssessmentPlanEntry[] = [];

  for (const fileName of collectGeneralAssessmentFiles(assessmentsDir)) {
    const filePath = path.join(assessmentsDir, fileName);

    try {
      const workbook = await loadWorkbook(filePath);
      const worksheet = findGeneralAssessmentWorksheet(workbook);

      if (!worksheet) {
        plan.push({
          name: fileName,
          fileName,
          outcome: 'worksheet_not_found',
          filePath,
          warnings: [],
          errors: [`Onglet d'auto-évaluation introuvable ou ambigu dans ${fileName}.`]
        });
        continue;
      }

      const { collaboratorName, axes, warnings } = parseGeneralAssessmentFromWorksheet(worksheet);

      const match = collaboratorName ? matchRosterUser(collaboratorName, roster) : null;
      if (!match) {
        plan.push({
          name: collaboratorName || fileName,
          fileName,
          outcome: 'no_match',
          filePath,
          warnings,
          errors: [
            collaboratorName
              ? `Aucun utilisateur du roster ne correspond à "${collaboratorName}" (${fileName}).`
              : `Nom du collaborateur introuvable (cellule B3 vide) dans ${fileName}.`
          ]
        });
        continue;
      }

      const name = rosterDisplayName(match);
      const hasAnyScore = Object.values(axes).some((subCriteria) => subCriteria.length > 0);

      if (!hasAnyScore) {
        plan.push({
          name,
          fileName,
          outcome: 'empty',
          matchedUser: match,
          filePath,
          axes,
          warnings,
          errors: [`Aucun sous-critère noté trouvé dans ${fileName}.`]
        });
        continue;
      }

      plan.push({
        name,
        fileName,
        outcome: 'ready',
        matchedUser: match,
        filePath,
        axes,
        warnings,
        errors: []
      });
    } catch (error) {
      plan.push({
        name: fileName,
        fileName,
        outcome: 'read_error',
        filePath,
        warnings: [],
        errors: [(error as Error).message]
      });
    }
  }

  return plan;
}

/** CLI : scanne `OKR_ENTRETIEN_DIR/evaluations-individuelles/`. */
export async function buildGeneralAssessmentImportPlan(
  okrDir: string,
  roster: RosterCandidate[]
): Promise<GeneralAssessmentPlanEntry[]> {
  return buildGeneralAssessmentPlanFromDir(path.join(okrDir, 'evaluations-individuelles'), roster);
}
