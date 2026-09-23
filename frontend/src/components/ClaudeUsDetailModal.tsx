import { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, X } from 'lucide-react';
import { jiraApi, type ClaudeUsIssueRow, type ClaudeUsIssuesParams } from '../services/api';

function jiraSearchUrl(jql: string): string | null {
  const base = (import.meta.env.VITE_JIRA_URL || '').replace(/\/+$/, '');
  return base ? `${base}/issues/?jql=${encodeURIComponent(jql)}` : null;
}

function jiraIssueUrl(key: string): string | null {
  const base = (import.meta.env.VITE_JIRA_URL || '').replace(/\/+$/, '');
  return base ? `${base}/browse/${key}` : null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

/** Label ajouté après la fin de la période : l'US a été étiquetée a posteriori. */
function isLabelledAfterPeriod(row: ClaudeUsIssueRow, periodEnd: string): boolean {
  return !!row.labelAddedAt && new Date(row.labelAddedAt).getTime() >= new Date(`${periodEnd}T00:00:00`).getTime();
}

/** Détail des US Claude d'une série : dates de création, de résolution et d'ajout du label (issue #39). */
export function ClaudeUsDetailModal({
  title,
  params,
  periodEnd,
  onClose,
}: {
  title: string;
  params: ClaudeUsIssuesParams;
  /** Fin (exclue) de la période, YYYY-MM-DD. */
  periodEnd: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ClaudeUsIssueRow[] | null>(null);
  const [jql, setJql] = useState<string | null>(null);
  const [label, setLabel] = useState('claude-us');
  const [error, setError] = useState<string | null>(null);
  const { quarter, year, basis, boardId } = params;

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    jiraApi
      .getClaudeUsIssues({ quarter, year, basis, boardId })
      .then((res) => {
        if (cancelled) return;
        setRows(res.issues);
        setJql(res.jql);
        setLabel(res.label);
      })
      .catch(() => {
        if (!cancelled) setError('Impossible de charger le détail depuis Jira.');
      });
    return () => {
      cancelled = true;
    };
  }, [quarter, year, basis, boardId]);

  const lateCount = rows ? rows.filter((r) => isLabelledAfterPeriod(r, periodEnd)).length : 0;
  const searchUrl = jql ? jiraSearchUrl(jql) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        className="bg-surface-900 border border-surface-700 rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <h3 className="text-lg font-semibold text-surface-100 pr-4">
            {title}
            {rows && <span className="text-surface-500 font-normal"> · {rows.length} US</span>}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="p-2 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-surface-200 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-4 pt-3 text-xs text-surface-500 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            « Label ajouté le » provient de l&apos;historique Jira du ticket (label « {label} »).
          </span>
          {searchUrl && (
            <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-violet-300 hover:underline">
              <ExternalLink className="w-3 h-3" aria-hidden />
              Ouvrir la recherche dans Jira
            </a>
          )}
        </div>
        {lateCount > 0 && (
          <p className="mx-4 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
            {lateCount} US étiquetée(s) après la fin de la période : le label a été ajouté a posteriori.
          </p>
        )}
        <div className="p-4 overflow-auto flex-1 min-h-0">
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!error && !rows && (
            <p className="text-sm text-surface-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Chargement…
            </p>
          )}
          {rows && rows.length === 0 && <p className="text-sm text-surface-500">Aucune US.</p>}
          {rows && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-700/50">
                    {['Clé', 'Résumé', 'Statut', 'Créée le', 'Résolue le', 'Label ajouté le'].map((h) => (
                      <th key={h} className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const late = isLabelledAfterPeriod(row, periodEnd);
                    const issueUrl = jiraIssueUrl(row.key);
                    return (
                      <tr key={row.key} className="border-b border-surface-700/30">
                        <td className="py-2 px-3 align-top whitespace-nowrap">
                          {issueUrl ? (
                            <a href={issueUrl} target="_blank" rel="noopener noreferrer" className="text-violet-300 hover:underline">
                              {row.key}
                            </a>
                          ) : (
                            <span className="text-surface-200">{row.key}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-surface-200 align-top max-w-[22rem]" title={row.summary}>
                          <span className="line-clamp-2">{row.summary || '—'}</span>
                        </td>
                        <td className="py-2 px-3 text-surface-400 align-top whitespace-nowrap">{row.status || '—'}</td>
                        <td className="py-2 px-3 text-surface-300 align-top tabular-nums">{formatDate(row.created)}</td>
                        <td className="py-2 px-3 text-surface-300 align-top tabular-nums">{formatDate(row.resolved)}</td>
                        <td
                          className={`py-2 px-3 align-top tabular-nums ${late ? 'text-amber-300 font-medium' : 'text-surface-300'}`}
                          title={late ? 'Label ajouté après la fin de la période' : undefined}
                        >
                          {row.labelAddedAt ? formatDate(row.labelAddedAt) : 'Non trouvé'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
