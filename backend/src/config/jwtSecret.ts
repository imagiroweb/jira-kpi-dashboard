import crypto from 'crypto';

/** Longueur minimale du secret de signature des JWT de session. */
export const MIN_JWT_SECRET_LENGTH = 32;

/** Valeurs d'exemple connues (anciens défauts / modèles) : jamais acceptées comme secret. */
const KNOWN_PLACEHOLDERS = new Set([
  'your-super-secret-jwt-key-change-in-production',
  'votre-secret-jwt-min-32-caracteres'
]);

/**
 * Secret JWT obligatoire : le serveur refuse de démarrer sans un secret d'au moins 32 caractères
 * (auparavant, une valeur par défaut codée en dur permettait de forger des jetons).
 * En test uniquement (NODE_ENV=test, Jest), un secret aléatoire propre au processus est généré.
 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = (env.JWT_SECRET ?? '').trim();
  if (!secret && env.NODE_ENV === 'test') {
    return crypto.randomBytes(48).toString('hex');
  }
  if (!secret) {
    throw new Error(
      'JWT_SECRET manquant : définissez un secret aléatoire d’au moins 32 caractères ' +
        '(ex. `openssl rand -hex 48`) avant de démarrer le serveur.'
    );
  }
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET trop court (${secret.length} caractères, minimum ${MIN_JWT_SECRET_LENGTH}).`);
  }
  if (KNOWN_PLACEHOLDERS.has(secret)) {
    throw new Error('JWT_SECRET contient une valeur d’exemple : générez un secret aléatoire (ex. `openssl rand -hex 48`).');
  }
  return secret;
}
