import { useEffect, useState, useMemo, useCallback } from 'react';
import { BarChart3, RefreshCw, Ticket, BookMarked } from 'lucide-react';
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart
} from 'recharts';

interface BoardInfo {
  id: number;
  name: string;
  color?: string;
}

interface ResolvedByDayProps {
  dateRange: { from: string; to: string };
  boards: BoardInfo[];
  /** When true, use sprint actif (or last closed) dates instead of dateRange */
  useActiveSprint?: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

type IssueTypeFilter = 'all' | 'Story';

export function ResolvedByDayChart({ dateRange, boards, useActiveSprint = false }: ResolvedByDayProps) {
  const [issueTypeFilter, setIssueTypeFilter] = useState<IssueTypeFilter>('all');
  const [byDay, setByDay] = useState<Array<Record<string, string | number>>>([]);
  const [boardList, setBoardList] = useState<BoardInfo[]>([]);
  const [effectiveDateRange, setEffectiveDateRange] = useState<{ from: string; to: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!useActiveSprint && (!dateRange.from || !dateRange.to)) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ issueType: issueTypeFilter });
      if (useActiveSprint) {
        params.set('activeSprint', 'true');
      } else {
        params.set('from', dateRange.from);
        params.set('to', dateRange.to);
      }
      const response = await fetch(`${API_BASE_URL}/jira/resolved-by-day?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (result.success) {
        setByDay(result.byDay || []);
        setBoardList(result.boards || []);
        setEffectiveDateRange(result.dateRange || { from: dateRange.from, to: dateRange.to });
      } else {
        throw new Error(result.message || 'Erreur inconnue');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur chargement');
      setByDay([]);
      setBoardList([]);
      setEffectiveDateRange(null);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange.from, dateRange.to, useActiveSprint, issueTypeFilter]);

  const displayRange = effectiveDateRange || dateRange;

  useEffect(() => {
    loadData();
  }, [loadData]);

  const chartData = useMemo(() => {
    return byDay.map((row) => {
      const out: Record<string, string | number> = {
        date: row.date as string,
        dateShort: formatDateShort(row.date as string)
      };
      boardList.forEach((b) => {
        out[`board_${b.id}`] = (row[`board_${b.id}`] as number) ?? 0;
      });
      return out;
    });
  }, [byDay, boardList]);

  const barConfig = useMemo(
    () =>
      boardList.map((b) => ({
        key: `board_${b.id}`,
        name: b.name,
        color: b.color || '#8b5cf6'
      })),
    [boardList]
  );

  if (boards.length === 0) {
    return null;
  }

  if (error) {
    return (
      <div className="card-glass p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary-500/20 rounded-lg">
            <BarChart3 className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-surface-100">Tickets résolus par jour</h2>
            <p className="text-sm text-surface-400">Par équipe sur la période</p>
          </div>
        </div>
        <div className="text-center py-8 text-amber-400">
          <p className="text-sm">Impossible de charger les données</p>
          <p className="text-xs mt-1 text-surface-600">{error}</p>
          <button
            type="button"
            onClick={loadData}
            className="mt-3 text-sm text-primary-400 hover:underline"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card-glass p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-500/20 rounded-lg">
            <BarChart3 className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-surface-100">
              Tickets résolus par jour
            </h2>
            <p className="text-sm text-surface-400">
              Par équipe • {useActiveSprint ? 'Sprint actif' : 'Période'} {displayRange.from} → {displayRange.to}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Toggle: Tous les tickets / US uniquement */}
          <div className="flex rounded-lg bg-surface-800 p-0.5 border border-surface-600">
            <button
              type="button"
              onClick={() => setIssueTypeFilter('all')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                issueTypeFilter === 'all'
                  ? 'bg-primary-500/30 text-primary-300 border border-primary-500/50'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              <Ticket className="w-4 h-4" />
              Tous les tickets
            </button>
            <button
              type="button"
              onClick={() => setIssueTypeFilter('Story')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                issueTypeFilter === 'Story'
                  ? 'bg-primary-500/30 text-primary-300 border border-primary-500/50'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              <BookMarked className="w-4 h-4" />
              US uniquement
            </button>
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="p-2 hover:bg-surface-700 rounded-lg transition-colors disabled:opacity-50"
            title="Actualiser"
          >
            <RefreshCw className={`w-4 h-4 text-surface-400 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {chartData.length === 0 && !isLoading ? (
        <div className="text-center py-12 text-surface-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Aucun ticket résolu sur cette période</p>
          <p className="text-xs mt-1 text-surface-600">
            {issueTypeFilter === 'Story' ? 'User Stories uniquement' : 'Tous types de tickets'}
          </p>
        </div>
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,100,120,0.2)" />
              <XAxis
                dataKey="dateShort"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickLine={{ stroke: '#475569' }}
                axisLine={{ stroke: '#475569' }}
              />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickLine={{ stroke: '#475569' }}
                axisLine={{ stroke: '#475569' }}
                allowDecimals={false}
                label={{
                  value: 'Tickets résolus',
                  angle: -90,
                  position: 'insideLeft',
                  fill: '#64748b',
                  fontSize: 11
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(30, 30, 40, 0.95)',
                  border: '1px solid rgba(100, 100, 120, 0.3)',
                  borderRadius: '8px',
                  padding: '12px'
                }}
                labelFormatter={(_, payload) => {
                  const p = payload[0]?.payload;
                  return p?.date ? formatDateLong(p.date as string) : '';
                }}
                formatter={(value: number, name: string) => {
                  const board = boardList.find((b) => `board_${b.id}` === name);
                  return [value, board?.name ?? name];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value) => {
                  const b = boardList.find((x) => `board_${x.id}` === value);
                  return b?.name ?? value;
                }}
              />
              {barConfig.map(({ key, color }) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="resolved"
                  fill={color}
                  radius={[0, 0, 0, 0]}
                  maxBarSize={32}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatDateLong(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}
