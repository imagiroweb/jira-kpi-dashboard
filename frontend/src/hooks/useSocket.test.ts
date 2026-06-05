import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStore, seedAuthenticatedUser } from '@/test/mocks/store';

const socketHarness = vi.hoisted(() => {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const mockSocket = {
    id: 'mock-socket-id',
    connected: false,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    trigger(event: string, ...args: unknown[]) {
      if (event === 'connect') mockSocket.connected = true;
      if (event === 'disconnect') mockSocket.connected = false;
      handlers[event]?.forEach((handler) => handler(...args));
    },
    clearHandlers() {
      for (const key of Object.keys(handlers)) delete handlers[key];
    },
  };
  const mockIo = vi.fn(() => mockSocket);
  return { mockSocket, mockIo };
});

vi.mock('socket.io-client', () => ({
  io: socketHarness.mockIo,
  default: { io: socketHarness.mockIo },
}));

import { useSocket, type Alert, type SyncProgress } from './useSocket';

describe('useSocket', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    socketHarness.mockSocket.clearHandlers();
    socketHarness.mockSocket.connected = false;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ne crée pas de connexion si l’utilisateur n’est pas authentifié', () => {
    renderHook(() => useSocket());

    expect(socketHarness.mockIo).not.toHaveBeenCalled();
  });

  it('connecte le socket avec le token et s’abonne aux KPI à la connexion', async () => {
    seedAuthenticatedUser(undefined, 'jwt-test-token');

    const { result } = renderHook(() => useSocket());

    expect(socketHarness.mockIo).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        auth: { token: 'jwt-test-token' },
        transports: ['websocket', 'polling'],
      })
    );

    act(() => {
      socketHarness.mockSocket.trigger('connect');
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(socketHarness.mockSocket.emit).toHaveBeenCalledWith('subscribe:kpi');
  });

  it('déconnecte le socket quand l’authentification est perdue', async () => {
    seedAuthenticatedUser(undefined, 'jwt-test-token');

    const { rerender } = renderHook(() => useSocket());

    act(() => {
      socketHarness.mockSocket.trigger('connect');
    });

    act(() => {
      resetStore();
    });

    rerender();

    expect(socketHarness.mockSocket.disconnect).toHaveBeenCalled();
  });

  it('met à jour clientsCount et lastPing', async () => {
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'));
    seedAuthenticatedUser();

    const { result } = renderHook(() => useSocket());

    act(() => {
      socketHarness.mockSocket.trigger('connect');
      socketHarness.mockSocket.trigger('clients:count', 5);
      socketHarness.mockSocket.trigger('pong', {
        timestamp: new Date('2026-06-05T12:00:00.000Z').getTime() - 42,
      });
    });

    await waitFor(() => {
      expect(result.current.clientsCount).toBe(5);
      expect(result.current.lastPing).toBe(42);
    });
  });

  it('appelle onAlert quand une alerte est reçue', async () => {
    seedAuthenticatedUser();
    const onAlert = vi.fn();

    renderHook(() => useSocket({ onAlert }));

    const alert: Alert = {
      level: 'critical',
      message: 'Bug rate élevé',
      timestamp: new Date(),
    };

    act(() => {
      socketHarness.mockSocket.trigger('alert:new', alert);
    });

    await waitFor(() => {
      expect(onAlert).toHaveBeenCalledWith(alert);
    });
  });

  it('appelle onSyncProgress quand la progression de sync est reçue', async () => {
    seedAuthenticatedUser();
    const onSyncProgress = vi.fn();

    renderHook(() => useSocket({ onSyncProgress }));

    const progress: SyncProgress = {
      status: 'in_progress',
      progress: 55,
      message: 'Synchronisation Jira…',
    };

    act(() => {
      socketHarness.mockSocket.trigger('sync:progress', progress);
    });

    await waitFor(() => {
      expect(onSyncProgress).toHaveBeenCalledWith(progress);
    });
  });

  it('expose subscribeToProject, requestSync et ping quand le socket est connecté', async () => {
    seedAuthenticatedUser();

    const { result } = renderHook(() => useSocket());

    act(() => {
      socketHarness.mockSocket.trigger('connect');
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    act(() => {
      result.current.subscribeToProject('PROJ-1');
      result.current.unsubscribeFromProject('PROJ-1');
      result.current.requestSync('PROJ');
      result.current.ping();
    });

    expect(socketHarness.mockSocket.emit).toHaveBeenCalledWith('subscribe:project', 'PROJ-1');
    expect(socketHarness.mockSocket.emit).toHaveBeenCalledWith('unsubscribe:project', 'PROJ-1');
    expect(socketHarness.mockSocket.emit).toHaveBeenCalledWith('request:sync', { projectKey: 'PROJ' });
    expect(socketHarness.mockSocket.emit).toHaveBeenCalledWith('ping');
  });

  it('déconnecte le socket au démontage du hook', () => {
    seedAuthenticatedUser();

    const { unmount } = renderHook(() => useSocket());

    act(() => {
      socketHarness.mockSocket.trigger('connect');
    });

    unmount();

    expect(socketHarness.mockSocket.disconnect).toHaveBeenCalled();
  });
});
