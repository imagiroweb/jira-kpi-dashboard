import crypto from 'crypto';
import { logger } from '../../utils/logger';

/**
 * Chiffrement applicatif des champs sensibles (RGPD art. 32) : AES-256-GCM (chiffrement
 * authentifié, toute altération est détectée), IV aléatoire de 12 octets par valeur.
 *
 * Format stocké (chaîne) : `enc:v1:<keyId>:<base64url(iv | tag | chiffré)>` pour du texte,
 * `encj:v1:<keyId>:…` pour une valeur JSON (ex. coûts horaires). L'identifiant de clé permet la
 * rotation des clés de données et, plus tard, une clé par organisation.
 *
 * Index aveugle : HMAC-SHA256 (clé dédiée) d'une valeur normalisée, pour rechercher une valeur
 * chiffrée par égalité (email) sans la déchiffrer.
 */
const TEXT_PREFIX = 'enc:v1:';
const JSON_PREFIX = 'encj:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

class Keyring {
  private dataKeys = new Map<string, Buffer>();
  private activeId: string | null = null;
  private indexKey: Buffer | null = null;

  load(input: { dataKeys: Array<{ id: string; key: Buffer }>; activeId: string; indexKey: Buffer }): void {
    this.dataKeys = new Map(input.dataKeys.map((k) => [k.id, k.key]));
    if (!this.dataKeys.has(input.activeId)) throw new Error('Clé de données active absente du trousseau');
    this.activeId = input.activeId;
    this.indexKey = input.indexKey;
  }

  clear(): void {
    this.dataKeys.clear();
    this.activeId = null;
    this.indexKey = null;
  }

  isReady(): boolean {
    return this.activeId !== null && this.indexKey !== null;
  }

  active(): { id: string; key: Buffer } {
    if (!this.activeId) throw new Error('Trousseau de chiffrement non initialisé');
    return { id: this.activeId, key: this.dataKeys.get(this.activeId)! };
  }

  get(id: string): Buffer | undefined {
    return this.dataKeys.get(id);
  }

  index(): Buffer {
    if (!this.indexKey) throw new Error('Trousseau de chiffrement non initialisé');
    return this.indexKey;
  }
}

export const keyring = new Keyring();

export function isEncryptedValue(value: unknown): value is string {
  return typeof value === 'string' && (value.startsWith(TEXT_PREFIX) || value.startsWith(JSON_PREFIX));
}

function seal(prefix: string, plaintext: string): string {
  const { id, key } = keyring.active();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(id));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  return `${prefix}${id}:${payload}`;
}

function open(value: string, prefix: string): string {
  const rest = value.slice(prefix.length);
  const sep = rest.indexOf(':');
  if (sep <= 0) throw new DecryptionError('Valeur chiffrée mal formée');
  const id = rest.slice(0, sep);
  const key = keyring.get(id);
  if (!key) throw new DecryptionError(`Clé de données inconnue (${id})`);
  const raw = Buffer.from(rest.slice(sep + 1), 'base64url');
  if (raw.length < IV_LENGTH + TAG_LENGTH) throw new DecryptionError('Valeur chiffrée tronquée');
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, raw.subarray(0, IV_LENGTH));
    decipher.setAAD(Buffer.from(id));
    decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
    return Buffer.concat([decipher.update(raw.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()]).toString('utf8');
  } catch {
    throw new DecryptionError('Échec du déchiffrement (clé ou donnée altérée)');
  }
}

/** Chiffre un texte (idempotent : une valeur déjà chiffrée est renvoyée telle quelle). */
export function encryptString(plaintext: string): string {
  if (isEncryptedValue(plaintext)) return plaintext;
  return seal(TEXT_PREFIX, plaintext);
}

/** Chiffre une valeur JSON (idempotent). */
export function encryptJson(value: unknown): string {
  if (isEncryptedValue(value)) return value;
  return seal(JSON_PREFIX, JSON.stringify(value));
}

/** Déchiffre une valeur ; une valeur non chiffrée (donnée historique) est renvoyée telle quelle. */
export function decryptValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (value.startsWith(TEXT_PREFIX)) return open(value, TEXT_PREFIX);
  if (value.startsWith(JSON_PREFIX)) return JSON.parse(open(value, JSON_PREFIX));
  return value;
}

let lastFailureLog = 0;
/** Comme `decryptValue`, sans lever : en cas d'échec, journalise (sans la valeur) et renvoie `fallback`. */
export function safeDecrypt(value: unknown, fallback: unknown = null): unknown {
  try {
    return decryptValue(value);
  } catch (error) {
    const now = Date.now();
    if (now - lastFailureLog > 60_000) {
      lastFailureLog = now;
      logger.error(`Déchiffrement impossible : ${(error as Error).message}`);
    }
    return fallback;
  }
}

/** Index aveugle d'une valeur normalisée (recherche par égalité sur un champ chiffré). */
export function blindIndex(normalizedValue: string): string {
  return crypto.createHmac('sha256', keyring.index()).update(normalizedValue, 'utf8').digest('hex');
}

function isPlainContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  if (Array.isArray(value)) return true;
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Déchiffre en place toutes les valeurs chiffrées d'un objet simple (résultats `.lean()`,
 * `toObject()`). Les objets non simples (ObjectId, Date, Buffer…) ne sont pas parcourus.
 */
export function decryptDeepInPlace<T>(input: T): T {
  const walk = (node: unknown): unknown => {
    if (isEncryptedValue(node)) return safeDecrypt(node);
    if (!isPlainContainer(node)) return node;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) node[i] = walk(node[i]);
      return node;
    }
    for (const key of Object.keys(node)) node[key] = walk(node[key]);
    return node;
  };
  return walk(input) as T;
}
