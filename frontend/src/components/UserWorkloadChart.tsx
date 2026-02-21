import { useState, useEffect } from 'react';
import { Users, Clock, AlertCircle, TrendingUp, FileText, ChevronDown } from 'lucide-react';

interface UserWorkloadData {
  accountId: string;
  displayName: string;
  totalHours: number;
  worklogCount: number;
}

interface SavedReport {
  id: string;
  name: string;
  description?: string;
}

interface UserWorkloadChartProps {
  dateRange: { from: string; to: string };
  selectedProjects: string[];
  useActiveSprint?: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

function formatHours(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)}min`;
  }
  if (hours < 8) {
    return `${hours.toFixed(1)}h`;
  }
  const days = hours / 8;
  return `${days.toFixed(1)}j`;
}

function getUserColor(index: number): string {
  const colors = [
    '#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
    '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
  ];
  return colors[index % colors.length];
}

export function UserWorkloadChart({ dateRange, selectedProjects, useActiveSprint = false }: UserWorkloadChartProps) {
  const [data, setData] = useState<UserWorkloadData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    totalHours: number;
    worklogCount: number;
    uniqueUsers: number;
  } | null>(null);

  // Saved reports
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [isReportSelectorOpen, setIsReportSelectorOpen] = useState(false);
  const [loadingReports, setLoadingReports] = useState(true);

  // Load saved reports
  useEffect(() => {
    const loadReports = async () => {
      setLoadingReports(true);
      try {
        const response = await fetch(`${API_BASE_URL}/worklog/saved-reports`);
        
        // Skip on rate limiting or errors - not critical
        if (!response.ok) {
          console.warn('Could not load saved reports:', response.status);
          return;
        }
        
        const result = await response.json();
        
        if (result.success && result.reports) {
          setSavedReports(result.reports);
        }
      } catch (err) {
        console.error('Failed to load saved reports:', err);
      } finally {
        setLoadingReports(false);
      }
    };

    loadReports();
  }, []);

  // Load workload data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        let result;

        let response;
        
        if (selectedReportId) {
          // Execute saved report
          const params = new URLSearchParams();
          params.append('from', dateRange.from);
          params.append('to', dateRange.to);
          if (selectedProjects.length === 1) {
            params.append('projectKey', selectedProjects[0]);
          }
          
          response = await fetch(
            `${API_BASE_URL}/worklog/saved-reports/${selectedReportId}/execute?${params}`
          );
        } else {
          // Default: use report endpoint
          const params = new URLSearchParams();
          if (useActiveSprint) {
            params.append('activeSprint', 'true');
          } else {
            params.append('from', dateRange.from);
            params.append('to', dateRange.to);
          }
          params.append('groupBy', 'user');
          if (selectedProjects.length === 1) {
            params.append('projectKey', selectedProjects[0]);
          }
          
          response = await fetch(`${API_BASE_URL}/worklog/report?${params}`);
        }
        
        // Handle rate limiting and errors
        if (response.status === 429) {
          setError('Trop de requêtes. Veuillez patienter quelques secondes.');
          return;
        }
        
        if (!response.ok) {
          setError(`Erreur serveur: ${response.status}`);
          return;
        }
        
        result = await response.json();

        console.log('Workload API response:', result);

        if (result.success) {
          let userData: UserWorkloadData[] = [];
          
          // Handle different response formats
          if (Array.isArray(result.data)) {
            userData = result.data.map((user: any) => ({
              accountId: user.accountId || user.displayName,
              displayName: user.displayName || 'Unknown',
              totalHours: user.timeSpentHours || user.totalHours || 0,
              worklogCount: user.worklogCount || 0
            }));
          } else if (result.data && typeof result.data === 'object') {
            userData = Object.entries(result.data).map(([displayName, hours]) => ({
              accountId: displayName,
              displayName,
              totalHours: (typeof hours === 'number' ? hours : 0),
              worklogCount: 0
            }));
          }
          
          userData.sort((a, b) => b.totalHours - a.totalHours);
          setData(userData);
          setSummary(result.summary || null);
        } else {
          setError(result.message || 'Erreur lors du chargement');
        }
      } catch (err) {
        console.error('Failed to fetch workload data:', err);
        setError('Impossible de charger les données WorklogPro');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [dateRange, selectedProjects, selectedReportId, useActiveSprint]);

  const maxHours = Math.max(...data.map(d => d.totalHours), 1);
  const selectedReport = savedReports.find(r => r.id === selectedReportId);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="card-glass p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-700 animate-pulse" />
            <div>
              <div className="h-5 bg-surface-700 rounded w-44 mb-2 animate-pulse" />
              <div className="h-4 bg-surface-700/50 rounded w-56 animate-pulse" />
            </div>
          </div>
          <div className="h-9 bg-surface-700 rounded-lg w-40 animate-pulse" />
        </div>
        <div className="space-y-3">
          {[100, 80, 65, 50, 35, 25].map((width, i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-surface-800/50">
              <div className="w-6 h-4 bg-surface-700 rounded animate-pulse" />
              <div className="w-44 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-700 animate-pulse" />
                <div className="h-4 bg-surface-700 rounded w-24 animate-pulse" />
              </div>
              <div className="flex-1 h-8 bg-surface-900 rounded-lg overflow-hidden">
                <div 
                  className="h-full bg-surface-700 rounded-lg animate-pulse"
                  style={{ width: `${width}%` }}
                />
              </div>
              <div className="w-28 text-right">
                <div className="h-4 bg-surface-700 rounded mb-1 animate-pulse" />
                <div className="h-3 bg-surface-700/50 rounded w-14 ml-auto animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="card-glass p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-surface-100">Temps par utilisateur</h3>
            <p className="text-sm text-surface-500">WorklogPro</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-red-400 bg-red-500/10 rounded-lg p-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-medium">{error}</p>
            <p className="text-sm text-red-300/70 mt-1">
              Vérifiez que WorklogPro est configuré.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card-glass p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-500/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-accent-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-surface-100">
              Temps par utilisateur
            </h3>
            <p className="text-sm text-surface-500">
              {selectedReport ? selectedReport.name : 'WorklogPro'} • {useActiveSprint ? 'Sprint actif' : `${dateRange.from} → ${dateRange.to}`}
            </p>
          </div>
        </div>
        
        {/* Report Selector */}
        <div className="relative">
          <button
            onClick={() => setIsReportSelectorOpen(!isReportSelectorOpen)}
            className="flex items-center gap-2 px-3 py-2 bg-surface-800 hover:bg-surface-700 border border-surface-600 rounded-lg text-surface-200 transition-colors"
          >
            <FileText className="w-4 h-4 text-accent-400" />
            <span className="text-sm font-medium max-w-[120px] truncate">
              {selectedReport ? selectedReport.name : 'Temps réel'}
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isReportSelectorOpen ? 'rotate-180' : ''}`} />
          </button>

          {isReportSelectorOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsReportSelectorOpen(false)} />
              <div className="absolute right-0 mt-2 z-50 bg-surface-800 border border-surface-600 rounded-xl shadow-xl min-w-[250px] max-h-[300px] overflow-y-auto">
                {/* Default option */}
                <button
                  onClick={() => {
                    setSelectedReportId(null);
                    setIsReportSelectorOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    !selectedReportId 
                      ? 'bg-primary-500/20 text-primary-300' 
                      : 'hover:bg-surface-700 text-surface-300'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <div>
                    <div className="font-medium text-sm">Temps réel</div>
                    <div className="text-xs text-surface-500">Données en direct</div>
                  </div>
                </button>

                {savedReports.length > 0 && (
                  <>
                    <div className="border-t border-surface-700 my-1" />
                    <div className="px-4 py-2 text-xs text-surface-500 uppercase tracking-wider">
                      Rapports sauvegardés
                    </div>
                    {savedReports.map((report) => (
                      <button
                        key={report.id}
                        onClick={() => {
                          setSelectedReportId(report.id);
                          setIsReportSelectorOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          selectedReportId === report.id 
                            ? 'bg-primary-500/20 text-primary-300' 
                            : 'hover:bg-surface-700 text-surface-300'
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                        <div>
                          <div className="font-medium text-sm">{report.name}</div>
                          {report.description && (
                            <div className="text-xs text-surface-500 truncate max-w-[180px]">
                              {report.description}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {loadingReports && (
                  <div className="px-4 py-3 text-sm text-surface-500">
                    Chargement des rapports...
                  </div>
                )}

                {!loadingReports && savedReports.length === 0 && (
                  <div className="px-4 py-3 text-sm text-surface-500">
                    Aucun rapport sauvegardé
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stats summary */}
      {summary && (
        <div className="flex items-center gap-4 mb-4 text-sm">
          <div className="text-surface-400">
            <span className="text-surface-200 font-medium">{summary.uniqueUsers}</span> utilisateurs
          </div>
          <div className="text-surface-400">
            <span className="text-surface-200 font-medium">{summary.totalHours.toFixed(1)}h</span> total
          </div>
          <div className="text-surface-400">
            <span className="text-surface-200 font-medium">{summary.worklogCount}</span> entrées
          </div>
        </div>
      )}

      {/* Data */}
      {data.length === 0 ? (
        <div className="text-center py-12 text-surface-500">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucun worklog trouvé pour cette période</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((user, index) => {
            const barWidth = (user.totalHours / maxHours) * 100;
            const color = getUserColor(index);
            const workDays = user.totalHours / 8;
            
            return (
              <div
                key={user.accountId}
                className="flex items-center gap-4 p-3 rounded-lg bg-surface-800/50 hover:bg-surface-800 transition-colors"
              >
                <div className="w-6 text-center text-surface-500 text-sm font-medium">
                  {index + 1}
                </div>
                <div className="w-44 flex items-center gap-3">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                    style={{ backgroundColor: color }}
                  >
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-surface-200 font-medium truncate">
                    {user.displayName}
                  </span>
                </div>
                <div className="flex-1 h-8 bg-surface-900 rounded-lg overflow-hidden relative">
                  <div
                    className="h-full rounded-lg transition-all duration-500 ease-out flex items-center justify-end pr-3"
                    style={{
                      width: `${Math.max(barWidth, 5)}%`,
                      backgroundColor: color,
                      opacity: 0.8,
                    }}
                  >
                    <span className="text-white text-sm font-bold">
                      {formatHours(user.totalHours)}
                    </span>
                  </div>
                </div>
                <div className="w-28 text-right">
                  <div className="text-surface-300 font-medium">
                    {user.totalHours.toFixed(1)}h
                  </div>
                  <div className="text-xs text-surface-500">
                    {workDays.toFixed(1)} jours
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {data.length > 0 && summary && (
        <div className="mt-6 pt-4 border-t border-surface-700">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-surface-400">
              <TrendingUp className="w-4 h-4" />
              <span>
                Moyenne: {' '}
                <span className="text-surface-200 font-medium">
                  {(summary.totalHours / data.length).toFixed(1)}h
                </span>
                {' '}par utilisateur
              </span>
            </div>
            {selectedReport && (
              <div className="flex items-center gap-2 text-accent-400">
                <FileText className="w-4 h-4" />
                <span className="text-xs">{selectedReport.name}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
