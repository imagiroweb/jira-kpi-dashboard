jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

const mockVerifyToken = jest.fn();
jest.mock('../application/services/AuthService', () => ({
  authService: { verifyToken: (...args: unknown[]) => mockVerifyToken(...args) }
}));

import type { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import {
  setupSocketHandlers,
  emitKPIUpdate,
  emitProjectUpdate,
  emitMeetingUpdate,
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
  data: Record<string, unknown>;
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

function makeSocketMock(id: string, auth: Record<string, unknown> = {}): SocketMock {
  const handlers: Record<string, SocketEventHandler> = {};
  return {
    id,
    handshake: { auth },
    data: {},
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

/** Récupère la fonction middleware passée à `io.use` (authentification). */
function getAuthMiddleware(io: IoMock) {
  return io.use.mock.calls[0][0] as (
    socket: SocketMock,
    next: (err?: Error) => void
  ) => void;
}

describe('socketHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyToken.mockReset();
  });

  it('setupSocketHandlers enregistre middleware et handlers de connexion', () => {
    const io = makeIoMock();
    setupSocketHandlers(asServer(io));
    expect(io.use).toHaveBeenCalledTimes(1);
    expect(io.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  describe('authentification (io.use)', () => {
    it('rejette une connexion sans token', () => {
      const io = makeIoMock();
      setupSocketHandlers(asServer(io));
      const middleware = getAuthMiddleware(io);
      const socket = makeSocketMock('sock-no-token');
      const next = jest.fn();

      middleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(mockVerifyToken).not.toHaveBeenCalled();
    });

    it('rejette une connexion avec un token invalide', () => {
      mockVerifyToken.mockReturnValue(null);
      const io = makeIoMock();
      setupSocketHandlers(asServer(io));
      const middleware = getAuthMiddleware(io);
      const socket = makeSocketMock('sock-bad-token', { token: 'garbage' });
      const next = jest.fn();

      middleware(socket, next);

      expect(mockVerifyToken).toHaveBeenCalledWith('garbage');
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('accepte une connexion avec un token valide et attache l\'utilisateur au socket', () => {
      const user = { userId: 'u1', email: 'alice@test.com' };
      mockVerifyToken.mockReturnValue(user);
      const io = makeIoMock();
      setupSocketHandlers(asServer(io));
      const middleware = getAuthMiddleware(io);
      const socket = makeSocketMock('sock-ok', { token: 'valid-jwt' });
      const next = jest.fn();

      middleware(socket, next);

      expect(next).toHaveBeenCalledWith();
      expect(socket.data.user).toEqual(user);
    });
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

  it('gère subscribe/unsubscribe:meeting et rejette un meetingId invalide', () => {
    const io = makeIoMock();
    setupSocketHandlers(asServer(io));
    const connectionCb = io.on.mock.calls.find((c) => c[0] === 'connection')?.[1] as
      | ((socket: Socket) => void)
      | undefined;
    const socket = makeSocketMock('sock-meeting');
    connectionCb?.(socket as unknown as Socket);

    socket._handlers['subscribe:meeting']('507f1f77bcf86cd799439055');
    expect(socket.join).toHaveBeenCalledWith('meeting:507f1f77bcf86cd799439055');
    expect(socket.emit).toHaveBeenCalledWith('subscribed:meeting', {
      meetingId: '507f1f77bcf86cd799439055',
      success: true
    });

    socket._handlers['unsubscribe:meeting']('507f1f77bcf86cd799439055');
    expect(socket.leave).toHaveBeenCalledWith('meeting:507f1f77bcf86cd799439055');

    socket.join.mockClear();
    socket._handlers['subscribe:meeting']('not valid; drop table');
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('émet les événements helpers vers les bons canaux', () => {
    const io = makeIoMock();

    emitKPIUpdate(asServer(io), { x: 1 });
    expect(io.to).toHaveBeenCalledWith('kpi:all');
    expect(io._toEmit).toHaveBeenCalledWith('kpi:update', { x: 1 });

    emitProjectUpdate(asServer(io), 'ABC', { y: 2 });
    expect(io.to).toHaveBeenCalledWith('project:ABC');
    expect(io._toEmit).toHaveBeenCalledWith('project:update', { y: 2 });

    emitMeetingUpdate(asServer(io), 'm1', { z: 3 });
    expect(io.to).toHaveBeenCalledWith('meeting:m1');
    expect(io._toEmit).toHaveBeenCalledWith('meeting:update', { z: 3 });

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
