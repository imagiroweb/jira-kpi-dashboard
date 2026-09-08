import React, { createContext, useCallback, useRef, ReactNode } from 'react';
import { useSocket, SocketState, Alert, SyncProgress, KPIUpdate, MeetingUpdate } from '../hooks/useSocket';
import { NotificationToast } from '../components/NotificationToast';
import { useNotifications } from '../hooks/useNotifications';
import { useStore } from '../store/useStore';

interface SocketContextValue extends SocketState {
  subscribeToProject: (projectId: string) => void;
  unsubscribeFromProject: (projectId: string) => void;
  subscribeToMeeting: (meetingId: string) => void;
  unsubscribeFromMeeting: (meetingId: string) => void;
  /** Enregistre un listener pour les mises à jour temps réel d'un point hebdo ; retourne le désabonnement. */
  onMeetingUpdate: (listener: (update: MeetingUpdate) => void) => () => void;
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

  // Registre des composants abonnés aux mises à jour de points hebdo (souvent un seul :
  // PointHebdoPage). Permet à un consommateur dynamique de s'abonner via le contexte sans
  // ouvrir une deuxième connexion socket.
  const meetingListenersRef = useRef(new Set<(update: MeetingUpdate) => void>());

  const handleMeetingUpdate = useCallback((update: MeetingUpdate) => {
    meetingListenersRef.current.forEach((listener) => listener(update));
  }, []);

  const onMeetingUpdate = useCallback((listener: (update: MeetingUpdate) => void) => {
    meetingListenersRef.current.add(listener);
    return () => {
      meetingListenersRef.current.delete(listener);
    };
  }, []);

  const socket = useSocket({
    onAlert: handleAlert,
    onSyncProgress: handleSyncProgress,
    onKPIUpdate: handleKPIUpdate,
    onMeetingUpdate: handleMeetingUpdate,
  });

  const contextValue: SocketContextValue = {
    ...socket,
    onMeetingUpdate,
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

export default SocketContext;

