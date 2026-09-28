/**
 * Détail technique d'une erreur renvoyé au client : seulement hors production.
 * En production, le message brut (requête Jira, nom de collection, chemin…) reste dans les
 * logs serveur et n'est jamais exposé dans la réponse HTTP.
 */
export function clientErrorDetail(error: unknown, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.NODE_ENV === 'production') return undefined;
  return error instanceof Error ? error.message : 'Unknown error';
}
