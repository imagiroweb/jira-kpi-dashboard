import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStore, seedAuthenticatedUser } from '@/test/mocks/store';
import { useStore } from '@/store/useStore';
import { useSocketContext } from '@/hooks/useSocketContext';
import type { Alert, MeetingUpdate, SyncProgress } from '@/hooks/useSocket';

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

import { SocketProvider } from './SocketContext';

function ContextConsumer() {
  const ctx = useSocketContext();
  return (
    <div>
      <span data-testid="connected">{String(ctx.isConnected)}</span>
      <button type="button" onClick={() => ctx.notify.success('OK', 'Succès manuel')}>
        Notifier
      </button>
    </div>
  );
}

/** Consommateur dynamique d'un point hebdo, à la façon de PointHebdoPage. */
function MeetingUpdateConsumer({ label }: { label: string }) {
  const ctx = useSocketContext();
  const [received, setReceived] = useState<MeetingUpdate | null>(null);

  useEffect(() => ctx.onMeetingUpdate(setReceived), [ctx]);

  return <div data-testid={label}>{received ? received.meetingId : 'aucun'}</div>;
}

describe('SocketProvider', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    socketHarness.mockSocket.clearHandlers();
    socketHarness.mockSocket.connected = false;
    seedAuthenticatedUser();
  });

  it('rend ses enfants et expose la valeur du contexte', async () => {
    render(
      <SocketProvider>
        <ContextConsumer />
        <p>Contenu enfant</p>
      </SocketProvider>
    );

    expect(screen.getByText('Contenu enfant')).toBeInTheDocument();

    act(() => {
      socketHarness.mockSocket.trigger('connect');
    });

    await waitFor(() => {
      expect(screen.getByTestId('connected').textContent).toBe('true');
    });
  });

  it('affiche une notification quand une alerte socket est reçue', async () => {
    render(
      <SocketProvider>
        <ContextConsumer />
      </SocketProvider>
    );

    const alert: Alert = {
      level: 'warning',
      message: 'Charge support élevée',
      timestamp: new Date(),
    };

    act(() => {
      socketHarness.mockSocket.trigger('alert:new', alert);
    });

    await waitFor(() => {
      expect(screen.getByText('Attention')).toBeInTheDocument();
      expect(screen.getByText('Charge support élevée')).toBeInTheDocument();
    });
  });

  it('met à jour dashboardLoading selon la progression de synchronisation', async () => {
    render(
      <SocketProvider>
        <span>Sync probe</span>
      </SocketProvider>
    );

    const started: SyncProgress = {
      status: 'started',
      progress: 0,
      message: 'Sync démarrée',
    };

    act(() => {
      socketHarness.mockSocket.trigger('sync:progress', started);
    });

    await waitFor(() => {
      expect(useStore.getState().dashboardLoading).toBe(true);
      expect(screen.getByText('Synchronisation')).toBeInTheDocument();
    });

    act(() => {
      socketHarness.mockSocket.trigger('sync:progress', {
        status: 'completed',
        progress: 100,
        message: 'Sync terminée',
      } satisfies SyncProgress);
    });

    await waitFor(() => {
      expect(useStore.getState().dashboardLoading).toBe(false);
    });
  });

  it('diffuse meeting:update à plusieurs abonnés via onMeetingUpdate, et arrête après désabonnement', async () => {
    const { unmount } = render(
      <SocketProvider>
        <MeetingUpdateConsumer label="a" />
        <MeetingUpdateConsumer label="b" />
      </SocketProvider>
    );

    const update: MeetingUpdate = {
      meetingId: 'meeting-42',
      patch: { sprint: { name: 'Sprint', number: '1', goal: '', date: '2026-09-08' } },
      origin: 'tab-x',
    };

    act(() => {
      socketHarness.mockSocket.trigger('meeting:update', update);
    });

    await waitFor(() => {
      expect(screen.getByTestId('a').textContent).toBe('meeting-42');
      expect(screen.getByTestId('b').textContent).toBe('meeting-42');
    });

    // Le démontage désabonne les listeners : un nouvel événement ne doit rien faire planter.
    unmount();
    expect(() => socketHarness.mockSocket.trigger('meeting:update', update)).not.toThrow();
  });

  it('expose subscribeToMeeting/unsubscribeFromMeeting via le contexte', async () => {
    function MeetingSubscriber() {
      const ctx = useSocketContext();
      useEffect(() => {
        ctx.subscribeToMeeting('meeting-1');
        return () => ctx.unsubscribeFromMeeting('meeting-1');
      }, [ctx]);
      return null;
    }

    const { unmount } = render(
      <SocketProvider>
        <MeetingSubscriber />
      </SocketProvider>
    );

    act(() => {
      socketHarness.mockSocket.trigger('connect');
    });

    await waitFor(() => {
      expect(socketHarness.mockSocket.emit).toHaveBeenCalledWith('subscribe:meeting', 'meeting-1');
    });

    unmount();
    expect(socketHarness.mockSocket.emit).toHaveBeenCalledWith('unsubscribe:meeting', 'meeting-1');
  });

  it('permet d’ajouter une notification manuelle via notify.success', async () => {
    render(
      <SocketProvider>
        <ContextConsumer />
      </SocketProvider>
    );

    act(() => {
      screen.getByRole('button', { name: 'Notifier' }).click();
    });

    await waitFor(() => {
      expect(screen.getByText('OK')).toBeInTheDocument();
      expect(screen.getByText('Succès manuel')).toBeInTheDocument();
    });
  });
});
