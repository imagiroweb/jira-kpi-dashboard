import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { 
  Headphones, Scale, Ticket, PlayCircle, FlaskConical, 
  Clock, CheckCircle, ListTodo, User, PieChart as PieChartIcon,
  TrendingDown, AlertTriangle, Tag, Users, CalendarDays, Save, History,
  X, Trash2, Eye, Loader2
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { DateRangePicker } from './DateRangePicker';
import { useStore } from '../store/useStore';
import { supportSnapshotApi, SupportSnapshotSummary, SupportSnapshotFull } from '../services/api';

interface SupportIssue {
  issueKey: string;
  summary: string;
  issueType: string;
  status: string;
  statusCategory: string;
  ponderation: number | null;
  assignee: string | null;
  created: string;
  resolved: string | null;
}

interface AssigneeStats {
  assignee: string;
  ponderation: number;
  ticketCount: number;
}

interface SupportKPIData {
  issues: SupportIssue[];
  statusCounts: {
    total: number;
    todo: number;
    inProgress: number;
    qa: number;
    resolved: number;
  };
  ponderationByStatus: {
    total: number;
    todo: number;
    inProgress: number;
    qa: number;
    resolved: number;
  };
  ponderationByType: Record<string, number>;
  ponderationByAssignee: AssigneeStats[];
  ponderationByLevel: {
    low: { count: number; total: number };      // 1-11
    medium: { count: number; total: number };   // 12-15
    high: { count: number; total: number };     // 16-20
    veryHigh: { count: number; total: number }; // 21+
  };
  ponderationByLabel: Array<{
    label: string;
    ponderation: number;
    ticketCount: number;
  }>;
  ponderationByTeam: Array<{
    team: string;
    ponderation: number;
    ticketCount: number;
  }>;
  backlog: {
    ticketCount: number;
    totalPonderation: number;
  };
  avgResolutionTimeHours: number;
  avgFirstResponseTimeHours: number;
  avgResolutionTimeFromDatesHours: number;
  highPondFastResolutionPercent: number;
  veryHighPondFastResolutionPercent: number;
  totalPonderation: number;
  resolutionDetails: Array<{
    issueKey: string;
    summary: string;
    beginDate: string;
    endDate: string;
    workingDays: number;
    ponderation: number | null;
  }>;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Format hours to working days (8h = 1 working day)
function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 8) return `${hours.toFixed(1)}h`;
  // Convert to working days (8h per day)
  const workingDays = hours / 8;
  return `${workingDays.toFixed(1)}j`;
}

export function SupportDashboard() {
  const dateRange = useStore((state) => state.dateRange);
  const setDateRange = useStore((state) => state.setDateRange);
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const kpiRefreshTrigger = useStore((state) => state.kpiRefreshTrigger);
  
  const [kpiData, setKpiData] = useState<SupportKPIData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [useActiveSprint, setUseActiveSprint] = useState(true);
  
  // Snapshot states
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showSnapshotView, setShowSnapshotView] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotNotes, setSnapshotNotes] = useState('');
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [snapshots, setSnapshots] = useState<SupportSnapshotSummary[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<SupportSnapshotFull | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  
  // Resolution details modal state
  const [showResolutionDetails, setShowResolutionDetails] = useState(false);
  const didMountLoad = useRef(false);

  // silent = true means no loading state (for background refreshes)
  const loadKPIs = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
    }
    
    try {
      const params = new URLSearchParams();
      
      // Only add date params if not using active sprint mode
      if (!useActiveSprint) {
        params.append('from', dateRange.from);
        params.append('to', dateRange.to);
      }
      // Add a flag to indicate active sprint mode
      params.append('activeSprint', String(useActiveSprint));

      const response = await fetch(`${API_BASE_URL}/worklog/support-kpi?${params}`);
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Only update if data actually changed
          const hasChanged = JSON.stringify(result) !== JSON.stringify(kpiData);
          if (hasChanged) {
            setKpiData(result);
            setLastUpdate(new Date());
          }
        }
      }
    } catch (err) {
      console.error('Failed to load Support KPIs:', err);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [dateRange, useActiveSprint, kpiData]);

  // Load once on mount (ref avoids re-run when loadKPIs identity changes after first load)
  useEffect(() => {
    if (didMountLoad.current) return;
    didMountLoad.current = true;
    loadKPIs(false);
  }, [loadKPIs]);

  // Reload when date range or mode changes (with loading indicator)
  useEffect(() => {
    loadKPIs(false);
  }, [dateRange.from, dateRange.to, useActiveSprint, loadKPIs]);

  // Silent refresh when kpiRefreshTrigger changes (no loading indicator)
  useEffect(() => {
    if (kpiRefreshTrigger > 0) {
      loadKPIs(true);
    }
  }, [kpiRefreshTrigger, loadKPIs]);

  // Handle date change - switch to custom date mode
  const handleDateChange = useCallback((newRange: { from: string; to: string }) => {
    setUseActiveSprint(false);
    setDateRange(newRange);
  }, [setDateRange]);

  // Switch back to active sprint mode
  const handleActiveSprintClick = useCallback(() => {
    setUseActiveSprint(true);
  }, []);

  // Calculate progress percentage based on ponderation
  const progressPercent = useMemo(() => {
    if (!kpiData || kpiData.ponderationByStatus.total === 0) return 0;
    return (kpiData.ponderationByStatus.resolved / kpiData.ponderationByStatus.total) * 100;
  }, [kpiData]);

  // Top 5 assignees by ponderation
  const topAssignees = useMemo(() => {
    if (!kpiData) return [];
    return kpiData.ponderationByAssignee.slice(0, 8);
  }, [kpiData]);

  // Issue types sorted by ponderation
  const issueTypesSorted = useMemo(() => {
    if (!kpiData) return [];
    return Object.entries(kpiData.ponderationByType)
      .map(([type, ponderation]) => ({ type, ponderation }))
      .sort((a, b) => b.ponderation - a.ponderation);
  }, [kpiData]);

  // Load snapshots
  const loadSnapshots = useCallback(async () => {
    setLoadingSnapshots(true);
    try {
      const result = await supportSnapshotApi.getSnapshots();
      if (result.success) {
        setSnapshots(result.snapshots);
      }
    } catch (err) {
      console.error('Failed to load snapshots:', err);
    } finally {
      setLoadingSnapshots(false);
    }
  }, []);

  // Save snapshot
  const handleSaveSnapshot = useCallback(async () => {
    if (!snapshotName.trim()) return;
    
    setSavingSnapshot(true);
    try {
      const result = await supportSnapshotApi.saveSnapshot(snapshotName.trim(), snapshotNotes.trim() || undefined);
      if (result.success) {
        setShowSaveModal(false);
        setSnapshotName('');
        setSnapshotNotes('');
        // Reload snapshots list
        loadSnapshots();
      }
    } catch (err) {
      console.error('Failed to save snapshot:', err);
    } finally {
      setSavingSnapshot(false);
    }
  }, [snapshotName, snapshotNotes, loadSnapshots]);

  // Load a specific snapshot
  const handleViewSnapshot = useCallback(async (id: string) => {
    setLoadingSnapshot(true);
    try {
      const result = await supportSnapshotApi.getSnapshot(id);
      if (result.success) {
        setSelectedSnapshot(result.snapshot);
        setShowSnapshotView(true);
        setShowHistoryModal(false);
      }
    } catch (err) {
      console.error('Failed to load snapshot:', err);
    } finally {
      setLoadingSnapshot(false);
    }
  }, []);

  // Delete snapshot
  const handleDeleteSnapshot = useCallback(async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce snapshot ?')) return;
    
    try {
      const result = await supportSnapshotApi.deleteSnapshot(id);
      if (result.success) {
        loadSnapshots();
      }
    } catch (err) {
      console.error('Failed to delete snapshot:', err);
    }
  }, [loadSnapshots]);

  // Open history modal
  const handleOpenHistory = useCallback(() => {
    loadSnapshots();
    setShowHistoryModal(true);
  }, [loadSnapshots]);

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold gradient-text mb-2 flex items-center gap-3">
              <Headphones className="w-8 h-8 text-primary-400" />
              Support Board KPI
            </h1>
            <p className="text-surface-400">
              Métriques Support chocolateam • Basé sur la pondération
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* History button */}
            <button
              onClick={handleOpenHistory}
              className="flex items-center gap-2 px-4 py-2 bg-surface-800 hover:bg-surface-700 border border-surface-600 rounded-lg text-surface-200 transition-colors"
              title="Voir l'historique des snapshots"
            >
              <History className="w-4 h-4" />
              Historique
            </button>
            
            {/* Save snapshot button - only if authenticated */}
            {isAuthenticated && (
              <button
                onClick={() => setShowSaveModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 border border-primary-500 rounded-lg text-white transition-colors"
                title="Enregistrer un snapshot du sprint actuel"
              >
                <Save className="w-4 h-4" />
                Sauvegarder
              </button>
            )}
            
            <div className="flex flex-col gap-2">
              <DateRangePicker 
                value={dateRange}
                onChange={handleDateChange}
              />
              <button
                onClick={handleActiveSprintClick}
                className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  useActiveSprint 
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/50' 
                    : 'bg-surface-800 hover:bg-surface-700 text-surface-300 border border-surface-600'
                }`}
              >
                <PlayCircle className="w-4 h-4" />
                Sprint actif
                {useActiveSprint && <CheckCircle className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>
        
        {/* Mode indicator */}
        <div className="flex items-center gap-2 mt-2">
          {useActiveSprint ? (
            <span className="text-xs text-primary-400 flex items-center gap-1">
              <PlayCircle className="w-3 h-3" />
              Mode: Sprint actif
            </span>
          ) : (
            <span className="text-xs text-surface-400 flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              Mode: Période personnalisée ({dateRange.from} → {dateRange.to})
            </span>
          )}
          {lastUpdate && (
            <span className="text-xs text-surface-600 ml-auto">
              Mise à jour : {lastUpdate.toLocaleTimeString('fr-FR')}
            </span>
          )}
        </div>
      </header>

      {isLoading && !kpiData ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="card-glass p-4 animate-pulse">
              <div className="h-6 bg-surface-700 rounded w-24 mb-2" />
              <div className="h-10 bg-surface-700 rounded w-16" />
            </div>
          ))}
        </div>
      ) : kpiData ? (
        <>
          {/* Backlog Banner */}
          {kpiData.backlog && kpiData.backlog.ticketCount > 0 && (
            <div className="card-glass p-4 mb-6 border-l-4 border-amber-500 bg-amber-500/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/20 rounded-lg">
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-amber-300">Backlog</h3>
                    <p className="text-sm text-surface-400">Tickets hors sprint en attente</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-amber-400">{kpiData.backlog.ticketCount}</div>
                    <div className="text-xs text-surface-500">tickets</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-amber-400">{kpiData.backlog.totalPonderation}</div>
                    <div className="text-xs text-surface-500">pondération</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div className="card-glass p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-surface-400 mb-2">
                <Ticket className="w-5 h-5" />
                <span className="text-xs uppercase">Total</span>
              </div>
              <div className="text-3xl font-bold text-surface-100">{kpiData.statusCounts.total}</div>
              <div className="text-xs text-surface-500 mt-1">tickets</div>
            </div>
            
            <div className="card-glass p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-slate-400 mb-2">
                <ListTodo className="w-5 h-5" />
                <span className="text-xs uppercase">À faire</span>
              </div>
              <div className="text-3xl font-bold text-slate-400">{kpiData.statusCounts.todo}</div>
              <div className="text-xs text-surface-500 mt-1">tickets</div>
            </div>
            
            <div className="card-glass p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-blue-400 mb-2">
                <PlayCircle className="w-5 h-5" />
                <span className="text-xs uppercase">En cours</span>
              </div>
              <div className="text-3xl font-bold text-blue-400">{kpiData.statusCounts.inProgress}</div>
              <div className="text-xs text-surface-500 mt-1">tickets</div>
            </div>
            
            <div className="card-glass p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-orange-400 mb-2">
                <FlaskConical className="w-5 h-5" />
                <span className="text-xs uppercase">QA</span>
              </div>
              <div className="text-3xl font-bold text-orange-400">{kpiData.statusCounts.qa}</div>
              <div className="text-xs text-surface-500 mt-1">tickets</div>
            </div>
            
            <div className="card-glass p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-success-400 mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="text-xs uppercase">Résolus</span>
              </div>
              <div className="text-3xl font-bold text-success-400">{kpiData.statusCounts.resolved}</div>
              <div className="text-xs text-surface-500 mt-1">tickets</div>
            </div>
          </div>

          {/* Main KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 mb-4">
            {/* Pondération par statut */}
            <div className="card-glass p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-warning-400 mb-1">
                <Scale className="w-4 h-4" />
                <span className="text-[10px] uppercase tracking-wider">Pond. Total</span>
              </div>
              <div className="text-2xl font-bold text-warning-400">{kpiData.ponderationByStatus.total}</div>
            </div>
            
            <div className="card-glass p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
                <Scale className="w-4 h-4" />
                <span className="text-[10px] uppercase tracking-wider">Pond. À faire</span>
              </div>
              <div className="text-2xl font-bold text-slate-400">{kpiData.ponderationByStatus.todo}</div>
            </div>
            
            <div className="card-glass p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-blue-400 mb-1">
                <Scale className="w-4 h-4" />
                <span className="text-[10px] uppercase tracking-wider">Pond. En cours</span>
              </div>
              <div className="text-2xl font-bold text-blue-400">{kpiData.ponderationByStatus.inProgress}</div>
            </div>
            
            <div className="card-glass p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-orange-400 mb-1">
                <Scale className="w-4 h-4" />
                <span className="text-[10px] uppercase tracking-wider">Pond. QA</span>
              </div>
              <div className="text-2xl font-bold text-orange-400">{kpiData.ponderationByStatus.qa}</div>
            </div>
            
            <div className="card-glass p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-success-400 mb-1">
                <Scale className="w-4 h-4" />
                <span className="text-[10px] uppercase tracking-wider">Pond. Résolue</span>
              </div>
              <div className="text-2xl font-bold text-success-400">{kpiData.ponderationByStatus.resolved}</div>
            </div>
            
            <div className="card-glass p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-success-400 mb-1">
                <CheckCircle className="w-4 h-4" />
                <span className="text-[10px] uppercase tracking-wider">Résolus</span>
              </div>
              <div className="text-2xl font-bold text-success-400">{kpiData.statusCounts.resolved}</div>
            </div>
          </div>

          {/* Time Indicators Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {/* Resolution Time with objective: <= 72h (3 days) */}
            {(() => {
              const targetHours = 72; // 72h = 3 jours
              const thresholdOver20Percent = targetHours * 1.2; // 86.4h
              const avgHours = kpiData.avgResolutionTimeFromDatesHours;
              
              let colorClass = 'text-success-400'; // Vert par défaut (objectif atteint)
              let bgClass = 'border-success-500/30';
              
              if (avgHours > thresholdOver20Percent) {
                // Plus de 20% au-dessus de l'objectif = Rouge
                colorClass = 'text-red-400';
                bgClass = 'border-red-500/30';
              } else if (avgHours > targetHours) {
                // Au-dessus mais <= 20% = Orange
                colorClass = 'text-warning-400';
                bgClass = 'border-warning-500/30';
              }
              
              return (
                <div 
                  className={`card-glass p-3 text-center border ${bgClass} cursor-pointer hover:scale-105 transition-transform`}
                  onClick={() => setShowResolutionDetails(true)}
                  title="Cliquez pour voir le détail des tickets"
                >
                  <div className={`flex items-center justify-center gap-1 ${colorClass} mb-1`}>
                    <Clock className="w-4 h-4" />
                    <span className="text-[10px] uppercase tracking-wider">Temps Moy.</span>
                  </div>
                  <div className={`text-2xl font-bold ${colorClass}`}>{formatHours(avgHours)}</div>
                  <div className="text-[10px] text-surface-500">résolution</div>
                  <div className="text-[9px] text-surface-600 mt-1">Objectif: ≤72h</div>
                </div>
              );
            })()}
            
            {/* First Response Time with objective: <= 4 days (96h) */}
            {(() => {
              const targetHours = 96; // 4 jours
              const thresholdOver20Percent = targetHours * 1.2; // 115.2h
              const avgHours = kpiData.avgFirstResponseTimeHours;
              
              let colorClass = 'text-success-400'; // Vert par défaut (objectif atteint)
              let bgClass = 'border-success-500/30';
              
              if (avgHours > thresholdOver20Percent) {
                // Plus de 20% au-dessus de l'objectif = Rouge
                colorClass = 'text-red-400';
                bgClass = 'border-red-500/30';
              } else if (avgHours > targetHours) {
                // Au-dessus mais <= 20% = Orange
                colorClass = 'text-warning-400';
                bgClass = 'border-warning-500/30';
              }
              
              return (
                <div className={`card-glass p-3 text-center border ${bgClass}`}>
                  <div className={`flex items-center justify-center gap-1 ${colorClass} mb-1`}>
                    <PlayCircle className="w-4 h-4" />
                    <span className="text-[10px] uppercase tracking-wider">1ère Prise</span>
                  </div>
                  <div className={`text-2xl font-bold ${colorClass}`}>{formatHours(avgHours)}</div>
                  <div className="text-[10px] text-surface-500">en charge</div>
                  <div className="text-[9px] text-surface-600 mt-1">Objectif: ≤4j</div>
                </div>
              );
            })()}
            
            {/* High Ponderation Fast Resolution Rate with objective: >= 75% */}
            {(() => {
              const targetPercent = 75; // Objectif 75%
              const thresholdMinus20Percent = targetPercent * 0.8; // 60%
              const percent = kpiData.highPondFastResolutionPercent;
              
              let colorClass = 'text-success-400'; // Vert par défaut (objectif atteint)
              let bgClass = 'border-success-500/30';
              
              if (percent < thresholdMinus20Percent) {
                // Plus de 20% en-dessous de l'objectif = Rouge
                colorClass = 'text-red-400';
                bgClass = 'border-red-500/30';
              } else if (percent < targetPercent) {
                // En-dessous mais >= -20% = Orange
                colorClass = 'text-warning-400';
                bgClass = 'border-warning-500/30';
              }
              
              return (
                <div className={`card-glass p-3 text-center border ${bgClass}`}>
                  <div className={`flex items-center justify-center gap-1 ${colorClass} mb-1`}>
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-[10px] uppercase tracking-wider">Haute Pond.</span>
                  </div>
                  <div className={`text-2xl font-bold ${colorClass}`}>{percent}%</div>
                  <div className="text-[10px] text-surface-500">résolus &lt;72h</div>
                  <div className="text-[9px] text-surface-600 mt-1">Objectif: ≥75%</div>
                </div>
              );
            })()}
            
            {/* Very High Ponderation Fast Resolution Rate with objective: >= 75%, resolution < 24h */}
            {(() => {
              const targetPercent = 75; // Objectif 75%
              const thresholdMinus20Percent = targetPercent * 0.8; // 60%
              const percent = kpiData.veryHighPondFastResolutionPercent;
              
              let colorClass = 'text-success-400'; // Vert par défaut (objectif atteint)
              let bgClass = 'border-success-500/30';
              
              if (percent < thresholdMinus20Percent) {
                // Plus de 20% en-dessous de l'objectif = Rouge
                colorClass = 'text-red-400';
                bgClass = 'border-red-500/30';
              } else if (percent < targetPercent) {
                // En-dessous mais >= -20% = Orange
                colorClass = 'text-warning-400';
                bgClass = 'border-warning-500/30';
              }
              
              return (
                <div className={`card-glass p-3 text-center border ${bgClass}`}>
                  <div className={`flex items-center justify-center gap-1 ${colorClass} mb-1`}>
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-[10px] uppercase tracking-wider">Très Haute</span>
                  </div>
                  <div className={`text-2xl font-bold ${colorClass}`}>{percent}%</div>
                  <div className="text-[10px] text-surface-500">résolus &lt;24h</div>
                  <div className="text-[9px] text-surface-600 mt-1">Objectif: ≥75%</div>
                </div>
              );
            })()}
          </div>

          {/* Progress Bar */}
          <div className="card-glass p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-surface-100 flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-success-400" />
                Progression (basée sur pondération)
              </h3>
              <span className="text-2xl font-bold text-success-400">{progressPercent.toFixed(1)}%</span>
            </div>
            <div className="h-4 bg-surface-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-success-500 to-success-400 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-surface-500 mt-2">
              <span>{kpiData.ponderationByStatus.resolved} pond. résolue</span>
              <span>{kpiData.ponderationByStatus.total} pond. totale</span>
            </div>
          </div>

          {/* Three Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Pondération par équipe */}
            <div className="card-glass p-6">
              <h3 className="text-lg font-semibold text-surface-100 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-400" />
                Pondération par Équipe
              </h3>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {kpiData.ponderationByTeam && kpiData.ponderationByTeam.length > 0 ? (
                  kpiData.ponderationByTeam.map((item, index) => {
                    const maxPond = kpiData.ponderationByTeam[0]?.ponderation || 1;
                    const percent = (item.ponderation / maxPond) * 100;
                    return (
                      <div key={item.team} className="relative">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-surface-200 truncate max-w-[60%]">
                            {index + 1}. {item.team}
                          </span>
                          <span className="text-sm font-bold text-surface-100">
                            {item.ponderation} <span className="text-surface-500 font-normal">({item.ticketCount} tickets)</span>
                          </span>
                        </div>
                        <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-surface-500 text-center py-4">Aucune donnée d&apos;équipe</p>
                )}
              </div>
            </div>

            {/* Pondération par assignee */}
            <div className="card-glass p-6">
              <h3 className="text-lg font-semibold text-surface-100 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-primary-400" />
                Pondération par Utilisateur
              </h3>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {topAssignees.map((assignee, index) => {
                  const maxPond = topAssignees[0]?.ponderation || 1;
                  const percent = (assignee.ponderation / maxPond) * 100;
                  return (
                    <div key={assignee.assignee} className="relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-surface-200 truncate max-w-[60%]">
                          {index + 1}. {assignee.assignee}
                        </span>
                        <span className="text-sm font-bold text-surface-100">
                          {assignee.ponderation} <span className="text-surface-500 font-normal">({assignee.ticketCount} tickets)</span>
                        </span>
                      </div>
                      <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {topAssignees.length === 0 && (
                  <p className="text-surface-500 text-center py-4">Aucune donnée</p>
                )}
              </div>
            </div>

            {/* Pondération par type avec ratio Support/Bug */}
            <div className="card-glass p-6">
              <h3 className="text-lg font-semibold text-surface-100 mb-4 flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-accent-400" />
                Pondération par Type de Ticket
              </h3>
              
              {/* Ratio Support/Bug Donut intégré */}
              {(() => {
                const supportPond = kpiData.ponderationByType['Support'] || kpiData.ponderationByType['Demande de support'] || 0;
                const bugPond = kpiData.ponderationByType['Bug'] || kpiData.ponderationByType['Bogue'] || 0;
                const totalSupportBug = supportPond + bugPond;
                
                if (totalSupportBug === 0) return null;
                
                const supportRatio = (supportPond / totalSupportBug) * 100;
                const bugRatio = (bugPond / totalSupportBug) * 100;
                const ratioStatus = supportRatio >= 60 ? 'Bon' : supportRatio >= 40 ? 'Moyen' : 'À améliorer';
                const ratioTextColor = supportRatio >= 60 ? 'text-green-400' : supportRatio >= 40 ? 'text-orange-400' : 'text-red-400';
                const ratioBgColor = supportRatio >= 60 ? 'bg-green-500/20' : supportRatio >= 40 ? 'bg-orange-500/20' : 'bg-red-500/20';
                
                const donutData = [
                  { name: 'Support', value: supportPond, color: '#3b82f6' },
                  { name: 'Bug', value: bugPond, color: '#ef4444' },
                ].filter(d => d.value > 0);
                
                return (
                  <div className="mb-6 pb-6 border-b border-surface-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-surface-300">Ratio Support/Bug</span>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${ratioTextColor} ${ratioBgColor}`}>
                        {ratioStatus}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Mini Donut */}
                      <div className="w-24 h-24 relative flex-shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={donutData}
                              cx="50%"
                              cy="50%"
                              innerRadius={25}
                              outerRadius={38}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {donutData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className={`text-sm font-bold ${ratioTextColor}`}>{supportRatio.toFixed(0)}%</span>
                        </div>
                      </div>
                      
                      {/* Legend compact */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500" />
                            <span className="text-xs text-surface-300">Support</span>
                          </div>
                          <span className="text-xs font-bold text-blue-400">{supportPond} ({supportRatio.toFixed(0)}%)</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500" />
                            <span className="text-xs text-surface-300">Bug</span>
                          </div>
                          <span className="text-xs font-bold text-red-400">{bugPond} ({bugRatio.toFixed(0)}%)</span>
                        </div>
                        <div className="text-[10px] text-surface-500 mt-1">
                          Objectif: 60/40 en faveur du support
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
              
              <div className="space-y-3">
                {issueTypesSorted.map((item, index) => {
                  const colors = ['text-red-400', 'text-orange-400', 'text-yellow-400', 'text-green-400', 'text-blue-400', 'text-purple-400'];
                  const bgColors = ['from-red-500', 'from-orange-500', 'from-yellow-500', 'from-green-500', 'from-blue-500', 'from-purple-500'];
                  const maxPond = issueTypesSorted[0]?.ponderation || 1;
                  const percent = (item.ponderation / maxPond) * 100;
                  return (
                    <div key={item.type} className="relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm ${colors[index % colors.length]}`}>
                          {item.type}
                        </span>
                        <span className="text-sm font-bold text-surface-100">
                          {item.ponderation}
                        </span>
                      </div>
                      <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${bgColors[index % bgColors.length]} to-surface-600 transition-all duration-500`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {issueTypesSorted.length === 0 && (
                  <p className="text-surface-500 text-center py-4">Aucune donnée</p>
                )}
              </div>
            </div>
          </div>

          {/* Ponderation Level Distribution - Pie Chart */}
          {kpiData.ponderationByLevel && (
            <div className="card-glass p-6 mb-8">
              <h3 className="text-lg font-semibold text-surface-100 mb-4 flex items-center gap-2">
                <Scale className="w-5 h-5 text-warning-400" />
                Répartition par Niveau de Pondération
              </h3>
              <div className="flex flex-col lg:flex-row items-center gap-8">
                {/* Pie Chart */}
                <div className="w-full lg:w-1/2 h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Basse (1-11)', value: kpiData.ponderationByLevel.low.count, total: kpiData.ponderationByLevel.low.total, color: '#22c55e' },
                          { name: 'Moyenne (12-15)', value: kpiData.ponderationByLevel.medium.count, total: kpiData.ponderationByLevel.medium.total, color: '#eab308' },
                          { name: 'Haute (16-20)', value: kpiData.ponderationByLevel.high.count, total: kpiData.ponderationByLevel.high.total, color: '#f97316' },
                          { name: 'Très haute (21+)', value: kpiData.ponderationByLevel.veryHigh.count, total: kpiData.ponderationByLevel.veryHigh.total, color: '#ef4444' },
                        ].filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {[
                          { color: '#22c55e' },
                          { color: '#eab308' },
                          { color: '#f97316' },
                          { color: '#ef4444' },
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(30, 30, 40, 0.95)',
                          border: '1px solid rgba(100, 100, 120, 0.3)',
                          borderRadius: '8px',
                          padding: '12px'
                        }}
                        formatter={(value: number, _name: string, props: { payload?: { total?: number } }) => [
                          <span key="value">
                            <strong>{value}</strong> tickets ({props.payload?.total ?? 0} pond.)
                          </span>,
                          _name
                        ]}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value) => <span className="text-surface-300 text-sm">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend with details */}
                <div className="w-full lg:w-1/2 grid grid-cols-2 gap-4">
                  <div className="bg-surface-800/50 rounded-lg p-4 border-l-4 border-green-500">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="text-sm font-medium text-green-400">Basse (1-11)</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-green-400">{kpiData.ponderationByLevel.low.count}</span>
                      <span className="text-sm text-surface-500">tickets</span>
                    </div>
                    <div className="text-xs text-surface-400 mt-1">
                      Total: {kpiData.ponderationByLevel.low.total} pond.
                    </div>
                  </div>

                  <div className="bg-surface-800/50 rounded-lg p-4 border-l-4 border-yellow-500">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <span className="text-sm font-medium text-yellow-400">Moyenne (12-15)</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-yellow-400">{kpiData.ponderationByLevel.medium.count}</span>
                      <span className="text-sm text-surface-500">tickets</span>
                    </div>
                    <div className="text-xs text-surface-400 mt-1">
                      Total: {kpiData.ponderationByLevel.medium.total} pond.
                    </div>
                  </div>

                  <div className="bg-surface-800/50 rounded-lg p-4 border-l-4 border-orange-500">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full bg-orange-500" />
                      <span className="text-sm font-medium text-orange-400">Haute (16-20)</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-orange-400">{kpiData.ponderationByLevel.high.count}</span>
                      <span className="text-sm text-surface-500">tickets</span>
                    </div>
                    <div className="text-xs text-surface-400 mt-1">
                      Total: {kpiData.ponderationByLevel.high.total} pond.
                    </div>
                  </div>

                  <div className="bg-surface-800/50 rounded-lg p-4 border-l-4 border-red-500">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-sm font-medium text-red-400">Très haute (21+)</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-red-400">{kpiData.ponderationByLevel.veryHigh.count}</span>
                      <span className="text-sm text-surface-500">tickets</span>
                    </div>
                    <div className="text-xs text-surface-400 mt-1">
                      Total: {kpiData.ponderationByLevel.veryHigh.total} pond.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ticket Creation Timeline */}
          {kpiData.issues && kpiData.issues.length > 0 && (() => {
            // Group tickets by creation date and resolution date
            const ticketsByDay = new Map<string, { created: number; resolved: number; ponderation: number }>();
            
            // Get all unique dates from both created and resolved
            const allDates = new Set<string>();
            
            kpiData.issues.forEach((issue: SupportIssue) => {
              if (issue.created) {
                const createdDate = issue.created.split('T')[0];
                allDates.add(createdDate);
                const current = ticketsByDay.get(createdDate) || { created: 0, resolved: 0, ponderation: 0 };
                current.created++;
                current.ponderation += issue.ponderation || 0;
                ticketsByDay.set(createdDate, current);
              }
              if (issue.resolved) {
                const resolvedDate = issue.resolved.split('T')[0];
                allDates.add(resolvedDate);
                const current = ticketsByDay.get(resolvedDate) || { created: 0, resolved: 0, ponderation: 0 };
                current.resolved++;
                ticketsByDay.set(resolvedDate, current);
              }
            });
            
            // Sort by date and format for chart
            const chartData = Array.from(allDates)
              .sort((a, b) => a.localeCompare(b))
              .map((date) => {
                const data = ticketsByDay.get(date) || { created: 0, resolved: 0, ponderation: 0 };
                return {
                  date,
                  displayDate: new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
                  created: data.created,
                  resolved: data.resolved,
                  ponderation: data.ponderation
                };
              });
            
            if (chartData.length === 0) return null;
            
            const totalCreated = chartData.reduce((sum, d) => sum + d.created, 0);
            const totalResolved = chartData.reduce((sum, d) => sum + d.resolved, 0);
            
            return (
              <div className="card-glass p-6 mb-8">
                <h3 className="text-lg font-semibold text-surface-100 mb-4 flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-cyan-400" />
                  Évolution des Tickets dans le Temps
                  <div className="ml-auto flex items-center gap-4 text-sm font-normal">
                    <span className="text-cyan-400">Créés: {totalCreated}</span>
                    <span className="text-green-400">Résolus: {totalResolved}</span>
                  </div>
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorPond" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,100,120,0.2)" />
                      <XAxis 
                        dataKey="displayDate" 
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        tickLine={{ stroke: '#475569' }}
                        axisLine={{ stroke: '#475569' }}
                      />
                      <YAxis 
                        yAxisId="left"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        tickLine={{ stroke: '#475569' }}
                        axisLine={{ stroke: '#475569' }}
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        tickLine={{ stroke: '#475569' }}
                        axisLine={{ stroke: '#475569' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(30, 30, 40, 0.95)',
                          border: '1px solid rgba(100, 100, 120, 0.3)',
                          borderRadius: '8px',
                          padding: '12px'
                        }}
                        labelFormatter={(label) => `📅 ${label}`}
                        formatter={(value: number, name: string) => {
                          const labels: Record<string, string> = {
                            created: 'Tickets créés',
                            resolved: 'Tickets résolus',
                            ponderation: 'Pondération'
                          };
                          return [value, labels[name] || name];
                        }}
                      />
                      <Legend 
                        formatter={(value) => {
                          const labels: Record<string, string> = {
                            created: 'Créés',
                            resolved: 'Résolus',
                            ponderation: 'Pondération'
                          };
                          return <span className="text-surface-300 text-sm">{labels[value] || value}</span>;
                        }}
                      />
                      <Area 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="created" 
                        stroke="#06b6d4" 
                        fillOpacity={1} 
                        fill="url(#colorCreated)"
                        strokeWidth={2}
                        name="created"
                      />
                      <Area 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="resolved" 
                        stroke="#22c55e" 
                        fillOpacity={1} 
                        fill="url(#colorResolved)"
                        strokeWidth={2}
                        name="resolved"
                      />
                      <Area 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="ponderation" 
                        stroke="#f59e0b" 
                        fillOpacity={1} 
                        fill="url(#colorPond)"
                        strokeWidth={2}
                        name="ponderation"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-between mt-4 text-xs text-surface-500">
                  <span>Premier ticket: {chartData[0]?.displayDate}</span>
                  <span>Dernier ticket: {chartData[chartData.length - 1]?.displayDate}</span>
                </div>
              </div>
            );
          })()}

          {/* Ponderation by Label */}
          {kpiData.ponderationByLabel && kpiData.ponderationByLabel.length > 0 && (
            <div className="card-glass p-6 mb-8">
              <h3 className="text-lg font-semibold text-surface-100 mb-4 flex items-center gap-2">
                <Tag className="w-5 h-5 text-accent-400" />
                Répartition par Étiquette
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-96 overflow-y-auto">
                {kpiData.ponderationByLabel.map((item, index) => {
                  const maxPond = kpiData.ponderationByLabel[0]?.ponderation || 1;
                  const percent = (item.ponderation / maxPond) * 100;
                  const colors = [
                    'border-purple-500 text-purple-400',
                    'border-blue-500 text-blue-400',
                    'border-cyan-500 text-cyan-400',
                    'border-teal-500 text-teal-400',
                    'border-emerald-500 text-emerald-400',
                    'border-lime-500 text-lime-400',
                    'border-amber-500 text-amber-400',
                    'border-orange-500 text-orange-400',
                    'border-rose-500 text-rose-400',
                    'border-pink-500 text-pink-400',
                  ];
                  const colorClass = colors[index % colors.length];
                  const borderColor = colorClass.split(' ')[0];
                  
                  return (
                    <div 
                      key={item.label} 
                      className={`bg-surface-800/50 rounded-lg p-3 border-l-4 ${borderColor}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-medium truncate max-w-[70%] ${colorClass.split(' ')[1]}`} title={item.label}>
                          {item.label}
                        </span>
                        <span className="text-xs text-surface-500">{item.ticketCount} tickets</span>
                      </div>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-xl font-bold text-surface-100">{item.ponderation}</span>
                        <span className="text-xs text-surface-500">pond.</span>
                      </div>
                      <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${borderColor.replace('border', 'bg')} transition-all duration-500`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 text-surface-500">
          <AlertTriangle className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg">Impossible de charger les KPIs Support</p>
          <p className="text-sm text-surface-600 mt-1">Vérifiez la connexion ou réessayez</p>
        </div>
      )}

      {/* Save Snapshot Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card-glass p-6 w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-surface-100 flex items-center gap-2">
                <Save className="w-5 h-5 text-primary-400" />
                Sauvegarder le Sprint
              </h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="p-2 hover:bg-surface-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-surface-400" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  Nom du Sprint *
                </label>
                <input
                  type="text"
                  value={snapshotName}
                  onChange={(e) => setSnapshotName(e.target.value)}
                  placeholder="Ex: Sprint 42 - Janvier 2026"
                  className="w-full px-4 py-2.5 bg-surface-800 border border-surface-600 rounded-lg text-surface-100 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  Notes (optionnel)
                </label>
                <textarea
                  value={snapshotNotes}
                  onChange={(e) => setSnapshotNotes(e.target.value)}
                  placeholder="Observations, contexte..."
                  rows={3}
                  className="w-full px-4 py-2.5 bg-surface-800 border border-surface-600 rounded-lg text-surface-100 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 resize-none"
                />
              </div>
              
              {kpiData && (
                <div className="bg-surface-800/50 rounded-lg p-4 border border-surface-700">
                  <p className="text-sm text-surface-400 mb-2">Résumé des données à sauvegarder :</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-surface-500">Tickets:</span>
                      <span className="text-surface-200 ml-2">{kpiData.statusCounts.total}</span>
                    </div>
                    <div>
                      <span className="text-surface-500">Résolus:</span>
                      <span className="text-success-400 ml-2">{kpiData.statusCounts.resolved}</span>
                    </div>
                    <div>
                      <span className="text-surface-500">Pondération:</span>
                      <span className="text-warning-400 ml-2">{kpiData.ponderationByStatus.total}</span>
                    </div>
                    <div>
                      <span className="text-surface-500">Pond. Résolue:</span>
                      <span className="text-success-400 ml-2">{kpiData.ponderationByStatus.resolved}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 px-4 py-2.5 bg-surface-700 hover:bg-surface-600 border border-surface-600 rounded-lg text-surface-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveSnapshot}
                disabled={!snapshotName.trim() || savingSnapshot}
                className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-500 rounded-lg text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {savingSnapshot ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sauvegarde...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Sauvegarder
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card-glass p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-surface-100 flex items-center gap-2">
                <History className="w-5 h-5 text-accent-400" />
                Historique des Sprints
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-2 hover:bg-surface-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-surface-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {loadingSnapshots ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
                </div>
              ) : snapshots.length === 0 ? (
                <div className="text-center py-12 text-surface-500">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Aucun snapshot enregistré</p>
                  <p className="text-sm text-surface-600 mt-1">
                    Sauvegardez votre premier sprint pour le voir apparaître ici
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {snapshots.map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className="bg-surface-800/50 rounded-lg p-4 border border-surface-700 hover:border-surface-600 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-surface-100">{snapshot.sprintName}</h4>
                          <p className="text-xs text-surface-500 mt-1">
                            Sauvegardé le {new Date(snapshot.savedAt).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })} par {snapshot.savedBy.name || snapshot.savedBy.email}
                          </p>
                          {snapshot.notes && (
                            <p className="text-sm text-surface-400 mt-2 italic">&quot;{snapshot.notes}&quot;</p>
                          )}
                          <div className="flex gap-4 mt-3 text-sm">
                            <span className="text-surface-400">
                              <Ticket className="w-4 h-4 inline mr-1" />
                              {snapshot.summary.totalTickets} tickets
                            </span>
                            <span className="text-success-400">
                              <CheckCircle className="w-4 h-4 inline mr-1" />
                              {snapshot.summary.resolvedTickets} résolus
                            </span>
                            <span className="text-warning-400">
                              <Scale className="w-4 h-4 inline mr-1" />
                              {snapshot.summary.totalPonderation} pond.
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => handleViewSnapshot(snapshot.id)}
                            disabled={loadingSnapshot}
                            className="p-2 bg-primary-600/20 hover:bg-primary-600/30 text-primary-400 rounded-lg transition-colors"
                            title="Voir les détails"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {isAuthenticated && (
                            <button
                              onClick={() => handleDeleteSnapshot(snapshot.id)}
                              className="p-2 bg-danger-600/20 hover:bg-danger-600/30 text-danger-400 rounded-lg transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Resolution Details Modal */}
      {showResolutionDetails && kpiData?.resolutionDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card-glass p-6 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold text-surface-100 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary-400" />
                  Détail des temps de résolution
                </h3>
                <p className="text-sm text-surface-500 mt-1">
                  {kpiData.resolutionDetails.length} tickets résolus • Moyenne: {formatHours(kpiData.avgResolutionTimeFromDatesHours)}
                </p>
              </div>
              <button
                onClick={() => setShowResolutionDetails(false)}
                className="p-2 hover:bg-surface-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-surface-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-surface-900">
                  <tr className="text-left text-xs text-surface-500 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Ticket</th>
                    <th className="pb-3 pr-4">Résumé</th>
                    <th className="pb-3 pr-4 text-center">Début</th>
                    <th className="pb-3 pr-4 text-center">Fin</th>
                    <th className="pb-3 pr-4 text-center">Jours ouvrés</th>
                    <th className="pb-3 text-center">Pondération</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800">
                  {kpiData.resolutionDetails.map((detail) => (
                    <tr key={detail.issueKey} className="hover:bg-surface-800/50 transition-colors">
                      <td className="py-3 pr-4">
                        <a 
                          href={`https://${import.meta.env.VITE_JIRA_DOMAIN || 'jira.atlassian.net'}/browse/${detail.issueKey}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-400 hover:text-primary-300 font-mono text-sm"
                        >
                          {detail.issueKey}
                        </a>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-sm text-surface-200 line-clamp-1" title={detail.summary}>
                          {detail.summary}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <span className="text-xs text-surface-400">
                          {new Date(detail.beginDate).toLocaleDateString('fr-FR')}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <span className="text-xs text-surface-400">
                          {new Date(detail.endDate).toLocaleDateString('fr-FR')}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <span className={`text-sm font-bold ${detail.workingDays <= 3 ? 'text-success-400' : detail.workingDays <= 9 ? 'text-warning-400' : 'text-red-400'}`}>
                          {detail.workingDays}j
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span className="text-sm text-surface-300">
                          {detail.ponderation ?? '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-6 pt-4 border-t border-surface-700">
              <button
                onClick={() => setShowResolutionDetails(false)}
                className="w-full px-4 py-2.5 bg-surface-700 hover:bg-surface-600 rounded-lg text-surface-200 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snapshot View Modal */}
      {showSnapshotView && selectedSnapshot && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card-glass p-6 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold text-surface-100 flex items-center gap-2">
                  <History className="w-5 h-5 text-accent-400" />
                  {selectedSnapshot.sprintName}
                </h3>
                <p className="text-sm text-surface-500 mt-1">
                  Sauvegardé le {new Date(selectedSnapshot.savedAt).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowSnapshotView(false);
                  setSelectedSnapshot(null);
                }}
                className="p-2 hover:bg-surface-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-surface-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-6">
              {selectedSnapshot.notes && (
                <div className="bg-surface-800/50 rounded-lg p-4 border border-surface-700">
                  <p className="text-sm text-surface-400 italic">&quot;{selectedSnapshot.notes}&quot;</p>
                </div>
              )}
              
              {/* Stats summary */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-surface-800/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-surface-100">{selectedSnapshot.statusCounts.total}</div>
                  <div className="text-xs text-surface-500">Total tickets</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-slate-400">{selectedSnapshot.statusCounts.todo}</div>
                  <div className="text-xs text-surface-500">À faire</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-400">{selectedSnapshot.statusCounts.inProgress}</div>
                  <div className="text-xs text-surface-500">En cours</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-orange-400">{selectedSnapshot.statusCounts.qa}</div>
                  <div className="text-xs text-surface-500">QA</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-success-400">{selectedSnapshot.statusCounts.resolved}</div>
                  <div className="text-xs text-surface-500">Résolus</div>
                </div>
              </div>
              
              {/* Ponderation stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-surface-800/50 rounded-lg p-4 text-center border-l-4 border-warning-500">
                  <div className="text-xl font-bold text-warning-400">{selectedSnapshot.ponderationByStatus.total}</div>
                  <div className="text-xs text-surface-500">Pond. Totale</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-4 text-center border-l-4 border-success-500">
                  <div className="text-xl font-bold text-success-400">{selectedSnapshot.ponderationByStatus.resolved}</div>
                  <div className="text-xs text-surface-500">Pond. Résolue</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-4 text-center border-l-4 border-primary-500">
                  <div className="text-xl font-bold text-primary-400">
                    {selectedSnapshot.ponderationByStatus.total > 0 
                      ? ((selectedSnapshot.ponderationByStatus.resolved / selectedSnapshot.ponderationByStatus.total) * 100).toFixed(1)
                      : 0}%
                  </div>
                  <div className="text-xs text-surface-500">Progression</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-4 text-center border-l-4 border-cyan-500">
                  <div className="text-xl font-bold text-cyan-400">{formatHours(selectedSnapshot.avgResolutionTimeFromDatesHours)}</div>
                  <div className="text-xs text-surface-500">Temps Moy. Résolution</div>
                </div>
              </div>
              
              {/* Performance indicators */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-surface-800/50 rounded-lg p-4 text-center">
                  <div className="text-lg font-bold text-primary-400">{formatHours(selectedSnapshot.avgFirstResponseTimeHours)}</div>
                  <div className="text-xs text-surface-500">1ère prise en charge</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-4 text-center">
                  <div className="text-lg font-bold text-accent-400">{selectedSnapshot.highPondFastResolutionPercent}%</div>
                  <div className="text-xs text-surface-500">Haute pond. &lt;72h</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-4 text-center">
                  <div className="text-lg font-bold text-warning-400">{selectedSnapshot.veryHighPondFastResolutionPercent}%</div>
                  <div className="text-xs text-surface-500">Très haute &lt;24h</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-4 text-center">
                  <div className="text-lg font-bold text-amber-400">{selectedSnapshot.backlog?.ticketCount || 0}</div>
                  <div className="text-xs text-surface-500">Backlog</div>
                </div>
              </div>
              
              {/* Top assignees */}
              {selectedSnapshot.ponderationByAssignee && selectedSnapshot.ponderationByAssignee.length > 0 && (
                <div className="bg-surface-800/50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-surface-300 mb-3 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Top Contributeurs
                  </h4>
                  <div className="space-y-2">
                    {selectedSnapshot.ponderationByAssignee.slice(0, 5).map((assignee, index) => (
                      <div key={assignee.assignee} className="flex items-center justify-between text-sm">
                        <span className="text-surface-300">{index + 1}. {assignee.assignee}</span>
                        <span className="text-primary-400 font-medium">
                          {assignee.ponderation} pond. ({assignee.ticketCount} tickets)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="mt-6 pt-4 border-t border-surface-700">
              <button
                onClick={() => {
                  setShowSnapshotView(false);
                  setSelectedSnapshot(null);
                }}
                className="w-full px-4 py-2.5 bg-surface-700 hover:bg-surface-600 rounded-lg text-surface-200 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

