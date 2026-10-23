import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Gauge, Loader2, Pencil, RefreshCw, Save, X } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { wipApi } from '../services/api';
import { useStore } from '../store/useStore';
import {
  buildWipRows,
  defaultWipPeriod,
  formatMeasuredAt,
  formatWeekRange,
  NO_TEAM,
  parseTeamDrafts,
  teamThreshold,
  thresholdLabel,
  validateWipPeriod,
  type WipRow,
  type WipSettings,
  type WipWeeklyData,
} from '../domain/wipChart';

/** Couleurs des équipes, attribuées dans l'ordre de la liste complète (une équipe garde sa couleur quel que soit le filtre). */
const TEAM_COLORS = ['#8b5cf6', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];
const NO_TEAM_COLOR = '#9ca3af';
const WIP_COLOR = '#22d3ee';
const DONE_COLOR = '#475569';
const OVER_COLOR = '#ef4444';

function errorMessage(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { error?: string; errors?: string[] } }; message?: string };
  return err?.response?.data?.errors?.join(' · ') || err?.response?.data?.error || err?.message || fallback;
}

function teamColor(allTeams: string[], team: string): string {
  if (team === NO_TEAM) return NO_TEAM_COLOR;
  const i = allTeams.filter((t) => t !== NO_TEAM).indexOf(team);
  return TEAM_COLORS[i % TEAM_COLORS.length];
}

/** Point de la courbe WIP : rouge et plus gros en cas de dépassement du seuil. */
export function WipDot(props: { cx?: number; cy?: number; payload?: WipRow }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const over = payload?.over === true;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={over ? 6 : 4}
      fill={over ? OVER_COLOR : WIP_COLOR}
      stroke="#0f172a"
      strokeWidth={2}
      data-over={over ? 'true' : 'false'}
    />
  );
}

/** Infobulle d'une semaine : dates, WIP, terminés, seuil, écart et dépassement. */
export function WipTooltipContent({ row, teams }: { row: WipRow; teams: string[] }) {
  return (
    <div className="rounded-lg border border-surface-700 bg-surface-900/95 p-3 text-xs shadow-xl">
      <p className="font-semibold text-surface-100">Semaine du {formatWeekRange(row.weekStart, row.weekEnd)}</p>
      {row.measuredAt && <p className="mb-1 text-surface-500">Mesure : {formatMeasuredAt(row.measuredAt)}</p>}
      <p className="text-surface-300">
        WIP : <span className="font-semibold tabular-nums text-surface-100">{row.wip}</span>
      </p>
      <p className="text-surface-300">
        Terminés : <span className="font-semibold tabular-nums text-surface-100">{row.done}</span>
      </p>
      <p className="text-surface-300">
        Seuil : <span className="tabular-nums text-surface-100">{row.threshold ?? 'non défini'}</span>
        {row.gap !== null && (
          <span className="ml-1 tabular-nums text-surface-400">(écart {row.gap > 0 ? `+${row.gap}` : row.gap})</span>
        )}
      </p>
      {row.over && (
        <p className="mt-1 flex items-center gap-1 font-medium text-red-400">
          <AlertTriangle className="h-3 w-3" /> Seuil dépassé
        </p>
      )}
      {teams.length > 1 && (
        <ul className="mt-2 space-y-0.5 border-t border-surface-700 pt-2 text-surface-400">
          {teams.map((t) => (
            <li key={t}>
              {t} : <span className="tabular-nums text-surface-200">{row.teams[t] ?? 0}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type TeamDraft = { team: string; devCount: string; maxPerDev: string };

/**
 * Page « Suivi WIP » (spec issue #79) : WIP en fin de semaine et tickets terminés, au global et par
 * équipe Jira, comparés au seuil devs × tickets max par dev. Réglages modifiables par le super admin.
 */
export function WipPage() {
  const kpiRefreshTrigger = useStore((s) => s.kpiRefreshTrigger);
  const [period, setPeriod] = useState(() => defaultWipPeriod());
  const [draftFrom, setDraftFrom] = useState(period.from);
  const [draftTo, setDraftTo] = useState(period.to);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [data, setData] = useState<WipWeeklyData | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [teamDrafts, setTeamDrafts] = useState<TeamDraft[]>([]);
  const [defaultMaxDraft, setDefaultMaxDraft] = useState('3');
  const [startDraft, setStartDraft] = useState('');
  const [endDraft, setEndDraft] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await wipApi.getWeekly(period.from, period.to);
      setData(res.data);
      setCanEdit(res.canEdit);
    } catch (e) {
      setError(errorMessage(e, 'Impossible de charger le WIP'));
    } finally {
      setLoading(false);
    }
  }, [period.from, period.to]);

  useEffect(() => {
    load();
  }, [load]);

  // Rechargement après une synchronisation (bouton « Synchroniser » ou planifiée).
  useEffect(() => {
    if (kpiRefreshTrigger > 0) load();
  }, [kpiRefreshTrigger, load]);

  const applyPeriod = () => {
    const err = validateWipPeriod(draftFrom, draftTo);
    setPeriodError(err);
    if (!err) setPeriod({ from: draftFrom, to: draftTo });
  };

  const toggleTeam = (team: string) =>
    setSelected((prev) => (prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team]));

  const chart = useMemo(() => (data ? buildWipRows(data, selected) : null), [data, selected]);
  const allTeams = data?.teams ?? [];
  const showTeamLines = (chart?.teams.length ?? 0) > 1 && selected.length > 1;
  const lastRow = chart?.rows[chart.rows.length - 1];

  const startEditing = () => {
    if (!data) return;
    const s = data.settings;
    // Équipes des données et des réglages, dédoublonnées sans tenir compte de la casse (comme les seuils).
    const teams: string[] = [];
    for (const t of [...allTeams.filter((name) => name !== NO_TEAM), ...s.teams.map((row) => row.team)]) {
      if (!teams.some((x) => x.toLowerCase() === t.toLowerCase())) teams.push(t);
    }
    setTeamDrafts(
      teams.map((team) => {
        const row = s.teams.find((t) => t.team.toLowerCase() === team.toLowerCase());
        return { team, devCount: row ? String(row.devCount) : '', maxPerDev: row?.maxPerDev != null ? String(row.maxPerDev) : '' };
      })
    );
    setDefaultMaxDraft(String(s.defaultMaxPerDev));
    setStartDraft(s.startStatuses.join(', '));
    setEndDraft(s.endStatuses.join(', '));
    setSaveError(null);
    setEditing(true);
  };

  const saveSettings = async () => {
    const parsed = parseTeamDrafts(teamDrafts);
    if (!parsed.ok) {
      setSaveError(parsed.error);
      return;
    }
    const splitStatuses = (raw: string) => raw.split(',').map((s) => s.trim()).filter(Boolean);
    const settings: WipSettings = {
      startStatuses: splitStatuses(startDraft),
      endStatuses: splitStatuses(endDraft),
      defaultMaxPerDev: Number(defaultMaxDraft),
      teams: parsed.teams,
    };
    setSaving(true);
    setSaveError(null);
    try {
      const res = await wipApi.saveSettings(settings);
      const statusesChanged =
        data !== null &&
        (data.settings.startStatuses.join('|') !== res.settings.startStatuses.join('|') ||
          data.settings.endStatuses.join('|') !== res.settings.endStatuses.join('|'));
      setData((prev) => (prev ? { ...prev, settings: res.settings } : prev));
      setEditing(false);
      if (statusesChanged) load();
    } catch (e) {
      setSaveError(errorMessage(e, "Impossible d'enregistrer les réglages"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-8">
      <header className="flex items-center gap-3">
        <div className="rounded-lg bg-primary-500/20 p-2">
          <Gauge className="h-6 w-6 text-primary-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-surface-100">Suivi WIP</h1>
          <p className="text-sm text-surface-400">
            Tickets en cours (de {data?.settings.startStatuses.join(', ') ?? 'In Progress'} à{' '}
            {data?.settings.endStatuses.join(', ') ?? 'Go Prod'}), mesurés chaque vendredi à 14:00, et tickets terminés depuis la mesure précédente.
          </p>
        </div>
      </header>

      <section className="card-glass flex flex-wrap items-end gap-4 p-4" aria-label="Filtres">
        <label className="text-sm text-surface-300">
          Du
          <input
            type="date"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            className="ml-2 rounded-lg border border-surface-700 bg-surface-800 px-2 py-1 text-surface-100"
          />
        </label>
        <label className="text-sm text-surface-300">
          Au
          <input
            type="date"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            className="ml-2 rounded-lg border border-surface-700 bg-surface-800 px-2 py-1 text-surface-100"
          />
        </label>
        <button type="button" onClick={applyPeriod} className="btn-primary px-3 py-1.5 text-sm">
          Appliquer
        </button>
        <button type="button" onClick={load} className="flex items-center gap-1 text-sm text-surface-400 hover:text-surface-200" title="Recharger">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Recharger
        </button>
        {periodError && (
          <p role="alert" className="w-full text-sm text-amber-400">
            {periodError}
          </p>
        )}
        {allTeams.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-2" role="group" aria-label="Équipes">
            <span className="text-sm text-surface-400">Équipes :</span>
            <button
              type="button"
              aria-pressed={selected.length === 0}
              onClick={() => setSelected([])}
              className={`rounded-full px-3 py-1 text-xs ${selected.length === 0 ? 'bg-primary-500/30 text-primary-200' : 'bg-surface-800 text-surface-400'}`}
            >
              Toutes
            </button>
            {allTeams.map((team) => (
              <button
                key={team}
                type="button"
                aria-pressed={selected.includes(team)}
                onClick={() => toggleTeam(team)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${
                  selected.includes(team) ? 'bg-primary-500/30 text-primary-200' : 'bg-surface-800 text-surface-400'
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: teamColor(allTeams, team) }} />
                {team}
              </button>
            ))}
          </div>
        )}
      </section>

      {error && (
        <div role="alert" className="card-glass p-6 text-center text-amber-400">
          <p>{error}</p>
          <button type="button" onClick={load} className="mt-2 text-sm text-primary-400 hover:underline">
            Réessayer
          </button>
        </div>
      )}

      {loading && !data && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-accent-500" aria-label="Chargement" />
        </div>
      )}

      {chart && data && (
        <>
          <section className="grid gap-4 sm:grid-cols-3" aria-label="Indicateurs">
            <div className="card-glass p-4">
              <p className="text-sm text-surface-400">WIP fin de période</p>
              <p className={`text-3xl font-bold tabular-nums ${lastRow?.over ? 'text-red-400' : 'text-surface-100'}`}>{lastRow?.wip ?? 0}</p>
              {lastRow?.over && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-400">
                  <AlertTriangle className="h-3 w-3" /> Seuil dépassé de {lastRow.gap}
                </p>
              )}
            </div>
            <div className="card-glass p-4">
              <p className="text-sm text-surface-400">Terminés dernière semaine</p>
              <p className="text-3xl font-bold tabular-nums text-surface-100">{lastRow?.done ?? 0}</p>
            </div>
            <div className="card-glass p-4">
              <p className="text-sm text-surface-400">{selected.length === 0 ? 'Seuil global' : 'Seuil de la sélection'}</p>
              <p className="text-3xl font-bold tabular-nums text-surface-100">{chart.threshold.value ?? '–'}</p>
              <p className="mt-1 text-xs text-surface-400">{thresholdLabel(chart.threshold)}</p>
            </div>
          </section>

          <section className="card-glass p-6" aria-label="Graphique WIP par semaine">
            <h2 className="mb-1 text-lg font-semibold text-surface-100">WIP et terminés par semaine</h2>
            <p className="mb-4 text-xs text-surface-400">
              {data.ticketCount} tickets analysés ·{' '}
              {data.boards && data.boards.length > 0 ? `boards ${data.boards.join(', ')}` : `projets ${data.projectKeys.join(', ') || '—'}`} · mesure le vendredi à 14:00 (heure de Paris), semaine en cours : maintenant
            </p>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart.rows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    content={({ active, payload }) =>
                      active && payload?.[0] ? <WipTooltipContent row={payload[0].payload as WipRow} teams={chart.teams} /> : null
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="done" name="Terminés" fill={DONE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line
                    type="monotone"
                    dataKey="wip"
                    name={selected.length === 0 ? 'WIP global' : 'WIP sélection'}
                    stroke={WIP_COLOR}
                    strokeWidth={2}
                    dot={<WipDot />}
                    isAnimationActive={false}
                  />
                  {showTeamLines &&
                    chart.teams.map((team) => (
                      <Line
                        key={team}
                        type="monotone"
                        dataKey={(row: WipRow) => row.teams[team] ?? 0}
                        name={`WIP ${team}`}
                        stroke={teamColor(allTeams, team)}
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  {chart.threshold.value !== null && (
                    <ReferenceLine
                      y={chart.threshold.value}
                      stroke={OVER_COLOR}
                      strokeDasharray="6 4"
                      label={{ value: thresholdLabel(chart.threshold), position: 'insideTopRight', fill: '#fca5a5', fontSize: 11 }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card-glass p-6" aria-label="Seuils par équipe">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-surface-100">Seuils par équipe</h2>
                <p className="text-xs text-surface-400">
                  Seuil = nombre de devs × tickets max par dev (défaut {data.settings.defaultMaxPerDev}).
                  {!canEdit && ' Seuls les super admins peuvent les modifier.'}
                </p>
              </div>
              {canEdit && !editing && (
                <button type="button" onClick={startEditing} className="flex items-center gap-1 text-sm text-primary-400 hover:underline">
                  <Pencil className="h-4 w-4" /> Modifier les réglages
                </button>
              )}
            </div>

            {!editing ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-surface-400">
                    <th className="py-2 font-medium">Équipe</th>
                    <th className="py-2 font-medium">Devs</th>
                    <th className="py-2 font-medium">Max / dev</th>
                    <th className="py-2 font-medium">Seuil</th>
                    <th className="py-2 font-medium">WIP fin de période</th>
                  </tr>
                </thead>
                <tbody>
                  {allTeams.map((team) => {
                    const row = data.settings.teams.find((t) => t.team.toLowerCase() === team.toLowerCase());
                    const threshold = teamThreshold(data.settings, team);
                    const wip = data.weeks[data.weeks.length - 1]?.byTeam[team]?.wip ?? 0;
                    const over = threshold !== null && wip > threshold;
                    return (
                      <tr key={team} className="border-t border-surface-800 text-surface-200">
                        <td className="py-2">{team}</td>
                        <td className="py-2 tabular-nums">{row?.devCount ?? '–'}</td>
                        <td className="py-2 tabular-nums">{row ? row.maxPerDev ?? data.settings.defaultMaxPerDev : '–'}</td>
                        <td className="py-2 tabular-nums">{threshold ?? <span className="text-surface-500">Seuil non défini</span>}</td>
                        <td className={`py-2 tabular-nums ${over ? 'font-semibold text-red-400' : ''}`}>
                          {wip}
                          {over && <span className="ml-2 text-xs">Seuil dépassé</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="text-sm text-surface-300">
                    Statuts de départ
                    <input
                      value={startDraft}
                      onChange={(e) => setStartDraft(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-2 py-1 text-surface-100"
                    />
                  </label>
                  <label className="text-sm text-surface-300">
                    Statuts d&apos;arrivée
                    <input
                      value={endDraft}
                      onChange={(e) => setEndDraft(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-2 py-1 text-surface-100"
                    />
                  </label>
                  <label className="text-sm text-surface-300">
                    Tickets max par dev (défaut)
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={defaultMaxDraft}
                      onChange={(e) => setDefaultMaxDraft(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-2 py-1 text-surface-100"
                    />
                  </label>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-surface-400">
                      <th className="py-2 font-medium">Équipe</th>
                      <th className="py-2 font-medium">Devs</th>
                      <th className="py-2 font-medium">Max / dev (vide = défaut)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamDrafts.map((d, i) => (
                      <tr key={d.team} className="border-t border-surface-800 text-surface-200">
                        <td className="py-2">{d.team}</td>
                        <td className="py-2">
                          <input
                            type="number"
                            min={0}
                            max={50}
                            aria-label={`Devs ${d.team}`}
                            value={d.devCount}
                            onChange={(e) => setTeamDrafts((prev) => prev.map((p, j) => (j === i ? { ...p, devCount: e.target.value } : p)))}
                            className="w-20 rounded-lg border border-surface-700 bg-surface-800 px-2 py-1 text-surface-100"
                          />
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            min={1}
                            max={20}
                            aria-label={`Max par dev ${d.team}`}
                            value={d.maxPerDev}
                            onChange={(e) => setTeamDrafts((prev) => prev.map((p, j) => (j === i ? { ...p, maxPerDev: e.target.value } : p)))}
                            className="w-20 rounded-lg border border-surface-700 bg-surface-800 px-2 py-1 text-surface-100"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {saveError && (
                  <p role="alert" className="text-sm text-amber-400">
                    {saveError}
                  </p>
                )}
                <div className="flex gap-3">
                  <button type="button" onClick={saveSettings} disabled={saving} className="btn-primary flex items-center gap-1 px-3 py-1.5 text-sm">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
                  </button>
                  <button type="button" onClick={() => setEditing(false)} className="flex items-center gap-1 text-sm text-surface-400 hover:text-surface-200">
                    <X className="h-4 w-4" /> Annuler
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
