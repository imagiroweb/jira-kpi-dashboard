import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import { buildGeneralAssessmentImportPlan, GeneralAssessmentPlanEntry } from './buildGeneralAssessmentImportPlan';
import { createImportApiClient } from './apiClient';
import { computeGeneralAssessmentGlobalScore } from '../../domain/performance/performanceReview';

// Permet de renseigner IMPORT_API_TOKEN / OKR_ENTRETIEN_DIR dans le .env à la racine du repo,
// comme le reste de l'application (voir src/index.ts), sans empêcher de les passer en variables
// d'environnement shell directement.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Étape 1 (lecture seule) de l'import de l'auto-évaluation générale (distincte du "Bilan du
 * cycle" — voir `dryRun.ts` / `runImport.ts` pour les objectifs) : affiche le plan construit par
 * `buildGeneralAssessmentImportPlan` (scan de `evaluations-individuelles/`, correspondance
 * roster, parsing des 4 axes × 3 sous-critères) sans effectuer la moindre écriture — l'écriture
 * elle-même n'est pas encore disponible (route API à venir).
 *
 * Usage : IMPORT_API_TOKEN=... OKR_ENTRETIEN_DIR=/chemin/vers/OKR-entretien \
 *         corepack yarn import:general-assessment:dry-run
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement ${name} manquante`);
  }
  return value;
}

function printEntry(entry: GeneralAssessmentPlanEntry): void {
  console.log(`### ${entry.name} (${entry.fileName})`);

  switch (entry.outcome) {
    case 'no_match':
    case 'worksheet_not_found':
    case 'read_error':
    case 'empty':
      entry.errors.forEach((e) => console.log(`  ✗ ${e}`));
      entry.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
      console.log('  → Import bloqué.\n');
      return;
    case 'ready': {
      entry.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
      const globalScore = computeGeneralAssessmentGlobalScore(entry.axes!);
      const perAxis = Object.entries(entry.axes!)
        .map(([axis, subCriteria]) => `${axis}=${subCriteria.length} note(s)`)
        .join(', ');
      console.log(`  ✓ Score global ${globalScore.toFixed(2)}/5 pour ${entry.matchedUser!.email} (${perAxis})`);
      console.log('');
    }
  }
}

async function main(): Promise<void> {
  const okrDir = requireEnv('OKR_ENTRETIEN_DIR');

  const api = createImportApiClient();
  const roster = await api.fetchRoster();
  console.log(`Roster récupéré : ${roster.length} utilisateur(s) actif(s).\n`);

  const plan = await buildGeneralAssessmentImportPlan(okrDir, roster);
  plan.forEach(printEntry);

  const ready = plan.filter((e) => e.outcome === 'ready' && e.warnings.length === 0).length;
  const readyWithWarnings = plan.filter((e) => e.outcome === 'ready' && e.warnings.length > 0).length;
  const blocked = plan.filter((e) => e.outcome !== 'ready').length;
  const matchedIds = new Set(plan.filter((e) => e.matchedUser).map((e) => e.matchedUser!.id));
  const rosterWithoutFile = roster.filter((u) => !matchedIds.has(u.id)).length;

  console.log('---');
  console.log(
    `Résumé : ${ready} prêt(s) sans réserve, ${readyWithWarnings} prêt(s) avec avertissement(s), ` +
      `${blocked} fichier(s) bloqué(s), ${rosterWithoutFile} utilisateur(s) du roster sans fichier. ` +
      `Aucune écriture effectuée (dry-run).`
  );
}

main().catch((error) => {
  if (axios.isAxiosError(error)) {
    console.error(
      `Erreur API : code=${error.code ?? '?'} status=${error.response?.status ?? '?'} message="${
        error.message || '(vide)'
      }" url=${error.config?.baseURL ?? ''}${error.config?.url ?? ''}`
    );
    if (error.response?.data) {
      console.error('Réponse du serveur :', JSON.stringify(error.response.data));
    }
  } else {
    console.error('Erreur fatale :', error);
  }
  process.exit(1);
});
