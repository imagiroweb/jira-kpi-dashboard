import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Notification } from '@/hooks/useNotifications';
import { NotificationToast, ConnectionStatus } from './NotificationToast';

const baseNotification = (
  overrides: Partial<Notification> & Pick<Notification, 'id' | 'type' | 'title' | 'message'>
): Notification => ({
  timestamp: new Date('2026-06-05T10:00:00.000Z'),
  autoClose: true,
  duration: 5000,
  ...overrides,
});

describe('NotificationToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ne rend rien sans notification', () => {
    const { container } = render(
      <NotificationToast notifications={[]} onClose={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('affiche les notifications success, error, warning et info', () => {
    const notifications: Notification[] = [
      baseNotification({ id: '1', type: 'success', title: 'Succès', message: 'Opération OK' }),
      baseNotification({ id: '2', type: 'error', title: 'Erreur', message: 'Échec critique' }),
      baseNotification({ id: '3', type: 'warning', title: 'Attention', message: 'Avertissement' }),
      baseNotification({ id: '4', type: 'info', title: 'Info', message: 'Message informatif' }),
    ];

    render(<NotificationToast notifications={notifications} onClose={vi.fn()} />);

    expect(screen.getByText('Succès')).toBeInTheDocument();
    expect(screen.getByText('Opération OK')).toBeInTheDocument();
    expect(screen.getByText('Erreur')).toBeInTheDocument();
    expect(screen.getByText('Échec critique')).toBeInTheDocument();
    expect(screen.getByText('Attention')).toBeInTheDocument();
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  it('affiche une notification sync avec barre de progression', () => {
    const notifications: Notification[] = [
      baseNotification({
        id: 'sync-1',
        type: 'sync',
        title: 'Synchronisation',
        message: 'En cours…',
        progress: 42,
      }),
    ];

    render(<NotificationToast notifications={notifications} onClose={vi.fn()} />);

    expect(screen.getByText('Synchronisation')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('ferme automatiquement après la durée par défaut', () => {
    const onClose = vi.fn();
    const notifications: Notification[] = [
      baseNotification({ id: 'auto-1', type: 'success', title: 'Auto', message: 'Fermeture auto' }),
    ];

    render(<NotificationToast notifications={notifications} onClose={onClose} />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onClose).toHaveBeenCalledWith('auto-1');
  });

  it('ne ferme pas automatiquement si autoClose est false', () => {
    const onClose = vi.fn();
    const notifications: Notification[] = [
      baseNotification({
        id: 'persist-1',
        type: 'error',
        title: 'Persistant',
        message: 'Reste affiché',
        autoClose: false,
      }),
    ];

    render(<NotificationToast notifications={notifications} onClose={onClose} />);

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('appelle onClose au clic sur le bouton fermer', () => {
    const onClose = vi.fn();
    const notifications: Notification[] = [
      baseNotification({ id: 'close-1', type: 'info', title: 'Fermable', message: 'Cliquez X' }),
    ];

    render(<NotificationToast notifications={notifications} onClose={onClose} />);

    const closeButtons = screen.getAllByRole('button');
    fireEvent.click(closeButtons[0]);

    expect(onClose).toHaveBeenCalledWith('close-1');
  });
});

describe('ConnectionStatus', () => {
  it('affiche le statut en ligne', () => {
    render(<ConnectionStatus isConnected={true} clientsCount={3} lastPing={42} />);
    expect(screen.getByText('En ligne')).toBeInTheDocument();
    expect(screen.getByText(/3 connectés/)).toBeInTheDocument();
    expect(screen.getByText(/42ms/)).toBeInTheDocument();
  });

  it('affiche le statut hors ligne', () => {
    render(<ConnectionStatus isConnected={false} clientsCount={0} />);
    expect(screen.getByText('Hors ligne')).toBeInTheDocument();
  });
});
