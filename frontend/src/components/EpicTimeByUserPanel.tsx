import { AlertTriangle, Loader2, Users } from 'lucide-react';
import type { EpicTimeByUserResponse } from '../services/api';
import { formatEuros, formatHoursOnly } from '../utils/timeFormat';
import { formatRates } from '../domain/hourlyRates';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

const NO_ROLE = 'Poste non renseigné';

/**
 * Temps passé par personne et par rôle sur tous les tickets de l'épic (worklogs Jira, sans filtre
 * de date), avec le poste = rôle de l'utilisateur dans l'app (issue #44). Les coûts ne sont affichés
 * que si le serveur les renvoie (super admin et rôles avec accès aux coûts). Données chargées par
 * la modale (`useEpicTimeByUser`) : null tant que la lecture des worklogs est en cours.
 */
export function EpicTimeByUserPanel({
  data,
  error,
  ticketTimeSpentSeconds,
}: {
  data: EpicTimeByUserResponse | null;
  error: string | null;
  /** « Temps passé » affiché par la modale (champ timespent des tickets), pour signaler un écart. */
  ticketTimeSpentSeconds: number;
}) {

  const showCosts = data?.totalCost !== undefined;
  // Écart de plus d'une minute entre la somme des worklogs et le temps passé des tickets.
  const gapSeconds = data ? data.totalSeconds - ticketTimeSpentSeconds : 0;
  const hasGap = data !== null && Math.abs(gapSeconds) >= 60;

  return (
    <div className="rounded-xl border border-surface-700/60 bg-surface-800/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-surface-200 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary-400 shrink-0" aria-hidden />
          Temps passé par personne
        </h3>
        {data && (
          <span className="text-xs text-surface-500">
            {data.people.length} personne(s) · {formatHoursOnly(data.totalSeconds)} sur {data.issueCount} ticket(s)
            {showCosts && <> · {formatEuros(data.totalCost ?? 0)}</>}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {!error && !data && (
        <p className="text-sm text-surface-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Lecture des worklogs…
        </p>
      )}
      {data && data.people.length === 0 && <p className="text-sm text-surface-500">Aucun temps saisi sur cette épic.</p>}

      {data && data.byRole.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Répartition par rôle">
          {data.byRole.map((r) => (
            <li
              key={r.role ?? '__none__'}
              className={`rounded-lg border px-2.5 py-1 text-xs flex items-center gap-2 ${
                r.role ? 'border-primary-500/40 bg-primary-500/10 text-primary-100' : 'border-surface-600/60 bg-surface-800/60 text-surface-400'
              }`}
              title={`${r.peopleCount} personne(s)`}
            >
              <span className="font-medium">{r.role ?? NO_ROLE}</span>
              <span className="tabular-nums">{formatHoursOnly(r.timeSpentSeconds)}</span>
              <span className="tabular-nums text-surface-400">{r.percent.toFixed(1)} %</span>
              {showCosts && (
                <span
                  className="tabular-nums font-semibold"
                  title={r.peopleWithoutCost ? `${r.peopleWithoutCost} personne(s) sans coût horaire` : undefined}
                >
                  {r.cost == null ? '— €' : formatEuros(r.cost)}
                  {r.cost != null && r.peopleWithoutCost ? ' *' : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {data && data.people.length > 0 && (
        <ul className="space-y-2" aria-label="Temps passé par personne">
          {data.people.map((p) => (
            <li
              key={p.accountId}
              className={`grid items-center gap-x-3 gap-y-1 ${
                showCosts
                  ? 'grid-cols-[2rem_minmax(0,1fr)_auto_auto] sm:grid-cols-[2rem_minmax(0,14rem)_minmax(0,1fr)_auto_6rem]'
                  : 'grid-cols-[2rem_minmax(0,1fr)_auto] sm:grid-cols-[2rem_minmax(0,14rem)_minmax(0,1fr)_auto]'
              }`}
            >
              {p.avatarUrl ? (
                <img src={p.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <span className="w-8 h-8 rounded-full bg-surface-700 text-surface-300 text-xs font-semibold flex items-center justify-center" aria-hidden>
                  {initials(p.displayName)}
                </span>
              )}
              <div className="min-w-0">
                <div className="text-sm text-surface-100 truncate" title={p.displayName}>
                  {p.displayName}
                </div>
                <div className="text-xs text-surface-500 truncate">
                  {p.role ?? NO_ROLE} · {p.issueCount} ticket(s)
                </div>
              </div>
              <div
                className="hidden sm:block h-2 rounded-full bg-surface-700/60 overflow-hidden"
                title={`Du ${formatDate(p.firstWorklogAt)} au ${formatDate(p.lastWorklogAt)}`}
              >
                <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.min(100, p.percent)}%` }} />
              </div>
              <div className="text-right tabular-nums whitespace-nowrap">
                <span className="text-sm font-semibold text-surface-100">{formatHoursOnly(p.timeSpentSeconds)}</span>
                <span className="text-xs text-surface-500 ml-2">{p.percent.toFixed(1)} %</span>
              </div>
              {showCosts && (
                <div
                  className="text-right tabular-nums whitespace-nowrap text-sm"
                  title={p.hourlyRates?.length ? formatRates(p.hourlyRates) : 'Coût horaire non renseigné'}
                >
                  {p.cost == null ? <span className="text-surface-500">— €</span> : <span className="font-semibold text-amber-200">{formatEuros(p.cost)}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {showCosts && !!data?.peopleWithoutCost && (
        <p className="text-xs text-surface-500">
          * {data.peopleWithoutCost} personne(s) sans coût horaire (ou non retrouvée(s) dans la gestion des utilisateurs) : leur
          temps n&apos;est pas compté dans les coûts.
        </p>
      )}

      {hasGap && (
        <p className="text-xs text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
          Écart de {formatHoursOnly(Math.abs(gapSeconds))} avec le « Temps passé » des tickets (
          {formatHoursOnly(ticketTimeSpentSeconds)}) : worklogs illisibles ou saisis hors des tickets de l&apos;épic.
        </p>
      )}
    </div>
  );
}
