import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFileSync } from 'child_process';
import ExcelJS from 'exceljs';

/**
 * Charge un classeur Excel en tolérant les deux cas réels rencontrés dans les fichiers
 * d'entretien (`OKR-entretien/Entretiens-eval-perf/**`) : un .xlsx "strict OOXML" que ExcelJS ne
 * sait pas lire directement, et un fichier .ods (LibreOffice). Dans les deux cas, on convertit
 * d'abord vers un .xlsx standard via `soffice --headless --convert-to xlsx`, dans un dossier
 * temporaire, avant de le charger avec ExcelJS — cette conversion reproduit exactement la même
 * disposition de cellules que l'original (seul le nom des onglets peut voir ses espaces
 * remplacés par des underscores, toléré par `findObjectivesWorksheet`).
 */
export async function loadWorkbook(filePath: string): Promise<ExcelJS.Workbook> {
  if (path.extname(filePath).toLowerCase() === '.xlsx') {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.readFile(filePath);
      return workbook;
    } catch {
      // Fichier .xlsx "strict OOXML" non supporté par ExcelJS — on retente après conversion.
    }
  }

  const convertedPath = convertToStandardXlsx(filePath);
  const converted = new ExcelJS.Workbook();
  await converted.xlsx.readFile(convertedPath);
  return converted;
}

/**
 * Emplacements usuels du binaire `soffice` non trouvés en pratique sur le PATH d'un Mac où
 * LibreOffice est installé via l'app (le bundle .app n'ajoute pas son binaire CLI au PATH par
 * défaut). `SOFFICE_PATH` permet de surcharger explicitement si besoin.
 */
const SOFFICE_CANDIDATES = [
  process.env.SOFFICE_PATH,
  'soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/local/bin/soffice',
  '/opt/homebrew/bin/soffice'
].filter((candidate): candidate is string => Boolean(candidate));

function resolveSofficeBinary(): string {
  for (const candidate of SOFFICE_CANDIDATES) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // Candidat suivant.
    }
  }
  throw new Error(
    'LibreOffice (`soffice`) introuvable — nécessaire pour lire ce fichier .ods ou .xlsx "strict". ' +
      'Installe LibreOffice, ou renseigne SOFFICE_PATH avec le chemin exact du binaire ' +
      '(ex. /Applications/LibreOffice.app/Contents/MacOS/soffice).'
  );
}

function convertToStandardXlsx(filePath: string): string {
  const soffice = resolveSofficeBinary();
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okr-import-'));
  execFileSync(soffice, ['--headless', '--convert-to', 'xlsx', '--outdir', outDir, filePath], {
    stdio: 'ignore'
  });
  const base = path.basename(filePath, path.extname(filePath));
  return path.join(outDir, `${base}.xlsx`);
}
