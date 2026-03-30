import type { MondayBoard, MondayColumn, MondayItem, MondayUser, MondayWorkspace } from './api';

/** TTL par défaut : métadonnées Monday (statut, user, espaces). */
export const MONDAY_CACHE_TTL_BOOTSTRAP_MS = 5 * 60 * 1000;
/** Listes de boards. */
export const MONDAY_CACHE_TTL_BOARDS_MS = 10 * 60 * 1000;
/** Contenu complet d’un board (colonnes + items). */
export const MONDAY_CACHE_TTL_BOARD_MS = 10 * 60 * 1000;

const STORAGE_PREFIX = 'jira_kpi_monday_produit_v1:';
/** Limite prudente pour sessionStorage (~5 Mo selon navigateurs). */
const MAX_SESSION_JSON_CHARS = 4_000_000;

const memory = new Map<string, { expires: number; value: unknown }>();

function memGet<T>(key: string): T | null {
  const e = memory.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) {
    memory.delete(key);
    return null;
  }
  return e.value as T;
}

function memSet(key: string, value: unknown, ttlMs: number): void {
  memory.set(key, { value, expires: Date.now() + ttlMs });
}

export const mondayProduitCacheKeys = {
  bootstrap: 'bootstrap',
  boardsAll: 'boards:all',
  boardsWs: (workspaceId: string) => `boards:ws:${workspaceId}`,
  boardData: (boardId: string, itemsLimit: number) => `board:${boardId}:${itemsLimit}`,
} as const;

export interface MondayBootstrapCachePayload {
  configured: boolean;
  me: MondayUser | null;
  workspaces: MondayWorkspace[];
}

export function getMondayProduitCache<T>(key: string): T | null {
  const m = memGet<T>(key);
  if (m !== null) return m;
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expires: number; value: unknown };
    if (Date.now() > parsed.expires) {
      sessionStorage.removeItem(STORAGE_PREFIX + key);
      return null;
    }
    memSet(key, parsed.value, parsed.expires - Date.now());
    return parsed.value as T;
  } catch {
    return null;
  }
}

export function setMondayProduitCache<T>(key: string, value: T, ttlMs: number): void {
  memSet(key, value, ttlMs);
  if (typeof sessionStorage === 'undefined') return;
  try {
    const payload = JSON.stringify({ expires: Date.now() + ttlMs, value });
    if (payload.length > MAX_SESSION_JSON_CHARS) {
      return;
    }
    sessionStorage.setItem(STORAGE_PREFIX + key, payload);
  } catch {
    // quota, mode privé, etc. — le cache mémoire suffit pour la session courante
  }
}

/** Supprime toutes les entrées cache Produit (mémoire + sessionStorage). */
export function invalidateMondayProduitCache(): void {
  memory.clear();
  if (typeof sessionStorage === 'undefined') return;
  const toRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(STORAGE_PREFIX)) toRemove.push(k);
  }
  toRemove.forEach((k) => sessionStorage.removeItem(k));
}

export function cacheBoardsListKey(workspaceIds: string[] | undefined): string {
  if (!workspaceIds?.length) return mondayProduitCacheKeys.boardsAll;
  return mondayProduitCacheKeys.boardsWs([...workspaceIds].sort().join(','));
}

export function setCachedBoardsList(
  workspaceIds: string[] | undefined,
  boards: MondayBoard[],
  ttlMs = MONDAY_CACHE_TTL_BOARDS_MS
): void {
  setMondayProduitCache(cacheBoardsListKey(workspaceIds), boards, ttlMs);
}

export function getCachedBoardsList(workspaceIds: string[] | undefined): MondayBoard[] | null {
  return getMondayProduitCache<MondayBoard[]>(cacheBoardsListKey(workspaceIds));
}

export function setCachedBoardPayload(
  boardId: string,
  itemsLimit: number,
  data: { columns: MondayColumn[]; items: MondayItem[] },
  ttlMs = MONDAY_CACHE_TTL_BOARD_MS
): void {
  setMondayProduitCache(mondayProduitCacheKeys.boardData(boardId, itemsLimit), data, ttlMs);
}

export function getCachedBoardPayload(
  boardId: string,
  itemsLimit: number
): { columns: MondayColumn[]; items: MondayItem[] } | null {
  return getMondayProduitCache<{ columns: MondayColumn[]; items: MondayItem[] }>(
    mondayProduitCacheKeys.boardData(boardId, itemsLimit)
  );
}
