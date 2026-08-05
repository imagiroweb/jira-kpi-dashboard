/**
 * Parse un fragment OAuth (#a=1&b=2) en préservant les `+` du token.
 * URLSearchParams convertirait `+` en espace (form-urlencoded), ce qui corrompt
 * les access tokens Microsoft et peut provoquer des erreurs de header HTTP.
 */
export function parseOAuthFragment(hash: string): Record<string, string> {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const out: Record<string, string> = {};
  if (!raw) return out;

  for (const part of raw.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const encKey = eq >= 0 ? part.slice(0, eq) : part;
    const encVal = eq >= 0 ? part.slice(eq + 1) : '';
    try {
      const key = decodeURIComponent(encKey);
      // Préserver `+` littéraux (base64) : les encoder avant decodeURIComponent
      const value = decodeURIComponent(encVal.replace(/\+/g, '%2B'));
      out[key] = value;
    } catch {
      // Paire mal formée : ignorer
    }
  }
  return out;
}

/**
 * Valide un access token Microsoft avant envoi / usage en header Authorization.
 */
export function isSafeMicrosoftAccessToken(token: unknown): token is string {
  if (typeof token !== 'string') return false;
  const t = token.trim();
  if (!t || t.length > 16_384) return false;
  // JSON accidentellement passé à la place du token brut
  if (t.startsWith('{') || t.startsWith('[')) return false;
  // Caractères interdits dans une valeur de header HTTP (Fetch / Node)
  if (/[\r\n\0]/.test(t)) return false;
  // Espaces / accolades au milieu = token corrompu (ex. `+` → espace via URLSearchParams)
  if (/[\s{}]/.test(t)) return false;
  return true;
}
