import { useEffect, useState } from 'react';
import { ShieldCheck, Users, Loader2, Save, Plus, X } from 'lucide-react';
import { authApi, UserWithRoleDto, RoleDto, VisiblePages } from '../services/authApi';
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

  const isSuperAdmin = user?.role === 'super_admin' || user?.visiblePages?.gestionUtilisateurs;

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
                  <tr key={u.id} className="border-b border-surface-700/30 hover:bg-surface-800/30">
                    <td className="p-4 text-surface-200">{u.email}</td>
                    <td className="p-4 text-surface-400">
                      {[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="p-4 text-surface-500 text-sm">{u.provider === 'microsoft' ? 'Microsoft' : 'Email'}</td>
                    <td className="p-4">
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
