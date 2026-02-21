import axios, { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger';

const MONDAY_API_URL = 'https://api.monday.com/v2';

export interface MondayUser {
  id: number;
  name: string;
  email?: string;
}

export interface MondayBoard {
  id: string;
  name: string;
  state?: string;
  boardKind?: string;
  itemCount?: number;
  workspaceId?: string;
}

export interface MondayWorkspace {
  id: string;
  name: string;
  kind?: string;
}

export interface MondayColumn {
  id: string;
  title: string;
  type: string;
}

export interface MondayItem {
  id: string;
  name: string;
  column_values?: Array<{ id: string; text?: string; type: string; value?: string }>;
}

interface MondayGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; locations?: unknown[] }>;
  account_id?: number;
}

/**
 * Client for Monday.com API v2 (GraphQL).
 * Requires MONDAY_API_KEY in environment.
 */
export class MondayClient {
  private readonly client: AxiosInstance;

  constructor(apiKey?: string) {
    const raw = apiKey || process.env.MONDAY_API_KEY;
    const key = typeof raw === 'string' ? raw.trim() : '';
    if (!key) {
      logger.warn('MondayClient: MONDAY_API_KEY not set or empty');
    }
    this.client = axios.create({
      baseURL: MONDAY_API_URL,
      method: 'POST',
      headers: {
        'Authorization': key,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    });
  }

  isConfigured(): boolean {
    return Boolean(process.env.MONDAY_API_KEY?.trim());
  }

  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<T | null> {
    if (!this.isConfigured()) {
      return null;
    }
    try {
      const { data } = await this.client.post<MondayGraphQLResponse<T>>('', {
        query,
        variables: variables || {},
      });
      if (data.errors?.length) {
        logger.warn('Monday API errors:', data.errors.map((e) => e.message).join('; '));
        return null;
      }
      return data.data ?? null;
    } catch (err: unknown) {
      const res = (err as { response?: { status: number; data?: unknown } })?.response;
      const status = res?.status;
      const body = res?.data;
      const msg = typeof body === 'object' && body !== null && 'error_message' in body
        ? (body as { error_message?: string }).error_message
        : typeof body === 'object' && body !== null && 'errors' in body
          ? JSON.stringify((body as { errors?: unknown }).errors)
          : String(body ?? err);
      logger.warn(`Monday API request failed: ${status} - ${msg}`);
      return null;
    }
  }

  /**
   * Get current user (me) to verify connection.
   */
  async getMe(): Promise<MondayUser | null> {
    const result = await this.query<{ me: MondayUser }>(`
      query {
        me { id name email }
      }
    `);
    return result?.me ?? null;
  }

  /**
   * List workspaces (pour voir les boards par espace, y compris partagés).
   * Peut retourner [] si l’API ne supporte pas la requête workspaces.
   */
  async getWorkspaces(): Promise<MondayWorkspace[]> {
    const result = await this.query<{ workspaces: Array<{ id: string; name: string; kind?: string }> }>(`
      query {
        workspaces(limit: 100) {
          id
          name
          kind
        }
      }
    `);
    const workspaces = result?.workspaces ?? [];
    return workspaces.map((w) => ({
      id: String(w.id),
      name: w.name,
      kind: w.kind,
    }));
  }

  /**
   * List boards (limit 100).
   * Inclut les tableaux partagés : state "all" et board_kind "all" (public, private, share).
   * Optionnel : filtrer par workspace_ids. Si la requête échoue (API plus ancienne), fallback sans state/board_kind.
   */
  async getBoards(limit = 100, workspaceIds?: string[]): Promise<MondayBoard[]> {
    const withShared = workspaceIds?.length
      ? `boards(limit: $limit, state: all, board_kind: all, workspace_ids: $workspaceIds)`
      : `boards(limit: $limit, state: all, board_kind: all)`;
    const fields = `id name state board_kind items_count workspace_id`;
    const queryWithShared = workspaceIds?.length
      ? `query ($limit: Int!, $workspaceIds: [ID!]) { ${withShared} { ${fields} } }`
      : `query ($limit: Int!) { ${withShared} { ${fields} } }`;
    const variables = workspaceIds?.length ? { limit, workspaceIds } : { limit };
    let result = await this.query<{ boards: MondayBoard[] }>(queryWithShared, variables);
    if (!result?.boards && !workspaceIds?.length) {
      result = await this.query<{ boards: MondayBoard[] }>(
        `query ($limit: Int!) { boards(limit: $limit, state: active) { id name state board_kind items_count workspace_id } }`,
        { limit }
      );
    }
    const boards = result?.boards ?? [];
    return boards.map((b) => {
      const raw = b as unknown as { id: string | number; workspace_id?: string | number; board_kind?: string; items_count?: number };
      return {
        id: String(raw.id),
        name: b.name,
        state: b.state,
        boardKind: raw.board_kind,
        itemCount: raw.items_count,
        workspaceId: raw.workspace_id != null ? String(raw.workspace_id) : undefined,
      };
    });
  }

  /**
   * Get one board with columns and first page of items.
   * Uses items_page (required by Monday API since deprecation of "items" field).
   */
  async getBoardWithItems(boardId: string, itemsLimit = 100): Promise<{
    board: MondayBoard;
    columns: MondayColumn[];
    items: MondayItem[];
  } | null> {
    const result = await this.query<{
      boards: Array<{
        id: string;
        name: string;
        state?: string;
        board_kind?: string;
        items_count?: number;
        columns: Array<{ id: string; title: string; type: string }>;
        items_page: {
          cursor: string | null;
          items: Array<{
            id: string;
            name: string;
            column_values: Array<{ id: string; text?: string; type: string; value?: string }>;
          }>;
        };
      }>;
    }>(`
      query ($boardId: ID!, $itemsLimit: Int!) {
        boards(ids: [$boardId]) {
          id
          name
          state
          board_kind
          items_count
          columns { id title type }
          items_page(limit: $itemsLimit) {
            cursor
            items {
              id
              name
              column_values { id text type value }
            }
          }
        }
      }
    `, { boardId, itemsLimit });
    const raw = result?.boards?.[0];
    if (!raw) return null;
    const itemsPage = raw.items_page;
    const items = itemsPage?.items ?? [];
    return {
      board: {
        id: String((raw as { id: string | number }).id),
        name: raw.name,
        state: raw.state,
        boardKind: raw.board_kind,
        itemCount: raw.items_count,
      },
      columns: raw.columns.map((c) => ({ id: c.id, title: c.title, type: c.type })),
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        column_values: i.column_values,
      })),
    };
  }
}

let mondayClientInstance: MondayClient | null = null;

export function getMondayClient(): MondayClient {
  if (!mondayClientInstance) {
    mondayClientInstance = new MondayClient();
  }
  return mondayClientInstance;
}
