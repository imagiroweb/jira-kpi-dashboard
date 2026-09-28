import { blindIndex } from '../../infrastructure/crypto/fieldEncryption';

/**
 * L'email est chiffré en base : il ne peut plus servir de filtre. On le retrouve (connexion, SSO,
 * invitation, unicité) par son empreinte HMAC-SHA256 calculée avec la clé d'index du trousseau.
 * Toujours filtrer avec `{ emailHash: emailHashOf(email) }`, jamais `{ email }`.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailHashOf(email: string): string {
  return blindIndex(normalizeEmail(email));
}
