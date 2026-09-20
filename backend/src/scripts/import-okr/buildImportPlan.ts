import path from 'path';
import fs from 'fs';
import {
  IMPORT_FILE_NAME_OVERRIDES,
  matchRosterForInterviewToken,
  matchRosterUser,
  parseInterviewFileName,
  rosterDisplayName,
  RosterCandidate
} from '../../domain/performance/importCollaboratorMapping';
import {
  findObjectivesWorksheet,
  parseObjectivesFromWorksheet,
  ParsedObjective
} from '../../domain/performance/importObjectives';
import { objectivesToApiInput } from '../../domain/performance/objectivesToApiInput';
import { validateObjectivesDefinition } from '../../domain/performance/performanceReview';
import type { ObjectiveDefinitionInput } from '../../domain/performance/performanceReview';
import { loadWorkbook } from './excelSource';

export type ImportPlanOutcome =
  | 'unrecognized_filename'
  | 'no_match'
  | 'worksheet_not_found'
  | 'read_error'
  | 'invalid'
  | 'ready';

export interface ImportPlanEntry {
  name: string;
  team: string;
  relativePath: string;
  outcome: ImportPlanOutcome;
  matchedUser?: RosterCandidate;
  filePath?: string;
  objectives?: ParsedObjective[];
  apiInput?: ObjectiveDefinitionInput[];
  warnings: string[];
  errors: string[];
}

const INTERVIEW_EXTENSIONS = new Set(['.xlsx', '.ods']);

/** Fichiers d'entretien sous `Entretiens-eval-perf/`, chemins relatifs, hors fichiers temporaires Excel. */
export function collectInterviewFiles(interviewsDir: string): string[] {
  const out: string[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name.startsWith('~$')) continue;
      if (!INTERVIEW_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      out.push(path.relative(interviewsDir, full));
    }
  }

  walk(interviewsDir);
  return out.sort((a, b) => a.localeCompare(b, 'fr'));
}

function teamHintFromRelativePath(relativePath: string): string {
  const parent = path.dirname(relativePath);
  return parent === '.' ? '—' : parent;
}

/** Plan d'import à partir d'un dossier déjà rempli de fichiers d'entretien (CLI ou upload UI). */
export async function buildImportPlanFromInterviewsDir(
  interviewsDir: string,
  roster: RosterCandidate[]
): Promise<ImportPlanEntry[]> {
  const plan: ImportPlanEntry[] = [];

  for (const relativePath of collectInterviewFiles(interviewsDir)) {
    const filePath = path.join(interviewsDir, relativePath);
    const fileName = path.basename(relativePath);
    const team = teamHintFromRelativePath(relativePath);
    const overrideName = IMPORT_FILE_NAME_OVERRIDES[relativePath];
    const token = parseInterviewFileName(fileName);

    if (!overrideName && !token) {
      plan.push({
        name: fileName,
        team,
        relativePath,
        outcome: 'unrecognized_filename',
        filePath,
        warnings: [],
        errors: [
          `Nom de fichier hors convention Adoria-<nom>-BDR : ${relativePath}. Renomme-le ou ajoute un override.`
        ]
      });
      continue;
    }

    const match = overrideName
      ? matchRosterUser(overrideName, roster)
      : matchRosterForInterviewToken(token!, roster);

    if (!match) {
      const label = overrideName ?? token ?? fileName;
      plan.push({
        name: label,
        team,
        relativePath,
        outcome: 'no_match',
        filePath,
        warnings: [],
        errors: []
      });
      continue;
    }

    const name = rosterDisplayName(match);

    try {
      const workbook = await loadWorkbook(filePath);
      const worksheet = findObjectivesWorksheet(workbook);
      if (!worksheet) {
        plan.push({
          name,
          team,
          relativePath,
          outcome: 'worksheet_not_found',
          matchedUser: match,
          filePath,
          warnings: [],
          errors: [`Onglet "OBJECTIFS S2-26" introuvable dans ${relativePath}`]
        });
        continue;
      }

      const { objectives, warnings } = parseObjectivesFromWorksheet(worksheet);
      const apiInput = objectivesToApiInput(objectives);
      const validation = validateObjectivesDefinition(apiInput);

      if (!validation.valid) {
        plan.push({
          name,
          team,
          relativePath,
          outcome: 'invalid',
          matchedUser: match,
          filePath,
          objectives,
          apiInput,
          warnings,
          errors: validation.errors
        });
        continue;
      }

      plan.push({
        name,
        team,
        relativePath,
        outcome: 'ready',
        matchedUser: match,
        filePath,
        objectives,
        apiInput,
        warnings,
        errors: []
      });
    } catch (error) {
      plan.push({
        name,
        team,
        relativePath,
        outcome: 'read_error',
        matchedUser: match,
        filePath,
        warnings: [],
        errors: [(error as Error).message]
      });
    }
  }

  return plan;
}

/** CLI : scanne `OKR_ENTRETIEN_DIR/Entretiens-eval-perf/`. */
export async function buildImportPlan(okrDir: string, roster: RosterCandidate[]): Promise<ImportPlanEntry[]> {
  return buildImportPlanFromInterviewsDir(path.join(okrDir, 'Entretiens-eval-perf'), roster);
}
