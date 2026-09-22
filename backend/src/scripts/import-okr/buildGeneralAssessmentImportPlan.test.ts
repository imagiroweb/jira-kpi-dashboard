/**
 * TU — `collectGeneralAssessmentFiles` (scan du dossier `evaluations-individuelles/`).
 * Le reste de `buildGeneralAssessmentImportPlan.ts` (matching roster, parsing Excel réel) n'est
 * pas couvert ici : voir les tests dédiés de `importCollaboratorMapping` / `importGeneralAssessment`,
 * et la reconnaissance manuelle sur les vrais fichiers (dry-run) pour le reste — même approche que
 * `buildImportPlan.test.ts`.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectGeneralAssessmentFiles } from './buildGeneralAssessmentImportPlan';

describe('collectGeneralAssessmentFiles', () => {
  it("lève une erreur explicite si le dossier n'existe pas (plutôt qu'une liste vide silencieuse)", () => {
    const missingDir = path.join(os.tmpdir(), `does-not-exist-${Date.now()}`);
    expect(() => collectGeneralAssessmentFiles(missingDir)).toThrow(/introuvable/);
    expect(() => collectGeneralAssessmentFiles(missingDir)).toThrow(missingDir);
  });

  it('scanne les .xlsx/.ods à plat, ignore les fichiers temporaires (~$...) et les agrégateurs connus', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'general-assessments-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'deguil-robin.xlsx'), '');
      fs.writeFileSync(path.join(tmpDir, 'parjouet.xlsx'), '');
      fs.writeFileSync(path.join(tmpDir, '~$parjouet.xlsx'), '');
      fs.writeFileSync(path.join(tmpDir, 'wan-meenen.ods'), '');
      fs.writeFileSync(path.join(tmpDir, 'dashboard-all.xlsx'), '');
      fs.writeFileSync(path.join(tmpDir, 'grille-evaluations.xlsx'), '');
      fs.writeFileSync(path.join(tmpDir, '.DS_Store'), '');
      fs.mkdirSync(path.join(tmpDir, 'un-sous-dossier'));

      const files = collectGeneralAssessmentFiles(tmpDir);

      expect(files).toEqual(
        ['deguil-robin.xlsx', 'parjouet.xlsx', 'wan-meenen.ods'].sort((a, b) => a.localeCompare(b, 'fr'))
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("l'exclusion des agrégateurs connus ignore la casse (fichier renommé en majuscules)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'general-assessments-case-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'Dashboard-All.xlsx'), '');
      fs.writeFileSync(path.join(tmpDir, 'megret.xlsx'), '');

      const files = collectGeneralAssessmentFiles(tmpDir);

      expect(files).toEqual(['megret.xlsx']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('renvoie une liste vide pour un dossier existant mais sans fichier pertinent', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'general-assessments-empty-'));
    try {
      expect(collectGeneralAssessmentFiles(tmpDir)).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
