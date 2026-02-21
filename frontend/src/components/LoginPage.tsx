import { useState, useCallback, useEffect } from 'react';
import { 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  LogIn, 
  UserPlus,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';
import { useStore } from '../store/useStore';
import { authApi, MicrosoftConfig, RoleForSignup } from '../services/authApi';

type AuthMode = 'login' | 'register';

// Microsoft Icon Component
function MicrosoftIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="11" height="11" fill="#f25022"/>
      <rect x="12" width="11" height="11" fill="#7fba00"/>
      <rect y="12" width="11" height="11" fill="#00a4ef"/>
      <rect x="12" y="12" width="11" height="11" fill="#ffb900"/>
    </svg>
  );
}

export function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [microsoftConfig, setMicrosoftConfig] = useState<MicrosoftConfig | null>(null);
  const [loadingMicrosoftConfig, setLoadingMicrosoftConfig] = useState(true);
  const [rolesForSignup, setRolesForSignup] = useState<RoleForSignup[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');

  const login = useStore((state) => state.login);

  // Load Microsoft SSO config
  useEffect(() => {
    const loadMicrosoftConfig = async () => {
      try {
        const config = await authApi.getMicrosoftConfig();
        if (config.enabled) {
          setMicrosoftConfig(config);
        }
      } catch (err) {
        console.log('Microsoft SSO not available');
      } finally {
        setLoadingMicrosoftConfig(false);
      }
    };
    loadMicrosoftConfig();
  }, []);

  // Load roles for signup when in register mode
  useEffect(() => {
    if (mode !== 'register') return;
    let cancelled = false;
    authApi
      .getRolesForSignup()
      .then((list) => {
        if (!cancelled) {
          setRolesForSignup(list);
          if (list.length > 0 && !selectedRoleId) setSelectedRoleId(list[0].id);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mode]);

  // Password validation for registration
  const isPasswordValid = useCallback(() => {
    if (mode !== 'register') return true;
    
    const hasMinLength = password.length >= 12;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password);
    
    return hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;
  }, [password, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        // Validate password
        if (!isPasswordValid()) {
          setError('Le mot de passe ne respecte pas tous les critères de sécurité');
          setLoading(false);
          return;
        }

        // Confirm password check
        if (password !== confirmPassword) {
          setError('Les mots de passe ne correspondent pas');
          setLoading(false);
          return;
        }

        if (!selectedRoleId) {
          setError('Veuillez sélectionner votre fonction');
          setLoading(false);
          return;
        }
        const result = await authApi.register(email, password, firstName, lastName, selectedRoleId);
        if (result.success && result.token && result.user) {
          login(result.token, result.user, result.firstLogin);
        } else {
          setError(result.error || 'Erreur lors de la création du compte');
        }
      } else {
        const result = await authApi.login(email, password);
        if (result.success && result.token && result.user) {
          login(result.token, result.user, result.firstLogin);
        } else {
          setError(result.error || 'Email ou mot de passe incorrect');
        }
      }
    } catch (err) {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftLogin = () => {
    if (!microsoftConfig) return;

    // Build Microsoft OAuth2 authorization URL
    const params = new URLSearchParams({
      client_id: microsoftConfig.clientId,
      response_type: 'token',
      redirect_uri: window.location.origin + '/auth/microsoft/callback',
      scope: 'openid profile email User.Read',
      response_mode: 'fragment',
      state: crypto.randomUUID(),
      nonce: crypto.randomUUID()
    });

    const authUrl = `https://login.microsoftonline.com/${microsoftConfig.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
    window.location.href = authUrl;
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(null);
    setPassword('');
    setConfirmPassword('');
    setSelectedRoleId('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-surface-950">
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-1/4 -left-1/4 w-1/2 h-1/2 bg-accent-500/10 rounded-full blur-3xl animate-pulse-slow" />
          <div className="absolute bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-primary-500/10 rounded-full blur-3xl animate-pulse-slow animation-delay-500" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full">
            <div 
              className="absolute inset-0 opacity-[0.02]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2306b6d4' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
              }}
            />
          </div>
        </div>
      </div>

      {/* Login Card */}
      <div className="relative w-full max-w-md animate-slide-up">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500 to-primary-500 shadow-glow mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-display font-bold gradient-text">
            Jira KPI Dashboard
          </h1>
          <p className="text-surface-400 mt-2">
            {mode === 'login' ? 'Connectez-vous à votre compte' : 'Créez votre compte'}
          </p>
        </div>

        {/* Card */}
        <div className="card-glass p-8">
          {/* Error Alert */}
          {error && (
            <div className="alert alert-danger mb-6 animate-fade-in">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name fields (register only) */}
            {mode === 'register' && (
              <div className="grid grid-cols-2 gap-4 animate-fade-in">
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">
                    Prénom
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="input"
                    placeholder="Jean"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">
                    Nom
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="input"
                    placeholder="Dupont"
                  />
                </div>
              </div>
            )}

            {/* Role (register only) - required for first-time signup */}
            {mode === 'register' && (
              <div className="animate-fade-in">
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  Ma fonction <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" />
                  <select
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                    required
                    className="input pl-10 w-full bg-surface-800 border-surface-600"
                  >
                    <option value="">Sélectionnez votre fonction...</option>
                    {rolesForSignup.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">
                Email
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
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-10 pr-10"
                  placeholder={mode === 'register' ? 'Min. 12 caractères' : '••••••••••••'}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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

            {/* Password Strength Indicator (register only) */}
            {mode === 'register' && (
              <PasswordStrengthIndicator 
                password={password} 
                className="animate-fade-in" 
              />
            )}

            {/* Confirm Password (register only) */}
            {mode === 'register' && (
              <div className="animate-fade-in">
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
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || (mode === 'register' && (!isPasswordValid() || !selectedRoleId))}
              className="btn-primary w-full py-3 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : mode === 'login' ? (
                <>
                  <LogIn className="w-5 h-5" />
                  Se connecter
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5" />
                  Créer mon compte
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          {(microsoftConfig || !loadingMicrosoftConfig) && (
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-surface-700" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-surface-900 text-surface-500">
                  ou continuer avec
                </span>
              </div>
            </div>
          )}

          {/* Microsoft SSO Button */}
          {microsoftConfig && (
            <button
              type="button"
              onClick={handleMicrosoftLogin}
              className="btn-secondary w-full py-3 text-base font-medium group"
            >
              <MicrosoftIcon className="w-5 h-5" />
              <span>Microsoft</span>
              <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
            </button>
          )}

          {loadingMicrosoftConfig && (
            <div className="flex justify-center py-3">
              <Loader2 className="w-5 h-5 animate-spin text-surface-500" />
            </div>
          )}

          {/* Toggle Mode */}
          <p className="text-center text-surface-400 mt-6">
            {mode === 'login' ? (
              <>
                Pas encore de compte ?{' '}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-accent-400 hover:text-accent-300 font-medium transition-colors"
                >
                  Créer un compte
                </button>
              </>
            ) : (
              <>
                Déjà un compte ?{' '}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-accent-400 hover:text-accent-300 font-medium transition-colors"
                >
                  Se connecter
                </button>
              </>
            )}
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-surface-600 text-sm mt-6">
          Powered by <span className="gradient-text font-medium">IMAGIRO</span>
        </p>
      </div>
    </div>
  );
}

