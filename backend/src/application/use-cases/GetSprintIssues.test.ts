import { GetSprintIssuesUseCase } from './GetSprintIssues';
import { SprintIssue } from '../../domain/sprint/entities/SprintIssue';
import { SprintMetricsCalculator } from '../../domain/kpi/services/SprintMetricsCalculator';

describe('GetSprintIssuesUseCase', () => {
  it('agrège issues, backlog et métriques', async () => {
    const issues = [
      SprintIssue.create({ issueKey: 'P-1', summary: 'a', storyPoints: 3, statusCategoryKey: 'new', statusCategory: 'To Do' })
    ];
    const backlog = [
      SprintIssue.create({ issueKey: 'P-99', summary: 'b', storyPoints: null }),
      SprintIssue.create({ issueKey: 'P-98', summary: 'c', storyPoints: 5 })
    ];
    const sprintRepository = {
      findOpenSprintIssues: jest.fn().mockResolvedValue(issues),
      findBacklogIssues: jest.fn().mockResolvedValue(backlog)
    };
    const metricsCalculator = new SprintMetricsCalculator();
    const uc = new GetSprintIssuesUseCase(sprintRepository as never, metricsCalculator);

    const result = await uc.execute('P');

    expect(sprintRepository.findOpenSprintIssues).toHaveBeenCalledWith('P');
    expect(sprintRepository.findBacklogIssues).toHaveBeenCalledWith('P');
    expect(result.projectKey).toBe('P');
    expect(result.issueCount).toBe(1);
    expect(result.backlog.ticketCount).toBe(2);
    expect(result.backlog.storyPoints).toBe(5);
    expect(result.issues).toHaveLength(1);
  });
});
