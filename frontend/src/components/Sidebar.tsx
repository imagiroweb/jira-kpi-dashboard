import { LayoutDashboard, Users, Headphones, ChevronLeft, ChevronRight, ChevronDown, LogOut, User, Wifi, WifiOff, RefreshCw, Flag, Megaphone, Package, ShieldCheck, CalendarClock, Target, Users2, Euro, TrendingUp, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { groupOfPage, resolveNav, type NavEntry } from '../domain/sidebarNav';
import { useStore } from '../store/useStore';
import { useSocketOptional } from '../hooks/useSocketContext';
import { syncApi } from '../services/api';

// PageType is defined in the store, we just use the same type here
export type PageType = 'dashboard' | 'users' | 'support' | 'epics' | 'marketing' | 'produit' | 'pointHebdo' | 'gestionUtilisateurs' | 'performance' | 'performanceDashboard' | 'couts';

interface SidebarProps {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
}

interface NavItem {
  id: PageType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const pageItems: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="w-5 h-5" />,
    description: 'Tendances globales sprint'
  },
  {
    id: 'support',
    label: 'Support Board',
    icon: <Headphones className="w-5 h-5" />,
    description: 'KPI Support (pondération)'
  },
  {
    id: 'users',
    label: 'Utilisateurs',
    icon: <Users className="w-5 h-5" />,
    description: 'Temps & tickets par user'
  },
  {
    id: 'epics',
    label: 'Suivi epics',
    icon: <Flag className="w-5 h-5" />,
    description: 'Progression par team'
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: <Megaphone className="w-5 h-5" />,
    description: 'Données Brevo (emails, contacts)'
  },
  {
    id: 'produit',
    label: 'Produit',
    icon: <Package className="w-5 h-5" />,
    description: 'Données Monday.com (boards, items)'
  },
  {
    id: 'pointHebdo',
    label: 'Point hebdo',
    icon: <CalendarClock className="w-5 h-5" />,
    description: 'Réunion sprint Dev & QA'
  },
  {
    id: 'gestionUtilisateurs',
    label: 'Gestion des utilisateurs',
    icon: <ShieldCheck className="w-5 h-5" />,
    description: 'Droits et rôles (super admin)'
  },
  {
    id: 'performance',
    label: 'Ma performance',
    icon: <Target className="w-5 h-5" />,
    description: 'Objectifs OKR & auto-évaluation'
  },
  {
    id: 'performanceDashboard',
    label: 'Performance équipe',
    icon: <Users2 className="w-5 h-5" />,
    description: 'Suivi lead/CTO par équipe'
  },
  {
    id: 'couts',
    label: 'Coûts horaires',
    icon: <Euro className="w-5 h-5" />,
    description: 'Coût horaire des utilisateurs'
  }
];

const PAGE_ITEMS = new Map(pageItems.map((item) => [item.id, item]));

interface NavGroup {
  label: string;
  icon: React.ReactNode;
  description: string;
}

const NAV_GROUPS: Record<string, NavGroup> = {
  suiviPerformance: {
    label: 'Suivi performance',
    icon: <TrendingUp className="w-5 h-5" />,
    description: 'Objectifs OKR, suivi par équipe'
  },
  parametres: {
    label: 'Paramètres',
    icon: <Settings className="w-5 h-5" />,
    description: 'Utilisateurs, droits et coûts'
  }
};

/** Menu : pages seules et groupes (un groupe à une seule page visible s'affiche comme cette page). */
const NAV: NavEntry<PageType>[] = [
  { kind: 'page', id: 'dashboard' },
  { kind: 'page', id: 'support' },
  { kind: 'page', id: 'users' },
  { kind: 'page', id: 'epics' },
  { kind: 'page', id: 'marketing' },
  { kind: 'page', id: 'produit' },
  { kind: 'page', id: 'pointHebdo' },
  { kind: 'group', id: 'suiviPerformance', pages: ['performance', 'performanceDashboard'] },
  { kind: 'group', id: 'parametres', pages: ['gestionUtilisateurs', 'couts'] }
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const socket = useSocketOptional();

  const visiblePages = user?.visiblePages;
  const canSee = (pageId: PageType) => {
    if (!visiblePages) return pageId !== 'gestionUtilisateurs' && pageId !== 'performanceDashboard' && pageId !== 'couts';
    return visiblePages[pageId] === true;
  };
  const nav = resolveNav(NAV, canSee);

  // Groupes ouverts : celui de la page courante est ouvert d'office.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const current = groupOfPage(NAV, currentPage);
    return new Set(current ? [current] : []);
  });
  useEffect(() => {
    const current = groupOfPage(NAV, currentPage);
    if (current) setOpenGroups((prev) => (prev.has(current) ? prev : new Set(prev).add(current)));
  }, [currentPage]);
  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderPageLink = (id: PageType, nested = false) => {
    const item = PAGE_ITEMS.get(id);
    if (!item) return null;
    const isActive = currentPage === item.id;
    return (
      <button
        key={item.id}
        onClick={() => onNavigate(item.id)}
        className={`w-full flex items-center gap-3 px-3 ${nested ? 'py-2' : 'py-3'} rounded-xl transition-all duration-200 group ${
          isActive
            ? 'bg-primary-500/20 text-primary-300 shadow-lg shadow-primary-500/10'
            : 'text-surface-400 hover:bg-surface-800 hover:text-surface-200'
        }`}
        title={isCollapsed ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
      >
        <div className={`flex-shrink-0 ${isActive ? 'text-primary-400' : 'text-surface-500 group-hover:text-surface-300'}`}>
          {item.icon}
        </div>
        {!isCollapsed && (
          <div className="flex-1 min-w-0 text-left">
            <div className="font-medium text-sm truncate">{item.label}</div>
            <div className={`text-xs truncate ${isActive ? 'text-primary-400/70' : 'text-surface-600'}`}>
              {item.description}
            </div>
          </div>
        )}
        {isActive && !isCollapsed && (
          <div className="w-1.5 h-8 bg-primary-500 rounded-full" />
        )}
      </button>
    );
  };

  const handleLogout = () => {
    if (window.confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
      logout();
    }
  };

  const handleSync = async () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    try {
      // Always use REST API for sync (WebSocket is just for progress updates)
      const result = await syncApi.forceSync();
      
      if (result.success) {
        socket?.notify?.success('Synchronisation', `${result.projectsSynced || 0} projet(s) synchronisé(s)`);
        // Trigger a page data refresh by updating the store
        useStore.getState().triggerKpiRefresh();
      } else {
        socket?.notify?.warning('Synchronisation', result.message || 'Synchronisation partielle');
      }
    } catch (error) {
      console.error('Sync error:', error);
      socket?.notify?.error('Erreur', 'Échec de la synchronisation');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <aside 
      className={`fixed left-0 top-0 h-full flex flex-col bg-surface-900/95 backdrop-blur-xl border-r border-surface-700/50 z-50 transition-all duration-300 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Header */}
      <div className="h-16 shrink-0 flex items-center justify-between px-4 border-b border-surface-700/50">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">KPI</span>
            </div>
            <span className="font-semibold text-surface-100">Jira KPI</span>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg hover:bg-surface-700/50 text-surface-400 hover:text-surface-200 transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation : seule zone qui défile quand la hauteur manque (en-tête et pied restent fixes) */}
      <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-1" aria-label="Navigation principale">
        {nav.map((entry) => {
          if (entry.kind === 'page') return renderPageLink(entry.id);
          // Barre réduite : pas de libellés, les pages du groupe s'affichent directement (icônes).
          if (isCollapsed) {
            return (
              <div key={entry.id} className="space-y-1 border-t border-surface-700/50 pt-1">
                {entry.pages.map((id) => renderPageLink(id))}
              </div>
            );
          }
          const group = NAV_GROUPS[entry.id];
          const isOpen = openGroups.has(entry.id);
          const containsActive = entry.pages.includes(currentPage);
          return (
            <div key={entry.id}>
              <button
                onClick={() => toggleGroup(entry.id)}
                aria-expanded={isOpen}
                aria-controls={`nav-group-${entry.id}`}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group ${
                  containsActive && !isOpen
                    ? 'bg-primary-500/10 text-primary-300'
                    : 'text-surface-400 hover:bg-surface-800 hover:text-surface-200'
                }`}
              >
                <div className={`flex-shrink-0 ${containsActive ? 'text-primary-400' : 'text-surface-500 group-hover:text-surface-300'}`}>
                  {group.icon}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="font-medium text-sm truncate">{group.label}</div>
                  <div className="text-xs text-surface-600 truncate">{group.description}</div>
                </div>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`} aria-hidden />
              </button>
              {isOpen && (
                <div id={`nav-group-${entry.id}`} role="group" aria-label={group.label} className="ml-4 pl-2 border-l border-surface-700/60 space-y-1 mt-1">
                  {entry.pages.map((id) => renderPageLink(id, true))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User Section & Footer */}
      <div className={`shrink-0 border-t border-surface-700/50 ${isCollapsed ? 'p-2' : 'p-4'}`}>
        {/* Sync Button */}
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className={`w-full mb-2 p-2 rounded-lg transition-all duration-200 ${
            isSyncing
              ? 'bg-purple-500/20 border border-purple-500/30 cursor-wait'
              : 'bg-surface-800/50 border border-surface-700/50 hover:bg-accent-500/20 hover:border-accent-500/30'
          } ${isCollapsed ? 'flex justify-center' : 'flex items-center gap-2'}`}
          title="Synchroniser les données Jira"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-purple-400' : 'text-surface-400'}`} />
          {!isCollapsed && (
            <span className={`text-xs font-medium ${isSyncing ? 'text-purple-400' : 'text-surface-400'}`}>
              {isSyncing ? 'Synchronisation...' : 'Synchroniser'}
            </span>
          )}
        </button>

        {/* Connection Status */}
        {socket && (
          <div className={`mb-2 p-2 rounded-lg transition-colors ${
            socket.isConnected 
              ? 'bg-green-500/10 border border-green-500/30' 
              : 'bg-red-500/10 border border-red-500/30'
          }`}>
            {isCollapsed ? (
              <div className="flex justify-center" title={socket.isConnected ? 'Connecté en temps réel' : 'Déconnecté'}>
                {socket.isConnected ? (
                  <Wifi className="w-4 h-4 text-green-400" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-400" />
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {socket.isConnected ? (
                  <>
                    <div className="relative">
                      <Wifi className="w-4 h-4 text-green-400" />
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    </div>
                    <div className="flex-1">
                      <span className="text-xs text-green-400 font-medium">Temps réel actif</span>
                      {socket.clientsCount > 1 && (
                        <span className="text-xs text-green-400/60 ml-1">
                          • {socket.clientsCount} en ligne
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-red-400" />
                    <span className="text-xs text-red-400">Hors ligne</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* User Info */}
        {user && (
          <div className={`p-3 rounded-xl bg-surface-800/50 border border-surface-700/50 mb-2 ${isCollapsed ? 'flex justify-center' : ''}`}>
            {isCollapsed ? (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-semibold text-sm">
                    {user.firstName?.[0] || user.email[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-surface-200 truncate">
                    {user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.email}
                  </div>
                  <div className="text-xs text-surface-500 truncate">
                    {user.provider === 'microsoft' ? '🔗 Microsoft' : user.email}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className={`w-full p-3 rounded-xl bg-surface-800/50 border border-surface-700/50 hover:bg-danger-500/20 hover:border-danger-500/50 text-surface-400 hover:text-danger-400 transition-all duration-200 ${
            isCollapsed ? 'flex justify-center' : 'flex items-center gap-2'
          }`}
          title="Se déconnecter"
        >
          <LogOut className="w-4 h-4" />
          {!isCollapsed && <span className="text-sm">Se déconnecter</span>}
        </button>
      </div>
    </aside>
  );
}

