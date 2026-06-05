jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

import type { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import {
  setupSocketHandlers,
  emitKPIUpdate,
  emitProjectUpdate,
  emitSyncProgress,
  emitAlert,
  emitAnalysisComplete,
  getConnectedClientsCount,
  getConnectedClients
} from './socketHandler';

const mockLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
};

type SocketEventHandler = (...args: unknown[]) => unknown;

type IoMock = {
  emit: jest.Mock;
  to: jest.Mock;
  use: jest.Mock;
  on: jest.Mock;
  _toEmit: jest.Mock;
};

type SocketMock = {
  id: string;
  handshake: { auth: Record<string, unknown> };
  on: jest.Mock;
  join: jest.Mock;
  leave: jest.Mock;
  emit: jest.Mock;
  _handlers: Record<string, SocketEventHandler>;
};

function makeIoMock(): IoMock {
  const ioEmit = jest.fn();
  const toEmit = jest.fn();
  const to = jest.fn(() => ({ emit: toEmit }));
  const use = jest.fn();
  const on = jest.fn();
  return { emit: ioEmit, to, use, on, _toEmit: toEmit };
}

function makeSocketMock(id: string): SocketMock {
  const handlers: Record<string, SocketEventHandler> = {};
  return {
    id,
    handshake: { auth: {} },
    on: jest.fn((event: string, cb: SocketEventHandler) => {
      handlers[event] = cb;
    }),
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    _handlers: handlers
  };
}

function asServer(io: IoMock): Server {
  return io as unknown as Server;
}

describe('socketHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('setupSocketHandlers enregistre middleware et handlers de connexion', () => {
    const io = makeIoMock();
    setupSocketHandlers(asServer(io));
    expect(io.use).toHaveBeenCalledTimes(1);
    expect(io.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  it('gère subscribe/unsubscribe/ping/disconnect et met à jour les clients connectés', () => {
    const io = makeIoMock();
    setupSocketHandlers(asServer(io));
    const connectionCb = io.on.mock.calls.find((c) => c[0] === 'connection')?.[1] as
      | ((socket: Socket) => void)
      | undefined;
    const socket = makeSocketMock('sock-1');

    connectionCb?.(socket as unknown as Socket);
    expect(getConnectedClientsCount()).toBeGreaterThanOrEqual(1);

    socket._handlers['subscribe:project']('ABC');
    expect(socket.join).toHaveBeenCalledWith('project:ABC');
    expect(socket.emit).toHaveBeenCalledWith('subscribed', { project: 'ABC', success: true });

    socket._handlers['ping']();
    expect(socket.emit).toHaveBeenCalledWith('pong', expect.objectContaining({ timestamp: expect.any(Number) }));

    socket._handlers['unsubscribe:project']('ABC');
    expect(socket.leave).toHaveBeenCalledWith('project:ABC');

    socket._handlers['disconnect']('client-closed');
    expect(getConnectedClients().find((c) => c.id === 'sock-1')).toBeUndefined();
  });

  it('émet les événements helpers vers les bons canaux', () => {
    const io = makeIoMock();

    emitKPIUpdate(asServer(io), { x: 1 });
    expect(io.to).toHaveBeenCalledWith('kpi:all');
    expect(io._toEmit).toHaveBeenCalledWith('kpi:update', { x: 1 });

    emitProjectUpdate(asServer(io), 'ABC', { y: 2 });
    expect(io.to).toHaveBeenCalledWith('project:ABC');
    expect(io._toEmit).toHaveBeenCalledWith('project:update', { y: 2 });

    emitSyncProgress(asServer(io), { status: 'started', progress: 0, message: 'start' });
    expect(io.emit).toHaveBeenCalledWith('sync:progress', { status: 'started', progress: 0, message: 'start' });

    emitAlert(asServer(io), { level: 'info', message: 'hello' });
    expect(io.emit).toHaveBeenCalledWith('alert:new', expect.objectContaining({ level: 'info', message: 'hello' }));

    emitAnalysisComplete(asServer(io), { report: true }, 'ABC');
    expect(io.to).toHaveBeenCalledWith('project:ABC');
    expect(io._toEmit).toHaveBeenCalledWith('analysis:complete', expect.objectContaining({ analysis: { report: true } }));

    emitAlert(asServer(io), { level: 'warning', message: 'scoped', projectKey: 'PROJ' });
    expect(io.to).toHaveBeenCalledWith('project:PROJ');
    expect(io._toEmit).toHaveBeenCalledWith('alert:new', expect.objectContaining({ level: 'warning', projectKey: 'PROJ' }));
  });

  it('emitAnalysisComplete sans projectKey cible kpi:all', () => {
    const io = makeIoMock();
    emitAnalysisComplete(asServer(io), { onlyGlobal: true });
    expect(io.to).toHaveBeenCalledWith('kpi:all');
    expect(io._toEmit).toHaveBeenCalledWith(
      'analysis:complete',
      expect.objectContaining({ analysis: { onlyGlobal: true } })
    );
  });

  it('request:sync, subscribe:kpi et error journalisent / émettent', () => {
    const io = makeIoMock();
    setupSocketHandlers(asServer(io));
    const connectionCb = io.on.mock.calls.find((c) => c[0] === 'connection')?.[1] as
      | ((socket: Socket) => void)
      | undefined;
    const socket = makeSocketMock('sock-sync');
    connectionCb?.(socket as unknown as Socket);

    socket._handlers['subscribe:kpi']();
    expect(socket.join).toHaveBeenCalledWith('kpi:all');

    socket._handlers['request:sync']({ projectKey: 'ABC' });
    expect(socket.emit).toHaveBeenCalledWith(
      'sync:progress',
      expect.objectContaining({ status: 'started' })
    );
    expect(io.emit).toHaveBeenCalledWith(
      'sync:requested',
      expect.objectContaining({ requestedBy: 'sock-sync', projectKey: 'ABC' })
    );

    socket._handlers['error'](new Error('socket err'));
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
