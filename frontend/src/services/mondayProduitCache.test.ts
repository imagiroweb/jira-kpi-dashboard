import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cacheBoardsListKey,
  getCachedBoardPayload,
  getCachedBoardsList,
  getMondayProduitCache,
  invalidateMondayProduitCache,
  MONDAY_CACHE_TTL_BOARDS_MS,
  MONDAY_CACHE_TTL_BOARD_MS,
  mondayProduitCacheKeys,
  setCachedBoardPayload,
  setCachedBoardsList,
  setMondayProduitCache,
} from './mondayProduitCache';

const STORAGE_PREFIX = 'jira_kpi_monday_produit_v1:';

describe('mondayProduitCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-05T12:00:00.000Z'));
    sessionStorage.clear();
    invalidateMondayProduitCache();
  });

  afterEach(() => {
    invalidateMondayProduitCache();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  describe('getMondayProduitCache / setMondayProduitCache', () => {
    it('retourne une valeur en mémoire tant que le TTL est valide', () => {
      setMondayProduitCache('test-key', { foo: 'bar' }, 60_000);

      expect(getMondayProduitCache<{ foo: string }>('test-key')).toEqual({ foo: 'bar' });
    });

    it('retourne null après expiration du cache mémoire', () => {
      setMondayProduitCache('expired-key', 'value', 1000);
      vi.advanceTimersByTime(1001);

      expect(getMondayProduitCache('expired-key')).toBeNull();
    });

    it('restaure depuis sessionStorage et réhydrate la mémoire', () => {
      const expires = Date.now() + 60_000;
      sessionStorage.setItem(
        STORAGE_PREFIX + 'from-storage',
        JSON.stringify({ expires, value: { cached: true } })
      );

      expect(getMondayProduitCache<{ cached: boolean }>('from-storage')).toEqual({ cached: true });
      // Deuxième lecture depuis mémoire (TTL recalculé)
      expect(getMondayProduitCache<{ cached: boolean }>('from-storage')).toEqual({ cached: true });
    });

    it('supprime sessionStorage et retourne null si expiré', () => {
      const expires = Date.now() - 1;
      sessionStorage.setItem(
        STORAGE_PREFIX + 'stale',
        JSON.stringify({ expires, value: 'old' })
      );

      expect(getMondayProduitCache('stale')).toBeNull();
      expect(sessionStorage.getItem(STORAGE_PREFIX + 'stale')).toBeNull();
    });
  });

  describe('invalidateMondayProduitCache', () => {
    it('vide mémoire et sessionStorage pour le préfixe Monday', () => {
      setMondayProduitCache('k1', 'v1', 60_000);
      sessionStorage.setItem(STORAGE_PREFIX + 'k2', JSON.stringify({ expires: Date.now() + 60_000, value: 'v2' }));
      sessionStorage.setItem('other-key', 'keep');

      invalidateMondayProduitCache();

      expect(getMondayProduitCache('k1')).toBeNull();
      expect(sessionStorage.getItem(STORAGE_PREFIX + 'k2')).toBeNull();
      expect(sessionStorage.getItem('other-key')).toBe('keep');
    });
  });

  describe('cacheBoardsListKey', () => {
    it('retourne boards:all sans workspaceIds', () => {
      expect(cacheBoardsListKey(undefined)).toBe(mondayProduitCacheKeys.boardsAll);
      expect(cacheBoardsListKey([])).toBe(mondayProduitCacheKeys.boardsAll);
    });

    it('trie les workspaceIds pour une clé stable', () => {
      expect(cacheBoardsListKey(['ws2', 'ws1'])).toBe(
        mondayProduitCacheKeys.boardsWs('ws1,ws2')
      );
      expect(cacheBoardsListKey(['ws1', 'ws2'])).toBe(
        mondayProduitCacheKeys.boardsWs('ws1,ws2')
      );
    });
  });

  describe('setCachedBoardsList / getCachedBoardsList', () => {
    it('met en cache la liste de boards par workspace', () => {
      const boards = [{ id: 'b1', name: 'Board 1' }];
      setCachedBoardsList(['ws1'], boards);

      expect(getCachedBoardsList(['ws1'])).toEqual(boards);
      expect(getCachedBoardsList(['ws2'])).toBeNull();
    });

    it('utilise le TTL boards par défaut', () => {
      setCachedBoardsList(undefined, [{ id: 'b1', name: 'All' }]);
      vi.advanceTimersByTime(MONDAY_CACHE_TTL_BOARDS_MS - 1);
      expect(getCachedBoardsList(undefined)).not.toBeNull();
      vi.advanceTimersByTime(2);
      expect(getCachedBoardsList(undefined)).toBeNull();
    });
  });

  describe('setCachedBoardPayload / getCachedBoardPayload', () => {
    it('met en cache colonnes et items par boardId + itemsLimit', () => {
      const payload = {
        columns: [{ id: 'c1', title: 'Statut', type: 'status' }],
        items: [{ id: 'i1', name: 'Item 1' }],
      };
      setCachedBoardPayload('board-42', 100, payload);

      expect(getCachedBoardPayload('board-42', 100)).toEqual(payload);
      expect(getCachedBoardPayload('board-42', 50)).toBeNull();
    });

    it('expire après MONDAY_CACHE_TTL_BOARD_MS', () => {
      setCachedBoardPayload('b1', 100, { columns: [], items: [] });
      vi.advanceTimersByTime(MONDAY_CACHE_TTL_BOARD_MS + 1);

      expect(getCachedBoardPayload('b1', 100)).toBeNull();
    });
  });
});
