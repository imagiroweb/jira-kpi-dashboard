import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle, Plus, Save, X, Upload } from 'lucide-react';
import { performanceApi, teamApi } from '../services/api';
import type { Team, RosterUser } from '../domain/team';
import type { OkrImportResult, PerformanceCycle, PerformanceCycleStatus } from '../domain/performance';
import { CYCLE_STATUS_LABELS } from '../domain/performance';

function extractApiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message || e?.message || fallback;
}

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function userLabel(user: Pick<RosterUser, 'firstName' | 'lastName' | 'email'>): string {
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return name || user.email;
}

/** Date ISO -> valeur pour <input type="date"> (YYYY-MM-DD). */
function toDateInputValue(iso: string): string {
  return iso ? iso.slice(0, 10) : '';
}

interface TeamsCyclesAdminPanelProps {
  teams: Team[];
  cycles: PerformanceCycle[];
  /** Recharge les équipes et les cycles depuis le parent après une mutation réussie. */
  onChanged: () => void | Promise<void>;
}

/**
 * Panneau de gestion réservé au CTO/admin (`performanceGlobalAccess`) : créer/renommer les
 * équipes et gérer leurs leads, créer/éditer/activer/clôturer les cycles de performance, et
 * réaffecter un collaborateur à une équipe. Rendu comme un onglet de `TeamPerformancePage`,
 * séparé du suivi des fiches pour ne pas surcharger ce composant déjà volumineux.
 */
export function TeamsCyclesAdminPanel({ teams, cycles, onChanged }: TeamsCyclesAdminPanelProps) {
  const [roster, setRoster] = useState<RosterUser[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const loadRoster = useCallback(async () => {
    setRosterLoading(true);
    setRosterError(null);
    try {
      const res = await teamApi.getRoster();
      if (res.success) setRoster(res.users);
    } catch (err) {
      setRosterError(extractApiErrorMessage(err, 'Impossible de charger la liste des collaborateurs'));
    } finally {
      setRosterLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadRoster();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadRoster]);

  const rosterById = useMemo(() => new Map(roster.map((u) => [u.id, u])), [roster]);

  // --- Équipes ---
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamLeadIds, setNewTeamLeadIds] = useState<string[]>([]);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [teamFormError, setTeamFormError] = useState<string | null>(null);

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [teamDraftName, setTeamDraftName] = useState('');
  const [teamDraftLeadIds, setTeamDraftLeadIds] = useState<string[]>([]);
  const [savingTeamId, setSavingTeamId] = useState<string | null>(null);
  const [teamRowError, setTeamRowError] = useState<string | null>(null);

  async function handleCreateTeam() {
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    setTeamFormError(null);
    try {
      await teamApi.create({ name: newTeamName.trim(), leadIds: newTeamLeadIds });
      setNewTeamName('');
      setNewTeamLeadIds([]);
      setShowNewTeam(false);
      await onChanged();
    } catch (err) {
      setTeamFormError(extractApiErrorMessage(err, "Erreur lors de la création de l'équipe"));
    } finally {
      setCreatingTeam(false);
    }
  }

  function handleStartEditTeam(team: Team) {
    setEditingTeamId(team.id);
    setTeamDraftName(team.name);
    setTeamDraftLeadIds([...team.leadIds]);
    setTeamRowError(null);
  }

  function handleCancelEditTeam() {
    setEditingTeamId(null);
    setTeamRowError(null);
  }

  async function handleSaveTeam(teamId: string) {
    if (!teamDraftName.trim()) return;
    setSavingTeamId(teamId);
    setTeamRowError(null);
    try {
      await teamApi.update(teamId, { name: teamDraftName.trim(), leadIds: teamDraftLeadIds });
      setEditingTeamId(null);
      await onChanged();
    } catch (err) {
      setTeamRowError(extractApiErrorMessage(err, "Erreur lors de la mise à jour de l'équipe"));
    } finally {
      setSavingTeamId(null);
    }
  }

  // --- Cycles ---
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [newCycleLabel, setNewCycleLabel] = useState('');
  const [newCycleStart, setNewCycleStart] = useState('');
  const [newCycleEnd, setNewCycleEnd] = useState('');
  const [creatingCycle, setCreatingCycle] = useState(false);
  const [cycleFormError, setCycleFormError] = useState<string | null>(null);

  const [editingCycleId, setEditingCycleId] = useState<string | null>(null);
  const [cycleDraftLabel, setCycleDraftLabel] = useState('');
  const [cycleDraftStart, setCycleDraftStart] = useState('');
  const [cycleDraftEnd, setCycleDraftEnd] = useState('');
  const [savingCycleId, setSavingCycleId] = useState<string | null>(null);
  const [cycleRowError, setCycleRowError] = useState<string | null>(null);

  async function handleCreateCycle() {
    if (!newCycleLabel.trim() || !newCycleStart || !newCycleEnd) return;
    setCreatingCycle(true);
    setCycleFormError(null);
    try {
      await performanceApi.createCycle({
        label: newCycleLabel.trim(),
        startDate: newCycleStart,
        endDate: newCycleEnd
      });
      setNewCycleLabel('');
      setNewCycleStart('');
      setNewCycleEnd('');
      setShowNewCycle(false);
      await onChanged();
    } catch (err) {
      setCycleFormError(extractApiErrorMessage(err, 'Erreur lors de la création du cycle'));
    } finally {
      setCreatingCycle(false);
    }
  }

  function handleStartEditCycle(cycle: PerformanceCycle) {
    setEditingCycleId(cycle.id);
    setCycleDraftLabel(cycle.label);
    setCycleDraftStart(toDateInputValue(cycle.startDate));
    setCycleDraftEnd(toDateInputValue(cycle.endDate));
    setCycleRowError(null);
  }

  function handleCancelEditCycle() {
    setEditingCycleId(null);
    setCycleRowError(null);
  }

  async function handleSaveCycle(cycleId: string) {
    if (!cycleDraftLabel.trim() || !cycleDraftStart || !cycleDraftEnd) return;
    setSavingCycleId(cycleId);
    setCycleRowError(null);
    try {
      await performanceApi.updateCycle(cycleId, {
        label: cycleDraftLabel.trim(),
        startDate: cycleDraftStart,
        endDate: cycleDraftEnd
      });
      setEditingCycleId(null);
      await onChanged();
    } catch (err) {
      setCycleRowError(extractApiErrorMessage(err, 'Erreur lors de la mise à jour du cycle'));
    } finally {
      setSavingCycleId(null);
    }
  }

  async function handleSetCycleStatus(cycleId: string, status: PerformanceCycleStatus) {
    setSavingCycleId(cycleId);
    setCycleRowError(null);
    try {
      await performanceApi.updateCycle(cycleId, { status });
      await onChanged();
    } catch (err) {
      setCycleRowError(extractApiErrorMessage(err, 'Erreur lors du changement de statut du cycle'));
    } finally {
      setSavingCycleId(null);
    }
  }

  // --- Réaffectation ---
  const [reassignUserId, setReassignUserId] = useState('');
  const [reassignTeamId, setReassignTeamId] = useState('');
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignSuccess, setReassignSuccess] = useState<string | null>(null);

  async function handleReassign() {
    if (!reassignUserId) return;
    setReassigning(true);
    setReassignError(null);
    setReassignSuccess(null);
    try {
      await teamApi.assignMember(reassignUserId, reassignTeamId || null);
      setReassignSuccess('Le collaborateur a été réaffecté.');
      setReassignUserId('');
      setReassignTeamId('');
      await loadRoster();
    } catch (err) {
      setReassignError(extractApiErrorMessage(err, 'Erreur lors de la réaffectation'));
    } finally {
      setReassigning(false);
    }
  }

  const sortedCycles = useMemo(
    () => [...cycles].sort((a, b) => (a.startDate < b.startDate ? 1 : -1)),
    [cycles]
  );

  const activeCycle = useMemo(
    () => cycles.find((c) => c.status === 'active') ?? cycles[0] ?? null,
    [cycles]
  );
  const [importCycleId, setImportCycleId] = useState('');
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<OkrImportResult | null>(null);

  useEffect(() => {
    if (activeCycle && !importCycleId) setImportCycleId(activeCycle.id);
  }, [activeCycle, importCycleId]);

  async function handleImportOkr(dryRun: boolean) {
    if (!importCycleId || importFiles.length === 0) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await performanceApi.importOkr({ files: importFiles, cycleId: importCycleId, dryRun });
      setImportResult(result);
      if (!dryRun) onChanged();
    } catch (err) {
      setImportError(extractApiErrorMessage(err, 'Erreur lors de l’import des fichiers d’entretien'));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card-glass p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-surface-100">Import des entretiens</h3>
          <p className="text-xs text-surface-500 mt-1">
            Ta session sert d’authentification (rien n’est stocké côté serveur). Dépose les .xlsx /
            .ods : le nom de fichier est rattaché à l’email Entra (`b` + `deguil-robin`).
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="import-cycle" className="block text-xs text-surface-400 mb-1">
              Cycle
            </label>
            <select
              id="import-cycle"
              className="input"
              value={importCycleId}
              onChange={(e) => setImportCycleId(e.target.value)}
            >
              {cycles.map((cyc) => (
                <option key={cyc.id} value={cyc.id}>
                  {cyc.label} ({CYCLE_STATUS_LABELS[cyc.status]})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="import-files" className="block text-xs text-surface-400 mb-1">
              Fichiers d’entretien
            </label>
            <input
              id="import-files"
              type="file"
              multiple
              accept=".xlsx,.ods"
              className="block w-full text-sm text-surface-300 file:mr-3 file:btn-secondary file:text-sm"
              onChange={(e) => setImportFiles(Array.from(e.target.files ?? []))}
            />
            {importFiles.length > 0 && (
              <p className="text-xs text-surface-500 mt-1">{importFiles.length} fichier(s) sélectionné(s)</p>
            )}
          </div>
        </div>
        {importError && <p className="text-xs text-danger-400">{importError}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={importing || !importCycleId || importFiles.length === 0}
            onClick={() => handleImportOkr(true)}
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Prévisualiser
          </button>
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={importing || !importCycleId || importFiles.length === 0}
            onClick={() => handleImportOkr(false)}
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Importer
          </button>
        </div>
        {importResult && (
          <div className="border border-surface-700/50 rounded-xl p-3 space-y-2 text-sm">
            <p className="text-surface-300">
              {importResult.dryRun ? 'Prévisualisation' : 'Import'} — {importResult.cycle.label} :{' '}
              {importResult.entries.filter((e) => e.outcome === 'ready').length} prêt(s),{' '}
              {importResult.entries.filter((e) => e.outcome !== 'ready').length} bloqué(s)
              {!importResult.dryRun &&
                `, ${importResult.writes.filter((w) => w.ok).length} écrit(s)`}
            </p>
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {importResult.entries.map((entry) => (
                <li key={entry.relativePath} className="text-xs text-surface-400">
                  {entry.outcome === 'ready' ? '✓' : '✗'} {entry.name}
                  {entry.email ? ` (${entry.email})` : ''} — {entry.outcome}
                  {entry.errors.length > 0 ? ` : ${entry.errors.join(' ; ')}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Équipes */}
      <div className="card-glass p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-surface-100">Équipes</h3>
          {!showNewTeam && (
            <button type="button" className="btn-secondary text-sm" onClick={() => setShowNewTeam(true)}>
              <Plus className="w-4 h-4" />
              Créer une équipe
            </button>
          )}
        </div>

        {showNewTeam && (
          <div className="border border-dashed border-surface-700/50 rounded-xl p-4 space-y-3">
            <input
              type="text"
              className="input"
              placeholder="Nom de l'équipe"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
            />
            <div>
              <p className="text-xs text-surface-400 mb-1.5">Leads</p>
              <div className="max-h-40 overflow-y-auto space-y-1 border border-surface-700/50 rounded-lg p-2">
                {roster.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm text-surface-300">
                    <input
                      type="checkbox"
                      className="rounded border-surface-600"
                      checked={newTeamLeadIds.includes(u.id)}
                      onChange={() => setNewTeamLeadIds((prev) => toggleId(prev, u.id))}
                    />
                    {userLabel(u)}
                  </label>
                ))}
              </div>
            </div>
            {teamFormError && <p className="text-xs text-danger-400">{teamFormError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={creatingTeam || !newTeamName.trim()}
                onClick={handleCreateTeam}
              >
                {creatingTeam ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Créer
              </button>
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={() => {
                  setShowNewTeam(false);
                  setNewTeamName('');
                  setNewTeamLeadIds([]);
                  setTeamFormError(null);
                }}
              >
                <X className="w-4 h-4" />
                Annuler
              </button>
            </div>
          </div>
        )}

        {teams.length === 0 ? (
          <p className="text-sm text-surface-400">Aucune équipe pour le moment.</p>
        ) : (
          <div className="space-y-3">
            {teams.map((team) =>
              editingTeamId === team.id ? (
                <div key={team.id} className="border border-surface-700/50 rounded-xl p-4 space-y-3">
                  <input
                    type="text"
                    className="input"
                    value={teamDraftName}
                    onChange={(e) => setTeamDraftName(e.target.value)}
                  />
                  <div>
                    <p className="text-xs text-surface-400 mb-1.5">Leads</p>
                    <div className="max-h-40 overflow-y-auto space-y-1 border border-surface-700/50 rounded-lg p-2">
                      {roster.map((u) => (
                        <label key={u.id} className="flex items-center gap-2 text-sm text-surface-300">
                          <input
                            type="checkbox"
                            className="rounded border-surface-600"
                            checked={teamDraftLeadIds.includes(u.id)}
                            onChange={() => setTeamDraftLeadIds((prev) => toggleId(prev, u.id))}
                          />
                          {userLabel(u)}
                        </label>
                      ))}
                    </div>
                  </div>
                  {teamRowError && <p className="text-xs text-danger-400">{teamRowError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-primary text-sm"
                      disabled={savingTeamId === team.id || !teamDraftName.trim()}
                      onClick={() => handleSaveTeam(team.id)}
                    >
                      {savingTeamId === team.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Enregistrer
                    </button>
                    <button type="button" className="btn-ghost text-sm" onClick={handleCancelEditTeam}>
                      <X className="w-4 h-4" />
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={team.id}
                  className="flex items-center justify-between border border-surface-700/50 rounded-xl p-4"
                >
                  <div>
                    <p className="font-medium text-surface-200">{team.name}</p>
                    <p className="text-xs text-surface-500 mt-1">
                      {team.leadIds.length === 0
                        ? 'Aucun lead'
                        : team.leadIds
                            .map((id) => (rosterById.has(id) ? userLabel(rosterById.get(id)!) : id))
                            .join(', ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost text-xs px-3 py-1.5"
                    onClick={() => handleStartEditTeam(team)}
                  >
                    Modifier
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Cycles */}
      <div className="card-glass p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-surface-100">Cycles de performance</h3>
          {!showNewCycle && (
            <button type="button" className="btn-secondary text-sm" onClick={() => setShowNewCycle(true)}>
              <Plus className="w-4 h-4" />
              Créer un cycle
            </button>
          )}
        </div>

        {showNewCycle && (
          <div className="border border-dashed border-surface-700/50 rounded-xl p-4 space-y-3">
            <input
              type="text"
              className="input"
              placeholder="Libellé (ex. S2-2026)"
              value={newCycleLabel}
              onChange={(e) => setNewCycleLabel(e.target.value)}
            />
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="new-cycle-start" className="block text-xs text-surface-400 mb-1">
                  Date de début
                </label>
                <input
                  id="new-cycle-start"
                  type="date"
                  className="input"
                  value={newCycleStart}
                  onChange={(e) => setNewCycleStart(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="new-cycle-end" className="block text-xs text-surface-400 mb-1">
                  Date de fin
                </label>
                <input
                  id="new-cycle-end"
                  type="date"
                  className="input"
                  value={newCycleEnd}
                  onChange={(e) => setNewCycleEnd(e.target.value)}
                />
              </div>
            </div>
            {cycleFormError && <p className="text-xs text-danger-400">{cycleFormError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={creatingCycle || !newCycleLabel.trim() || !newCycleStart || !newCycleEnd}
                onClick={handleCreateCycle}
              >
                {creatingCycle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Créer
              </button>
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={() => {
                  setShowNewCycle(false);
                  setNewCycleLabel('');
                  setNewCycleStart('');
                  setNewCycleEnd('');
                  setCycleFormError(null);
                }}
              >
                <X className="w-4 h-4" />
                Annuler
              </button>
            </div>
          </div>
        )}

        {sortedCycles.length === 0 ? (
          <p className="text-sm text-surface-400">Aucun cycle pour le moment.</p>
        ) : (
          <div className="space-y-3">
            {sortedCycles.map((cyc) =>
              editingCycleId === cyc.id ? (
                <div key={cyc.id} className="border border-surface-700/50 rounded-xl p-4 space-y-3">
                  <input
                    type="text"
                    className="input"
                    value={cycleDraftLabel}
                    onChange={(e) => setCycleDraftLabel(e.target.value)}
                  />
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="cycle-draft-start" className="block text-xs text-surface-400 mb-1">
                        Date de début
                      </label>
                      <input
                        id="cycle-draft-start"
                        type="date"
                        className="input"
                        value={cycleDraftStart}
                        onChange={(e) => setCycleDraftStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="cycle-draft-end" className="block text-xs text-surface-400 mb-1">
                        Date de fin
                      </label>
                      <input
                        id="cycle-draft-end"
                        type="date"
                        className="input"
                        value={cycleDraftEnd}
                        onChange={(e) => setCycleDraftEnd(e.target.value)}
                      />
                    </div>
                  </div>
                  {cycleRowError && <p className="text-xs text-danger-400">{cycleRowError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-primary text-sm"
                      disabled={savingCycleId === cyc.id || !cycleDraftLabel.trim() || !cycleDraftStart || !cycleDraftEnd}
                      onClick={() => handleSaveCycle(cyc.id)}
                    >
                      {savingCycleId === cyc.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Enregistrer
                    </button>
                    <button type="button" className="btn-ghost text-sm" onClick={handleCancelEditCycle}>
                      <X className="w-4 h-4" />
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={cyc.id}
                  className="flex items-center justify-between border border-surface-700/50 rounded-xl p-4"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium text-surface-200">{cyc.label}</p>
                      <p className="text-xs text-surface-500 mt-1">
                        {toDateInputValue(cyc.startDate)} — {toDateInputValue(cyc.endDate)}
                      </p>
                    </div>
                    <span className="badge badge-info">{CYCLE_STATUS_LABELS[cyc.status]}</span>
                  </div>
                  <div className="flex gap-2">
                    {cyc.status !== 'active' && (
                      <button
                        type="button"
                        className="btn-secondary text-xs px-3 py-1.5"
                        disabled={savingCycleId === cyc.id}
                        onClick={() => handleSetCycleStatus(cyc.id, 'active')}
                      >
                        Activer
                      </button>
                    )}
                    {cyc.status === 'active' && (
                      <button
                        type="button"
                        className="btn-secondary text-xs px-3 py-1.5"
                        disabled={savingCycleId === cyc.id}
                        onClick={() => handleSetCycleStatus(cyc.id, 'closed')}
                      >
                        Clôturer
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-ghost text-xs px-3 py-1.5"
                      onClick={() => handleStartEditCycle(cyc)}
                    >
                      Modifier
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
        {cycleRowError && !editingCycleId && <p className="text-xs text-danger-400">{cycleRowError}</p>}
      </div>

      {/* Réaffectation d'un collaborateur */}
      <div className="card-glass p-6 space-y-4">
        <h3 className="text-base font-semibold text-surface-100">Réaffecter un collaborateur</h3>

        {rosterLoading ? (
          <div className="p-4 text-center">
            <Loader2 className="w-5 h-5 text-accent-500 animate-spin mx-auto" />
          </div>
        ) : rosterError ? (
          <div className="alert alert-danger">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>{rosterError}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label htmlFor="reassign-user" className="block text-xs text-surface-400 mb-1">
                Collaborateur
              </label>
              <select
                id="reassign-user"
                className="input"
                value={reassignUserId}
                onChange={(e) => setReassignUserId(e.target.value)}
              >
                <option value="">Sélectionner…</option>
                {roster.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userLabel(u)} — {u.teamId ? teams.find((t) => t.id === u.teamId)?.name ?? '' : 'sans équipe'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="reassign-team" className="block text-xs text-surface-400 mb-1">
                Équipe
              </label>
              <select
                id="reassign-team"
                className="input"
                value={reassignTeamId}
                onChange={(e) => setReassignTeamId(e.target.value)}
              >
                <option value="">Aucune équipe (détacher)</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn-primary text-sm"
              disabled={!reassignUserId || reassigning}
              onClick={handleReassign}
            >
              {reassigning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Réaffecter
            </button>
          </div>
        )}

        {reassignError && <p className="text-xs text-danger-400">{reassignError}</p>}
        {reassignSuccess && <p className="text-xs text-success-400">{reassignSuccess}</p>}
      </div>
    </div>
  );
}
