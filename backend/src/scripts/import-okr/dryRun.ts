import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import { buildImportPlan, ImportPlanEntry } from './buildImportPlan';
import { createImportApiClient } from './apiClient';

// Permet de renseigner IMPORT_API_TOKEN / OKR_ENTRETIEN_DIR dans le .env à la racine du repo,
// comme le reste de l'application (voir src/index.ts), sans empêcher de les passer en variables
// d'environnement shell directement.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Étape 1 (lecture seule) de l'import ponctuel des objectifs S2-2026 : affiche le plan d'import
 * construit par `buildImportPlan` (scan des fichiers, correspondance roster, parsing/validation)
 * sans effectuer la moindre écriture. Sert à valider le plan avant d'exécuter
 * `runImport.ts`.
 *
 * Usage : IMPORT_API_TOKEN=... OKR_ENTRETIEN_DIR=/chemin/vers/OKR-entretien \
 *         corepack yarn import:okr:dry-run
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement ${name} manquante`);
  }
  return value;
}

function printEntry(entry: ImportPlanEntry): void {
  console.log(`### ${entry.name} (équipe ${entry.team})`);

  switch (entry.outcome) {
    case 'unrecognized_filename':
      entry.errors.forEach((e) => console.log(`  ✗ ${e}`));
      console.log('  → Import bloqué.\n');
      return;
    case 'no_match':
      console.log(
        `  ✗ Aucun utilisateur du roster ne correspond à "${entry.name}" (${entry.relativePath}) — import bloqué.\n`
      );
      return;
    case 'worksheet_not_found':
    case 'read_error':
      entry.errors.forEach((e) => console.log(`  ✗ ${e}`));
      console.log('  → Import bloqué.\n');
      return;
    case 'invalid':
      entry.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
      entry.errors.forEach((e) => console.log(`  ✗ ${e}`));
      console.log(`  → Import bloqué (${entry.errors.length} erreur(s) de validation).\n`);
      return;
    case 'ready':
      entry.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
      console.log(
        `  ✓ ${entry.objectives!.length} objectif(s) prêt(s) pour ${entry.matchedUser!.email} : ${entry
          .objectives!.map((o) => o.title)
          .join(' / ')}`
      );
      console.log('');
  }
}

async function main(): Promise<void> {
  const okrDir = requireEnv('OKR_ENTRETIEN_DIR');

  const api = createImportApiClient();
  const roster = await api.fetchRoster();
  console.log(`Roster récupéré : ${roster.length} utilisateur(s) actif(s).\n`);

  const plan = await buildImportPlan(okrDir, roster);
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
