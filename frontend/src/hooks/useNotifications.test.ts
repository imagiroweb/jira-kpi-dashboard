import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotifications } from './useNotifications';
import type { Alert } from './useSocket';

describe('useNotifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ajoute, met à jour et supprime une notification', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addNotification({
        type: 'info',
        title: 'Titre',
        message: 'Message initial',
      });
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].title).toBe('Titre');
    expect(result.current.notifications[0].timestamp).toEqual(new Date('2026-06-05T12:00:00.000Z'));

    const id = result.current.notifications[0].id;

    act(() => {
      result.current.updateNotification(id, { message: 'Message mis à jour' });
    });

    expect(result.current.notifications[0].message).toBe('Message mis à jour');

    act(() => {
      result.current.removeNotification(id);
    });

    expect(result.current.notifications).toHaveLength(0);
  });

  it('vide toutes les notifications avec clearAll', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.success('OK', 'Succès');
      result.current.error('Erreur', 'Échec');
    });

    expect(result.current.notifications).toHaveLength(2);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.notifications).toHaveLength(0);
  });

  it('expose les helpers success, error, warning et info avec les bons types', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.success('Succès', 'Opération réussie');
      result.current.error('Erreur', 'Opération échouée');
      result.current.warning('Attention', 'Avertissement');
      result.current.info('Info', 'Information');
    });

    expect(result.current.notifications.map((n) => n.type)).toEqual([
      'success',
      'error',
      'warning',
      'info',
    ]);
    expect(result.current.notifications[1].autoClose).toBe(false);
    expect(result.current.notifications[2].duration).toBe(8000);
  });

  it('gère une notification sync avec update, complete et fail', () => {
    const { result } = renderHook(() => useNotifications());

    let syncHandle: ReturnType<typeof result.current.sync>;

    act(() => {
      syncHandle = result.current.sync('Sync', 'En cours…', 10);
    });

    expect(result.current.notifications[0].type).toBe('sync');
    expect(result.current.notifications[0].progress).toBe(10);
    expect(result.current.notifications[0].autoClose).toBe(false);

    act(() => {
      syncHandle.update(50, 'Mi-parcours');
    });

    expect(result.current.notifications[0].progress).toBe(50);
    expect(result.current.notifications[0].message).toBe('Mi-parcours');

    act(() => {
      syncHandle.complete();
    });

    expect(result.current.notifications[0].progress).toBe(100);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.notifications).toHaveLength(0);

    act(() => {
      const failed = result.current.sync('Sync 2', 'En cours…', 0);
      failed.fail('Échec réseau');
    });

    expect(result.current.notifications[0].type).toBe('error');
    expect(result.current.notifications[0].title).toBe('Erreur de synchronisation');
    expect(result.current.notifications[0].message).toBe('Échec réseau');
  });

  it('convertit une alerte socket en notification via fromAlert', () => {
    const { result } = renderHook(() => useNotifications());

    const alert: Alert = {
      level: 'warning',
      message: 'Seuil dépassé',
      timestamp: new Date(),
    };

    act(() => {
      result.current.fromAlert(alert);
    });

    expect(result.current.notifications[0].type).toBe('warning');
    expect(result.current.notifications[0].title).toBe('Attention');

    act(() => {
      result.current.fromAlert({
        level: 'critical',
        message: 'Incident critique',
        timestamp: new Date(),
      });
    });

    expect(result.current.notifications[1].type).toBe('error');
    expect(result.current.notifications[1].title).toBe('Alerte Critique');
    expect(result.current.notifications[1].autoClose).toBe(false);

    act(() => {
      result.current.fromAlert({
        level: 'info',
        message: 'Note informative',
        timestamp: new Date(),
      });
    });

    expect(result.current.notifications[2].type).toBe('info');
    expect(result.current.notifications[2].title).toBe('Information');
  });

  it('gère fromSyncProgress pour started, in_progress, completed et error', () => {
    const { result } = renderHook(() => useNotifications());

    let syncId: string | undefined;

    act(() => {
      syncId = result.current.fromSyncProgress({
        status: 'started',
        progress: 0,
        message: 'Démarrage…',
      });
    });

    expect(syncId).toBeDefined();
    expect(result.current.notifications[0].type).toBe('sync');

    act(() => {
      result.current.fromSyncProgress(
        { status: 'in_progress', progress: 40, message: '40 %' },
        syncId
      );
    });

    expect(result.current.notifications[0].progress).toBe(40);
    expect(result.current.notifications[0].message).toBe('40 %');

    act(() => {
      result.current.fromSyncProgress(
        { status: 'completed', progress: 100, message: 'Terminé' },
        syncId
      );
    });

    expect(result.current.notifications[0].progress).toBe(100);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.notifications).toHaveLength(0);

    act(() => {
      const syncHandle = result.current.sync('Sync erreur', 'En cours…', 20);
      result.current.fromSyncProgress(
        { status: 'error', progress: 20, message: 'Timeout Jira' },
        syncHandle.id
      );
    });

    expect(result.current.notifications[0].type).toBe('error');
    expect(result.current.notifications[0].message).toBe('Timeout Jira');
  });
});
