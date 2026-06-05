import { SearchWorklogsUseCase } from './SearchWorklogs';
import { Worklog } from '../../domain/worklog/entities/Worklog';
import { Author } from '../../domain/worklog/value-objects/Author';
import { TimeSpent } from '../../domain/worklog/value-objects/TimeSpent';
import { WorklogMetricsCalculator } from '../../domain/kpi/services/WorklogMetricsCalculator';

function makeWorklog(id: string, hours: number) {
  return Worklog.create({
    id,
    issueKey: 'PROJ-1',
    author: Author.create('acc-1', 'Alice'),
    timeSpent: TimeSpent.fromHours(hours),
    workStart: new Date('2026-04-15T10:00:00.000Z'),
    description: 'Dev',
  });
}

describe('SearchWorklogsUseCase', () => {
  it('recherche les worklogs et retourne les métriques agrégées', async () => {
    const worklogs = [makeWorklog('w1', 2), makeWorklog('w2', 1)];
    const worklogRepository = {
      search: jest.fn().mockResolvedValue(worklogs),
    };
    const metricsCalculator = new WorklogMetricsCalculator();
    const uc = new SearchWorklogsUseCase(worklogRepository as never, metricsCalculator);

    const result = await uc.execute({
      from: '2026-04-01',
      to: '2026-04-30',
      projectKeys: ['PROJ'],
      accountId: 'acc-1',
      openSprints: true,
    });

    expect(worklogRepository.search).toHaveBeenCalledWith({
      from: '2026-04-01',
      to: '2026-04-30',
      projectKey: undefined,
      projectKeys: ['PROJ'],
      issueKey: undefined,
      accountId: 'acc-1',
      teamName: undefined,
      openSprints: true,
    });
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(result.worklogs).toHaveLength(2);
    expect(result.metrics.totalTimeSpentHours).toBe(3);
    expect(result.filters.projectKeys).toEqual(['PROJ']);
  });
});
