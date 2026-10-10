/**
 * `fetch` authentifié : envoie le cookie de session HttpOnly (credentials: 'include'), comme
 * axios avec `withCredentials`. Toutes les routes Jira / worklog exigent une session.
 */
export function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { credentials: 'include', ...init });
}
