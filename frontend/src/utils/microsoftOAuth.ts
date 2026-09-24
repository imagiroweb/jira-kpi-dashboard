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

const OAUTH_STATE_KEY = 'ms_oauth_state';
const OAUTH_NONCE_KEY = 'ms_oauth_nonce';

/**
 * Génère et mémorise (sessionStorage, onglet courant) le `state` (anti-CSRF) et le `nonce`
 * (anti-rejeu, vérifié par le backend dans l'id_token) d'une demande d'autorisation Microsoft.
 */
export function createOAuthRequestState(): { state: string; nonce: string } {
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  try {
    sessionStorage.setItem(OAUTH_STATE_KEY, state);
    sessionStorage.setItem(OAUTH_NONCE_KEY, nonce);
  } catch {
    // stockage indisponible : la vérification du retour échouera proprement
  }
  return { state, nonce };
}

/**
 * Récupère puis efface le `state` / `nonce` mémorisés (usage unique).
 * Retourne null si le `state` reçu ne correspond pas à celui émis par cet onglet.
 */
export function consumeOAuthRequestState(receivedState: string | undefined): { nonce: string } | null {
  let state: string | null = null;
  let nonce: string | null = null;
  try {
    state = sessionStorage.getItem(OAUTH_STATE_KEY);
    nonce = sessionStorage.getItem(OAUTH_NONCE_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_NONCE_KEY);
  } catch {
    return null;
  }
  if (!state || !nonce || !receivedState || receivedState !== state) return null;
  return { nonce };
}
