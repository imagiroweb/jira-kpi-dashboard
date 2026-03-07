import { useEffect, useState, useMemo, useCallback } from 'react';
import { BarChart3, RefreshCw, Ticket, Zap } from 'lucide-react';
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

interface TypeInfo {
  name: string;
  color: string;
}

interface ResolvedByDayProps {
  dateRange: { from: string; to: string };
  boards: BoardInfo[];
  /** When true, use sprint actif (or last closed) dates instead of dateRange */
  useActiveSprint?: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

type ModeFilter = 'tickets' | 'points';

export function ResolvedByDayChart({ dateRange, boards, useActiveSprint = false }: ResolvedByDayProps) {
  const [mode, setMode] = useState<ModeFilter>('tickets');
  const [byDay, setByDay] = useState<Array<Record<string, string | number>>>([]);
  const [boardList, setBoardList] = useState<BoardInfo[]>([]);
  const [typeList, setTypeList] = useState<TypeInfo[]>([]);
  const [effectiveDateRange, setEffectiveDateRange] = useState<{ from: string; to: string } | null>(null);
  const [totalResolvedTickets, setTotalResolvedTickets] = useState<number | null>(null);
  const [totalsBySeries, setTotalsBySeries] = useState<Array<{ name: string; total: number }>>([]);
  const [totalsBySeriesPoints, setTotalsBySeriesPoints] = useState<Array<{ name: string; total: number }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!useActiveSprint && (!dateRange.from || !dateRange.to)) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ mode: 'tickets' });
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
        setTypeList(result.types || []);
        setTotalResolvedTickets(result.totalResolvedTickets ?? null);
        setTotalsBySeries(result.totalsBySeries || []);
        setTotalsBySeriesPoints(result.totalsBySeriesPoints || []);
        setEffectiveDateRange(result.dateRange || { from: dateRange.from, to: dateRange.to });
      } else {
        throw new Error(result.message || 'Erreur inconnue');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur chargement');
      setByDay([]);
      setBoardList([]);
      setTypeList([]);
      setTotalResolvedTickets(null);
      setTotalsBySeries([]);
      setTotalsBySeriesPoints([]);
      setEffectiveDateRange(null);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange.from, dateRange.to, useActiveSprint]);

  const displayRange = effectiveDateRange || dateRange;

  useEffect(() => {
    loadData();
  }, [loadData]);

  const byType = typeList.length > 0;

  const chartData = useMemo(() => {
    return byDay.map((row) => {
      const out: Record<string, string | number> = {
        date: row.date as string,
        dateShort: formatDateShort(row.date as string)
      };
      if (byType) {
        typeList.forEach((t) => {
          const key = mode === 'points' ? `${t.name}_points` : t.name;
          out[key] = (row[key] as number) ?? 0;
        });
      } else {
        boardList.forEach((b) => {
          out[`board_${b.id}`] = (row[`board_${b.id}`] as number) ?? 0;
        });
      }
      return out;
    });
  }, [byDay, boardList, typeList, byType, mode]);

  const barConfig = useMemo(() => {
    if (byType) {
      return typeList.map((t) => ({
        key: mode === 'points' ? `${t.name}_points` : t.name,
        name: t.name,
        color: t.color
      }));
    }
    return boardList.map((b) => ({
      key: `board_${b.id}`,
      name: b.name,
      color: b.color || '#8b5cf6'
    }));
  }, [byType, typeList, boardList, mode]);

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
              {mode === 'tickets' ? 'Tickets résolus par jour' : 'Story points résolus par jour'}
            </h2>
            <p className="text-sm text-surface-400">
              Par équipe • {useActiveSprint ? 'Sprint actif' : 'Période'} {displayRange.from} → {displayRange.to}
            </p>
            {totalResolvedTickets !== null && (
              <p className="text-sm font-medium text-primary-400 mt-1">
                Résultat de la requête : <span className="tabular-nums font-bold">{totalResolvedTickets}</span> ticket{totalResolvedTickets !== 1 ? 's' : ''} résolu{totalResolvedTickets !== 1 ? 's' : ''} sur la période
              </p>
            )}
            {(mode === 'points' ? totalsBySeriesPoints : totalsBySeries).length > 0 && (
              <p className="text-xs text-surface-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-surface-500">
                  {mode === 'points' ? 'Story points par équipe :' : 'Répartition (tickets) :'}
                </span>
                {(mode === 'points' ? totalsBySeriesPoints : totalsBySeries).map(({ name, total }, i) => (
                  <span key={name} className="tabular-nums">
                    {i > 0 && <span className="text-surface-600 mr-1">·</span>}
                    <span className="text-surface-300">{name}</span>
                    <span className="text-surface-200 font-medium ml-0.5">{total}</span>
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Switch: tickets count vs story points sum */}
          <div className="flex rounded-lg bg-surface-800 p-0.5 border border-surface-600">
            <button
              type="button"
              onClick={() => setMode('tickets')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === 'tickets'
                  ? 'bg-primary-500/30 text-primary-300 border border-primary-500/50'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              <Ticket className="w-4 h-4" />
              Tous les tickets
            </button>
            <button
              type="button"
              onClick={() => setMode('points')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === 'points'
                  ? 'bg-primary-500/30 text-primary-300 border border-primary-500/50'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              <Zap className="w-4 h-4" />
              Story points
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
          <p className="text-sm">
            {mode === 'points' ? 'Aucun story point résolu sur cette période' : 'Aucun ticket résolu sur cette période'}
          </p>
        </div>
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              key={mode}
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
                allowDecimals={mode === 'points'}
                label={{
                  value: mode === 'points' ? 'Story points résolus' : 'Tickets résolus',
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
                  const bar = barConfig.find((b) => b.key === name);
                  return [value, bar?.name ?? name];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value) => {
                  const bar = barConfig.find((b) => b.key === value);
                  return bar?.name ?? value;
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
