import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useStore } from '../store/useStore';

export interface SocketState {
  isConnected: boolean;
  clientsCount: number;
  lastPing: number | null;
}

export interface SyncProgress {
  status: 'started' | 'in_progress' | 'completed' | 'error';
  progress: number;
  message: string;
}

export interface Alert {
  level: 'warning' | 'critical' | 'info';
  message: string;
  projectKey?: string;
  timestamp: Date;
}

export interface KPIUpdate {
  type: 'sprint' | 'support' | 'worklog';
  data: unknown;
  timestamp: Date;
}

interface UseSocketOptions {
  onKPIUpdate?: (data: KPIUpdate) => void;
  onProjectUpdate?: (projectId: string, data: unknown) => void;
  onSyncProgress?: (progress: SyncProgress) => void;
  onAlert?: (alert: Alert) => void;
  onAnalysisComplete?: (analysis: unknown) => void;
}

export function useSocket(options: UseSocketOptions = {}) {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<SocketState>({
    isConnected: false,
    clientsCount: 0,
    lastPing: null,
  });
  
  const { token, isAuthenticated } = useStore();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Initialize socket connection
  useEffect(() => {
    if (!isAuthenticated) {
      // Disconnect if not authenticated
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setState({ isConnected: false, clientsCount: 0, lastPing: null });
      }
      return;
    }

    // Create socket connection
    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    
    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('[WebSocket] Connected:', socket.id);
      setState(prev => ({ ...prev, isConnected: true }));
      
      // Auto-subscribe to KPI updates
      socket.emit('subscribe:kpi');
    });

    socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
      setState(prev => ({ ...prev, isConnected: false }));
    });

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error.message);
    });

    // Client count updates
    socket.on('clients:count', (count: number) => {
      setState(prev => ({ ...prev, clientsCount: count }));
    });

    // Subscription confirmation
    socket.on('subscribed', (data: { project: string; success: boolean }) => {
      console.log('[WebSocket] Subscribed to project:', data.project);
    });

    // KPI Updates
    socket.on('kpi:update', (data: KPIUpdate) => {
      console.log('[WebSocket] KPI Update received:', data);
      optionsRef.current.onKPIUpdate?.(data);
    });

    // Project Updates
    socket.on('project:update', (data: { projectId: string; payload: unknown }) => {
      console.log('[WebSocket] Project Update:', data);
      optionsRef.current.onProjectUpdate?.(data.projectId, data.payload);
    });

    // Sync Progress
    socket.on('sync:progress', (progress: SyncProgress) => {
      console.log('[WebSocket] Sync Progress:', progress);
      optionsRef.current.onSyncProgress?.(progress);
    });

    // Alerts
    socket.on('alert:new', (alert: Alert) => {
      console.log('[WebSocket] New Alert:', alert);
      optionsRef.current.onAlert?.(alert);
    });

    // Analysis Complete
    socket.on('analysis:complete', (data: { analysis: unknown; timestamp: Date }) => {
      console.log('[WebSocket] Analysis Complete:', data);
      optionsRef.current.onAnalysisComplete?.(data.analysis);
    });

    // Pong response
    socket.on('pong', (data: { timestamp: number }) => {
      setState(prev => ({ ...prev, lastPing: Date.now() - data.timestamp }));
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, token]);

  // Subscribe to a specific project
  const subscribeToProject = useCallback((projectId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe:project', projectId);
    }
  }, []);

  // Unsubscribe from a project
  const unsubscribeFromProject = useCallback((projectId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe:project', projectId);
    }
  }, []);

  // Request manual sync
  const requestSync = useCallback((projectKey?: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('request:sync', { projectKey });
    }
  }, []);

  // Ping server to check latency
  const ping = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('ping');
    }
  }, []);

  return {
    ...state,
    socket: socketRef.current,
    subscribeToProject,
    unsubscribeFromProject,
    requestSync,
    ping,
  };
}

export default useSocket;

