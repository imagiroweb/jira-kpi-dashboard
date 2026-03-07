import { useEffect, useState, useRef } from 'react';
import { ShieldCheck, Loader2, ArrowRight } from 'lucide-react';
import { useStore } from '../store/useStore';
import { authApi, RoleForSignup } from '../services/authApi';

export function RoleSelectionScreen() {
  const user = useStore((state) => state.user);
  const updateUser = useStore((state) => state.updateUser);
  const setPendingRoleSelection = useStore((state) => state.setPendingRoleSelection);
  const [roles, setRoles] = useState<RoleForSignup[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialRoleSet = useRef(false);

  useEffect(() => {
    let cancelled = false;
    authApi
      .getRolesForSignup()
      .then((list) => {
        if (!cancelled) {
          setRoles(list);
          if (list.length > 0 && !initialRoleSet.current) {
            setSelectedRoleId(list[0].id);
            initialRoleSet.current = true;
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError('Impossible de charger les rôles');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoleId) return;
    setError(null);
    setSubmitting(true);
    try {
      const updated = await authApi.updateMyRole(selectedRoleId);
      updateUser(updated);
      setPendingRoleSelection(false);
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { error?: string } }; message?: string };
      setError(errObj?.response?.data?.error || errObj?.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-950">
        <Loader2 className="w-10 h-10 text-primary-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface-950">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500 to-primary-500 shadow-glow mb-4">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-display font-bold text-surface-100">
            Première connexion
          </h1>
          <p className="text-surface-400 mt-2">
            Choisissez votre fonction pour accéder aux pages correspondantes.
          </p>
          {user?.email && (
            <p className="text-surface-500 text-sm mt-1">
              Connecté en tant que {user.email}
            </p>
          )}
        </div>

        <div className="card-glass p-8">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-2">
                Ma fonction <span className="text-red-400">*</span>
              </label>
              <select
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                required
                className="w-full bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-surface-200 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
              >
                <option value="">Sélectionnez...</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting || !selectedRoleId}
              className="btn-primary w-full py-3 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Valider et continuer
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
