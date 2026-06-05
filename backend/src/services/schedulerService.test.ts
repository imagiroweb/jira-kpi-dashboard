const mockEmitKpiUpdate = jest.fn();
const mockEmitAlert = jest.fn();
const mockGetConfiguredProjects = jest.fn();
const mockGetSprintIssuesForProject = jest.fn();
const mockGetSupportBoardKPI = jest.fn();
const mockCacheClear = jest.fn();

jest.mock('../websocket/socketHandler', () => ({
  emitKPIUpdate: mockEmitKpiUpdate,
  emitAlert: mockEmitAlert
}));

jest.mock('../application/services/WorklogApplicationService', () => ({
  worklogAppService: {
    getConfiguredProjects: mockGetConfiguredProjects,
    getSprintIssuesForProject: mockGetSprintIssuesForProject,
    getSupportBoardKPI: mockGetSupportBoardKPI
  }
}));

jest.mock('../infrastructure/cache/CacheDecorator', () => ({
  globalCache: {
    clear: mockCacheClear
  }
}));

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

import { schedulerService } from './schedulerService';
import type { Server } from 'socket.io';

describe('schedulerService', () => {
  const io = { emit: jest.fn(), to: jest.fn() } as unknown as Server;
  const initialSupportKey = process.env.JIRA_SUPPORT_PROJECT_KEY;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    schedulerService.stop();
    mockGetConfiguredProjects.mockResolvedValue(['ABC', 'DEF']);
    mockGetSprintIssuesForProject.mockResolvedValue(undefined);
    mockGetSupportBoardKPI.mockResolvedValue(undefined);
    process.env.JIRA_SUPPORT_PROJECT_KEY = 'SB';
  });

  afterEach(() => {
    schedulerService.stop();
    jest.useRealTimers();
  });

  afterAll(() => {
    process.env.JIRA_SUPPORT_PROJECT_KEY = initialSupportKey;
  });

  it('n’active pas la planification si disabled', () => {
    schedulerService.initialize(io, { enabled: false, syncIntervalSeconds: 60 });
    expect(schedulerService.isSchedulerRunning()).toBe(false);
  });

  it('lance un sync automatique et émet KPI update', async () => {
    schedulerService.initialize(io, { enabled: true, syncIntervalSeconds: 60 });
    expect(schedulerService.isSchedulerRunning()).toBe(true);

    await jest.advanceTimersByTimeAsync(2100);

    expect(mockCacheClear).toHaveBeenCalled();
    expect(mockGetConfiguredProjects).toHaveBeenCalled();
    expect(mockGetSprintIssuesForProject).toHaveBeenCalledTimes(2);
    expect(mockGetSupportBoardKPI).toHaveBeenCalledTimes(1);
    expect(mockEmitKpiUpdate).toHaveBeenCalled();
  });

  it('émet une alerte warning en cas d’erreurs partielles', async () => {
    mockGetSprintIssuesForProject.mockRejectedValueOnce(new Error('boom ABC'));
    schedulerService.initialize(io, { enabled: true, syncIntervalSeconds: 60 });

    await jest.advanceTimersByTimeAsync(2100);

    expect(mockEmitAlert).toHaveBeenCalledWith(
      io,
      expect.objectContaining({
        level: 'warning'
      })
    );
  });

  it('triggerManualSync couvre la voie manuelle', async () => {
    await schedulerService.triggerManualSync();
    expect(mockGetConfiguredProjects).toHaveBeenCalled();
  });

  it('émet une alerte critique si la sync globale échoue', async () => {
    mockGetConfiguredProjects.mockRejectedValueOnce(new Error('fatal'));

    await schedulerService.triggerManualSync();

    expect(mockEmitAlert).toHaveBeenCalledWith(
      io,
      expect.objectContaining({
        level: 'critical'
      })
    );
  });

  it('ignore une sync si une précédente est en cours', async () => {
    let releaseFirst: (() => void) | undefined;
    mockGetConfiguredProjects.mockReturnValue(
      new Promise<string[]>((resolve) => {
        releaseFirst = () => resolve(['ABC']);
      })
    );

    const first = schedulerService.triggerManualSync();
    expect(schedulerService.isSyncInProgress()).toBe(true);

    await schedulerService.triggerManualSync();
    expect(mockGetConfiguredProjects).toHaveBeenCalledTimes(1);

    const release = releaseFirst;
    expect(release).toBeDefined();
    release!();
    await first;
    expect(schedulerService.isSyncInProgress()).toBe(false);
  });

  it('expose l’intervalle configuré', () => {
    schedulerService.initialize(io, { enabled: true, syncIntervalSeconds: 123 });
    expect(schedulerService.getIntervalSeconds()).toBe(123);
  });
});
