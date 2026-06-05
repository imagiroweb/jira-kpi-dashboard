const mockAxiosPost = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      post: mockAxiosPost,
    })),
  },
}));

const mockLoggerWarn = jest.fn();
jest.mock('../../utils/logger', () => ({
  logger: { warn: mockLoggerWarn, info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { MondayClient } from './MondayClient';

describe('MondayClient', () => {
  const initialApiKey = process.env.MONDAY_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MONDAY_API_KEY = 'monday-test-key';
  });

  afterAll(() => {
    process.env.MONDAY_API_KEY = initialApiKey;
  });

  it('isConfigured dépend de MONDAY_API_KEY', () => {
    const client = new MondayClient();
    expect(client.isConfigured()).toBe(true);
    process.env.MONDAY_API_KEY = '   ';
    expect(client.isConfigured()).toBe(false);
  });

  it('getMe retourne null si Monday n’est pas configuré', async () => {
    process.env.MONDAY_API_KEY = '';
    const client = new MondayClient();
    await expect(client.getMe()).resolves.toBeNull();
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it('getMe retourne l’utilisateur courant', async () => {
    mockAxiosPost.mockResolvedValue({
      data: { data: { me: { id: 1, name: 'Alice', email: 'alice@test.com' } } },
    });
    const client = new MondayClient();
    await expect(client.getMe()).resolves.toEqual({ id: 1, name: 'Alice', email: 'alice@test.com' });
  });

  it('getMe retourne null en cas d’erreur GraphQL ou HTTP', async () => {
    mockAxiosPost
      .mockResolvedValueOnce({ data: { errors: [{ message: 'Unauthorized' }] } })
      .mockRejectedValueOnce({ response: { status: 401, data: { error_message: 'Invalid token' } } });

    const client = new MondayClient();
    await expect(client.getMe()).resolves.toBeNull();
    await expect(client.getMe()).resolves.toBeNull();
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it('getWorkspaces et getBoards mappent la réponse GraphQL', async () => {
    mockAxiosPost
      .mockResolvedValueOnce({
        data: { data: { workspaces: [{ id: '10', name: 'Main', kind: 'open' }] } },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            boards: [{ id: 99, name: 'Roadmap', state: 'active', board_kind: 'public', items_count: 3, workspace_id: 10 }],
          },
        },
      });

    const client = new MondayClient();
    await expect(client.getWorkspaces()).resolves.toEqual([{ id: '10', name: 'Main', kind: 'open' }]);
    await expect(client.getBoards()).resolves.toEqual([
      {
        id: '99',
        name: 'Roadmap',
        state: 'active',
        boardKind: 'public',
        itemCount: 3,
        workspaceId: '10',
      },
    ]);
  });

  it('getBoardWithItems retourne colonnes et items', async () => {
    mockAxiosPost.mockResolvedValue({
      data: {
        data: {
          boards: [
            {
              id: '5',
              name: 'Sprint',
              columns: [{ id: 'status', title: 'Status', type: 'status' }],
              items_page: {
                cursor: null,
                items: [{ id: '1', name: 'Task A', column_values: [] }],
              },
            },
          ],
        },
      },
    });

    const client = new MondayClient();
    const result = await client.getBoardWithItems('5', 50);
    expect(result?.board.name).toBe('Sprint');
    expect(result?.columns).toHaveLength(1);
    expect(result?.items[0].name).toBe('Task A');
  });

  it('getBoardViews mappe les filtres Monday', async () => {
    mockAxiosPost.mockResolvedValue({
      data: {
        data: {
          boards: [
            {
              views: [
                {
                  id: '7',
                  name: 'Filtered',
                  type: 'board',
                  filter: { rules: [] },
                  filter_user_id: 3,
                  filter_team_id: 4,
                },
              ],
            },
          ],
        },
      },
    });

    const client = new MondayClient();
    await expect(client.getBoardViews('5')).resolves.toEqual([
      {
        id: '7',
        name: 'Filtered',
        type: 'board',
        filter: { rules: [] },
        settings: undefined,
        sort: undefined,
        tags: undefined,
        filterUserId: 3,
        filterTeamId: 4,
      },
    ]);
  });
});
