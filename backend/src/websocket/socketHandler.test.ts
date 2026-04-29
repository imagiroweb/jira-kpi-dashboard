jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

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

function makeIoMock() {
  const ioEmit = jest.fn();
  const toEmit = jest.fn();
  const to = jest.fn(() => ({ emit: toEmit }));
  const use = jest.fn();
  const on = jest.fn();
  return { emit: ioEmit, to, use, on, _toEmit: toEmit };
}

function makeSocketMock(id: string) {
  const handlers: Record<string, (...args: any[]) => any> = {};
  return {
    id,
    handshake: { auth: {} },
    on: jest.fn((event: string, cb: (...args: any[]) => any) => {
      handlers[event] = cb;
    }),
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    _handlers: handlers
  };
}

describe('socketHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('setupSocketHandlers enregistre middleware et handlers de connexion', () => {
    const io = makeIoMock();
    setupSocketHandlers(io as any);
    expect(io.use).toHaveBeenCalledTimes(1);
    expect(io.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  it('gère subscribe/unsubscribe/ping/disconnect et met à jour les clients connectés', () => {
    const io = makeIoMock();
    setupSocketHandlers(io as any);
    const connectionCb = io.on.mock.calls.find((c) => c[0] === 'connection')?.[1];
    const socket = makeSocketMock('sock-1');

    connectionCb(socket);
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

    emitKPIUpdate(io as any, { x: 1 });
    expect(io.to).toHaveBeenCalledWith('kpi:all');
    expect(io._toEmit).toHaveBeenCalledWith('kpi:update', { x: 1 });

    emitProjectUpdate(io as any, 'ABC', { y: 2 });
    expect(io.to).toHaveBeenCalledWith('project:ABC');
    expect(io._toEmit).toHaveBeenCalledWith('project:update', { y: 2 });

    emitSyncProgress(io as any, { status: 'started', progress: 0, message: 'start' });
    expect(io.emit).toHaveBeenCalledWith('sync:progress', { status: 'started', progress: 0, message: 'start' });

    emitAlert(io as any, { level: 'info', message: 'hello' });
    expect(io.emit).toHaveBeenCalledWith('alert:new', expect.objectContaining({ level: 'info', message: 'hello' }));

    emitAnalysisComplete(io as any, { report: true }, 'ABC');
    expect(io.to).toHaveBeenCalledWith('project:ABC');
    expect(io._toEmit).toHaveBeenCalledWith('analysis:complete', expect.objectContaining({ analysis: { report: true } }));
  });
});
