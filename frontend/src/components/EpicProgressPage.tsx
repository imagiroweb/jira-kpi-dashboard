import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Flag, Loader2, Search, Users, X } from 'lucide-react';
import {
  epicApi,
  EpicSearchItem,
  EpicChildIssue,
  EpicDetailsResponse,
  EpicProgressResponse,
  jiraApi
} from '../services/api';
import { useStore } from '../store/useStore';

/** Affiche toujours en heures (et minutes si < 1h), sans jours */
function formatHoursOnly(seconds: number): string {
  if (!seconds || seconds <= 0) return '0h';
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  return `${hours.toFixed(1)}h`;
}

/** Préfixes de tickets (ex. INT-123, FAC-456) pour le filtre */
export const TICKET_PREFIXES = ['INT', 'FAC', 'CLI', 'OPT', 'NIM'] as const;
export type TicketPrefixFilter = (typeof TICKET_PREFIXES)[number] | 'all';

function getKeyPrefix(key: string): string {
  return key.split('-')[0]?.toUpperCase() || '';
}

function filterChildrenByPrefix(children: EpicChildIssue[], prefix: TicketPrefixFilter): EpicChildIssue[] {
  if (!prefix || prefix === 'all') return children;
  return children.filter((c) => getKeyPrefix(c.issueKey) === prefix);
}

function getStatusLabel(statusCategoryKey: string | null): string {
  switch (statusCategoryKey) {
    case 'done':
      return 'Terminé';
    case 'indeterminate':
      return 'En cours';
    case 'new':
    default:
      return 'À faire';
  }
}

function getStatusBadgeClass(statusCategoryKey: string | null): string {
  switch (statusCategoryKey) {
    case 'done':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'indeterminate':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'new':
    default:
      return 'bg-surface-600/30 text-surface-300 border-surface-600/40';
  }
}

// Helper to calculate subtotals recursively
function calculateSubtotals(items: EpicChildIssue[]): { estimate: number; spent: number; storyPoints: number } {
  let est = 0;
  let sp = 0;
  let pts = 0;
  for (const item of items) {
    est += item.originalEstimateSeconds;
    sp += item.timeSpentSeconds;
    pts += item.storyPoints || 0;
    if (item.children && item.children.length > 0) {
      const childTotals = calculateSubtotals(item.children);
      est += childTotals.estimate;
      sp += childTotals.spent;
      pts += childTotals.storyPoints;
    }
  }
  return { estimate: est, spent: sp, storyPoints: pts };
}

// Composant pour afficher un enfant et ses sous-enfants
function ChildIssueRow({ child, level = 0, prefixFilter = 'all' }: { child: EpicChildIssue; level?: number; prefixFilter?: TicketPrefixFilter }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = child.children && child.children.length > 0;
  const indent = level * 24;
  
  // Calculate subtotals for items with children
  const subtotals = hasChildren ? calculateSubtotals(child.children!) : null;
  
  // For display: use own value + children subtotals if applicable
  const displayEstimate = child.originalEstimateSeconds + (subtotals?.estimate || 0);
  const displaySpent = child.timeSpentSeconds + (subtotals?.spent || 0);
  const displayStoryPoints = (child.storyPoints || 0) + (subtotals?.storyPoints || 0);
  
  // Au-delà de 100 % = dépassement (ex. 150 %)
  const progressPercent = displayEstimate > 0 
    ? Math.round((displaySpent / displayEstimate) * 100)
    : 0;
  const isOverrun = displayEstimate > 0 && displaySpent > displayEstimate;

  return (
    <>
      <tr className="border-b border-surface-800/50 hover:bg-surface-800/30 transition-colors">
        <td className="px-3 py-2.5" style={{ paddingLeft: `${12 + indent}px` }}>
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-surface-700/50 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-surface-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-surface-400" />
                )}
              </button>
            ) : (
              <div className="w-5 h-5" />
            )}
            <span className="text-xs px-1.5 py-0.5 rounded bg-surface-700/60 text-surface-400 font-mono">
              {child.issueKey}
            </span>
            <span className="text-sm text-surface-200 truncate max-w-[300px]" title={child.summary}>
              {child.summary}
            </span>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span className="text-xs px-2 py-0.5 rounded bg-surface-700/40 text-surface-400">
            {child.issueType}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <span className={`text-xs px-2 py-0.5 rounded border ${getStatusBadgeClass(child.statusCategoryKey)}`}>
            {child.status}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right">
          {displayStoryPoints > 0 ? (
            <span className="text-sm font-medium text-primary-300">
              {displayStoryPoints}
              {hasChildren && <span className="text-xs text-surface-500 ml-0.5">Σ</span>}
            </span>
          ) : (
            <span className="text-sm text-surface-500">-</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right">
          <span className="text-sm text-surface-300">
            {formatHoursOnly(displayEstimate)}
            {hasChildren && displayEstimate > 0 && <span className="text-xs text-surface-500 ml-0.5">Σ</span>}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right">
          <span className={`text-sm ${isOverrun ? 'text-danger-400' : 'text-surface-300'}`}>
            {formatHoursOnly(displaySpent)}
            {hasChildren && displaySpent > 0 && <span className="text-xs text-surface-500 ml-0.5">Σ</span>}
          </span>
        </td>
        <td className="px-3 py-2.5 w-[100px]">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-surface-700 overflow-hidden">
              <div 
                className={`h-full ${isOverrun ? 'bg-danger-500' : 'bg-primary-500'}`}
                style={{ width: `${Math.min(100, progressPercent)}%` }}
              />
            </div>
            <span className="text-xs text-surface-400 w-8 text-right">{progressPercent}%</span>
          </div>
        </td>
      </tr>
      {isExpanded && hasChildren && filterChildrenByPrefix(child.children!, prefixFilter).map(subChild => (
        <ChildIssueRow key={subChild.issueKey} child={subChild} level={level + 1} prefixFilter={prefixFilter} />
      ))}
    </>
  );
}

// Modal de détail d'un Epic/Legend
function EpicDetailModal({ 
  epicKey, 
  onClose,
  prefixFilter = 'all',
}: { 
  epicKey: string; 
  onClose: () => void;
  prefixFilter?: TicketPrefixFilter;
}) {
  const [details, setDetails] = useState<EpicDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDetails = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await epicApi.getDetails(epicKey);
        if (result.success) {
          setDetails({
            ...result,
            children: Array.isArray(result.children) ? result.children : []
          });
        } else {
          setError('Erreur lors du chargement des détails');
        }
      } catch (err) {
        console.error('Failed to load epic details:', err);
        setError('Erreur lors du chargement des détails');
      } finally {
        setIsLoading(false);
      }
    };
    loadDetails();
  }, [epicKey]);

  // Fermer avec Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const progressColor = details?.isOverrun ? 'bg-danger-500' : 'bg-primary-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div 
        className="relative w-full max-w-5xl max-h-[85vh] bg-surface-900 border border-surface-700/60 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary-500/10 border border-primary-500/20">
              <Flag className="w-5 h-5 text-primary-400" />
            </div>
            {details && (
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-surface-400">{details.issueType}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-surface-700/60 text-surface-400 font-mono">
                    {details.epicKey}
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-surface-100">{details.summary}</h2>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-800 transition-colors text-surface-400 hover:text-surface-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-primary-400 animate-spin mr-2" />
              <span className="text-surface-400">Chargement des détails...</span>
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-danger-400">
              {error}
            </div>
          )}

          {!isLoading && details && (
            <div className="space-y-6">
              {/* Progress summary */}
              <div className="grid gap-4 sm:grid-cols-5 lg:grid-cols-6">
                <div className="rounded-xl bg-surface-800/60 border border-surface-700/60 p-4">
                  <div className="text-xs text-surface-500 uppercase tracking-wide">Progression</div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-sm text-surface-300 mb-1.5">
                      <span>{details.progressPercent}%</span>
                      {details.isOverrun && <span className="text-danger-400 text-xs">Dépassé</span>}
                    </div>
                    <div className="h-2 rounded-full bg-surface-700 overflow-hidden">
                      <div className={`h-full ${progressColor}`} style={{ width: `${Math.min(100, details.progressPercent)}%` }} />
                    </div>
                  </div>
                </div>
                <div className="rounded-xl bg-surface-800/60 border border-surface-700/60 p-4">
                  <div className="text-xs text-surface-500 uppercase tracking-wide">Estimation</div>
                  <div className="text-xl font-semibold text-surface-100 mt-1">
                    {formatHoursOnly(details.originalEstimateSeconds)}
                  </div>
                </div>
                <div className="rounded-xl bg-surface-800/60 border border-surface-700/60 p-4">
                  <div className="text-xs text-surface-500 uppercase tracking-wide">Temps passé</div>
                  <div className={`text-xl font-semibold mt-1 ${details.isOverrun ? 'text-danger-400' : 'text-surface-100'}`}>
                    {formatHoursOnly(details.timeSpentSeconds)}
                  </div>
                  {details.macroChiffrageSeconds != null && details.macroChiffrageSeconds > 0 && (
                    <div className="text-xs text-surface-500 mt-1">
                      vs Macro: {details.timeSpentSeconds > details.macroChiffrageSeconds ? '+' : ''}{formatHoursOnly(details.timeSpentSeconds - details.macroChiffrageSeconds)}
                    </div>
                  )}
                </div>
                {details.macroChiffrageSeconds != null && details.macroChiffrageSeconds >= 0 && (
                  <div className="rounded-xl bg-surface-800/60 border border-surface-700/60 p-4">
                    <div className="text-xs text-surface-500 uppercase tracking-wide">Macro chiffrage</div>
                    <div className="text-xl font-semibold text-surface-100 mt-1">
                      {formatHoursOnly(details.macroChiffrageSeconds)}
                    </div>
                  </div>
                )}
                <div className="rounded-xl bg-surface-800/60 border border-surface-700/60 p-4">
                  <div className="text-xs text-surface-500 uppercase tracking-wide">Story Points</div>
                  <div className="text-xl font-semibold text-primary-300 mt-1">
                    {details.totalStoryPoints || 0} pts
                  </div>
                </div>
                <div className="rounded-xl bg-surface-800/60 border border-surface-700/60 p-4">
                  <div className="text-xs text-surface-500 uppercase tracking-wide">Tickets enfants</div>
                  <div className="text-xl font-semibold text-surface-100 mt-1">
                    {(details.children ?? []).length}
                  </div>
                </div>
              </div>

              {/* Children table */}
              <div className="rounded-xl border border-surface-700/60 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-surface-800/80 text-xs uppercase tracking-wide text-surface-500">
                      <th className="px-3 py-3 text-left font-medium">Ticket</th>
                      <th className="px-3 py-3 text-left font-medium">Type</th>
                      <th className="px-3 py-3 text-left font-medium">Statut</th>
                      <th className="px-3 py-3 text-right font-medium">Points</th>
                      <th className="px-3 py-3 text-right font-medium">Estimation</th>
                      <th className="px-3 py-3 text-right font-medium">Passé</th>
                      <th className="px-3 py-3 text-left font-medium w-[100px]">Progression</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(details.children ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-surface-500">
                          Aucun ticket enfant trouvé
                        </td>
                      </tr>
                    ) : (
                      filterChildrenByPrefix(details.children ?? [], prefixFilter).map((child) => (
                        <Fragment key={child.issueKey}>
                          <ChildIssueRow child={child} level={0} prefixFilter={prefixFilter} />
                        </Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const EPICS_PAGE_SIZE = 20;

export function EpicProgressPage() {
  const kpiRefreshTrigger = useStore((s) => s.kpiRefreshTrigger);

  const epicsPayload = useStore((s) => s.epicsProgressPayload) as
    | ({ success?: boolean } & EpicProgressResponse)
    | null;
  const setEpicsProgressPayload = useStore((s) => s.setEpicsProgressPayload);
  const setEpicsProgressLastUpdate = useStore((s) => s.setEpicsProgressLastUpdate);
  const setEpicsLastFiltersKey = useStore((s) => s.setEpicsLastFiltersKey);
  const selectedBoardId = useStore((s) => s.epicsSelectedBoardId);
  const typeFilter = useStore((s) => s.epicsTypeFilter);
  const setEpicsTypeFilter = useStore((s) => s.setEpicsTypeFilter);
  const statusFilter = useStore((s) => s.epicsStatusFilter);
  const setEpicsStatusFilter = useStore((s) => s.setEpicsStatusFilter);
  const page = useStore((s) => s.epicsPage);
  const setEpicsPage = useStore((s) => s.setEpicsPage);
  const prefixFilter = useStore((s) => s.epicsPrefixFilter) as TicketPrefixFilter;
  const setEpicsPrefixFilter = useStore((s) => s.setEpicsPrefixFilter);
  const lastUpdate = useStore((s) => s.epicsProgressLastUpdate);

  const epics = epicsPayload?.epics ?? [];
  const totalEpics = epicsPayload?.total ?? 0;

  const [isLoadingEpics, setIsLoadingEpics] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EpicSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Detail modal state
  const [selectedEpicKey, setSelectedEpicKey] = useState<string | null>(null);

  const filtersKey = useMemo(() => {
    if (!selectedBoardId) return '';
    return `${selectedBoardId}|${typeFilter}|${statusFilter}|${page}|${EPICS_PAGE_SIZE}|${prefixFilter}`;
  }, [selectedBoardId, typeFilter, statusFilter, page, prefixFilter]);

  const filtersKeyRef = useRef(filtersKey);
  filtersKeyRef.current = filtersKey;

  const loadBoards = useCallback(async () => {
    try {
      const result = await jiraApi.getConfiguredBoards();
      if (result.success && result.boards?.length) {
        const st = useStore.getState();
        if (st.epicsSelectedBoardId == null) {
          st.setEpicsSelectedBoardId(result.boards[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load boards:', error);
    }
  }, []);

  const loadEpics = useCallback(
    async (silent = false) => {
      const {
        epicsSelectedBoardId: boardId,
        epicsTypeFilter: tf,
        epicsStatusFilter: sf,
        epicsPage: pageNum,
        epicsPrefixFilter: pf
      } = useStore.getState();
      if (!boardId) return;
      if (!silent) setIsLoadingEpics(true);
      try {
        const result = await epicApi.getProgress(
          boardId,
          tf,
          sf,
          pageNum,
          EPICS_PAGE_SIZE,
          pf !== 'all' ? (pf as TicketPrefixFilter) : undefined
        );
        if (result.success) {
          setEpicsProgressPayload(result);
          setEpicsProgressLastUpdate(new Date());
          const key = filtersKeyRef.current;
          if (key) setEpicsLastFiltersKey(key);
        }
      } catch (error) {
        console.error('Failed to load epic progress:', error);
      } finally {
        if (!silent) setIsLoadingEpics(false);
      }
    },
    [setEpicsProgressPayload, setEpicsProgressLastUpdate, setEpicsLastFiltersKey]
  );

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    if (!selectedBoardId || !filtersKey) return;
    const { epicsLastFiltersKey: lastKey, epicsProgressPayload: cached } = useStore.getState();
    if (lastKey === filtersKey && cached != null) {
      return;
    }
    loadEpics(false);
  }, [selectedBoardId, filtersKey, loadEpics]);

  useEffect(() => {
    if (kpiRefreshTrigger <= 0) return;
    loadEpics(true);
  }, [kpiRefreshTrigger, loadEpics]);

  // Handle search
  const handleSearch = useCallback(async (query: string) => {
    if (!selectedBoardId || query.trim().length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    
    setIsSearching(true);
    try {
      const result = await epicApi.search(selectedBoardId, query, typeFilter, statusFilter);
      if (result.success) {
        setSearchResults(result.results);
        setShowSearchDropdown(true);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [selectedBoardId, typeFilter, statusFilter]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (searchQuery.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        handleSearch(searchQuery);
      }, 300);
    } else {
      setSearchResults([]);
      setShowSearchDropdown(false);
    }
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, handleSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSearchResult = (epicKey: string) => {
    setSelectedEpicKey(epicKey);
    setShowSearchDropdown(false);
    setSearchQuery('');
  };

  const sortedEpics = useMemo(() => {
    return [...epics].sort((a, b) => (b.progressPercent || 0) - (a.progressPercent || 0));
  }, [epics]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary-500/10 border border-primary-500/20">
            <Flag className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-surface-100">Suivi epics</h1>
            <p className="text-sm text-surface-500">
              Progression basee sur l&apos;estimation originale des US enfants et le temps passe.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wide text-surface-500">Type</label>
            <div className="flex rounded-xl bg-surface-900/80 border border-surface-700/50 p-1">
              <button
                onClick={() => { setEpicsTypeFilter('all'); setEpicsPage(1); }}
                className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
                  typeFilter === 'all' 
                    ? 'bg-primary-500/20 text-primary-300' 
                    : 'text-surface-400 hover:text-surface-200'
                }`}
              >
                Tous
              </button>
              <button
                onClick={() => { setEpicsTypeFilter('epic'); setEpicsPage(1); }}
                className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
                  typeFilter === 'epic' 
                    ? 'bg-primary-500/20 text-primary-300' 
                    : 'text-surface-400 hover:text-surface-200'
                }`}
              >
                Épics
              </button>
              <button
                onClick={() => { setEpicsTypeFilter('legend'); setEpicsPage(1); }}
                className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
                  typeFilter === 'legend' 
                    ? 'bg-primary-500/20 text-primary-300' 
                    : 'text-surface-400 hover:text-surface-200'
                }`}
              >
                Legends
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide text-surface-500">Statut</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setEpicsStatusFilter('all'); setEpicsPage(1); }}
                  className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
                    statusFilter === 'all'
                      ? 'bg-primary-500/20 text-primary-300'
                      : 'text-surface-400 hover:text-surface-200'
                  }`}
                >
                  Toutes
                </button>
                <button
                  onClick={() => { setEpicsStatusFilter('done'); setEpicsPage(1); }}
                  className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
                    statusFilter === 'done'
                      ? 'bg-primary-500/20 text-primary-300'
                      : 'text-surface-400 hover:text-surface-200'
                  }`}
                >
                  Terminées
                </button>
                <button
                  onClick={() => { setEpicsStatusFilter('new'); setEpicsPage(1); }}
                  className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
                    statusFilter === 'new'
                      ? 'bg-primary-500/20 text-primary-300'
                      : 'text-surface-400 hover:text-surface-200'
                  }`}
                >
                  À faire
                </button>
                <button
                  onClick={() => { setEpicsStatusFilter('indeterminate'); setEpicsPage(1); }}
                  className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
                    statusFilter === 'indeterminate'
                      ? 'bg-primary-500/20 text-primary-300'
                      : 'text-surface-400 hover:text-surface-200'
                  }`}
                >
                  En cours
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide text-surface-500" title="Filtre les épics/legends dont le résumé commence par ces 3 lettres (ex. FAC064 - ...)">
                Préfixe résumé (3 lettres)
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setEpicsPrefixFilter('all'); setEpicsPage(1); }}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors font-mono ${
                    prefixFilter === 'all'
                      ? 'bg-primary-500/20 text-primary-300'
                      : 'text-surface-400 hover:text-surface-200'
                  }`}
                >
                  Tous
                </button>
                {TICKET_PREFIXES.map((p) => (
                  <button
                    key={p}
                    onClick={() => { setEpicsPrefixFilter(p); setEpicsPage(1); }}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors font-mono ${
                      prefixFilter === p ? 'bg-primary-500/20 text-primary-300' : 'text-surface-400 hover:text-surface-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div ref={searchRef} className="relative">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un epic ou legend par titre..."
            className="w-full rounded-xl bg-surface-900/80 border border-surface-700/50 pl-11 pr-10 py-2.5 text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500/40"
            disabled={!selectedBoardId}
          />
          {isSearching && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500 animate-spin" />
          )}
          {searchQuery && !isSearching && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); setShowSearchDropdown(false); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        
        {/* Dropdown résultats */}
        {showSearchDropdown && searchResults.length > 0 && (
          <div className="absolute z-20 mt-2 w-full bg-surface-900 border border-surface-700/60 rounded-xl shadow-xl overflow-hidden">
            <div className="max-h-80 overflow-y-auto">
              {searchResults.map((result) => (
                <button
                  key={result.epicKey}
                  onClick={() => handleSelectSearchResult(result.epicKey)}
                  className="w-full px-4 py-3 text-left hover:bg-surface-800/60 transition-colors border-b border-surface-800/50 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-surface-700/60 text-surface-400 font-mono">
                      {result.epicKey}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary-500/20 text-primary-300">
                      {result.issueType}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${getStatusBadgeClass(result.statusCategoryKey)}`}>
                      {result.status}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-surface-200 truncate">
                    {result.summary}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        
        {showSearchDropdown && searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
          <div className="absolute z-20 mt-2 w-full bg-surface-900 border border-surface-700/60 rounded-xl shadow-xl p-4 text-center text-surface-500 text-sm">
            Aucun résultat trouvé pour &quot;{searchQuery}&quot;
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-surface-500">
        <span>{lastUpdate ? `Derniere mise a jour: ${lastUpdate.toLocaleString()}` : ''}</span>
      </div>

      <div className="grid gap-4">
        {isLoadingEpics && (
          <div className="flex items-center justify-center rounded-2xl border border-surface-800 bg-surface-900/40 py-16">
            <Loader2 className="w-6 h-6 text-primary-400 animate-spin mr-2" />
            <span className="text-surface-400">Chargement des epics...</span>
          </div>
        )}

        {!isLoadingEpics && sortedEpics.length === 0 && (
          <div className="rounded-2xl border border-surface-800 bg-surface-900/40 p-8 text-center text-surface-500">
            Aucun epic trouve pour cette board.
          </div>
        )}

        {!isLoadingEpics && sortedEpics.map(epic => {
          const progressColor = epic.isOverrun ? 'bg-danger-500' : 'bg-primary-500';
          const statusBadgeClass = epic.statusCategoryKey === 'done'
            ? 'bg-green-500/15 text-green-300'
            : epic.statusCategoryKey === 'indeterminate'
              ? 'bg-primary-500/15 text-primary-300'
              : 'bg-surface-600/30 text-surface-300';
          return (
            <button
              key={epic.epicKey}
              onClick={() => setSelectedEpicKey(epic.epicKey)}
              className="w-full text-left rounded-2xl border border-surface-800 bg-surface-900/40 p-5 space-y-4 hover:border-primary-500/40 hover:bg-surface-900/60 transition-all duration-200 cursor-pointer group"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-surface-500">
                    <span>{epic.issueType}</span>
                    {epic.teams && epic.teams.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-surface-700/60 text-surface-300" title="Équipe(s)">
                        <Users className="w-3.5 h-3.5 text-surface-400" />
                        {epic.teams.join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="text-lg font-semibold text-surface-100 group-hover:text-primary-300 transition-colors">
                    {epic.epicKey} • {epic.summary}
                  </div>
                </div>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${statusBadgeClass}`}>
                  {getStatusLabel(epic.statusCategoryKey)}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-surface-400 mb-2">
                  <span>Progression</span>
                  <span>{epic.progressPercent}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-surface-800 overflow-hidden">
                  <div className={`h-full ${progressColor}`} style={{ width: `${Math.min(100, epic.progressPercent)}%` }} />
                </div>
                {epic.isOverrun && (
                  <div className="text-xs text-danger-400 mt-2">
                    Temps passé supérieur à l&apos;estimation originale.
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-5 text-sm text-surface-300">
                <div className="rounded-xl bg-surface-800/60 border border-surface-700/60 p-3">
                  <div className="text-xs text-surface-500">
                    Estimation originale ({epic.issueType.toLowerCase().includes('legend') ? 'Épics' : 'US'} enfants)
                  </div>
                  <div className="font-semibold">{formatHoursOnly(epic.originalEstimateSeconds)}</div>
                </div>
                <div className="rounded-xl bg-surface-800/60 border border-surface-700/60 p-3">
                  <div className="text-xs text-surface-500">Temps passé (tickets + enfants)</div>
                  <div className="font-semibold">{formatHoursOnly(epic.timeSpentSeconds)}</div>
                  {epic.macroChiffrageSeconds != null && epic.macroChiffrageSeconds > 0 && (
                    <div className="text-xs text-surface-500 mt-1">
                      vs Macro: {epic.timeSpentSeconds > epic.macroChiffrageSeconds ? '+' : ''}{formatHoursOnly(epic.timeSpentSeconds - epic.macroChiffrageSeconds)}
                    </div>
                  )}
                </div>
                {epic.macroChiffrageSeconds != null && epic.macroChiffrageSeconds >= 0 && (
                  <div className="rounded-xl bg-surface-800/60 border border-surface-700/60 p-3">
                    <div className="text-xs text-surface-500">Macro chiffrage</div>
                    <div className="font-semibold">{formatHoursOnly(epic.macroChiffrageSeconds)}</div>
                  </div>
                )}
                <div className="rounded-xl bg-surface-800/60 border border-surface-700/60 p-3">
                  <div className="text-xs text-surface-500">Story Points</div>
                  <div className="font-semibold text-primary-300">{epic.totalStoryPoints || 0} pts</div>
                </div>
                <div className="rounded-xl bg-surface-800/60 border border-surface-700/60 p-3">
                  <div className="text-xs text-surface-500">
                    {epic.issueType.toLowerCase().includes('legend') ? 'Épics enfants' : 'US enfants'}
                  </div>
                  <div className="font-semibold">{epic.childIssueCount}</div>
                </div>
              </div>
            </button>
          );
        })}

        {/* Pagination */}
        {!isLoadingEpics && (totalEpics > 0 || epics.length > 0) && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-surface-800 bg-surface-900/40 px-4 py-3">
            <div className="text-sm text-surface-400">
              Affichage {(page - 1) * EPICS_PAGE_SIZE + 1}-{Math.min(page * EPICS_PAGE_SIZE, totalEpics || epics.length)} sur {totalEpics || epics.length} epics
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEpicsPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-surface-800 border border-surface-700 text-surface-300 hover:bg-surface-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Précédent
              </button>
              <span className="px-3 py-1.5 text-sm text-surface-400">
                Page {page} sur {Math.max(1, Math.ceil((totalEpics || epics.length) / EPICS_PAGE_SIZE))}
              </span>
              <button
                type="button"
                onClick={() => setEpicsPage(page + 1)}
                disabled={totalEpics > 0 && page * EPICS_PAGE_SIZE >= totalEpics}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-surface-800 border border-surface-700 text-surface-300 hover:bg-surface-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Suivant
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedEpicKey && (
        <EpicDetailModal 
          epicKey={selectedEpicKey} 
          onClose={() => setSelectedEpicKey(null)}
          prefixFilter={prefixFilter}
        />
      )}
    </div>
  );
}
