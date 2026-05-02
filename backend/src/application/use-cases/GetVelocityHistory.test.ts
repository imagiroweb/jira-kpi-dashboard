import { GetVelocityHistoryUseCase } from './GetVelocityHistory';
import { SprintMetricsCalculator } from '../../domain/kpi/services/SprintMetricsCalculator';
import { Sprint } from '../../domain/sprint/entities/Sprint';
import { SprintIssue } from '../../domain/sprint/entities/SprintIssue';

describe('GetVelocityHistoryUseCase', () => {
  const metricsCalculator = new SprintMetricsCalculator();

  it('retourne une réponse vide si aucun sprint fermé', async () => {
    const sprintRepository = {
      findClosedSprints: jest.fn().mockResolvedValue([]),
      findSprintIssues: jest.fn()
    };
    const uc = new GetVelocityHistoryUseCase(sprintRepository as never, metricsCalculator);
    const result = await uc.execute('PROJ', 5);

    expect(result.sprintCount).toBe(0);
    expect(result.sprints).toEqual([]);
    expect(result.averageVelocity).toBe(0);
    expect(result.trend).toBe('stable');
    expect(sprintRepository.findSprintIssues).not.toHaveBeenCalled();
  });

  it('construit l’historique à partir des sprints et issues', async () => {
    const s1 = Sprint.create({
      id: 10,
      name: 'S1',
      state: 'closed',
      startDate: '2026-01-01',
      endDate: '2026-01-14',
      boardId: 1
    });
    const sprintRepository = {
      findClosedSprints: jest.fn().mockResolvedValue([s1]),
      findSprintIssues: jest.fn().mockResolvedValue([
        SprintIssue.create({
          issueKey: 'P-1',
          summary: 'x',
          storyPoints: 10,
          statusCategoryKey: 'done',
          statusCategory: 'Done'
        }),
        SprintIssue.create({
          issueKey: 'P-2',
          summary: 'y',
          storyPoints: 2,
          statusCategoryKey: 'new',
          statusCategory: 'To Do'
        })
      ])
    };
    const uc = new GetVelocityHistoryUseCase(sprintRepository as never, metricsCalculator);
    const result = await uc.execute('P', 10);

    expect(result.projectKey).toBe('P');
    expect(result.sprintCount).toBe(1);
    expect(result.sprints[0].committed).toBe(12);
    expect(result.sprints[0].completed).toBe(10);
    expect(result.sprints[0].startDate).toMatch(/^2026-01-01/);
  });
});
