/**
 * `fetch` authentifié : ajoute le jeton de session (en-tête Authorization) comme l'intercepteur
 * axios de `services/api.ts`. Toutes les routes Jira / worklog exigent désormais une session.
 */
export function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  let token: string | null = null;
  try {
    token = localStorage.getItem('auth_token');
  } catch {
    token = null;
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
