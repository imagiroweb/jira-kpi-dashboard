import { useEffect, useState, useCallback, useMemo } from 'react';
import { ShieldCheck, Users, Loader2, Save, Plus, X, LogIn, ChevronRight, BarChart3, LayoutDashboard, KeyRound, CheckCircle2, XCircle, Mail } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { authApi, UserWithRoleDto, RoleDto, VisiblePages, UserActivityLogEntry } from '../services/authApi';
import { useStore } from '../store/useStore';

const PAGE_LABELS: Record<keyof VisiblePages, string> = {
  dashboard: 'Dashboard',
  users: 'Utilisateurs',
  support: 'Support Board',
  epics: 'Suivi epics',
  marketing: 'Marketing',
  produit: 'Produit',
  gestionUtilisateurs: 'Gestion des utilisateurs'
};

export function UserManagementPage() {
  const user = useStore((state) => state.user);
  const [users, setUsers] = useState<UserWithRoleDto[]>([]);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [showNewRole, setShowNewRole] = useState(false);
  const [drawerUser, setDrawerUser] = useState<UserWithRoleDto | null>(null);
  const [drawerLogs, setDrawerLogs] = useState<UserActivityLogEntry[]>([]);
  const [drawerLogsLoading, setDrawerLogsLoading] = useState(false);
  const [showAllLogsModal, setShowAllLogsModal] = useState(false);
  const [allLogs, setAllLogs] = useState<UserActivityLogEntry[]>([]);
  const [allLogsLoading, setAllLogsLoading] = useState(false);
  const [pageStats, setPageStats] = useState<{ pages: Record<string, number>; total: number; percentages: Record<string, number> } | null>(null);
  const [pageStatsLoading, setPageStatsLoading] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin' || user?.visiblePages?.gestionUtilisateurs;

  const loadUserLogs = useCallback(async (userId: string, limit = 10) => {
    setDrawerLogsLoading(true);
    try {
      const logs = await authApi.getUserLogs(userId, limit);
      setDrawerLogs(logs);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error || err?.message || 'Erreur chargement des logs');
      setDrawerLogs([]);
    } finally {
      setDrawerLogsLoading(false);
    }
  }, []);

  const openAllLogsModal = useCallback(async () => {
    if (!drawerUser) return;
    setShowAllLogsModal(true);
    setAllLogsLoading(true);
    setAllLogs([]);
    try {
      const logs = await authApi.getUserLogs(drawerUser.id, 500);
      setAllLogs(logs);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error || err?.message || 'Erreur chargement des logs');
    } finally {
      setAllLogsLoading(false);
    }
  }, [drawerUser]);

  const loadPageStats = useCallback(async (userId: string) => {
    setPageStatsLoading(true);
    try {
      const stats = await authApi.getUserPageStats(userId, 30);
      setPageStats({ pages: stats.pages, total: stats.total, percentages: stats.percentages });
    } catch {
      setPageStats(null);
    } finally {
      setPageStatsLoading(false);
    }
  }, []);

  const openDrawer = useCallback((u: UserWithRoleDto) => {
    setDrawerUser(u);
    setDrawerLogs([]);
    setPageStats(null);
    loadUserLogs(u.id, 10);
    loadPageStats(u.id);
  }, [loadUserLogs, loadPageStats]);

  const closeDrawer = useCallback(() => {
    setDrawerUser(null);
    setDrawerLogs([]);
    setPageStats(null);
    setShowAllLogsModal(false);
    setAllLogs([]);
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authApi.getUsersAndRoles();
      setUsers(data.users);
      setRoles(data.roles);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error || err?.message || 'Erreur chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin]);

  const handleUserRoleChange = async (userId: string, role: 'super_admin' | null, roleId: string | null) => {
    setSavingUserId(userId);
    try {
      const updated = await authApi.updateUserRole(userId, role, roleId);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                role: updated.role ?? null,
                roleId: roleId,
                roleName: updated.roleName ?? '—'
              }
            : u
        )
      );
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error || err?.message || 'Erreur mise à jour');
    } finally {
      setSavingUserId(null);
    }
  };

  const handleSaveRole = async (roleId: string, name: string, pageVisibilities: VisiblePages) => {
    try {
      await authApi.updateRole(roleId, { name, pageVisibilities });
      setRoles((prev) => prev.map((r) => (r.id === roleId ? { ...r, name, pageVisibilities } : r)));
      setEditingRoleId(null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error || err?.message || 'Erreur sauvegarde rôle');
    }
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      const defaultPages: VisiblePages = {
        dashboard: true,
        users: true,
        support: true,
        epics: true,
        marketing: true,
        produit: true,
        gestionUtilisateurs: false
      };
      const created = await authApi.createRole(newRoleName.trim(), defaultPages);
      setRoles((prev) => [...prev, created]);
      setNewRoleName('');
      setShowNewRole(false);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error || err?.message || 'Erreur création rôle');
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="rounded-2xl border border-surface-700/50 bg-surface-900/50 p-8 text-center max-w-md">
          <ShieldCheck className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-surface-200 mb-2">Accès réservé</h2>
          <p className="text-surface-500 text-sm">Seuls les super administrateurs peuvent accéder à cette page.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <Loader2 className="w-10 h-10 text-primary-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-primary-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-surface-100">Gestion des utilisateurs</h1>
            <p className="text-surface-500 text-sm">Attribuer des rôles et définir les pages visibles par rôle.</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="p-1 hover:bg-red-500/20 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Liste des utilisateurs */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-surface-200 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-400" />
            Utilisateurs
          </h2>
          <div className="rounded-xl border border-surface-700/50 bg-surface-900/50 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-surface-700/50">
                  <th className="p-4 text-xs font-medium text-surface-500 uppercase tracking-wider">Email</th>
                  <th className="p-4 text-xs font-medium text-surface-500 uppercase tracking-wider">Nom</th>
                  <th className="p-4 text-xs font-medium text-surface-500 uppercase tracking-wider">Connexion</th>
                  <th className="p-4 text-xs font-medium text-surface-500 uppercase tracking-wider">Rôle</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-surface-700/30 hover:bg-surface-800/30 cursor-pointer group"
                    onClick={() => openDrawer(u)}
                  >
                    <td className="p-4 text-surface-200">{u.email}</td>
                    <td className="p-4 text-surface-400">
                      {[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="p-4 text-surface-500 text-sm">{u.provider === 'microsoft' ? 'Microsoft' : 'Email'}</td>
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <select
                          value={u.role === 'super_admin' ? 'super_admin' : u.roleId ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === 'super_admin') handleUserRoleChange(u.id, 'super_admin', null);
                            else if (v === '') handleUserRoleChange(u.id, null, null);
                            else handleUserRoleChange(u.id, null, v);
                          }}
                          disabled={savingUserId === u.id}
                          className="bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-200 focus:ring-2 focus:ring-primary-500/50"
                        >
                          <option value="super_admin">Super admin</option>
                          <option value="">Aucun rôle</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        {savingUserId === u.id && <Loader2 className="w-4 h-4 animate-spin text-primary-400" />}
                        <ChevronRight className="w-4 h-4 text-surface-500 group-hover:text-primary-400 shrink-0" aria-hidden />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Rôles et pages visibles */}
        <section>
          <h2 className="text-lg font-semibold text-surface-200 mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            Rôles et pages visibles
          </h2>
          <div className="space-y-4">
            {roles.map((role) => (
              <div
                key={role.id}
                className="rounded-xl border border-surface-700/50 bg-surface-900/50 p-4"
              >
                {editingRoleId === role.id ? (
                  <RoleEditor
                    role={role}
                    pageLabels={PAGE_LABELS}
                    onSave={(name, pageVisibilities) => handleSaveRole(role.id, name, pageVisibilities)}
                    onCancel={() => setEditingRoleId(null)}
                  />
                ) : (
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="font-medium text-surface-200">{role.name}</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {(Object.keys(role.pageVisibilities) as (keyof VisiblePages)[]).map((pageId) => (
                          <span
                            key={pageId}
                            className={`text-xs px-2 py-0.5 rounded ${
                              role.pageVisibilities[pageId]
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-surface-700 text-surface-500'
                            }`}
                          >
                            {PAGE_LABELS[pageId]}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingRoleId(role.id)}
                      className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
                    >
                      <Save className="w-4 h-4" />
                      Modifier
                    </button>
                  </div>
                )}
              </div>
            ))}

            {showNewRole ? (
              <div className="rounded-xl border border-dashed border-surface-600 p-4 flex items-center gap-3 flex-wrap">
                <input
                  type="text"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="Nom du rôle"
                  className="bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 text-surface-200 placeholder-surface-500 flex-1 min-w-[200px]"
                />
                <button
                  type="button"
                  onClick={handleCreateRole}
                  disabled={!newRoleName.trim()}
                  className="px-4 py-2 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 disabled:opacity-50 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Créer
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewRole(false); setNewRoleName(''); }}
                  className="p-2 rounded-lg hover:bg-surface-700 text-surface-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNewRole(true)}
                className="w-full rounded-xl border border-dashed border-surface-600 p-4 text-surface-500 hover:text-surface-400 hover:border-surface-500 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Ajouter un rôle
              </button>
            )}
          </div>
        </section>
      </div>

              {/* Drawer activité utilisateur */}
      {drawerUser && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeDrawer}
            onKeyDown={(e) => e.key === 'Escape' && closeDrawer()}
            role="button"
            tabIndex={0}
            aria-label="Fermer"
          />
          <div
            className="relative w-full max-w-md ml-auto bg-surface-900 border-l border-surface-700/50 shadow-xl flex flex-col"
            aria-modal="true"
            aria-labelledby="drawer-title"
          >
            <div className="p-4 border-b border-surface-700/50 flex items-center justify-between">
              <div>
                <h2 id="drawer-title" className="text-lg font-semibold text-surface-100">
                  Activité utilisateur
                </h2>
                <p className="text-sm text-surface-400 mt-0.5">
                  {[drawerUser.email, [drawerUser.firstName, drawerUser.lastName].filter(Boolean).join(' ')].filter(Boolean).join(' — ')}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="p-2 rounded-lg hover:bg-surface-700 text-surface-400 hover:text-surface-200"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {drawerLogsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
                </div>
              ) : drawerLogs.length === 0 ? (
                <p className="text-surface-500 text-sm py-4">Aucun log de connexion pour l’instant.</p>
              ) : (
                <>
                  <p className="text-surface-500 text-xs mb-3">10 dernières connexions</p>
                  <ul className="space-y-2">
                    {drawerLogs
                      .filter((log) => log.type === 'login')
                      .map((log) => (
                      <li
                        key={log.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-surface-800/50 border border-surface-700/30"
                      >
                        <LogIn className="w-4 h-4 text-primary-400 shrink-0" />
                        <span className="text-surface-200 text-sm">
                          Connexion — {new Date(log.timestamp).toLocaleString('fr-FR', {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={openAllLogsModal}
                    className="mt-4 w-full py-2.5 px-4 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 border border-primary-500/30 text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <BarChart3 className="w-4 h-4" />
                    Voir toutes les connexions
                  </button>
                </>
              )}

              {/* Logs de navigation — % visites par page */}
              <div className="mt-6 pt-4 border-t border-surface-700/50">
                <h3 className="text-sm font-medium text-surface-300 flex items-center gap-2 mb-3">
                  <LayoutDashboard className="w-4 h-4 text-primary-400" />
                  Logs de navigation
                </h3>
                <p className="text-surface-500 text-xs mb-3">30 derniers jours — part des visites par page</p>
                {pageStatsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 text-primary-400 animate-spin" />
                  </div>
                ) : !pageStats || pageStats.total === 0 ? (
                  <p className="text-surface-500 text-sm">Aucune visite enregistrée.</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(pageStats.percentages)
                      .sort(([, a], [, b]) => b - a)
                      .map(([pageId, pct]) => (
                        <div key={pageId} className="flex items-center gap-2">
                          <span className="text-surface-300 text-sm w-36 shrink-0 truncate" title={PAGE_LABELS[pageId as keyof VisiblePages] ?? pageId}>
                            {PAGE_LABELS[pageId as keyof VisiblePages] ?? pageId}
                          </span>
                          <div className="flex-1 h-2 rounded-full bg-surface-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary-500/80 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-surface-400 text-xs w-10 text-right">{pct}%</span>
                        </div>
                      ))}
                    <p className="text-surface-500 text-xs mt-2">{pageStats.total} visite{pageStats.total !== 1 ? 's' : ''} au total</p>
                  </div>
                )}
              </div>

              {/* Historique réinitialisation de mot de passe */}
              {(() => {
                const resetLogs = drawerLogs.filter(
                  (l) => l.type === 'password_reset_request' || l.type === 'password_reset_complete'
                );
                if (resetLogs.length === 0) return null;
                return (
                  <div className="mt-6 pt-4 border-t border-surface-700/50">
                    <h3 className="text-sm font-medium text-surface-300 flex items-center gap-2 mb-3">
                      <KeyRound className="w-4 h-4 text-amber-400" />
                      Réinitialisation de mot de passe
                    </h3>
                    <ul className="space-y-2">
                      {resetLogs.map((log) => {
                        const isRequest = log.type === 'password_reset_request';
                        const emailSent = log.meta?.emailSent;
                        return (
                          <li
                            key={log.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border ${
                              isRequest
                                ? emailSent
                                  ? 'bg-amber-500/5 border-amber-500/20'
                                  : 'bg-danger-500/5 border-danger-500/20'
                                : 'bg-success-500/5 border-success-500/20'
                            }`}
                          >
                            <div className="mt-0.5 shrink-0">
                              {isRequest ? (
                                emailSent
                                  ? <Mail className="w-4 h-4 text-amber-400" />
                                  : <XCircle className="w-4 h-4 text-danger-400" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-success-400" />
                              )}
                            </div>
                            <div>
                              <p className="text-surface-200 text-sm font-medium">
                                {isRequest
                                  ? emailSent
                                    ? 'Lien de reset envoyé par email'
                                    : 'Demande de reset — email non envoyé'
                                  : 'Mot de passe réinitialisé avec succès'}
                              </p>
                              <p className="text-surface-500 text-xs mt-0.5">
                                {new Date(log.timestamp).toLocaleString('fr-FR', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short'
                                })}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {showAllLogsModal && drawerUser && (
        <AllLogsModal
          user={drawerUser}
          logs={allLogs}
          loading={allLogsLoading}
          onClose={() => {
            setShowAllLogsModal(false);
            setAllLogs([]);
          }}
        />
      )}
    </div>
  );
}

function AllLogsModal({
  user,
  logs,
  loading,
  onClose
}: {
  user: UserWithRoleDto;
  logs: UserActivityLogEntry[];
  loading: boolean;
  onClose: () => void;
}) {
  const chartData = useMemo(() => {
    const loginLogs = logs.filter((l) => l.type === 'login');
    const byDate: Record<string, number> = {};
    loginLogs.forEach((log) => {
      const d = new Date(log.timestamp);
      const key = d.toISOString().slice(0, 10);
      byDate[key] = (byDate[key] ?? 0) + 1;
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({
        date,
        dateLabel: new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
        connexions: count
      }));
  }, [logs]);

  const totalConnexions = useMemo(() => logs.filter((l) => l.type === 'login').length, [logs]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        role="button"
        tabIndex={0}
        aria-label="Fermer"
      />
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-surface-900 border border-surface-700/50 shadow-xl"
        aria-modal="true"
        aria-labelledby="all-logs-title"
      >
        <div className="sticky top-0 p-4 border-b border-surface-700/50 flex items-center justify-between bg-surface-900/95 backdrop-blur">
          <div>
            <h2 id="all-logs-title" className="text-lg font-semibold text-surface-100">
              Toutes les connexions
            </h2>
            <p className="text-sm text-surface-400 mt-0.5">
              {[user.email, [user.firstName, user.lastName].filter(Boolean).join(' ')].filter(Boolean).join(' — ')}
            </p>
            <p className="text-xs text-primary-400 mt-1">{totalConnexions} connexion{totalConnexions !== 1 ? 's' : ''} au total</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-700 text-surface-400 hover:text-surface-200"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-10 h-10 text-primary-400 animate-spin" />
            </div>
          ) : chartData.length === 0 ? (
            <p className="text-surface-500 text-sm py-8 text-center">Aucune connexion enregistrée.</p>
          ) : (
            <div className="h-80 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fill: 'rgb(148,163,184)', fontSize: 11 }}
                    tickLine={{ stroke: 'rgba(148,163,184,0.2)' }}
                  />
                  <YAxis
                    tick={{ fill: 'rgb(148,163,184)', fontSize: 11 }}
                    tickLine={{ stroke: 'rgba(148,163,184,0.2)' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'rgb(30,41,59)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '8px' }}
                    labelStyle={{ color: 'rgb(203,213,225)' }}
                    formatter={(value: number) => [value, 'Connexions']}
                    labelFormatter={(label) => `Date : ${label}`}
                  />
                  <Bar dataKey="connexions" fill="rgb(99,102,241)" radius={[4, 4, 0, 0]} name="Connexions" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleEditor({
  role,
  pageLabels,
  onSave,
  onCancel
}: {
  role: RoleDto;
  pageLabels: Record<keyof VisiblePages, string>;
  onSave: (name: string, pageVisibilities: VisiblePages) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [pages, setPages] = useState<VisiblePages>({ ...role.pageVisibilities });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 text-surface-200"
        />
        <button
          type="button"
          onClick={() => onSave(name, pages)}
          className="px-4 py-2 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          Enregistrer
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-surface-700 text-surface-400 hover:bg-surface-600"
        >
          Annuler
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {(Object.keys(pages) as (keyof VisiblePages)[]).map((pageId) => (
          <label
            key={pageId}
            className="flex items-center gap-2 p-2 rounded-lg bg-surface-800/50 cursor-pointer hover:bg-surface-800"
          >
            <input
              type="checkbox"
              checked={pages[pageId]}
              onChange={(e) => setPages((prev) => ({ ...prev, [pageId]: e.target.checked }))}
              className="rounded border-surface-600 text-primary-500 focus:ring-primary-500/50"
            />
            <span className="text-sm text-surface-300">{pageLabels[pageId]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
