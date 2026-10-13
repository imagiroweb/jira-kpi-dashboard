import { parseArgs, runWithMongo } from './cli';
import { migrateLegacyPlaintext } from '../../application/services/encryptionMigration';

/**
 * État du chiffrement des données : nombre de documents encore en clair (à blanc par défaut).
 *
 * Usage :
 *   yarn encryption:status            # à blanc : n'écrit rien
 *   yarn encryption:status --apply    # chiffre ce qui reste (fait aussi automatiquement au démarrage)
 *   (en production : node dist/scripts/admin/encryptionStatus.js …)
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === true;
  const report = await migrateLegacyPlaintext({ dryRun: !apply });
  console.log(
    `${apply ? 'Chiffrés' : 'Encore en clair'} : ${report.users} utilisateur(s), ${report.reviews} fiche(s), ` +
      `${report.integrationSettings} réglage(s) d'intégration` +
      (report.droppedLegacyEmailIndex ? ` ; index email_1 historique ${apply ? 'supprimé' : 'présent'}` : '')
  );
}

void runWithMongo(main);
