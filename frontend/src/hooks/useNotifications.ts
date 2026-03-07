import { useState } from 'react';
import { Alert, SyncProgress } from './useSocket';

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
