import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axiosModuleMock } from '@/test/mocks/api';

const axiosMocks = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPatch: vi.fn(),
  mockDelete: vi.fn(),
  mockPut: vi.fn(),
}));
const { mockGet, mockPost, mockDelete } = axiosMocks;

vi.mock('axios', () => axiosModuleMock(axiosMocks));

import {
  brevoApi,
  dashboardSnapshotApi,
  epicApi,
  jiraApi,
  mondayApi,
  supportSnapshotApi,
  syncApi,
} from './api';

describe('jiraApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getProjects appelle GET /jira/projects', async () => {
    const payload = { success: true, data: [{ key: 'PROJ', name: 'Projet' }] };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await jiraApi.getProjects();

    expect(mockGet).toHaveBeenCalledWith('/jira/projects');
    expect(result).toEqual(payload);
  });

  it('getConfiguredBoards appelle GET /jira/configured-boards', async () => {
    const payload = { success: true, boards: [{ id: 1, name: 'Board', projectKey: 'P' }] };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await jiraApi.getConfiguredBoards();

    expect(mockGet).toHaveBeenCalledWith('/jira/configured-boards');
    expect(result).toEqual(payload);
  });

  it('getTimeConfig appelle GET /jira/time-config', async () => {
    const payload = { success: true, workingHoursPerDay: 8, workingDaysPerWeek: 5 };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await jiraApi.getTimeConfig();

    expect(mockGet).toHaveBeenCalledWith('/jira/time-config');
    expect(result).toEqual(payload);
  });
});

describe('epicApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getProgress envoie boardId, filtres et pagination par défaut', async () => {
    const payload = { success: true, boardId: 42, epics: [] };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await epicApi.getProgress(42);

    expect(mockGet).toHaveBeenCalledWith('/jira/epic-progress', {
      params: { boardId: 42, typeFilter: 'all', statusFilter: 'all', page: 1, pageSize: 20 },
    });
    expect(result).toEqual(payload);
  });

  it('getProgress inclut summaryPrefix seulement si différent de « all »', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true } });

    await epicApi.getProgress(42, 'all', 'all', 1, 20, 'all');

    expect(mockGet).toHaveBeenCalledWith('/jira/epic-progress', {
      params: { boardId: 42, typeFilter: 'all', statusFilter: 'all', page: 1, pageSize: 20 },
    });

    mockGet.mockResolvedValueOnce({ data: { success: true } });

    await epicApi.getProgress(42, 'epic', 'done', 2, 10, 'INT');

    expect(mockGet).toHaveBeenCalledWith('/jira/epic-progress', {
      params: {
        boardId: 42,
        typeFilter: 'epic',
        statusFilter: 'done',
        page: 2,
        pageSize: 10,
        summaryPrefix: 'INT',
      },
    });
  });

  it('search appelle GET /jira/epic-search avec query et filtres', async () => {
    const payload = { success: true, boardId: 42, query: 'INT', results: [] };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await epicApi.search(42, 'INT', 'legend', 'new');

    expect(mockGet).toHaveBeenCalledWith('/jira/epic-search', {
      params: { boardId: 42, query: 'INT', typeFilter: 'legend', statusFilter: 'new' },
    });
    expect(result).toEqual(payload);
  });

  it('getDetails appelle GET /jira/epic/:key/details', async () => {
    const payload = { success: true, epicKey: 'PROJ-1', children: [] };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await epicApi.getDetails('PROJ-1');

    expect(mockGet).toHaveBeenCalledWith('/jira/epic/PROJ-1/details');
    expect(result).toEqual(payload);
  });
});

describe('syncApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forceSync envoie POST /worklog/sync avec timeout 120s', async () => {
    const payload = { success: true, message: 'Sync OK', projectsSynced: 3 };
    mockPost.mockResolvedValueOnce({ data: payload });

    const result = await syncApi.forceSync();

    expect(mockPost).toHaveBeenCalledWith('/worklog/sync', {}, { timeout: 120000 });
    expect(result).toEqual(payload);
  });

  it('clearCache envoie DELETE /worklog/cache', async () => {
    const payload = { success: true, message: 'Cache vidé' };
    mockDelete.mockResolvedValueOnce({ data: payload });

    const result = await syncApi.clearCache();

    expect(mockDelete).toHaveBeenCalledWith('/worklog/cache');
    expect(result).toEqual(payload);
  });
});

describe('supportSnapshotApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saveSnapshot envoie POST avec sprintName et notes', async () => {
    const payload = { success: true, snapshot: { id: 'snap-1' } };
    mockPost.mockResolvedValueOnce({ data: payload });

    const result = await supportSnapshotApi.saveSnapshot('Sprint 42', 'Note test');

    expect(mockPost).toHaveBeenCalledWith('/worklog/support-snapshot?activeSprint=true', {
      sprintName: 'Sprint 42',
      notes: 'Note test',
    });
    expect(result).toEqual(payload);
  });

  it('getSnapshots appelle GET avec limit par défaut 50', async () => {
    const payload = { success: true, snapshots: [] };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await supportSnapshotApi.getSnapshots();

    expect(mockGet).toHaveBeenCalledWith('/worklog/support-snapshots?limit=50');
    expect(result).toEqual(payload);
  });

  it('getSnapshots accepte un limit personnalisé', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, snapshots: [] } });

    await supportSnapshotApi.getSnapshots(10);

    expect(mockGet).toHaveBeenCalledWith('/worklog/support-snapshots?limit=10');
  });

  it('getSnapshot appelle GET /worklog/support-snapshot/:id', async () => {
    const payload = { success: true, snapshot: { id: 'snap-1' } };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await supportSnapshotApi.getSnapshot('snap-1');

    expect(mockGet).toHaveBeenCalledWith('/worklog/support-snapshot/snap-1');
    expect(result).toEqual(payload);
  });

  it('deleteSnapshot appelle DELETE /worklog/support-snapshot/:id', async () => {
    const payload = { success: true, message: 'Supprimé' };
    mockDelete.mockResolvedValueOnce({ data: payload });

    const result = await supportSnapshotApi.deleteSnapshot('snap-1');

    expect(mockDelete).toHaveBeenCalledWith('/worklog/support-snapshot/snap-1');
    expect(result).toEqual(payload);
  });
});

describe('dashboardSnapshotApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saveSnapshot injecte key depuis boardId si absent', async () => {
    const payload = { success: true, snapshot: { id: 'dash-1' } };
    mockPost.mockResolvedValueOnce({ data: payload });

    const projectsStats = [{ boardId: 99, name: 'Board A', color: '#fff' }];
    const totals = {
      totalPoints: 10,
      todoPoints: 2,
      inProgressPoints: 3,
      qaPoints: 1,
      resolvedPoints: 4,
      estimatedPoints: 10,
      totalTickets: 5,
      todoTickets: 1,
      inProgressTickets: 1,
      qaTickets: 1,
      resolvedTickets: 2,
      totalTimeHours: 8,
      backlogTickets: 0,
      backlogPoints: 0,
    };
    const dateRange = { from: '2025-01-01', to: '2025-01-31' };

    const result = await dashboardSnapshotApi.saveSnapshot(
      'Sprint 1',
      projectsStats,
      totals,
      dateRange,
      'Notes'
    );

    expect(mockPost).toHaveBeenCalledWith('/jira/dashboard-snapshot', {
      sprintName: 'Sprint 1',
      projectsStats: [{ boardId: 99, name: 'Board A', color: '#fff', key: '99' }],
      totals,
      dateRange,
      notes: 'Notes',
    });
    expect(result).toEqual(payload);
  });

  it('saveSnapshot conserve key existante', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true } });

    await dashboardSnapshotApi.saveSnapshot(
      'Sprint 1',
      [{ key: 'PROJ', name: 'Legacy', color: '#000' }],
      {
        totalPoints: 0,
        todoPoints: 0,
        inProgressPoints: 0,
        qaPoints: 0,
        resolvedPoints: 0,
        estimatedPoints: 0,
        totalTickets: 0,
        todoTickets: 0,
        inProgressTickets: 0,
        qaTickets: 0,
        resolvedTickets: 0,
        totalTimeHours: 0,
        backlogTickets: 0,
        backlogPoints: 0,
      },
      { from: '2025-01-01', to: '2025-01-31' }
    );

    expect(mockPost).toHaveBeenCalledWith(
      '/jira/dashboard-snapshot',
      expect.objectContaining({
        projectsStats: [{ key: 'PROJ', name: 'Legacy', color: '#000' }],
      })
    );
  });

  it('getSnapshots appelle GET avec limit par défaut 50', async () => {
    const payload = { success: true, snapshots: [] };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await dashboardSnapshotApi.getSnapshots();

    expect(mockGet).toHaveBeenCalledWith('/jira/dashboard-snapshots?limit=50');
    expect(result).toEqual(payload);
  });

  it('getSnapshot appelle GET /jira/dashboard-snapshot/:id', async () => {
    const payload = { success: true, snapshot: { id: 'dash-1' } };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await dashboardSnapshotApi.getSnapshot('dash-1');

    expect(mockGet).toHaveBeenCalledWith('/jira/dashboard-snapshot/dash-1');
    expect(result).toEqual(payload);
  });

  it('deleteSnapshot appelle DELETE /jira/dashboard-snapshot/:id', async () => {
    const payload = { success: true, message: 'Supprimé' };
    mockDelete.mockResolvedValueOnce({ data: payload });

    const result = await dashboardSnapshotApi.deleteSnapshot('dash-1');

    expect(mockDelete).toHaveBeenCalledWith('/jira/dashboard-snapshot/dash-1');
    expect(result).toEqual(payload);
  });
});

describe('brevoApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getStatus appelle GET /brevo/status', async () => {
    const payload = { success: true, configured: true };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await brevoApi.getStatus();

    expect(mockGet).toHaveBeenCalledWith('/brevo/status');
    expect(result).toEqual(payload);
  });

  it('getAccount appelle GET /brevo/account', async () => {
    const payload = { success: true, account: { email: 'a@test.com' } };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await brevoApi.getAccount();

    expect(mockGet).toHaveBeenCalledWith('/brevo/account');
    expect(result).toEqual(payload);
  });

  it('getStats appelle GET /brevo/stats', async () => {
    const payload = { success: true, stats: { contactsCount: 100, listsCount: 2 } };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await brevoApi.getStats();

    expect(mockGet).toHaveBeenCalledWith('/brevo/stats');
    expect(result).toEqual(payload);
  });

  it('getTransactionalEvents transmet les params optionnels', async () => {
    const payload = { success: true, events: [] };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await brevoApi.getTransactionalEvents({ days: 7, limit: 50, event: 'clicks' });

    expect(mockGet).toHaveBeenCalledWith('/brevo/transactional/events', {
      params: { days: 7, limit: 50, event: 'clicks' },
    });
    expect(result).toEqual(payload);
  });

  it('getCampaignRecipients utilise timeout 90s', async () => {
    const payload = { success: true, emails: ['a@test.com'] };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await brevoApi.getCampaignRecipients(123, 'clickers');

    expect(mockGet).toHaveBeenCalledWith('/brevo/campaigns/123/recipients', {
      params: { type: 'clickers' },
      timeout: 90000,
    });
    expect(result).toEqual(payload);
  });
});

describe('mondayApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getStatus appelle GET /monday/status', async () => {
    const payload = { success: true, configured: true };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await mondayApi.getStatus();

    expect(mockGet).toHaveBeenCalledWith('/monday/status');
    expect(result).toEqual(payload);
  });

  it('getMe appelle GET /monday/me', async () => {
    const payload = { success: true, me: { id: 1, name: 'User' } };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await mondayApi.getMe();

    expect(mockGet).toHaveBeenCalledWith('/monday/me');
    expect(result).toEqual(payload);
  });

  it('getWorkspaces appelle GET /monday/workspaces', async () => {
    const payload = { success: true, workspaces: [{ id: 'ws1', name: 'WS' }] };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await mondayApi.getWorkspaces();

    expect(mockGet).toHaveBeenCalledWith('/monday/workspaces');
    expect(result).toEqual(payload);
  });

  it('getBoards joint workspace_ids quand fournis', async () => {
    const payload = { success: true, boards: [] };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await mondayApi.getBoards(100, ['ws2', 'ws1']);

    expect(mockGet).toHaveBeenCalledWith('/monday/boards', {
      params: { limit: 100, workspace_ids: 'ws2,ws1' },
    });
    expect(result).toEqual(payload);
  });

  it('getBoards omet workspace_ids si tableau vide', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, boards: [] } });

    await mondayApi.getBoards(50, []);

    expect(mockGet).toHaveBeenCalledWith('/monday/boards', { params: { limit: 50 } });
  });

  it('getBoard appelle GET /monday/boards/:id avec itemsLimit', async () => {
    const payload = { success: true, board: { id: 'b1', name: 'Board' } };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await mondayApi.getBoard('b1', 200);

    expect(mockGet).toHaveBeenCalledWith('/monday/boards/b1', { params: { itemsLimit: 200 } });
    expect(result).toEqual(payload);
  });

  it('getBoardViews appelle GET /monday/boards/:id/views', async () => {
    const payload = { success: true, views: [{ id: 'v1', name: 'Main', type: 'board' }] };
    mockGet.mockResolvedValueOnce({ data: payload });

    const result = await mondayApi.getBoardViews('b1');

    expect(mockGet).toHaveBeenCalledWith('/monday/boards/b1/views');
    expect(result).toEqual(payload);
  });
});
