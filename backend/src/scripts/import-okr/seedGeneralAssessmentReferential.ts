import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import { loadWorkbook } from './excelSource';
import { createImportApiClient } from './apiClient';
import { parseReferentialFromWorksheet } from '../../domain/performance/generalAssessmentReferential';
import { RoleProfile } from '../../domain/performance/entities/GeneralAssessmentReferentialProfile';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const REFERENTIAL_WORKSHEET_NAME = 'référentiel évaluation';

/**
 * Un fichier réel représentatif par profil de poste, choisi parmi les 21 fichiers individuels de
 * `evaluations-individuelles/` : l'onglet "Référentiel évaluation" y est identique (byte pour
 * byte, vérifié par un script de hash sur les 21 fichiers) pour tous les fichiers d'un même
 * profil — seules les 3 lignes "Technique" varient selon le poste (3 variantes réelles
 * constatées aujourd'hui : Dev, QA, DBA), les 9 lignes Impact/Collaboration/Leadership étant
 * partagées par tout le monde. `dev_back` et `dev_front` partagent donc le même fichier source.
 *
 * Ce mapping peut devenir obsolète si de nouveaux profils de poste apparaissent dans de futurs
 * fichiers d'auto-évaluation (ex. un onglet "Technique" spécifique à un futur profil "Data") —
 * dans ce cas, ajouter le fichier représentatif correspondant ici plutôt que de modifier le
 * référentiel en base à la main : ce script reste la source de vérité rejouable pour le
 * référentiel de notation.
 */
const REPRESENTATIVE_FILES: Record<RoleProfile, { fileName: string; label: string }> = {
  dev_back: { fileName: 'andres.xlsx', label: 'Développeur Back' },
  dev_front: { fileName: 'andres.xlsx', label: 'Développeur Front' },
  qa: { fileName: 'beaudouin.xlsx', label: 'QA' },
  dba: { fileName: 'ignace.xlsx', label: 'DBA' }
};

/**
 * Seed (rejouable) du référentiel de notation manager (4 axes × 3 sous-critères × 5 réponses
 * verbeuses notées) pour les 4 profils de poste actuels, à partir des fichiers réels
 * d'auto-évaluation — voir `GENERAL_ASSESSMENT_REFERENTIAL_DESIGN` dans la conversation produit :
 * le manager note en sélectionnant une réponse verbeuse par sous-critère (pas une note brute), et
 * les points de chaque réponse restent modifiables en base sans changement de code (via
 * `PUT /performance/general-assessment-referential/:roleProfile`, exactement la route que ce
 * script appelle).
 *
 * Rejouable sans risque : chaque exécution REMPLACE entièrement le référentiel d'un profil
 * (upsert par roleProfile) — relancer ce script après avoir corrigé un fichier source ou ajusté
 * les points d'une réponse directement en base écrasera cependant les ajustements manuels faits
 * en base entre-temps ; à n'utiliser que pour l'amorçage initial ou une resynchronisation
 * volontaire depuis les fichiers sources.
 *
 * Usage : IMPORT_API_TOKEN=... OKR_ENTRETIEN_DIR=/chemin/vers/OKR-entretien \
 *         corepack yarn import:general-assessment-referential:seed
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
  const assessmentsDir = path.join(okrDir, 'evaluations-individuelles');
  const api = createImportApiClient();

  let written = 0;
  const failures: string[] = [];

  for (const roleProfile of Object.keys(REPRESENTATIVE_FILES) as RoleProfile[]) {
    const { fileName, label } = REPRESENTATIVE_FILES[roleProfile];
    console.log(`### ${roleProfile} (${label}) — source : ${fileName}`);

    try {
      const workbook = await loadWorkbook(path.join(assessmentsDir, fileName));
      const worksheet = workbook.worksheets.find(
        (ws) => ws.name.trim().toLowerCase() === REFERENTIAL_WORKSHEET_NAME
      );
      if (!worksheet) {
        throw new Error(`Onglet "Référentiel évaluation" introuvable dans ${fileName}.`);
      }

      const { axes, warnings } = parseReferentialFromWorksheet(worksheet);
      warnings.forEach((w) => console.log(`  ⚠ ${w}`));

      const perAxis = Object.entries(axes)
        .map(([axis, criteria]) => `${axis}=${criteria.length}`)
        .join(', ');
      console.log(`  Sous-critères extraits : ${perAxis}`);

      await api.writeGeneralAssessmentReferential(roleProfile, label, axes);
      console.log(`  ✓ Référentiel écrit pour ${roleProfile}\n`);
      written++;
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? `HTTP ${error.response?.status ?? '?'} : ${JSON.stringify(error.response?.data ?? error.message)}`
        : (error as Error).message;
      console.log(`  ✗ Échec pour ${roleProfile} : ${message}\n`);
      failures.push(`${roleProfile} (${fileName}) : ${message}`);
    }
  }

  console.log('---');
  console.log(`Résumé : ${written} profil(s) écrit(s), ${failures.length} échec(s).`);
  if (failures.length > 0) {
    process.exitCode = 1;
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
