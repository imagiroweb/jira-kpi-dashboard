/**
 * Trousseau de chiffrement de test (clés aléatoires en mémoire), chargé avant chaque fichier de
 * test : les modèles à champs chiffrés fonctionnent sans base ni DATA_ENCRYPTION_KEY.
 */
import crypto from 'crypto';
import { keyring } from '../infrastructure/crypto/fieldEncryption';

keyring.load({
  dataKeys: [{ id: 'ktest', key: crypto.randomBytes(32) }],
  activeId: 'ktest',
  indexKey: crypto.randomBytes(32)
});
