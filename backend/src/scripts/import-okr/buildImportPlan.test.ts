/**
 * TU — `collectInterviewFiles` (scan du dossier `Entretiens-eval-perf/`).
 * Le reste de `buildImportPlan.ts` (matching roster, parsing Excel réel, appels réseau) n'est
 * pas couvert ici : voir les tests dédiés de `importCollaboratorMapping` / `importObjectives` /
 * `objectivesToApiInput`, et la reconnaissance manuelle sur les vrais fichiers pour le reste.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectInterviewFiles } from './buildImportPlan';

describe('collectInterviewFiles', () => {
  it("lève une erreur explicite si le dossier n'existe pas (plutôt qu'une liste vide silencieuse)", () => {
    const missingDir = path.join(os.tmpdir(), `does-not-exist-${Date.now()}`);
    expect(() => collectInterviewFiles(missingDir)).toThrow(/introuvable/);
    expect(() => collectInterviewFiles(missingDir)).toThrow(missingDir);
  });

  it('scanne récursivement les .xlsx/.ods et ignore les fichiers temporaires Excel (~$...)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interviews-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'Choco'));
      fs.writeFileSync(path.join(tmpDir, 'Choco', 'alice.xlsx'), '');
      fs.writeFileSync(path.join(tmpDir, 'Choco', '~$alice.xlsx'), '');
      fs.writeFileSync(path.join(tmpDir, 'bruno.ods'), '');
      fs.writeFileSync(path.join(tmpDir, 'notes.txt'), '');

      const files = collectInterviewFiles(tmpDir);

      expect(files).toEqual(['Choco/alice.xlsx', 'bruno.ods'].sort((a, b) => a.localeCompare(b, 'fr')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('renvoie une liste vide pour un dossier existant mais sans fichier pertinent', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interviews-empty-'));
    try {
      expect(collectInterviewFiles(tmpDir)).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
