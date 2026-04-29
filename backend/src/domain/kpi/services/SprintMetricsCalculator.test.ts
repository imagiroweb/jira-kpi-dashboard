import { SprintMetricsCalculator } from './SprintMetricsCalculator';
import { SprintIssue } from '../../sprint/entities/SprintIssue';

function makeIssue(params: {
  key: string;
  type?: string;
  status?: string;
  statusCategory?: 'To Do' | 'In Progress' | 'Done' | 'Unknown';
  statusCategoryKey?: 'new' | 'indeterminate' | 'done' | 'undefined';
  storyPoints?: number | null;
}) {
  return SprintIssue.create({
    issueKey: params.key,
    summary: params.key,
    issueType: params.type ?? 'Task',
    status: params.status ?? 'Unknown',
    statusCategory: params.statusCategory ?? 'Unknown',
    statusCategoryKey: params.statusCategoryKey ?? 'undefined',
    storyPoints: params.storyPoints ?? null
  });
}

describe('SprintMetricsCalculator', () => {
  const calculator = new SprintMetricsCalculator();

  it('calcule les compteurs/statuts et points par statut', () => {
    const issues = [
      makeIssue({ key: 'A-1', type: 'Story', statusCategoryKey: 'new', statusCategory: 'To Do', storyPoints: 3 }),
      makeIssue({ key: 'A-2', type: 'Bug', statusCategoryKey: 'indeterminate', statusCategory: 'In Progress', storyPoints: 5 }),
      makeIssue({ key: 'A-3', type: 'Task', status: 'QA Ready', statusCategoryKey: 'indeterminate', storyPoints: 2 }),
      makeIssue({ key: 'A-4', type: 'Story', statusCategoryKey: 'done', statusCategory: 'Done', storyPoints: 8 })
    ];

    const m = calculator.calculate(issues);
    expect(m.statusCounts.total).toBe(4);
    expect(m.statusCounts.todo).toBe(1);
    expect(m.statusCounts.inProgress).toBe(1);
    expect(m.statusCounts.qa).toBe(1);
    expect(m.statusCounts.resolved).toBe(1);
    expect(m.totalStoryPoints).toBe(18);
    expect(m.completionRate).toBe(25);
    expect(m.issuesByType.find((x) => x.type === 'Story')?.storyPoints).toBe(11);
  });

  it('calcule la vélocité, moyenne et tendance', () => {
    const v1 = calculator.calculateVelocity(20, 18);
    const v2 = calculator.calculateVelocity(20, 20);
    const v3 = calculator.calculateVelocity(20, 24);

    expect(v1.completionRate).toBe(90);
    expect(v1.variance).toBe(-2);
    expect(v3.variancePercent).toBe(20);
    expect(calculator.calculateAverageVelocity([v1, v2, v3])).toBe(20.7);
    expect(calculator.calculateVelocityTrend([v1, v2, v3])).toBe('increasing');
    expect(calculator.calculateVelocityTrend([v3, v2, v1])).toBe('decreasing');
    expect(calculator.calculateVelocityTrend([v1, v2])).toBe('stable');
  });
});
