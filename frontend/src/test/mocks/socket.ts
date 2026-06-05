import { vi } from 'vitest';

export type MockSocketEventHandler = (...args: unknown[]) => void;

/** Socket.io-client mock avec enregistrement des handlers pour les tests useSocket */
export interface MockSocket {
  id: string;
  connected: boolean;
  on: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  /** Déclenche un événement enregistré via socket.on */
  trigger: (event: string, ...args: unknown[]) => void;
  /** Réinitialise les handlers entre les tests */
  clearHandlers: () => void;
}

export function createMockSocket(overrides: Partial<MockSocket> = {}): MockSocket {
  const handlers: Record<string, MockSocketEventHandler[]> = {};

  const socket: MockSocket = {
    id: 'mock-socket-id',
    connected: false,
    on: vi.fn((event: string, handler: MockSocketEventHandler) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    trigger(event: string, ...args: unknown[]) {
      if (event === 'connect') {
        socket.connected = true;
      }
      if (event === 'disconnect') {
        socket.connected = false;
      }
      handlers[event]?.forEach((handler) => handler(...args));
    },
    clearHandlers() {
      for (const key of Object.keys(handlers)) {
        delete handlers[key];
      }
    },
    ...overrides,
  };

  return socket;
}

/**
 * Factory Vitest pour mocker `socket.io-client`.
 * ```ts
 * const { mockIo, mockSocket } = vi.hoisted(() => {
 *   const mockSocket = createMockSocket();
 *   return { mockSocket, mockIo: vi.fn(() => mockSocket) };
 * });
 * vi.mock('socket.io-client', () => socketIoModuleMock(mockIo));
 * ```
 */
export function socketIoModuleMock(mockIo: ReturnType<typeof vi.fn>) {
  return {
    io: mockIo,
    default: { io: mockIo },
  };
}

export interface MockSocketContextValue {
  isConnected: boolean;
  clientsCount: number;
  lastPing: number | null;
  subscribeToProject: ReturnType<typeof vi.fn>;
  unsubscribeFromProject: ReturnType<typeof vi.fn>;
  requestSync: ReturnType<typeof vi.fn>;
  ping: ReturnType<typeof vi.fn>;
  notify: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warning: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
}

/** Valeur mock pour SocketContext.Provider */
export function createMockSocketContextValue(
  overrides: Partial<MockSocketContextValue> = {}
): MockSocketContextValue {
  return {
    isConnected: true,
    clientsCount: 1,
    lastPing: Date.now(),
    subscribeToProject: vi.fn(),
    unsubscribeFromProject: vi.fn(),
    requestSync: vi.fn(),
    ping: vi.fn(),
    notify: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
    ...overrides,
  };
}

/**
 * Mock du module useSocketContext (évite socket.io-client dans les tests composants).
 * ```ts
 * vi.mock('@/hooks/useSocketContext', () => socketContextModuleMock());
 * ```
 */
export function socketContextModuleMock(value?: Partial<MockSocketContextValue>) {
  const ctx = createMockSocketContextValue(value);
  return {
    useSocketContext: () => ctx,
    useSocketOptional: () => ctx,
  };
}
