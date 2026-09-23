import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bot, Loader2, MousePointerClick, Percent, User } from 'lucide-react';
import {
  jiraApi,
  type ClaudeUsBasis,
  type ClaudeUsCounts,
  type ClaudeUsQuarter,
  type ClaudeUsSection,
  type ClaudeUsStats,
} from '../services/api';
import { ClaudeUsDetailModal } from './ClaudeUsDetailModal';

const TILE_CLASS = 'rounded-lg border flex flex-col w-full min-h-[8.25rem] p-[9px] gap-1.5 text-left';
const VALUE_BUTTON_CLASS = 'hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 rounded';

const TONES = {
  claude: { box: 'bg-violet-500/10 border-violet-500/45', icon: 'text-violet-400', title: 'text-violet-100/95', value: 'text-violet-50', hint: 'text-violet-200/85', row: 'border-violet-500/20' },
  neutral: { box: 'bg-surface-800/60 border-surface-600/50', icon: 'text-surface-400', title: 'text-surface-200', value: 'text-surface-100', hint: 'text-surface-400', row: 'border-surface-600/40' },
} as const;

/** Demande d'ouverture du détail des US Claude d'une série, éventuellement pour une équipe. */
type DetailRequest = { title: string; basis: ClaudeUsBasis; boardId?: number };

type Team = { id: number; name: string };

/** Valeur d'un encart : bouton si le détail est disponible, sinon simple texte. */
function TileValue({
  text,
  className,
  title,
  onOpen,
}: {
  text: string;
  className: string;
  title: string;
  onOpen?: () => void;
}) {
  if (!onOpen) return <span className={className}>{text}</span>;
  return (
    <button type="button" onClick={onOpen} title={title} className={`${className} ${VALUE_BUTTON_CLASS}`}>
      {text}
    </button>
  );
}

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
  /** Si fourni, les valeurs sont cliquables : détail pour tous les boards (sans argument) ou une équipe. */
  onOpen?: (team?: Team) => void;
}) {
  const t = TONES[tone];
  return (
    <div className={`${TILE_CLASS} ${t.box}`}>
      <div className="flex items-start gap-1.5 min-h-0">
        <Icon className={`w-[18px] h-[18px] shrink-0 mt-0.5 ${t.icon}`} aria-hidden />
        <h4 className={`text-[10px] font-semibold uppercase tracking-wide leading-tight line-clamp-2 ${t.title}`}>{label}</h4>
      </div>
      <div className="flex items-center justify-center py-1">
        <TileValue
          text={section ? value(section) : '—'}
          className={`text-3xl font-bold tabular-nums leading-none ${t.value}`}
          title={`${label} — voir le détail`}
          onOpen={section && onOpen ? () => onOpen() : undefined}
        />
      </div>
      {section && section.byTeam.length > 0 ? (
        <ul className={`border-t ${t.row} pt-1 space-y-0.5`} aria-label={`${label} par équipe`}>
          {section.byTeam.map((row) => (
            <li key={row.id} className={`flex items-center justify-between gap-2 text-[10px] leading-tight ${t.hint}`}>
              <span className="truncate" title={row.name}>
                {row.name}
              </span>
              <TileValue
                text={value(row)}
                className={`tabular-nums font-semibold ${t.value}`}
                title={`${label} · ${row.name} — voir le détail`}
                onOpen={onOpen ? () => onOpen(row) : undefined}
              />
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

/** Les 3 encarts d'une série : US Claude (cliquable), US non Claude, % US IA. */
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
  const claudeLabel = `US Claude ${suffix}`;
  return (
    <>
      <KpiTile
        icon={Bot}
        label={claudeLabel}
        tone="claude"
        section={section}
        value={(c) => String(c.claudeCount)}
        emptyHint={emptyHint}
        onOpen={(team) => onOpen({ title: team ? `${claudeLabel} · ${team.name}` : claudeLabel, basis, boardId: team?.id })}
      />
      <KpiTile icon={User} label={`US non Claude ${suffix}`} tone="neutral" section={section} value={(c) => String(c.nonClaudeCount)} emptyHint={emptyHint} />
      <KpiTile icon={Percent} label={`% US IA ${suffix}`} tone="claude" section={section} value={formatPercent} emptyHint={emptyHint} />
    </>
  );
}

/**
 * Encarts US Claude (issue #39), filtrés sur le trimestre sélectionné et détaillés par équipe :
 * 3 encarts sur les US passées à Done, puis 3 sur les US créées sur la période.
 * Un clic sur une valeur « US Claude » ouvre le détail (dates de création, résolution et ajout du label).
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
          Cliquer sur une valeur « US Claude » affiche le détail : dates de création, de résolution et d&apos;ajout du label.
        </p>
      )}

      {detail && stats && (
        <ClaudeUsDetailModal
          title={`${detail.title} · ${periodLabel}`}
          params={{ quarter, year, basis: detail.basis, boardId: detail.boardId }}
          periodEnd={stats.toExclusive}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
