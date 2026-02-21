import { useState, useEffect, useMemo } from 'react';
import { User, Ticket, Clock, CheckCircle, AlertCircle, ChevronDown, Search, Zap } from 'lucide-react';

interface TicketData {
  issueKey: string;
  issueSummary: string;
  issueType: string;
  status: string;
  timeSpentHours: number;
  timeSpentSeconds: number;
  worklogCount: number;
  storyPoints: number | null;
  weight: number | null;
}

interface UserOption {
  accountId: string;
  displayName: string;
  totalHours: number;
}

interface UserTicketsChartProps {
  dateRange: { from: string; to: string };
  selectedProjects: string[];
  useActiveSprint?: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Colors by issue type
const issueTypeColors: Record<string, string> = {
  'Bug': '#ef4444',
  'Story': '#10b981',
  'Task': '#6366f1',
  'Epic': '#8b5cf6',
  'Sub-task': '#06b6d4',
  'Support': '#f59e0b',
  'Improvement': '#14b8a6',
  'New Feature': '#ec4899',
  'default': '#64748b'
};

function getIssueTypeColor(type: string): string {
  return issueTypeColors[type] || issueTypeColors['default'];
}

function formatHours(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)}min`;
  }
  return `${hours.toFixed(1)}h`;
}

export function UserTicketsChart({ dateRange, selectedProjects, useActiveSprint = false }: UserTicketsChartProps) {
  // Users list
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [isUserSelectorOpen, setIsUserSelectorOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  // Tickets data
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load users from worklog report
  useEffect(() => {
    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
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

        const response = await fetch(`${API_BASE_URL}/worklog/report?${params}`);
        
        // Handle rate limiting and errors
        if (response.status === 429) {
          console.warn('Rate limited, retrying in 2 seconds...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          setLoadingUsers(false);
          return;
        }
        
        if (!response.ok) {
          console.error(`Server error: ${response.status}`);
          setLoadingUsers(false);
          return;
        }
        
        const result = await response.json();

        if (result.success && Array.isArray(result.data)) {
          const userList = result.data.map((user: { accountId?: string; displayName?: string; timeSpentHours?: number }) => ({
            accountId: user.accountId,
            displayName: user.displayName,
            totalHours: user.timeSpentHours || 0
          }));
          userList.sort((a: UserOption, b: UserOption) => b.totalHours - a.totalHours);
          setUsers(userList);
        }
      } catch (err) {
        console.error('Failed to load users:', err);
      } finally {
        setLoadingUsers(false);
      }
    };

    loadUsers();
  }, [dateRange, selectedProjects, useActiveSprint]);

  // Load tickets for selected user
  useEffect(() => {
    if (!selectedUser) {
      setTickets([]);
      return;
    }

    const loadTickets = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (useActiveSprint) {
          params.append('openSprints', 'true');
        } else {
          params.append('from', dateRange.from);
          params.append('to', dateRange.to);
        }
        params.append('accountId', selectedUser.accountId);
        if (selectedProjects.length === 1) {
          params.append('projectKey', selectedProjects[0]);
        }

        const response = await fetch(`${API_BASE_URL}/worklog/search?${params}`);
        
        // Handle rate limiting and errors
        if (response.status === 429) {
          setError('Trop de requêtes. Veuillez patienter quelques secondes.');
          return;
        }
        
        if (!response.ok) {
          setError(`Erreur serveur: ${response.status}`);
          return;
        }
        
        const result = await response.json();

        if (result.success && Array.isArray(result.worklogs)) {
          // Group worklogs by issue
          const ticketMap = new Map<string, TicketData>();
          console.log(ticketMap);

          for (const worklog of result.worklogs) {
            const key = worklog.issueKey;
            if (!ticketMap.has(key)) {
              ticketMap.set(key, {
                issueKey: key,
                issueSummary: worklog.issueSummary || '',
                issueType: worklog.issueType || 'Task',
                status: worklog.status || 'Unknown',
                timeSpentHours: 0,
                timeSpentSeconds: 0,
                worklogCount: 0,
                storyPoints: worklog.storyPoints ?? null,
                weight: worklog.weight ?? null
              });
            }
            const ticket = ticketMap.get(key)!;
            ticket.timeSpentSeconds += worklog.timeSpentSeconds || 0;
            ticket.timeSpentHours = ticket.timeSpentSeconds / 3600;
            ticket.worklogCount += 1;
            // Update story points if available
            if (worklog.storyPoints !== undefined && worklog.storyPoints !== null) {
              ticket.storyPoints = worklog.storyPoints;
            }
            // Update weight if available
            if (worklog.weight !== undefined && worklog.weight !== null) {
              ticket.weight = worklog.weight;
            }
          }

          const ticketList = Array.from(ticketMap.values());
          ticketList.sort((a, b) => b.timeSpentHours - a.timeSpentHours);
          setTickets(ticketList);
        } else {
          setError('Aucun worklog trouvé');
        }
      } catch (err) {
        console.error('Failed to load tickets:', err);
        setError('Impossible de charger les tickets');
      } finally {
        setIsLoading(false);
      }
    };

    loadTickets();
  }, [selectedUser, dateRange, selectedProjects, useActiveSprint]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalHours = tickets.reduce((sum, t) => sum + t.timeSpentHours, 0);
    const totalTickets = tickets.length;
    const resolvedStatuses = ['Done', 'Resolved', 'Closed', 'Terminé', 'Résolu', 'Fermé'];
    const resolvedTickets = tickets.filter(t => 
      resolvedStatuses.some(s => t.status.toLowerCase().includes(s.toLowerCase()))
    ).length;
    const totalPoints = tickets.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
    const totalWeight = tickets.reduce((sum, t) => sum + (t.weight || 0), 0);

    return { totalHours, totalTickets, resolvedTickets, totalPoints, totalWeight };
  }, [tickets]);

  // Filter users by search
  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(userSearch.toLowerCase())
  );

  // Max hours for bar scaling
  const maxHours = Math.max(...tickets.map(t => t.timeSpentHours), 1);

  // Loading skeleton
  if (loadingUsers && users.length === 0) {
    return (
      <div className="card-glass p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-700 animate-pulse" />
            <div>
              <div className="h-5 bg-surface-700 rounded w-40 mb-2 animate-pulse" />
              <div className="h-4 bg-surface-700/50 rounded w-56 animate-pulse" />
            </div>
          </div>
          <div className="h-9 bg-surface-700 rounded-lg w-48 animate-pulse" />
        </div>
        <div className="text-center py-12 text-surface-500">
          <User className="w-12 h-12 mx-auto mb-3 opacity-30 animate-pulse" />
          <p>Chargement des utilisateurs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card-glass p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-success-500/10 flex items-center justify-center">
            <Ticket className="w-5 h-5 text-success-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-surface-100">
              Tickets par utilisateur
            </h3>
            <p className="text-sm text-surface-500">
              {selectedUser ? selectedUser.displayName : 'Sélectionnez un utilisateur'}
            </p>
          </div>
        </div>

        {/* User Selector */}
        <div className="relative">
          <button
            onClick={() => setIsUserSelectorOpen(!isUserSelectorOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-surface-800 hover:bg-surface-700 border border-surface-600 rounded-lg text-surface-200 transition-colors min-w-[200px]"
          >
            <User className="w-4 h-4 text-success-400" />
            <span className="text-sm font-medium truncate flex-1 text-left">
              {selectedUser ? selectedUser.displayName : 'Choisir un utilisateur'}
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isUserSelectorOpen ? 'rotate-180' : ''}`} />
          </button>

          {isUserSelectorOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsUserSelectorOpen(false)} />
              <div className="absolute right-0 mt-2 z-50 bg-surface-800 border border-surface-600 rounded-xl shadow-xl min-w-[280px] max-h-[350px] flex flex-col">
                {/* Search */}
                <div className="p-3 border-b border-surface-700">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                    <input
                      type="text"
                      placeholder="Rechercher..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-surface-900 border border-surface-600 rounded-lg text-sm text-surface-200 placeholder-surface-500 focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>

                {/* Users List */}
                <div className="flex-1 overflow-y-auto">
                  {filteredUsers.length === 0 ? (
                    <div className="px-4 py-6 text-center text-surface-500 text-sm">
                      Aucun utilisateur trouvé
                    </div>
                  ) : (
                    filteredUsers.map((user, index) => (
                      <button
                        key={user.accountId}
                        onClick={() => {
                          setSelectedUser(user);
                          setIsUserSelectorOpen(false);
                          setUserSearch('');
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          selectedUser?.accountId === user.accountId
                            ? 'bg-primary-500/20 text-primary-300'
                            : 'hover:bg-surface-700 text-surface-300'
                        }`}
                      >
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                          style={{ backgroundColor: `hsl(${(index * 37) % 360}, 70%, 50%)` }}
                        >
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{user.displayName}</div>
                          <div className="text-xs text-surface-500">{formatHours(user.totalHours)}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stats Row */}
      {selectedUser && !isLoading && tickets.length > 0 && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          <div className="bg-surface-800/50 rounded-lg p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-primary-400 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wider">Temps</span>
            </div>
            <div className="text-2xl font-bold text-surface-100">
              {formatHours(stats.totalHours)}
            </div>
          </div>
          <div className="bg-surface-800/50 rounded-lg p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-accent-400 mb-1">
              <Ticket className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wider">Tickets</span>
            </div>
            <div className="text-2xl font-bold text-surface-100">
              {stats.totalTickets}
            </div>
          </div>
          <div className="bg-surface-800/50 rounded-lg p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-warning-400 mb-1">
              <Zap className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wider">Points</span>
            </div>
            <div className="text-2xl font-bold text-surface-100">
              {stats.totalPoints > 0 ? stats.totalPoints : '-'}
            </div>
          </div>
          <div className="bg-surface-800/50 rounded-lg p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-purple-400 mb-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
              <span className="text-xs uppercase tracking-wider">Pondération</span>
            </div>
            <div className="text-2xl font-bold text-surface-100">
              {stats.totalWeight > 0 ? stats.totalWeight : '-'}
            </div>
          </div>
          <div className="bg-surface-800/50 rounded-lg p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-success-400 mb-1">
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wider">Résolus</span>
            </div>
            <div className="text-2xl font-bold text-surface-100">
              {stats.resolvedTickets}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {!selectedUser ? (
        <div className="text-center py-12 text-surface-500">
          <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Sélectionnez un utilisateur pour voir ses tickets</p>
          <p className="text-sm mt-1 text-surface-600">
            {users.length} utilisateurs disponibles
          </p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-surface-800/50 animate-pulse">
              <div className="w-16 h-6 bg-surface-700 rounded" />
              <div className="flex-1 h-8 bg-surface-700 rounded" />
              <div className="w-20 h-6 bg-surface-700 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 text-amber-400 bg-amber-500/10 rounded-lg p-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12 text-surface-500">
          <Ticket className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucun ticket trouvé pour cette période</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
          {tickets.map((ticket) => {
            const barWidth = (ticket.timeSpentHours / maxHours) * 100;
            const color = getIssueTypeColor(ticket.issueType);
            const isResolved = ['Done', 'Resolved', 'Closed', 'Terminé', 'Résolu', 'Fermé']
              .some(s => ticket.status.toLowerCase().includes(s.toLowerCase()));

            return (
              <div
                key={ticket.issueKey}
                className="flex items-center gap-3 p-3 rounded-lg bg-surface-800/50 hover:bg-surface-800 transition-colors group"
              >
                {/* Issue Key & Type */}
                <div className="w-28 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <a 
                      href={`${import.meta.env.VITE_JIRA_URL || ''}/browse/${ticket.issueKey}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-mono text-primary-400 hover:underline"
                    >
                      {ticket.issueKey}
                    </a>
                  </div>
                  <div className="text-xs text-surface-500 ml-4">{ticket.issueType}</div>
                </div>

                {/* Bar */}
                <div className="flex-1 h-8 bg-surface-900 rounded-lg overflow-hidden relative">
                  <div
                    className="h-full rounded-lg transition-all duration-500 flex items-center px-3"
                    style={{
                      width: `${Math.max(barWidth, 8)}%`,
                      backgroundColor: color,
                      opacity: 0.75,
                    }}
                  >
                    <span className="text-white text-xs font-medium truncate">
                      {ticket.issueSummary || ticket.issueKey}
                    </span>
                  </div>
                </div>

                {/* Points & Weight */}
                <div className="w-20 flex-shrink-0 flex items-center justify-center gap-1">
                  {/* Story Points */}
                  {ticket.storyPoints !== null && ticket.storyPoints !== undefined && ticket.storyPoints > 0 ? (
                    <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-warning-500/20 rounded-full" title="Story Points">
                      <Zap className="w-3 h-3 text-warning-400" />
                      <span className="text-xs font-bold text-warning-300">{ticket.storyPoints}</span>
                    </div>
                  ) : null}
                  {/* Weight */}
                  {ticket.weight !== null && ticket.weight !== undefined && ticket.weight > 0 ? (
                    <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-500/20 rounded-full" title="Pondération">
                      <svg className="w-3 h-3 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                      </svg>
                      <span className="text-xs font-bold text-purple-300">{ticket.weight}</span>
                    </div>
                  ) : null}
                  {/* Dash if both empty */}
                  {(!ticket.storyPoints || ticket.storyPoints <= 0) && (!ticket.weight || ticket.weight <= 0) && (
                    <span className="text-xs text-surface-600">-</span>
                  )}
                </div>

                {/* Time & Status */}
                <div className="w-24 text-right flex-shrink-0">
                  <div className="text-surface-200 font-medium text-sm">
                    {formatHours(ticket.timeSpentHours)}
                  </div>
                  <div className={`text-xs flex items-center justify-end gap-1 ${
                    isResolved ? 'text-success-400' : 'text-surface-500'
                  }`}>
                    {isResolved && <CheckCircle className="w-3 h-3" />}
                    {ticket.status}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {selectedUser && tickets.length > 0 && (
        <div className="mt-4 pt-4 border-t border-surface-700">
          <div className="flex items-center justify-between text-sm text-surface-500">
            <span>{useActiveSprint ? 'Sprint actif' : `${dateRange.from} → ${dateRange.to}`}</span>
            <span>{tickets.reduce((sum, t) => sum + t.worklogCount, 0)} entrées de temps</span>
          </div>
        </div>
      )}
    </div>
  );
}
