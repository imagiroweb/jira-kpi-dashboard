import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import { buildGeneralAssessmentImportPlan, GeneralAssessmentPlanEntry } from './buildGeneralAssessmentImportPlan';
import { createImportApiClient } from './apiClient';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Étape 2 (écriture) de l'import de l'auto-évaluation générale (distincte du "Bilan du cycle" —
 * voir `runImport.ts` pour les objectifs) : rejoue exactement le plan de
 * `dryRunGeneralAssessment.ts` (même scan de `evaluations-individuelles/`, même correspondance
 * roster, même parsing/validation) et, pour chaque collaborateur `ready`, écrit réellement ses 4
 * axes via `PATCH /performance/reviews/:userId/general-self-assessment`. Les fichiers non
 * matchés au roster (pas encore connectés en SSO), vides ou en erreur sont signalés et ignorés —
 * sans bloquer les autres.
 *
 * Rejouable sans risque : chaque exécution REMPLACE entièrement les sous-critères d'un axe
 * (pas de fusion positionnelle par id, contrairement aux objectifs — l'auto-évaluation générale
 * n'a pas d'avancement à préserver), donc relancer ce script met simplement à jour les notes ;
 * un collaborateur pas encore connecté au moment d'une exécution est simplement retenté à la
 * suivante.
 *
 * Un cycle EXPLICITE est obligatoire (`PERFORMANCE_CYCLE_LABEL`, ex. "S2-2026") : le script
 * échoue si le libellé ne correspond à aucun cycle ou à plusieurs, plutôt que de se reposer
 * silencieusement sur "le cycle actif" par défaut de l'API — même choix que `runImport.ts`.
 *
 * Usage : IMPORT_API_TOKEN=... OKR_ENTRETIEN_DIR=/chemin/vers/OKR-entretien \
 *         PERFORMANCE_CYCLE_LABEL=S2-2026 corepack yarn import:general-assessment:run
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement ${name} manquante`);
  }
  return value;
}

async function main(): Promise<void> {
  const okrDir = requireEnv('OKR_ENTRETIEN_DIR');
  const cycleLabel = requireEnv('PERFORMANCE_CYCLE_LABEL');

  const api = createImportApiClient();

  const [roster, cycles] = await Promise.all([api.fetchRoster(), api.fetchCycles()]);
  console.log(`Roster récupéré : ${roster.length} utilisateur(s) actif(s).`);

  const matchingCycles = cycles.filter((c) => c.label === cycleLabel);
  if (matchingCycles.length === 0) {
    throw new Error(`Aucun cycle avec le libellé "${cycleLabel}" — vérifie PERFORMANCE_CYCLE_LABEL.`);
  }
  if (matchingCycles.length > 1) {
    throw new Error(`Plusieurs cycles portent le libellé "${cycleLabel}" — ambigu, écriture annulée.`);
  }
  const cycle = matchingCycles[0];
  console.log(`Cycle cible : "${cycle.label}" (id ${cycle.id}, statut ${cycle.status}).\n`);

  const plan = await buildGeneralAssessmentImportPlan(okrDir, roster);

  let written = 0;
  let blocked = 0;
  const failures: string[] = [];

  for (const entry of plan) {
    console.log(`### ${entry.name} (${entry.fileName})`);
    await handleEntry(entry, api, cycle.id, failures, {
      onWritten: () => written++,
      onBlocked: () => blocked++
    });
  }

  console.log('---');
  console.log(`Résumé : ${written} auto-évaluation(s) écrite(s), ${blocked} bloquée(s).`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} échec(s) d'écriture (voir détail ci-dessus) :`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

async function handleEntry(
  entry: GeneralAssessmentPlanEntry,
  api: ReturnType<typeof createImportApiClient>,
  cycleId: string,
  failures: string[],
  counters: { onWritten: () => void; onBlocked: () => void }
): Promise<void> {
  if (entry.outcome !== 'ready') {
    entry.errors.forEach((e) => console.log(`  ✗ ${e}`));
    console.log('  → Import bloqué, aucune écriture.\n');
    counters.onBlocked();
    return;
  }

  entry.warnings.forEach((w) => console.log(`  ⚠ ${w}`));

  try {
    await api.writeGeneralAssessment(entry.matchedUser!.id, entry.axes!, cycleId);
    console.log(`  ✓ Auto-évaluation générale écrite pour ${entry.matchedUser!.email}\n`);
    counters.onWritten();
  } catch (error) {
    const message = axios.isAxiosError(error)
      ? `HTTP ${error.response?.status ?? '?'} : ${JSON.stringify(error.response?.data ?? error.message)}`
      : (error as Error).message;
    console.log(`  ✗ Échec de l'écriture pour ${entry.matchedUser!.email} : ${message}\n`);
    failures.push(`${entry.name} (${entry.matchedUser!.email}) : ${message}`);
  }
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
