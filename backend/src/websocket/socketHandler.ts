import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';

interface ConnectedClient {
  id: string;
  subscribedProjects: Set<string>;
  connectedAt: Date;
}

const connectedClients = new Map<string, ConnectedClient>();

export function setupSocketHandlers(io: Server): void {
  // Middleware for authentication (optional)
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    // TODO: Implement token validation if needed
    logger.debug(`Socket auth attempt from ${socket.id}`);
    next();
  });

  io.on('connection', (socket: Socket) => {
    logger.info(`Client connected: ${socket.id}`);
    
    // Track connected client
    connectedClients.set(socket.id, {
      id: socket.id,
      subscribedProjects: new Set(),
      connectedAt: new Date()
    });

    // Emit current connection count
    io.emit('clients:count', connectedClients.size);

    // Subscribe to project updates
    socket.on('subscribe:project', (projectId: string) => {
      const roomName = `project:${projectId}`;
      socket.join(roomName);
      
      const client = connectedClients.get(socket.id);
      if (client) {
        client.subscribedProjects.add(projectId);
      }
      
      logger.info(`Client ${socket.id} subscribed to project ${projectId}`);
      socket.emit('subscribed', { project: projectId, success: true });
    });

    // Unsubscribe from project
    socket.on('unsubscribe:project', (projectId: string) => {
      const roomName = `project:${projectId}`;
      socket.leave(roomName);
      
      const client = connectedClients.get(socket.id);
      if (client) {
        client.subscribedProjects.delete(projectId);
      }
      
      logger.info(`Client ${socket.id} unsubscribed from project ${projectId}`);
    });

    // Subscribe to all KPI updates
    socket.on('subscribe:kpi', () => {
      socket.join('kpi:all');
      logger.info(`Client ${socket.id} subscribed to all KPI updates`);
    });

    // Request manual sync
    socket.on('request:sync', async (data: { projectKey?: string }) => {
      logger.info(`Manual sync requested by ${socket.id}`);
      socket.emit('sync:progress', {
        status: 'started',
        progress: 0,
        message: 'Starting synchronization...'
      });
      
      // The actual sync will be triggered by the controller
      // This just acknowledges the request
      io.emit('sync:requested', {
        requestedBy: socket.id,
        projectKey: data?.projectKey,
        timestamp: new Date()
      });
    });

    // Ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`Client disconnected: ${socket.id}, reason: ${reason}`);
      connectedClients.delete(socket.id);
      io.emit('clients:count', connectedClients.size);
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
    });
  });

  logger.info('WebSocket handlers initialized');
}

// Helper functions to emit events from other parts of the application

export function emitKPIUpdate(io: Server, data: unknown): void {
  io.to('kpi:all').emit('kpi:update', data);
  logger.debug('Emitted KPI update to all subscribers');
}

export function emitProjectUpdate(io: Server, projectId: string, data: unknown): void {
  io.to(`project:${projectId}`).emit('project:update', data);
  logger.debug(`Emitted update to project ${projectId}`);
}

export function emitSyncProgress(io: Server, progress: {
  status: 'started' | 'in_progress' | 'completed' | 'error';
  progress: number;
  message: string;
}): void {
  io.emit('sync:progress', progress);
}

export function emitAlert(io: Server, alert: {
  level: 'warning' | 'critical' | 'info';
  message: string;
  projectKey?: string;
}): void {
  const payload = {
    ...alert,
    timestamp: new Date()
  };
  
  if (alert.projectKey) {
    io.to(`project:${alert.projectKey}`).emit('alert:new', payload);
  } else {
    io.emit('alert:new', payload);
  }
  
  logger.info(`Alert emitted: ${alert.level} - ${alert.message}`);
}

export function emitAnalysisComplete(io: Server, analysis: unknown, projectKey?: string): void {
  const payload = {
    analysis,
    timestamp: new Date()
  };
  
  if (projectKey) {
    io.to(`project:${projectKey}`).emit('analysis:complete', payload);
  } else {
    io.to('kpi:all').emit('analysis:complete', payload);
  }
}

export function getConnectedClientsCount(): number {
  return connectedClients.size;
}

export function getConnectedClients(): ConnectedClient[] {
  return Array.from(connectedClients.values());
}

