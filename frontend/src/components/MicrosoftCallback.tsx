import { useEffect, useState } from 'react';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { authApi } from '../services/authApi';
import { isSafeMicrosoftAccessToken, parseOAuthFragment } from '../utils/microsoftOAuth';

/** Évite d’afficher des messages JS bruts (ex. SyntaxError Safari) à l’utilisateur. */
function friendlySsoError(err: unknown): string {
  const fromApi = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  if (fromApi && typeof fromApi === 'string') return fromApi;

  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (
    err instanceof SyntaxError ||
    /unexpected token|compound expression|invalid character in header|invalid header/i.test(
      message
    )
  ) {
    return 'Erreur technique lors de la connexion Microsoft. Réessayez, ou vérifiez la configuration Azure (URI de redirection SPA).';
  }
  return message || 'Erreur de connexion au serveur';
}

export function MicrosoftCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const login = useStore((state) => state.login);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const hashParams = parseOAuthFragment(window.location.hash);
        const queryParams = new URLSearchParams(window.location.search);
        const errorCode = hashParams.error || queryParams.get('error');
        const errorDescription =
          hashParams.error_description || queryParams.get('error_description');

        if (errorCode) {
          setError(errorDescription || errorCode || 'Erreur lors de la connexion Microsoft');
          setStatus('error');
          return;
        }

        const accessToken = hashParams.access_token;
        if (!accessToken) {
          setError(
            "Token d'accès manquant. Vérifiez que l'URI de redirection dans Azure correspond à cette page (/auth/microsoft/callback, type SPA)."
          );
          setStatus('error');
          return;
        }

        if (!isSafeMicrosoftAccessToken(accessToken)) {
          setError(
            'Token Microsoft invalide ou corrompu (caractères interdits). Réessayez la connexion SSO.'
          );
          setStatus('error');
          return;
        }

        // Retirer le token de l’URL (historique / fuites via referrer)
        try {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch {
          // ignore
        }

        const result = await authApi.microsoftCallback(accessToken.trim());

        if (result.success && result.token && result.user) {
          setStatus('success');
          setTimeout(() => {
            login(result.token!, result.user!, result.firstLogin);
            window.location.href = '/';
          }, 1000);
        } else {
          setError(result.error || 'Erreur de connexion');
          setStatus('error');
        }
      } catch (err: unknown) {
        console.error('Microsoft callback error:', err);
        setError(friendlySsoError(err));
        setStatus('error');
      }
    };

    handleCallback();
  }, [login]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-950">
      <div className="card-glass p-8 max-w-sm w-full text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 text-accent-500 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-surface-100">Connexion en cours...</h2>
            <p className="text-surface-400 mt-2">Vérification de votre compte Microsoft</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-12 h-12 bg-success-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-success-500" />
            </div>
            <h2 className="text-xl font-semibold text-surface-100">Connexion réussie !</h2>
            <p className="text-surface-400 mt-2">Redirection en cours...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-12 h-12 bg-danger-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-danger-500" />
            </div>
            <h2 className="text-xl font-semibold text-surface-100">Erreur de connexion</h2>
            <p className="text-danger-400 mt-2">{error}</p>
            <button onClick={() => (window.location.href = '/')} className="btn-secondary mt-6">
              Retour à la connexion
            </button>
          </>
        )}
      </div>
    </div>
  );
}
