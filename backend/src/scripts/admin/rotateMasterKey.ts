import { runWithMongo } from './cli';
import { resolveMasterKey } from '../../config/dataEncryption';
import { rewrapAllKeys } from '../../infrastructure/crypto/keyringService';

/**
 * Rotation de la clé maître : les clés de données (collection `encryptionkeys`) sont ré-enveloppées
 * avec la nouvelle clé ; les données elles-mêmes ne sont pas rechiffrées (inutile).
 *
 * Usage (application arrêtée ou redémarrée juste après) :
 *   DATA_ENCRYPTION_KEY=<actuelle> DATA_ENCRYPTION_KEY_NEW=<nouvelle> yarn encryption:rotate-master-key
 *   (en production : node dist/scripts/admin/rotateMasterKey.js)
 * Puis remplacer DATA_ENCRYPTION_KEY par la nouvelle valeur dans le coffre et le .env, et redémarrer.
 */
async function main() {
  const oldKey = resolveMasterKey(process.env, 'DATA_ENCRYPTION_KEY');
  const newKey = resolveMasterKey(process.env, 'DATA_ENCRYPTION_KEY_NEW');
  if (newKey.equals(oldKey)) throw new Error('La nouvelle clé doit différer de l’actuelle');
  const count = await rewrapAllKeys(oldKey, newKey);
  console.log(`${count} clé(s) de données ré-enveloppée(s). Mettez à jour DATA_ENCRYPTION_KEY puis redémarrez.`);
}

void runWithMongo(main);
