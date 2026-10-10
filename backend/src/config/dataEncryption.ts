import crypto from 'crypto';

/**
 * Clé maître de chiffrement des données (KEK) : 32 octets fournis par DATA_ENCRYPTION_KEY
 * (64 caractères hexadécimaux, ou base64). Elle ne chiffre jamais les données directement : elle
 * « enveloppe » les clés de données stockées en base (collection encryptionkeys). Elle n'est
 * jamais écrite en base ni dans les logs.
 *
 * Obligatoire hors tests : le serveur refuse de démarrer sans (comme JWT_SECRET). Sa perte rend
 * les données chiffrées illisibles : la conserver dans un coffre, hors du serveur.
 */
export function parseMasterKey(raw: string): Buffer | null {
  const value = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex');
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(value)) {
    const buf = Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    return buf.length === 32 ? buf : null;
  }
  return null;
}

let testKey: Buffer | null = null;

export function resolveMasterKey(env: NodeJS.ProcessEnv = process.env, variable = 'DATA_ENCRYPTION_KEY'): Buffer {
  const raw = (env[variable] ?? '').trim();
  if (!raw && env.NODE_ENV === 'test') {
    testKey ??= crypto.randomBytes(32);
    return testKey;
  }
  if (!raw) {
    throw new Error(
      `${variable} manquant : définissez une clé maître de 32 octets (ex. \`openssl rand -hex 32\`), ` +
        'et conservez-en une copie hors du serveur (sa perte rend les données chiffrées illisibles).'
    );
  }
  const key = parseMasterKey(raw);
  if (!key) throw new Error(`${variable} invalide : 64 caractères hexadécimaux (openssl rand -hex 32) ou 32 octets en base64.`);
  return key;
}
