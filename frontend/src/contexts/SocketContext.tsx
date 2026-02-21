import React, { createContext, useContext, useCallback, useRef, ReactNode } from 'react';
import { useSocket, SocketState, Alert, SyncProgress, KPIUpdate } from '../hooks/useSocket';
import { NotificationToast, useNotifications } from '../components/NotificationToast';
import { useStore } from '../store/useStore';

interface SocketContextValue extends SocketState {
  subscribeToProject: (projectId: string) => void;
  unsubscribeFromProject: (projectId: string) => void;
  requestSync: (projectKey?: string) => void;
  ping: () => void;
  // Notification helpers
  notify: {
    success: (title: string, message: string) => void;
    error: (title: string, message: string) => void;
    warning: (title: string, message: string) => void;
    info: (title: string, message: string) => void;
  };
}

const SocketContext = createContext<SocketContextValue | null>(null);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const {
    notifications,
    removeNotification,
    success,
    error,
    warning,
    info,
    fromAlert,
    fromSyncProgress,
  } = useNotifications();

  const syncIdRef = useRef<string | undefined>();
  const { setDashboardLoading, triggerKpiRefresh } = useStore();

  const handleAlert = useCallback((alert: Alert) => {
    fromAlert(alert);
  }, [fromAlert]);

  const handleSyncProgress = useCallback((progress: SyncProgress) => {
    syncIdRef.current = fromSyncProgress(progress, syncIdRef.current);
    
    // Update loading state based on sync status
    if (progress.status === 'started' || progress.status === 'in_progress') {
      setDashboardLoading(true);
    } else {
      setDashboardLoading(false);
      if (progress.status === 'completed') {
        syncIdRef.current = undefined;
      }
    }
  }, [fromSyncProgress, setDashboardLoading]);

  const handleKPIUpdate = useCallback((data: KPIUpdate) => {
    // Check if this is an automatic sync (silent refresh, no notification)
    const isAutomatic = (data.data as { automatic?: boolean })?.automatic === true;
    
    if (!isAutomatic) {
      // Only show notification for manual syncs
      info('Mise à jour KPI', `Nouvelles données ${data.type} reçues`);
    }
    
    // Trigger refresh in the store (silent for automatic syncs)
    triggerKpiRefresh();
  }, [info, triggerKpiRefresh]);

  const socket = useSocket({
    onAlert: handleAlert,
    onSyncProgress: handleSyncProgress,
    onKPIUpdate: handleKPIUpdate,
  });

  const contextValue: SocketContextValue = {
    ...socket,
    notify: {
      success,
      error,
      warning,
      info,
    },
  };

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
      <NotificationToast
        notifications={notifications}
        onClose={removeNotification}
      />
    </SocketContext.Provider>
  );
};

export function useSocketContext() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocketContext must be used within a SocketProvider');
  }
  return context;
}

// Hook that can be used outside provider (returns null values if not in provider)
export function useSocketOptional() {
  return useContext(SocketContext);
}

export default SocketContext;

