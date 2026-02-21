import { useEffect, useState } from 'react';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { authApi } from '../services/authApi';

export function MicrosoftCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const login = useStore((state) => state.login);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Parse the fragment (hash) from URL
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        
        const accessToken = params.get('access_token');
        const errorCode = params.get('error');
        const errorDescription = params.get('error_description');

        if (errorCode) {
          setError(errorDescription || 'Erreur lors de la connexion Microsoft');
          setStatus('error');
          return;
        }

        if (!accessToken) {
          setError('Token d\'accès manquant');
          setStatus('error');
          return;
        }

        // Send token to backend for validation
        const result = await authApi.microsoftCallback(accessToken);

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
      } catch (err) {
        console.error('Microsoft callback error:', err);
        setError('Erreur de connexion au serveur');
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
            <h2 className="text-xl font-semibold text-surface-100">
              Connexion en cours...
            </h2>
            <p className="text-surface-400 mt-2">
              Vérification de votre compte Microsoft
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-12 h-12 bg-success-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-success-500" />
            </div>
            <h2 className="text-xl font-semibold text-surface-100">
              Connexion réussie !
            </h2>
            <p className="text-surface-400 mt-2">
              Redirection en cours...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-12 h-12 bg-danger-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-danger-500" />
            </div>
            <h2 className="text-xl font-semibold text-surface-100">
              Erreur de connexion
            </h2>
            <p className="text-danger-400 mt-2">{error}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="btn-secondary mt-6"
            >
              Retour à la connexion
            </button>
          </>
        )}
      </div>
    </div>
  );
}

