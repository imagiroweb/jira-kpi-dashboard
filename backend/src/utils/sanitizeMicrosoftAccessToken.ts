/**
 * Validation d’un access token Microsoft avant usage en header Authorization.
 * Évite TypeError Node/undici (« Invalid character in header… ») et les payloads JSON accidentels.
 */
export function sanitizeMicrosoftAccessToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const token = raw.trim();
  if (!token || token.length > 16_384) return null;
  if (token.startsWith('{') || token.startsWith('[')) return null;
  if (/[\r\n\0]/.test(token)) return null;
  if (/[\s{}]/.test(token)) return null;
  return token;
}
