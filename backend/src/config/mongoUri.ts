/**
 * Analyse de MONGODB_URI (sans jamais journaliser le mot de passe).
 */
export interface MongoUriInfo {
  username: string | null;
  authSource: string | null;
  /** Connexion avec le compte root (utilisateur de la base `admin`) : à éviter pour l'application. */
  usesRootAccount: boolean;
}

export function describeMongoUri(uri: string): MongoUriInfo {
  try {
    const url = new URL(uri);
    const username = url.username ? decodeURIComponent(url.username) : null;
    const authSource = url.searchParams.get('authSource');
    const usesRootAccount = Boolean(username) && (authSource === 'admin' || username === 'admin' || username === 'root');
    return { username, authSource, usesRootAccount };
  } catch {
    return { username: null, authSource: null, usesRootAccount: false };
  }
}
