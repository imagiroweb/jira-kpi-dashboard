import { useEffect, useState } from 'react';
import { 
  Sidebar, 
  SprintDashboard, 
  UserDetailPage, 
  SupportDashboard, 
  EpicProgressPage,
  MarketingDashboard,
  ProduitDashboard,
  UserManagementPage,
  LoginPage, 
  MicrosoftCallback,
  RoleSelectionScreen
} from './components';
import { useStore } from './store/useStore';
import { authApi } from './services/authApi';
import { Loader2 } from 'lucide-react';
import { SocketProvider } from './contexts/SocketContext';

function App() {
  const currentPage = useStore((state) => state.currentPage);
  const setCurrentPage = useStore((state) => state.setCurrentPage);
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const pendingRoleSelection = useStore((state) => state.pendingRoleSelection);
  const token = useStore((state) => state.token);
  const logout = useStore((state) => state.logout);
  const [isVerifyingToken, setIsVerifyingToken] = useState(true);

  // Check if we're on Microsoft callback route
  const isMicrosoftCallback = window.location.pathname === '/auth/microsoft/callback';

  // Verify token on app load and refresh user (role, visiblePages)
  const updateUser = useStore((state) => state.updateUser);
  useEffect(() => {
    const verifyAuth = async () => {
      if (token) {
        const isValid = await authApi.verifyToken();
        if (!isValid) {
          logout();
        } else {
          const me = await authApi.getCurrentUser();
          if (me) updateUser(me);
        }
      }
      setIsVerifyingToken(false);
    };
    verifyAuth();
  }, [token, logout, updateUser]);

  // Handle Microsoft callback
  if (isMicrosoftCallback) {
    return <MicrosoftCallback />;
  }

  // Show loading while verifying token
  if (isVerifyingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-950">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-accent-500 animate-spin mx-auto mb-4" />
          <p className="text-surface-400">Chargement...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (pendingRoleSelection) {
    return <RoleSelectionScreen />;
  }

  return <AuthenticatedApp currentPage={currentPage} setCurrentPage={setCurrentPage} />;
}

// Separate component for authenticated users with WebSocket support
function AuthenticatedApp({ 
  currentPage, 
  setCurrentPage 
}: { 
  currentPage: 'dashboard' | 'users' | 'support' | 'epics' | 'marketing' | 'produit' | 'gestionUtilisateurs';
  setCurrentPage: (page: 'dashboard' | 'users' | 'support' | 'epics' | 'marketing' | 'produit' | 'gestionUtilisateurs') => void;
}) {
  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <SprintDashboard />;
      case 'support':
        return <SupportDashboard />;
      case 'users':
        return <UserDetailPage />;
      case 'epics':
        return <EpicProgressPage />;
      case 'marketing':
        return <MarketingDashboard />;
      case 'produit':
        return <ProduitDashboard />;
      case 'gestionUtilisateurs':
        return <UserManagementPage />;
      default:
        return <SprintDashboard />;
    }
  };

  return (
    <SocketProvider>
      <div className="min-h-screen bg-surface-950">
        {/* Background decorations */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-accent-500/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-primary-500/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full">
            <div 
              className="absolute inset-0 opacity-[0.015]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2306b6d4' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
              }}
            />
          </div>
        </div>

        {/* Sidebar */}
        <Sidebar 
          currentPage={currentPage} 
          onNavigate={setCurrentPage} 
        />

        {/* Main Content - with left margin for sidebar */}
        <main className="relative z-10 ml-64 transition-all duration-300">
          {renderPage()}
        </main>

        {/* Footer */}
        <footer className="relative z-10 ml-64 text-center py-6 text-surface-600 text-sm">
          <p>
            Jira KPI Dashboard • Powered by{' '}
            <span className="gradient-text font-medium">IMAGIRO</span>
          </p>
        </footer>
      </div>
    </SocketProvider>
  );
}

export default App;
