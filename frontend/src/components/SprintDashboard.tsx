import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { 
  FolderKanban, Zap, Ticket, PlayCircle, FlaskConical, 
  Clock, CheckCircle, TrendingUp, ListTodo, Inbox, CalendarDays,
  Save, History, X, Trash2, Eye, Loader2
} from 'lucide-react';
import { DateRangePicker } from './DateRangePicker';
import { ResolvedByDayChart } from './ResolvedByDayChart';
import { useStore, BoardStats } from '../store/useStore';
import { dashboardSnapshotApi, DashboardSnapshotSummary, DashboardSnapshotFull } from '../services/api';

// Type pour les boards configurés
interface ConfiguredBoard {
  id: number;
  name: string;
  projectKey: string | null;
  color: string;
}


const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Couleurs de fallback si l'API ne répond pas
const FALLBACK_COLORS = ['#8b5cf6', '#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#ec4899'];

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 8) return `${hours.toFixed(1)}h`;
  return `${(hours / 8).toFixed(1)}j`;
}

export function SprintDashboard() {
  // Use global store
  const dateRange = useStore((state) => state.dateRange);
  const setDateRange = useStore((state) => state.setDateRange);
  const projectsStats = useStore((state) => state.dashboardStats);
  const setProjectsStats = useStore((state) => state.setDashboardStats);
  const lastUpdate = useStore((state) => state.dashboardLastUpdate);
  const setLastUpdate = useStore((state) => state.setDashboardLastUpdate);
  const isLoading = useStore((state) => state.dashboardLoading);
  const setIsLoading = useStore((state) => state.setDashboardLoading);
  
  // Boards configurés depuis le backend
  const [configuredBoards, setConfiguredBoards] = useState<ConfiguredBoard[]>([]);
  const [boardsLoaded, setBoardsLoaded] = useState(false);
  const [useActiveSprint, setUseActiveSprint] = useState(true);
  
  // Auth state
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  
  // Real-time refresh trigger
  const kpiRefreshTrigger = useStore((state) => state.kpiRefreshTrigger);
  
  // Snapshot states
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showSnapshotView, setShowSnapshotView] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotNotes, setSnapshotNotes] = useState('');
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [snapshots, setSnapshots] = useState<DashboardSnapshotSummary[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<DashboardSnapshotFull | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const didInitialLoad = useRef(false);

  // Charger les boards configurés depuis l'API
  useEffect(() => {
    const loadConfiguredBoards = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/jira/configured-boards`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && Array.isArray(result.boards)) {
            // API returns objects with id, name and projectKey
            const boards = result.boards.map((b: { id: number; name: string; projectKey: string | null }, index: number) => ({
              id: b.id,
              name: b.name || `Board ${b.id}`,
              projectKey: b.projectKey,
              color: FALLBACK_COLORS[index % FALLBACK_COLORS.length]
            }));
            setConfiguredBoards(boards);
            console.log('✅ Boards configurés chargés:', boards);
          }
        }
      } catch (err) {
        console.error('❌ Erreur chargement boards configurés:', err);
      } finally {
        setBoardsLoaded(true);
      }
    };
    
    loadConfiguredBoards();
  }, []);

  // Load data for all boards
  // silent = true means no loading state (for background refreshes)
  const loadAllBoards = useCallback(async (forceRefresh = false, silent = false) => {
    // Skip if boards not loaded yet or already have data
    if (configuredBoards.length === 0) {
      return;
    }
    
    if (!forceRefresh && projectsStats.length > 0) {
      return;
    }
    
    // Only show loading indicator for non-silent refreshes
    if (!silent) {
      setIsLoading(true);
    }
    
    const allStats: BoardStats[] = [];
    
    // Load boards sequentially to avoid rate limiting
    for (const board of configuredBoards) {
      try {
        // Sprint actif: pas de from/to. Période personnalisée: from/to pour issues mises à jour dans la plage
        const params = new URLSearchParams();
        if (!useActiveSprint && dateRange.from && dateRange.to) {
          params.set('from', dateRange.from);
          params.set('to', dateRange.to);
        }
        const query = params.toString();
        const sprintIssuesResponse = await fetch(
          `${API_BASE_URL}/jira/board/${board.id}/sprint-issues${query ? `?${query}` : ''}`
        );
        
        if (sprintIssuesResponse.status === 429) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        
        let sprintData = {
          statusCounts: { total: 0, todo: 0, inProgress: 0, qa: 0, resolved: 0 },
          storyPointsByStatus: { total: 0, todo: 0, inProgress: 0, qa: 0, resolved: 0 },
          totalStoryPoints: 0,
          totalTimeSeconds: 0,
          backlog: { ticketCount: 0, storyPoints: 0 },
          issues: [] as Array<{ originalEstimateSeconds: number | null }>
        };
        
        if (sprintIssuesResponse.ok) {
          const sprintResult = await sprintIssuesResponse.json();
          if (sprintResult.success) {
            sprintData = {
              ...sprintResult,
              storyPointsByStatus: sprintResult.storyPointsByStatus || { total: 0, todo: 0, inProgress: 0, qa: 0, resolved: 0 },
              totalTimeSeconds: sprintResult.totalTimeSeconds || 0
            };
          }
        }

        // Time is now calculated per-board in the backend from actual board issues
        const totalTimeHours = (sprintData.totalTimeSeconds || 0) / 3600;

        // Calculate estimated points from sprint issues
        const estimatedPoints = sprintData.issues.reduce(
          (sum, t) => sum + (t.originalEstimateSeconds ? (t.originalEstimateSeconds / 3600 / 8) : 0), 
          0
        );
        
        // Build stats using sprint issues for status counters
        const stats: BoardStats = {
          boardId: board.id,
          name: board.name,
          projectKey: board.projectKey,
          color: board.color,
          totalPoints: sprintData.storyPointsByStatus.total,
          todoPoints: sprintData.storyPointsByStatus.todo,
          inProgressPoints: sprintData.storyPointsByStatus.inProgress,
          qaPoints: sprintData.storyPointsByStatus.qa,
          resolvedPoints: sprintData.storyPointsByStatus.resolved,
          estimatedPoints,
          totalTickets: sprintData.statusCounts.total,
          todoTickets: sprintData.statusCounts.todo,
          inProgressTickets: sprintData.statusCounts.inProgress,
          qaTickets: sprintData.statusCounts.qa,
          resolvedTickets: sprintData.statusCounts.resolved,
          totalTimeHours,
          backlogTickets: sprintData.backlog?.ticketCount || 0,
          backlogPoints: sprintData.backlog?.storyPoints || 0
        };
        
        allStats.push(stats);
        
        // Small delay between requests
        await new Promise(r => setTimeout(r, 300));
        
      } catch (err) {
        console.error(`Failed to load board ${board.id}:`, err);
      }
    }
    
    // Only update state if data actually changed (prevents unnecessary re-renders)
    const hasChanged = JSON.stringify(allStats) !== JSON.stringify(projectsStats);
    if (hasChanged) {
      setProjectsStats(allStats);
      setLastUpdate(new Date());
    }
    
    if (!silent) {
      setIsLoading(false);
    }
  }, [dateRange, useActiveSprint, configuredBoards, projectsStats, setIsLoading, setProjectsStats, setLastUpdate]);

  // Handle date change - switch to custom date mode
  const handleDateChange = useCallback((newRange: { from: string; to: string }) => {
    setUseActiveSprint(false);
    setDateRange(newRange);
  }, [setDateRange]);

  // Switch back to active sprint mode
  const handleActiveSprintClick = useCallback(() => {
    setUseActiveSprint(true);
    // Force reload with active sprint
    loadAllBoards(true);
  }, [loadAllBoards]);

  // Load once when boards are loaded (ref avoids re-run when projectsStats updates)
  useEffect(() => {
    if (!boardsLoaded || configuredBoards.length === 0 || didInitialLoad.current) return;
    didInitialLoad.current = true;
    loadAllBoards(true);
  }, [boardsLoaded, configuredBoards.length, loadAllBoards]);

  // Reload when date range changes (with loading indicator)
  useEffect(() => {
    if (configuredBoards.length > 0) {
      loadAllBoards(true, false);
    }
  }, [configuredBoards.length, loadAllBoards, dateRange.from, dateRange.to]);

  // Silent refresh when kpiRefreshTrigger changes (no loading indicator)
  useEffect(() => {
    if (configuredBoards.length > 0 && kpiRefreshTrigger > 0) {
      loadAllBoards(true, true);
    }
  }, [configuredBoards.length, kpiRefreshTrigger, loadAllBoards]);

  // Totals
  const totals = useMemo(() => {
    return projectsStats.reduce((acc, p) => ({
      totalPoints: acc.totalPoints + p.totalPoints,
      todoPoints: acc.todoPoints + p.todoPoints,
      inProgressPoints: acc.inProgressPoints + p.inProgressPoints,
      qaPoints: acc.qaPoints + p.qaPoints,
      resolvedPoints: acc.resolvedPoints + p.resolvedPoints,
      estimatedPoints: acc.estimatedPoints + p.estimatedPoints,
      totalTickets: acc.totalTickets + p.totalTickets,
      todoTickets: acc.todoTickets + p.todoTickets,
      inProgressTickets: acc.inProgressTickets + p.inProgressTickets,
      qaTickets: acc.qaTickets + p.qaTickets,
      resolvedTickets: acc.resolvedTickets + p.resolvedTickets,
      totalTimeHours: acc.totalTimeHours + p.totalTimeHours,
      backlogTickets: acc.backlogTickets + p.backlogTickets,
      backlogPoints: acc.backlogPoints + p.backlogPoints
    }), {
      totalPoints: 0,
      todoPoints: 0,
      inProgressPoints: 0,
      qaPoints: 0,
      resolvedPoints: 0,
      estimatedPoints: 0,
      totalTickets: 0,
      todoTickets: 0,
      inProgressTickets: 0,
      qaTickets: 0,
      resolvedTickets: 0,
      totalTimeHours: 0,
      backlogTickets: 0,
      backlogPoints: 0
    });
  }, [projectsStats]);

  // Load snapshots
  const loadSnapshots = useCallback(async () => {
    setLoadingSnapshots(true);
    try {
      const result = await dashboardSnapshotApi.getSnapshots();
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
    if (!snapshotName.trim() || projectsStats.length === 0) return;
    
    setSavingSnapshot(true);
    try {
      const result = await dashboardSnapshotApi.saveSnapshot(
        snapshotName.trim(),
        projectsStats,
        totals,
        dateRange,
        snapshotNotes.trim() || undefined
      );
      if (result.success) {
        setShowSaveModal(false);
        setSnapshotName('');
        setSnapshotNotes('');
        loadSnapshots();
      }
    } catch (err) {
      console.error('Failed to save snapshot:', err);
    } finally {
      setSavingSnapshot(false);
    }
  }, [snapshotName, snapshotNotes, projectsStats, totals, dateRange, loadSnapshots]);

  // Load a specific snapshot
  const handleViewSnapshot = useCallback(async (id: string) => {
    setLoadingSnapshot(true);
    try {
      const result = await dashboardSnapshotApi.getSnapshot(id);
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
      const result = await dashboardSnapshotApi.deleteSnapshot(id);
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
            <h1 className="text-3xl font-bold gradient-text mb-2">
              Dashboard Sprint
            </h1>
            <p className="text-surface-400">
              Tendances globales par projet
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
            {isAuthenticated && projectsStats.length > 0 && (
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
              Mode: Sprint actif (openSprints)
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

      {/* Global Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-12 gap-3 mb-8">
        {/* Story Points par statut */}
        <div className="card-glass p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
            <Zap className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider">SP À faire</span>
          </div>
          <div className="text-2xl font-bold text-slate-400">{totals.todoPoints}</div>
        </div>
        
        <div className="card-glass p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-blue-400 mb-1">
            <Zap className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider">SP En cours</span>
          </div>
          <div className="text-2xl font-bold text-blue-400">{totals.inProgressPoints}</div>
        </div>
        
        <div className="card-glass p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-orange-400 mb-1">
            <Zap className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider">SP QA</span>
          </div>
          <div className="text-2xl font-bold text-orange-400">{totals.qaPoints}</div>
        </div>
        
        <div className="card-glass p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-success-400 mb-1">
            <Zap className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider">SP Résolus</span>
          </div>
          <div className="text-2xl font-bold text-success-400">{totals.resolvedPoints}</div>
        </div>
        
        <div className="card-glass p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-purple-400 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider">Estimation</span>
          </div>
          <div className="text-2xl font-bold text-surface-100">{totals.estimatedPoints.toFixed(0)}</div>
          <div className="text-[10px] text-surface-500">jours</div>
        </div>
        
        <div className="card-glass p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-accent-400 mb-1">
            <Ticket className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider">Total</span>
          </div>
          <div className="text-2xl font-bold text-surface-100">{totals.totalTickets}</div>
          <div className="text-[10px] text-surface-500">tickets</div>
        </div>
        
        <div className="card-glass p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
            <ListTodo className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider">À faire</span>
          </div>
          <div className="text-2xl font-bold text-slate-400">{totals.todoTickets}</div>
        </div>
        
        <div className="card-glass p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-blue-400 mb-1">
            <PlayCircle className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider">En cours</span>
          </div>
          <div className="text-2xl font-bold text-blue-400">{totals.inProgressTickets}</div>
        </div>
        
        <div className="card-glass p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-orange-400 mb-1">
            <FlaskConical className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider">QA</span>
          </div>
          <div className="text-2xl font-bold text-orange-400">{totals.qaTickets}</div>
        </div>
        
        <div className="card-glass p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-success-400 mb-1">
            <CheckCircle className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider">Résolus</span>
          </div>
          <div className="text-2xl font-bold text-success-400">{totals.resolvedTickets}</div>
        </div>
        
        <div className="card-glass p-3 text-center border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-center gap-1 text-amber-400 mb-1">
            <Inbox className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider">Backlog</span>
          </div>
          <div className="text-2xl font-bold text-amber-400">{totals.backlogTickets}</div>
        </div>
        
        <div className="card-glass p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-primary-400 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider">Temps</span>
          </div>
          <div className="text-2xl font-bold text-surface-100">{formatHours(totals.totalTimeHours)}</div>
        </div>
      </div>

      {/* Boards Grid */}
      {isLoading || !boardsLoaded ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(configuredBoards.length > 0 ? configuredBoards : [{id: 1}, {id: 2}, {id: 3}, {id: 4}]).map((b) => (
            <div key={b.id} className="card-glass p-6 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-surface-700 rounded-xl" />
                <div className="h-6 bg-surface-700 rounded w-32" />
              </div>
              <div className="space-y-3">
                <div className="h-8 bg-surface-700 rounded" />
                <div className="h-20 bg-surface-700 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {projectsStats.map((board) => {
            const progressPercent = board.totalTickets > 0 
              ? (board.resolvedTickets / board.totalTickets) * 100 
              : 0;
            
            return (
              <div key={board.boardId} className="card-glass p-6">
                {/* Board Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${board.color}20` }}
                    >
                      <FolderKanban className="w-5 h-5" style={{ color: board.color }} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-surface-100">{board.name}</h3>
                      <span className="text-xs text-surface-500 font-mono">
                        Board #{board.boardId}
                        {board.projectKey && ` • ${board.projectKey}`}
                      </span>
                    </div>
                  </div>
                  {/* Story Points par statut */}
                  <div className="flex items-center gap-2 text-sm">
                    <div className="text-center">
                      <div className="font-bold text-slate-400">{board.todoPoints}</div>
                      <div className="text-[9px] text-surface-500">SP todo</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-blue-400">{board.inProgressPoints}</div>
                      <div className="text-[9px] text-surface-500">SP dev</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-orange-400">{board.qaPoints}</div>
                      <div className="text-[9px] text-surface-500">SP QA</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-success-400">{board.resolvedPoints}</div>
                      <div className="text-[9px] text-surface-500">SP done</div>
                    </div>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-surface-500 mb-1">
                    <span>Progression</span>
                    <span>{progressPercent.toFixed(0)}%</span>
                  </div>
                  <div className="h-3 bg-surface-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-success-500 to-success-400 transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-7 gap-2 text-center">
                  <div className="bg-surface-800/50 rounded-lg p-2">
                    <div className="text-lg font-bold text-surface-100">{board.totalTickets}</div>
                    <div className="text-[10px] text-surface-500 uppercase">Total</div>
                  </div>
                  <div className="bg-surface-800/50 rounded-lg p-2">
                    <div className="text-lg font-bold text-slate-400">{board.todoTickets}</div>
                    <div className="text-[10px] text-surface-500 uppercase">À faire</div>
                  </div>
                  <div className="bg-surface-800/50 rounded-lg p-2">
                    <div className="text-lg font-bold text-blue-400">{board.inProgressTickets}</div>
                    <div className="text-[10px] text-surface-500 uppercase">En cours</div>
                  </div>
                  <div className="bg-surface-800/50 rounded-lg p-2">
                    <div className="text-lg font-bold text-orange-400">{board.qaTickets}</div>
                    <div className="text-[10px] text-surface-500 uppercase">QA</div>
                  </div>
                  <div className="bg-surface-800/50 rounded-lg p-2">
                    <div className="text-lg font-bold text-success-400">{board.resolvedTickets}</div>
                    <div className="text-[10px] text-surface-500 uppercase">Résolus</div>
                  </div>
                  <div className="bg-amber-500/10 rounded-lg p-2 border border-amber-500/30">
                    <div className="text-lg font-bold text-amber-400">{board.backlogTickets}</div>
                    <div className="text-[10px] text-amber-500 uppercase">Backlog</div>
                  </div>
                  <div className="bg-surface-800/50 rounded-lg p-2">
                    <div className="text-lg font-bold text-primary-400">{formatHours(board.totalTimeHours)}</div>
                    <div className="text-[10px] text-surface-500 uppercase">Temps</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Resolved by day chart - per team, same date context as page (sprint actif or plage) */}
      {!isLoading && configuredBoards.length > 0 && (
        <div className="mt-8">
          <ResolvedByDayChart
            dateRange={dateRange}
            boards={configuredBoards.map((b) => ({ id: b.id, name: b.name, color: b.color }))}
            useActiveSprint={useActiveSprint}
          />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && projectsStats.length === 0 && (
        <div className="text-center py-16 text-surface-500">
          <FolderKanban className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg">Aucune donnée pour cette période</p>
          <p className="text-sm text-surface-600 mt-1">Vérifiez les dates ou actualisez</p>
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
              
              <div className="bg-surface-800/50 rounded-lg p-4 border border-surface-700">
                <p className="text-sm text-surface-400 mb-2">Résumé des données à sauvegarder :</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-surface-500">Projets:</span>
                    <span className="text-surface-200 ml-2">{projectsStats.length}</span>
                  </div>
                  <div>
                    <span className="text-surface-500">Tickets:</span>
                    <span className="text-surface-200 ml-2">{totals.totalTickets}</span>
                  </div>
                  <div>
                    <span className="text-surface-500">Résolus:</span>
                    <span className="text-success-400 ml-2">{totals.resolvedTickets}</span>
                  </div>
                  <div>
                    <span className="text-surface-500">Story Points:</span>
                    <span className="text-primary-400 ml-2">{totals.totalPoints}</span>
                  </div>
                </div>
              </div>
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
                            <span className="text-primary-400">
                              <Zap className="w-4 h-4 inline mr-1" />
                              {snapshot.summary.totalPoints} SP
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

      {/* Snapshot View Modal */}
      {showSnapshotView && selectedSnapshot && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card-glass p-6 w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-up">
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
              
              {/* Totals summary */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="bg-surface-800/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-surface-100">{selectedSnapshot.totals.totalTickets}</div>
                  <div className="text-xs text-surface-500">Total tickets</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-success-400">{selectedSnapshot.totals.resolvedTickets}</div>
                  <div className="text-xs text-surface-500">Résolus</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-primary-400">{selectedSnapshot.totals.totalPoints}</div>
                  <div className="text-xs text-surface-500">Total SP</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-success-400">{selectedSnapshot.totals.resolvedPoints}</div>
                  <div className="text-xs text-surface-500">SP Résolus</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-amber-400">{selectedSnapshot.totals.backlogTickets}</div>
                  <div className="text-xs text-surface-500">Backlog</div>
                </div>
                <div className="bg-surface-800/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-cyan-400">{formatHours(selectedSnapshot.totals.totalTimeHours)}</div>
                  <div className="text-xs text-surface-500">Temps total</div>
                </div>
              </div>
              
              {/* Projects Grid */}
              <div>
                <h4 className="text-lg font-semibold text-surface-200 mb-4 flex items-center gap-2">
                  <FolderKanban className="w-5 h-5" />
                  Détails par Projet
                </h4>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {selectedSnapshot.projectsStats.map((project) => {
                    const progressPercent = project.totalTickets > 0 
                      ? (project.resolvedTickets / project.totalTickets) * 100 
                      : 0;
                    
                    return (
                      <div key={project.key} className="bg-surface-800/50 rounded-lg p-4 border border-surface-700">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-8 h-8 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: `${project.color}20` }}
                            >
                              <FolderKanban className="w-4 h-4" style={{ color: project.color }} />
                            </div>
                            <div>
                              <h5 className="font-medium text-surface-100">{project.name}</h5>
                              <span className="text-xs text-surface-500">{project.key}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-success-400">{project.resolvedPoints} SP</div>
                            <div className="text-xs text-surface-500">sur {project.totalPoints}</div>
                          </div>
                        </div>
                        
                        {/* Progress bar */}
                        <div className="h-2 bg-surface-700 rounded-full overflow-hidden mb-3">
                          <div
                            className="h-full bg-gradient-to-r from-success-500 to-success-400"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        
                        <div className="grid grid-cols-5 gap-2 text-center text-sm">
                          <div>
                            <div className="font-medium text-surface-100">{project.totalTickets}</div>
                            <div className="text-[10px] text-surface-500">Total</div>
                          </div>
                          <div>
                            <div className="font-medium text-slate-400">{project.todoTickets}</div>
                            <div className="text-[10px] text-surface-500">Todo</div>
                          </div>
                          <div>
                            <div className="font-medium text-blue-400">{project.inProgressTickets}</div>
                            <div className="text-[10px] text-surface-500">Dev</div>
                          </div>
                          <div>
                            <div className="font-medium text-orange-400">{project.qaTickets}</div>
                            <div className="text-[10px] text-surface-500">QA</div>
                          </div>
                          <div>
                            <div className="font-medium text-success-400">{project.resolvedTickets}</div>
                            <div className="text-[10px] text-surface-500">Done</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
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
