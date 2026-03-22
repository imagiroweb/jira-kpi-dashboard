import { useState } from 'react';
import { Mail, ArrowLeft, Loader2, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { authApi } from '../services/authApi';

interface ForgotPasswordPageProps {
  onBack: () => void;
}

export function ForgotPasswordPage({ onBack }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await authApi.forgotPassword(email);
      if (result.success) {
        setSent(true);
      } else {
        setError(result.error || 'Une erreur est survenue. Veuillez réessayer.');
      }
    } catch {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-surface-950">
        <div className="absolute top-1/4 -left-1/4 w-1/2 h-1/2 bg-accent-500/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-primary-500/10 rounded-full blur-3xl animate-pulse-slow animation-delay-500" />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500 to-primary-500 shadow-glow mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-display font-bold gradient-text">Jira KPI Dashboard</h1>
          <p className="text-surface-400 mt-2">Réinitialisation du mot de passe</p>
        </div>

        <div className="card-glass p-8">
          {sent ? (
            <div className="text-center animate-fade-in">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success-500/15 mb-4">
                <CheckCircle2 className="w-8 h-8 text-success-400" />
              </div>
              <h2 className="text-lg font-semibold text-surface-100 mb-3">Email envoyé !</h2>
              <p className="text-surface-400 text-sm leading-relaxed mb-2">
                Si un compte est associé à <strong className="text-surface-300">{email}</strong>,
                vous recevrez un lien valable <strong className="text-surface-300">1 heure</strong>.
              </p>
              <p className="text-surface-500 text-xs mb-6">
                Vérifiez également vos courriers indésirables.
              </p>
              <button type="button" onClick={onBack} className="btn-secondary w-full py-3 text-sm font-medium">
                <ArrowLeft className="w-4 h-4" />
                Retour à la connexion
              </button>
            </div>
          ) : (
            <>
              <p className="text-surface-400 text-sm leading-relaxed mb-6">
                Saisissez votre adresse email. Si elle est associée à un compte local, vous recevrez un lien pour réinitialiser votre mot de passe.
              </p>

              {error && (
                <div className="alert alert-danger mb-5 animate-fade-in">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">
                    Adresse email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input pl-10"
                      placeholder="votre@email.com"
                      required
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="btn-primary w-full py-3 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Mail className="w-5 h-5" />
                      Envoyer le lien de réinitialisation
                    </>
                  )}
                </button>
              </form>

              <p className="text-center mt-6">
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 text-accent-400 hover:text-accent-300 font-medium transition-colors text-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Retour à la connexion
                </button>
              </p>
            </>
          )}
        </div>

        <p className="text-center text-surface-600 text-sm mt-6">
          Powered by <span className="gradient-text font-medium">IMAGIRO</span>
        </p>
      </div>
    </div>
  );
}
