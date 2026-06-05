import { vi } from 'vitest';

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
