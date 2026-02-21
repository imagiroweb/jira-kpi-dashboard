import React, { useEffect, useState } from 'react';
import { AlertTriangle, AlertCircle, Info, X, CheckCircle, Wifi, WifiOff } from 'lucide-react';
import { Alert, SyncProgress } from '../hooks/useSocket';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info' | 'sync';
  title: string;
  message: string;
  timestamp: Date;
  autoClose?: boolean;
  duration?: number;
  progress?: number;
}

interface NotificationToastProps {
  notifications: Notification[];
  onClose: (id: string) => void;
}

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  sync: Wifi,
};

const colorMap = {
  success: 'bg-green-500/20 border-green-500/50 text-green-400',
  error: 'bg-red-500/20 border-red-500/50 text-red-400',
  warning: 'bg-amber-500/20 border-amber-500/50 text-amber-400',
  info: 'bg-blue-500/20 border-blue-500/50 text-blue-400',
  sync: 'bg-purple-500/20 border-purple-500/50 text-purple-400',
};

const NotificationItem: React.FC<{
  notification: Notification;
  onClose: () => void;
}> = ({ notification, onClose }) => {
  const Icon = iconMap[notification.type];
  const colorClass = colorMap[notification.type];

  useEffect(() => {
    if (notification.autoClose !== false) {
      const duration = notification.duration || 5000;
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [notification.autoClose, notification.duration, onClose]);

  return (
    <div
      className={`relative flex items-start gap-3 p-4 rounded-lg border backdrop-blur-sm shadow-lg animate-slide-in ${colorClass}`}
      style={{ minWidth: '320px', maxWidth: '420px' }}
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{notification.title}</p>
        <p className="text-sm opacity-80 mt-0.5">{notification.message}</p>
        
        {notification.type === 'sync' && notification.progress !== undefined && (
          <div className="mt-2">
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-purple-400 rounded-full transition-all duration-300"
                style={{ width: `${notification.progress}%` }}
              />
            </div>
            <p className="text-xs mt-1 opacity-60">{notification.progress}%</p>
          </div>
        )}
      </div>

      <button
        onClick={onClose}
        className="p-1 hover:bg-white/10 rounded transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notifications,
  onClose,
}) => {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onClose={() => onClose(notification.id)}
        />
      ))}
    </div>
  );
};

// Connection Status Badge Component
export const ConnectionStatus: React.FC<{
  isConnected: boolean;
  clientsCount: number;
  lastPing?: number | null;
}> = ({ isConnected, clientsCount, lastPing }) => {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
      isConnected 
        ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
        : 'bg-red-500/20 text-red-400 border border-red-500/30'
    }`}>
      {isConnected ? (
        <>
          <Wifi className="w-3.5 h-3.5" />
          <span>En ligne</span>
          {clientsCount > 1 && (
            <span className="opacity-60">• {clientsCount} connectés</span>
          )}
          {lastPing && (
            <span className="opacity-60">• {lastPing}ms</span>
          )}
        </>
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5" />
          <span>Hors ligne</span>
        </>
      )}
    </div>
  );
};

// Custom hook to manage notifications
export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (
    notification: Omit<Notification, 'id' | 'timestamp'>
  ) => {
    const newNotification: Notification = {
      ...notification,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    setNotifications(prev => [...prev, newNotification]);
    return newNotification.id;
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const updateNotification = (id: string, updates: Partial<Notification>) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, ...updates } : n))
    );
  };

  const clearAll = () => {
    setNotifications([]);
  };

  // Helper methods for common notification types
  const success = (title: string, message: string) =>
    addNotification({ type: 'success', title, message });

  const error = (title: string, message: string) =>
    addNotification({ type: 'error', title, message, autoClose: false });

  const warning = (title: string, message: string) =>
    addNotification({ type: 'warning', title, message, duration: 8000 });

  const info = (title: string, message: string) =>
    addNotification({ type: 'info', title, message });

  const sync = (title: string, message: string, progress: number = 0) => {
    const id = addNotification({
      type: 'sync',
      title,
      message,
      progress,
      autoClose: false,
    });
    return {
      id,
      update: (newProgress: number, newMessage?: string) =>
        updateNotification(id, {
          progress: newProgress,
          message: newMessage || message,
        }),
      complete: () => {
        updateNotification(id, { progress: 100 });
        setTimeout(() => removeNotification(id), 2000);
      },
      fail: (errorMessage: string) => {
        updateNotification(id, {
          type: 'error',
          title: 'Erreur de synchronisation',
          message: errorMessage,
        });
      },
    };
  };

  // Convert Alert from WebSocket to notification
  const fromAlert = (alert: Alert) => {
    const typeMap: Record<Alert['level'], Notification['type']> = {
      warning: 'warning',
      critical: 'error',
      info: 'info',
    };
    addNotification({
      type: typeMap[alert.level],
      title: alert.level === 'critical' ? 'Alerte Critique' : alert.level === 'warning' ? 'Attention' : 'Information',
      message: alert.message,
      autoClose: alert.level !== 'critical',
    });
  };

  // Handle sync progress from WebSocket
  const fromSyncProgress = (progress: SyncProgress, existingSyncId?: string) => {
    if (existingSyncId) {
      if (progress.status === 'completed') {
        updateNotification(existingSyncId, { progress: 100 });
        setTimeout(() => removeNotification(existingSyncId), 2000);
      } else if (progress.status === 'error') {
        updateNotification(existingSyncId, {
          type: 'error',
          title: 'Erreur de synchronisation',
          message: progress.message,
        });
      } else {
        updateNotification(existingSyncId, {
          progress: progress.progress,
          message: progress.message,
        });
      }
    } else if (progress.status === 'started') {
      return sync('Synchronisation', progress.message, progress.progress).id;
    }
    return existingSyncId;
  };

  return {
    notifications,
    addNotification,
    removeNotification,
    updateNotification,
    clearAll,
    success,
    error,
    warning,
    info,
    sync,
    fromAlert,
    fromSyncProgress,
  };
}

export default NotificationToast;

