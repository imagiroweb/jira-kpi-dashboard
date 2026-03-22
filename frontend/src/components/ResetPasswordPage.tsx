import { useState } from 'react';
import { Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authApi } from '../services/authApi';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';

interface ResetPasswordPageProps {
  token: string;
  onSuccess: () => void;
}

export function ResetPasswordPage({ token, onSuccess }: ResetPasswordPageProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isPasswordValid = () => {
    return (
      password.length >= 12 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isPasswordValid()) {
      setError('Le mot de passe ne respecte pas tous les critères de sécurité');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setLoading(true);
    try {
      const result = await authApi.resetPassword(token, password);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => onSuccess(), 3000);
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
          <p className="text-surface-400 mt-2">Définir un nouveau mot de passe</p>
        </div>

        <div className="card-glass p-8">
          {success ? (
            <div className="text-center animate-fade-in">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success-500/15 mb-4">
                <CheckCircle2 className="w-8 h-8 text-success-400" />
              </div>
              <h2 className="text-lg font-semibold text-surface-100 mb-2">Mot de passe mis à jour !</h2>
              <p className="text-surface-400 text-sm mb-5">
                Votre mot de passe a été réinitialisé.<br />
                Redirection vers la connexion…
              </p>
              <button type="button" onClick={onSuccess} className="btn-primary w-full py-3 text-sm font-semibold">
                Se connecter maintenant
              </button>
            </div>
          ) : (
            <>
              {error && (
                <div className="alert alert-danger mb-5 animate-fade-in">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">
                    Nouveau mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input pl-10 pr-10"
                      placeholder="Min. 12 caractères"
                      required
                      autoComplete="new-password"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <PasswordStrengthIndicator password={password} />

                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">
                    Confirmer le mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`input pl-10 pr-10 ${
                        confirmPassword && password !== confirmPassword
                          ? 'border-danger-500 focus:ring-danger-500/50'
                          : confirmPassword && password === confirmPassword
                            ? 'border-success-500 focus:ring-success-500/50'
                            : ''
                      }`}
                      placeholder="Confirmer le mot de passe"
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-danger-400 text-xs mt-1">Les mots de passe ne correspondent pas</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !isPasswordValid() || password !== confirmPassword}
                  className="btn-primary w-full py-3 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Lock className="w-5 h-5" />
                      Enregistrer le nouveau mot de passe
                    </>
                  )}
                </button>
              </form>
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
