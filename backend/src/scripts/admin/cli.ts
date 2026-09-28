import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { resolveMasterKey } from '../../config/dataEncryption';
import { initKeyring } from '../../infrastructure/crypto/keyringService';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/** Parse `--cle valeur` / `--drapeau` en objet. */
export function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

export function parseBool(value: string | true | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === true) return true;
  return !['false', '0', 'non', 'no'].includes(value.trim().toLowerCase());
}

/** Exécute une commande d'administration avec une connexion MongoDB (MONGODB_URI)
 * et le trousseau de chiffrement chargé (DATA_ENCRYPTION_KEY). */
export async function runWithMongo(task: () => Promise<void>): Promise<void> {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/jira-kpi';
  try {
    const masterKey = resolveMasterKey();
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    await initKeyring(masterKey);
    await task();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
