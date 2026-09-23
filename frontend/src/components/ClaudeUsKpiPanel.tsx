import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bot, Loader2, MousePointerClick, Percent, User } from 'lucide-react';
import {
  jiraApi,
  type ClaudeUsBasis,
  type ClaudeUsCounts,
  type ClaudeUsIssuesParams,
  type ClaudeUsKind,
  type ClaudeUsQuarter,
  type ClaudeUsSection,
  type ClaudeUsStats,
} from '../services/api';
import { ClaudeUsDetailModal } from './ClaudeUsDetailModal';

const TILE_CLASS = 'rounded-lg border flex flex-col w-full min-h-[8.25rem] p-[9px] gap-1.5 text-left';

const TONES = {
  claude: { box: 'bg-violet-500/10 border-violet-500/45', icon: 'text-violet-400', title: 'text-violet-100/95', value: 'text-violet-50', hint: 'text-violet-200/85', row: 'border-violet-500/20' },
  neutral: { box: 'bg-surface-800/60 border-surface-600/50', icon: 'text-surface-400', title: 'text-surface-200', value: 'text-surface-100', hint: 'text-surface-400', row: 'border-surface-600/40' },
} as const;

/** Demande d'ouverture du détail : série, type d'US et éventuellement équipe. */
type DetailRequest = { title: string; basis: ClaudeUsBasis; kind: ClaudeUsKind; boardId?: number };

function KpiTile({
  icon: Icon,
  label,
  tone,
  section,
  value,
  emptyHint,
  onOpen,
}: {
  icon: LucideIcon;
  label: string;
  tone: keyof typeof TONES;
  section: ClaudeUsSection | null;
  value: (c: ClaudeUsCounts) => string;
  emptyHint: string;
  /** Ouvre le détail, pour tous les boards (sans argument) ou une équipe. */
  onOpen: (team?: { id: number; name: string }) => void;
}) {
  const t = TONES[tone];
  const valueButton = 'hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 rounded';
  return (
    <div className={`${TILE_CLASS} ${t.box}`}>
      <div className="flex items-start gap-1.5 min-h-0">
        <Icon className={`w-[18px] h-[18px] shrink-0 mt-0.5 ${t.icon}`} aria-hidden />
        <h4 className={`text-[10px] font-semibold uppercase tracking-wide leading-tight line-clamp-2 ${t.title}`}>{label}</h4>
      </div>
      <div className="flex items-center justify-center py-1">
        {section ? (
          <button
            type="button"
            onClick={() => onOpen()}
            title={`${label} — voir le détail`}
            className={`text-3xl font-bold tabular-nums leading-none ${t.value} ${valueButton}`}
          >
            {value(section)}
          </button>
        ) : (
          <span className={`text-3xl font-bold tabular-nums leading-none ${t.value}`}>—</span>
        )}
      </div>
      {section && section.byTeam.length > 0 ? (
        <ul className={`border-t ${t.row} pt-1 space-y-0.5`} aria-label={`${label} par équipe`}>
          {section.byTeam.map((row) => (
            <li key={row.id} className={`flex items-center justify-between gap-2 text-[10px] leading-tight ${t.hint}`}>
              <span className="truncate" title={row.name}>
                {row.name}
              </span>
              <button
                type="button"
                onClick={() => onOpen(row)}
                title={`${label} · ${row.name} — voir le détail`}
                className={`tabular-nums font-semibold ${t.value} ${valueButton}`}
              >
                {value(row)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`text-[9px] text-center leading-tight ${t.hint}`}>
          {section ? `Sur ${section.totalCount} ${emptyHint}.` : 'Chargement…'}
        </p>
      )}
    </div>
  );
}

const formatPercent = (c: ClaudeUsCounts) => `${c.totalCount > 0 ? c.claudePercent.toFixed(1) : '0'} %`;

/** Les 3 encarts d'une série : US Claude, US non Claude, % US IA. */
function ClaudeUsTiles({
  section,
  basis,
  onOpen,
}: {
  section: ClaudeUsSection | null;
  basis: ClaudeUsBasis;
  onOpen: (req: DetailRequest) => void;
}) {
  const suffix = basis === 'done' ? 'terminées' : 'créées';
  const emptyHint = basis === 'done' ? 'US terminée(s)' : 'US créée(s)';
  const tiles: Array<{ icon: LucideIcon; label: string; tone: keyof typeof TONES; kind: ClaudeUsKind; value: (c: ClaudeUsCounts) => string }> = [
    { icon: Bot, label: `US Claude ${suffix}`, tone: 'claude', kind: 'claude', value: (c) => String(c.claudeCount) },
    { icon: User, label: `US non Claude ${suffix}`, tone: 'neutral', kind: 'nonClaude', value: (c) => String(c.nonClaudeCount) },
    { icon: Percent, label: `% US IA ${suffix}`, tone: 'claude', kind: 'all', value: formatPercent },
  ];
  return (
    <>
      {tiles.map((tile) => (
        <KpiTile
          key={tile.kind}
          icon={tile.icon}
          label={tile.label}
          tone={tile.tone}
          section={section}
          value={tile.value}
          emptyHint={emptyHint}
          onOpen={(team) =>
            onOpen({
              title: team ? `${tile.label} · ${team.name}` : tile.label,
              basis,
              kind: tile.kind,
              boardId: team?.id,
            })
          }
        />
      ))}
    </>
  );
}

/**
 * Encarts US Claude (issue #39), filtrés sur le trimestre sélectionné et détaillés par équipe :
 * 3 encarts sur les US passées à Done, puis 3 sur les US créées sur la période.
 * Un clic sur une valeur ouvre le détail des US (dates de création, résolution et ajout du label).
 */
export function ClaudeUsKpiPanel({ quarter }: { quarter: ClaudeUsQuarter }) {
  const [stats, setStats] = useState<ClaudeUsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailRequest | null>(null);
  const year = new Date().getFullYear();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    jiraApi
      .getClaudeUsStats(quarter, year)
      .then((res) => {
        if (!cancelled) setStats(res);
      })
      .catch(() => {
        if (!cancelled) setError('Impossible de charger les US Claude depuis Jira.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [quarter, year]);

  const periodLabel = quarter === 'all' ? `Année ${year}` : `${quarter} ${year}`;
  const criterionLabel = stats
    ? stats.criterion.kind === 'filter'
      ? `filtre Jira ${stats.criterion.value}`
      : `label « ${stats.criterion.value} »`
    : '';
  const scopeLabel = stats
    ? stats.done.byTeam.length > 0
      ? `Boards : ${stats.done.byTeam.map((b) => b.name).join(', ')}`
      : 'Périmètre projet (filtres de boards indisponibles)'
    : '';
  const detailParams: ClaudeUsIssuesParams | null = detail
    ? { quarter, year, basis: detail.basis, kind: detail.kind, boardId: detail.boardId }
    : null;

  return (
    <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-end gap-4 justify-between">
        <h3 className="text-sm font-semibold text-surface-200 flex items-center gap-2">
          <Bot className="w-4 h-4 text-violet-400 shrink-0" />
          US réalisées avec Claude (IA)
        </h3>
        <div className="text-xs text-surface-500 flex items-center gap-2">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-label="Chargement" />}
          <span>
            US passées à Done / créées · {periodLabel}
            {criterionLabel && <> · {criterionLabel}</>}
            {scopeLabel && <> · {scopeLabel}</>}
          </span>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 xl:grid-cols-6">
          <ClaudeUsTiles section={stats?.done ?? null} basis="done" onOpen={setDetail} />
          <ClaudeUsTiles section={stats?.created ?? null} basis="created" onOpen={setDetail} />
        </div>
      )}
      {stats && (
        <p className="text-[11px] text-surface-500 flex items-center gap-1">
          <MousePointerClick className="w-3 h-3" aria-hidden />
          Cliquer sur une valeur affiche le détail des US : dates de création, de résolution et d&apos;ajout du label.
        </p>
      )}

      {detail && detailParams && stats && (
        <ClaudeUsDetailModal
          title={`${detail.title} · ${periodLabel}`}
          params={detailParams}
          periodEnd={stats.toExclusive}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
