/**
 * Règles pures sur les domaines d'email d'une organisation.
 */

/** Domaine d'un email, en minuscules (`Jean@Adoria.com` → `adoria.com`) ; null si l'email est invalide. */
export function emailDomain(email: string): string | null {
  const trimmed = (email ?? '').trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;
  return trimmed.slice(at + 1);
}

/** Normalise une liste de domaines (minuscules, sans `@` initial, sans doublons ni vides). */
export function normalizeEmailDomains(domains: readonly string[] | string | undefined | null): string[] {
  const list = typeof domains === 'string' ? domains.split(',') : domains ?? [];
  return [...new Set(list.map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];
}

/**
 * L'email appartient-il à un domaine autorisé ? Correspondance exacte du domaine
 * (`adoria.com` n'autorise ni `evil-adoria.com` ni `adoria.com.evil.io`).
 * Liste vide = aucune restriction de domaine.
 */
export function isEmailDomainAllowed(email: string, allowedDomains: readonly string[]): boolean {
  const domains = normalizeEmailDomains(allowedDomains);
  if (domains.length === 0) return true;
  const domain = emailDomain(email);
  return domain !== null && domains.includes(domain);
}
