import { Sprint } from '../../domain/sprint/entities/Sprint';
import { SprintIssue } from '../../domain/sprint/entities/SprintIssue';
import type { SprintMetrics } from '../../domain/kpi/services/SprintMetricsCalculator';
import { SprintDTOMapper } from './SprintDTO';

describe('SprintDTOMapper', () => {
  it('toDTO sérialise les dates null et les champs sprint', () => {
    const sprint = Sprint.create({
      id: 1,
      name: 'S1',
      state: 'active',
      startDate: null,
      endDate: null,
      completeDate: null,
      goal: null,
      boardId: 9
    });
    const dto = SprintDTOMapper.toDTO(sprint);
    expect(dto.id).toBe(1);
    expect(dto.startDate).toBeNull();
    expect(dto.endDate).toBeNull();
    expect(dto.completeDate).toBeNull();
    expect(dto.goal).toBeNull();
    expect(dto.isActive).toBe(true);
  });

  it('issueToDTO expose originalEstimateSeconds ou null', () => {
    const withEst = SprintIssue.create({
      issueKey: 'P-1',
      summary: 'x',
      originalEstimateSeconds: 7200
    });
    const dto1 = SprintDTOMapper.issueToDTO(withEst);
    expect(dto1.originalEstimateSeconds).toBe(7200);

    const noEst = SprintIssue.create({ issueKey: 'P-2', summary: 'y' });
    const dto2 = SprintDTOMapper.issueToDTO(noEst);
    expect(dto2.originalEstimateSeconds).toBeNull();
  });

  it('issuesToDTO délègue à issueToDTO', () => {
    const issues = [SprintIssue.create({ issueKey: 'A-1', summary: 's' })];
    const arr = SprintDTOMapper.issuesToDTO(issues);
    expect(arr).toHaveLength(1);
    expect(arr[0].issueKey).toBe('A-1');
  });

  it('toSprintIssuesResponse agrège backlog et issues', () => {
    const metrics: SprintMetrics = {
      statusCounts: { total: 1, todo: 1, inProgress: 0, qa: 0, resolved: 0 },
      storyPointsByStatus: { total: 2, todo: 2, inProgress: 0, qa: 0, resolved: 0 },
      totalStoryPoints: 2,
      completionRate: 0,
      issuesByType: []
    };
    const issues = [SprintIssue.create({ issueKey: 'X-1', summary: 'one', storyPoints: 2 })];
    const res = SprintDTOMapper.toSprintIssuesResponse('X', issues, metrics, {
      ticketCount: 3,
      storyPoints: 5
    });
    expect(res.success).toBe(true);
    expect(res.projectKey).toBe('X');
    expect(res.issueCount).toBe(1);
    expect(res.backlog.ticketCount).toBe(3);
    expect(res.backlog.storyPoints).toBe(5);
    expect(res.issues[0].issueKey).toBe('X-1');
  });
});
