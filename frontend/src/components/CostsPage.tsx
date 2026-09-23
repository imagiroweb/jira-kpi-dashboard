import { useCallback, useEffect, useMemo, useState } from 'react';
import { Euro, Loader2, Pencil, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { costsApi, type CostUser } from '../services/api';
import {
  MAX_HOURLY_RATES,
  formatDateFr,
  parseDrafts,
  toDrafts,
  type HourlyRate,
  type HourlyRateDraft,
} from '../domain/hourlyRates';
import { useStore } from '../store/useStore';

function displayName(u: Pick<CostUser, 'firstName' | 'lastName' | 'email'>): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
}

function errorMessage(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { error?: string; errors?: string[] } }; message?: string };
  return err?.response?.data?.errors?.[0] || err?.response?.data?.error || err?.message || fallback;
}

/**
 * Page « Coûts horaires » (issue #44) : coût horaire (€) des utilisateurs connectés par SSO, et des
 * comptes non SSO qu'un super admin ajoute manuellement. Ces coûts alimentent le coût des épics
 * (Suivi épic). Visible du super admin et des rôles ayant la page `couts` (ex. Finance).
 */
export function CostsPage() {
  const user = useStore((state) => state.user);
  const hasAccess = user?.role === 'super_admin' || user?.visiblePages?.couts === true;

  const [users, setUsers] = useState<CostUser[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [candidates, setCandidates] = useState<CostUser[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await costsApi.getUsers();
      setUsers(res.users);
      setCanManage(res.canManage);
      if (res.canManage) setCandidates((await costsApi.getCandidates()).users);
    } catch (e) {
      setError(errorMessage(e, 'Erreur de chargement des coûts'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasAccess) load();
  }, [hasAccess, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => `${displayName(u)} ${u.email} ${u.roleName ?? ''}`.toLowerCase().includes(q));
  }, [users, query]);
  const missingCount = users.filter((u) => u.hourlyRates.length === 0).length;

  /** Enregistre les coûts ; renvoie false (et affiche l'erreur) en cas d'échec pour garder l'édition ouverte. */
  const saveRates = async (userId: string, hourlyRates: HourlyRate[]): Promise<boolean> => {
    setSavingId(userId);
    setError(null);
    try {
      const res = await costsApi.updateHourlyRates(userId, hourlyRates);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, hourlyRates: res.hourlyRates } : u)));
      return true;
    } catch (e) {
      setError(errorMessage(e, "Erreur d'enregistrement des coûts horaires"));
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const addUser = async () => {
    if (!selectedCandidate) return;
    setError(null);
    try {
      await costsApi.addUser(selectedCandidate);
      setSelectedCandidate('');
      await load();
    } catch (e) {
      setError(errorMessage(e, "Erreur d'ajout de l'utilisateur"));
    }
  };

  const removeUser = async (u: CostUser) => {
    if (!window.confirm(`Retirer ${displayName(u)} de la liste des coûts ? Son coût horaire sera effacé.`)) return;
    setError(null);
    try {
      await costsApi.removeUser(u.id);
      await load();
    } catch (e) {
      setError(errorMessage(e, "Erreur de retrait de l'utilisateur"));
    }
  };

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="rounded-2xl border border-surface-700/50 bg-surface-900/50 p-8 text-center max-w-md">
          <ShieldCheck className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-surface-200 mb-2">Accès réservé</h2>
          <p className="text-surface-500 text-sm">Cette page est réservée aux utilisateurs ayant accès aux coûts.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-surface-100 flex items-center gap-2">
          <Euro className="w-6 h-6 text-amber-400" aria-hidden />
          Coûts horaires
        </h1>
        <p className="text-sm text-surface-500">
          Coût horaire des utilisateurs connectés par SSO{canManage ? ' et des comptes ajoutés manuellement' : ''}. Il sert à
          calculer le coût du temps passé sur les épics (Suivi épic). En cas de changement en cours d&apos;année, ajoutez une
          période « à partir du » : le temps saisi avant cette date garde le coût précédent ({MAX_HOURLY_RATES} coûts maximum
          par utilisateur).
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {canManage && (
        <section className="rounded-xl border border-surface-700/50 bg-surface-900/50 p-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-surface-300">Ajouter un compte non SSO :</span>
          <select
            value={selectedCandidate}
            onChange={(e) => setSelectedCandidate(e.target.value)}
            aria-label="Compte non SSO à ajouter"
            className="bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-200 min-w-[16rem]"
          >
            <option value="">{candidates.length ? 'Choisir un utilisateur…' : 'Aucun compte non SSO disponible'}</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {displayName(c)} ({c.email})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addUser}
            disabled={!selectedCandidate}
            className="px-4 py-2 rounded-lg bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 disabled:opacity-40 flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" aria-hidden />
            Ajouter
          </button>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-surface-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (nom, email, rôle)"
              aria-label="Rechercher un utilisateur"
              className="bg-surface-800 border border-surface-600 rounded-lg pl-9 pr-3 py-2 text-sm text-surface-200 w-72 max-w-full"
            />
          </div>
          {!loading && (
            <span className="text-xs text-surface-500">
              {users.length} utilisateur(s){missingCount > 0 && <> · {missingCount} sans coût horaire</>}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-surface-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Chargement…
          </p>
        ) : (
          <div className="rounded-xl border border-surface-700/50 bg-surface-900/50 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-surface-700/50 text-xs font-medium text-surface-500 uppercase tracking-wider">
                  <th className="p-3">Nom</th>
                  <th className="p-3">Rôle</th>
                  <th className="p-3">Connexion</th>
                  <th className="p-3">Coûts horaires</th>
                  {canManage && <th className="p-3" aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} className="p-6 text-center text-sm text-surface-500">
                      Aucun utilisateur.
                    </td>
                  </tr>
                )}
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-surface-700/30">
                    <td className="p-3">
                      <div className={`text-sm ${u.isActive ? 'text-surface-200' : 'text-surface-500'}`}>
                        {displayName(u)}
                        {!u.isActive && <span className="ml-2 text-xs text-surface-500">(inactif)</span>}
                      </div>
                      <div className="text-xs text-surface-500">{u.email}</div>
                    </td>
                    <td className="p-3 text-sm text-surface-400">{u.roleName ?? '—'}</td>
                    <td className="p-3 text-sm">
                      {u.manual ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">Ajouté manuellement</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-primary-500/15 text-primary-300">SSO Microsoft</span>
                      )}
                    </td>
                    <td className="p-3">
                      <HourlyRatesCell
                        rates={u.hourlyRates}
                        saving={savingId === u.id}
                        name={displayName(u)}
                        onSave={(rates) => saveRates(u.id, rates)}
                      />
                    </td>
                    {canManage && (
                      <td className="p-3 text-right">
                        {u.manual && (
                          <button
                            type="button"
                            onClick={() => removeUser(u)}
                            aria-label={`Retirer ${displayName(u)}`}
                            title="Retirer de la liste des coûts"
                            className="p-2 rounded-lg text-surface-500 hover:text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Coûts horaires d'un utilisateur : résumé (coût initial puis changements datés) et édition du coût
 * initial et des périodes « à partir du » (3 coûts maximum), enregistrés ensemble.
 */
function HourlyRatesCell({
  rates,
  saving,
  name,
  onSave,
}: {
  rates: HourlyRate[];
  saving: boolean;
  name: string;
  onSave: (rates: HourlyRate[]) => Promise<boolean>;
}) {
  const [drafts, setDrafts] = useState<HourlyRateDraft[] | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);

  const startEdit = () => {
    setDrafts(toDrafts(rates));
    setInvalid(null);
  };
  const cancel = () => {
    setDrafts(null);
    setInvalid(null);
  };
  const update = (index: number, patch: Partial<HourlyRateDraft>) =>
    setDrafts((prev) => prev && prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  const submit = async () => {
    if (!drafts) return;
    const parsed = parseDrafts(drafts);
    if (!parsed.ok) {
      setInvalid(parsed.error);
      return;
    }
    setInvalid(null);
    if (await onSave(parsed.rates)) setDrafts(null);
  };

  if (!drafts) {
    return (
      <div className="flex items-start gap-2">
        {rates.length === 0 ? (
          <span className="text-sm text-surface-500">Non renseigné</span>
        ) : (
          <ul className="text-sm space-y-0.5" aria-label={`Coûts horaires de ${name}`}>
            {rates.map((r) => (
              <li key={r.startDate ?? 'initial'} className="tabular-nums text-surface-200">
                {r.rate} €/h
                <span className="text-xs text-surface-500 ml-1">
                  {r.startDate ? `dès le ${formatDateFr(r.startDate)}` : rates.length > 1 ? '(initial)' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={startEdit}
          aria-label={`Modifier les coûts de ${name}`}
          title="Modifier"
          className="p-1 rounded text-surface-500 hover:text-primary-300 hover:bg-surface-800"
        >
          <Pencil className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>
    );
  }

  const inputClass =
    'bg-surface-800 border border-surface-600 rounded-lg px-2 py-1.5 text-sm text-surface-200 focus:ring-2 focus:ring-primary-500/50';
  return (
    <div className="space-y-2 min-w-[18rem]" role="group" aria-label={`Édition des coûts de ${name}`}>
      {drafts.map((d, i) => (
        <div key={i} className="flex items-center gap-2 flex-wrap">
          {i === 0 ? (
            <span className="text-xs text-surface-400 w-[8.5rem]">Coût initial</span>
          ) : (
            <label className="text-xs text-surface-400 flex items-center gap-1">
              À partir du
              <input
                type="date"
                value={d.startDate}
                onChange={(e) => update(i, { startDate: e.target.value })}
                aria-label={`Date de début de la période ${i}`}
                className={`${inputClass} w-[9.5rem]`}
              />
            </label>
          )}
          <input
            type="text"
            inputMode="decimal"
            value={d.rate}
            onChange={(e) => update(i, { rate: e.target.value })}
            aria-label={i === 0 ? `Coût initial de ${name}` : `Coût de la période ${i}`}
            placeholder="—"
            className={`${inputClass} w-20 text-right tabular-nums`}
          />
          <span className="text-sm text-surface-500">€/h</span>
          {i > 0 && (
            <button
              type="button"
              onClick={() => setDrafts((prev) => prev && prev.filter((_, j) => j !== i))}
              aria-label={`Supprimer la période ${i}`}
              className="p-1 rounded text-surface-500 hover:text-red-400"
            >
              <X className="w-3.5 h-3.5" aria-hidden />
            </button>
          )}
        </div>
      ))}
      {invalid && (
        <p className="text-xs text-red-400" role="alert">
          {invalid}
        </p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {drafts.length < MAX_HOURLY_RATES && (
          <button
            type="button"
            onClick={() => setDrafts((prev) => prev && [...prev, { startDate: '', rate: '' }])}
            className="text-xs text-primary-300 hover:text-primary-200 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden />
            Ajouter une période
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-surface-700 text-surface-300 hover:bg-surface-600 text-xs"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 text-xs flex items-center gap-1"
        >
          {saving && <Loader2 className="w-3 h-3 animate-spin" aria-hidden />}
          Enregistrer
        </button>
      </div>
    </div>
  );
}
