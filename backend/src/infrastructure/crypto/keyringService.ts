import crypto from 'crypto';
import { EncryptionKey } from './EncryptionKey';
import { keyring } from './fieldEncryption';
import { logger } from '../../utils/logger';

/**
 * Chargement du trousseau au démarrage : les clés de données stockées en base sont
 * « désenveloppées » avec la clé maître et gardées en mémoire uniquement.
 * Première exécution : génère une clé de données et une clé d'index.
 * Si des clés existent mais ne se déchiffrent pas (mauvaise clé maître), le démarrage échoue :
 * on ne génère JAMAIS de nouvelles clés dans ce cas (les données existantes deviendraient illisibles).
 */
export function wrapKey(masterKey: Buffer, key: Buffer, aad: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(key), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

export function unwrapKey(masterKey: Buffer, wrapped: string, aad: string): Buffer {
  const raw = Buffer.from(wrapped, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
}

const aadOf = (keyId: string, purpose: string) => `${keyId}:${purpose}`;
const newKeyId = (purpose: 'data' | 'index') => `${purpose === 'data' ? 'k' : 'i'}${crypto.randomBytes(6).toString('hex')}`;

async function createKey(masterKey: Buffer, purpose: 'data' | 'index'): Promise<void> {
  const keyId = newKeyId(purpose);
  await EncryptionKey.create({ keyId, purpose, wrappedKey: wrapKey(masterKey, crypto.randomBytes(32), aadOf(keyId, purpose)), active: true });
  logger.info(`Clé de chiffrement générée (${purpose}, ${keyId})`);
}

export async function initKeyring(masterKey: Buffer): Promise<void> {
  let docs = await EncryptionKey.find().lean();
  if (!docs.some((d) => d.purpose === 'data')) await createKey(masterKey, 'data');
  if (!docs.some((d) => d.purpose === 'index')) await createKey(masterKey, 'index');
  docs = await EncryptionKey.find().sort({ createdAt: 1 }).lean();

  const dataKeys: Array<{ id: string; key: Buffer }> = [];
  let activeId: string | null = null;
  let indexKey: Buffer | null = null;
  for (const doc of docs) {
    let key: Buffer;
    try {
      key = unwrapKey(masterKey, doc.wrappedKey, aadOf(doc.keyId, doc.purpose));
    } catch {
      throw new Error(
        `Impossible de déchiffrer la clé ${doc.keyId} : DATA_ENCRYPTION_KEY ne correspond pas à celle utilisée ` +
          'pour chiffrer les données. Démarrage interrompu pour ne pas créer de clés incohérentes.'
      );
    }
    if (doc.purpose === 'data') {
      dataKeys.push({ id: doc.keyId, key });
      if (doc.active) activeId = doc.keyId; // la plus récente active l'emporte (tri par date)
    } else if (doc.active || !indexKey) {
      indexKey = key;
    }
  }
  if (!activeId || !indexKey) throw new Error('Trousseau de chiffrement incomplet');
  keyring.load({ dataKeys, activeId, indexKey });
  logger.info(`Trousseau de chiffrement chargé (${dataKeys.length} clé(s) de données, active : ${activeId})`);
}

/**
 * Rotation de la clé maître : ré-enveloppe toutes les clés avec la nouvelle clé maître (les
 * données elles-mêmes ne sont pas re-chiffrées). Utilisé par le script admin.
 */
export async function rewrapAllKeys(oldMasterKey: Buffer, newMasterKey: Buffer): Promise<number> {
  const docs = await EncryptionKey.find().lean();
  const rewrapped = docs.map((doc) => {
    const aad = aadOf(doc.keyId, doc.purpose);
    return { id: doc._id, wrappedKey: wrapKey(newMasterKey, unwrapKey(oldMasterKey, doc.wrappedKey, aad), aad) };
  });
  for (const r of rewrapped) await EncryptionKey.updateOne({ _id: r.id }, { $set: { wrappedKey: r.wrappedKey } });
  return rewrapped.length;
}
