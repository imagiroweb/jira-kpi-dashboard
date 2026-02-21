import { ISprintRepository } from '../../domain/sprint/repositories/ISprintRepository';
import { SprintMetricsCalculator, VelocityMetrics } from '../../domain/kpi/services/SprintMetricsCalculator';
import { VelocityHistoryResponseDTO } from '../dto/SprintDTO';

/**
 * Use Case: Get Velocity History
 * Retrieves velocity data for past sprints to show trends
 */
export class GetVelocityHistoryUseCase {
  constructor(
    private readonly sprintRepository: ISprintRepository,
    private readonly metricsCalculator: SprintMetricsCalculator
  ) {}

  async execute(projectKey: string, sprintCount: number = 10): Promise<VelocityHistoryResponseDTO> {
    // Get closed sprints
    const sprints = await this.sprintRepository.findClosedSprints(projectKey, sprintCount);
    
    const velocities: VelocityMetrics[] = [];
    const sprintData: VelocityHistoryResponseDTO['sprints'] = [];

    for (const sprint of sprints) {
      // Get issues for this sprint
      const issues = await this.sprintRepository.findSprintIssues(sprint.id);
      
      // Calculate committed (total) and completed (done) points
      const committed = issues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
      const completed = issues
        .filter(i => i.isDone)
        .reduce((sum, i) => sum + (i.storyPoints || 0), 0);
      
      const velocity = this.metricsCalculator.calculateVelocity(committed, completed);
      velocities.push(velocity);
      
      sprintData.push({
        id: sprint.id,
        name: sprint.name,
        startDate: sprint.startDate?.toISOString() ?? null,
        endDate: sprint.endDate?.toISOString() ?? null,
        committed,
        completed,
        completionRate: velocity.completionRate
      });
    }

    const averageVelocity = this.metricsCalculator.calculateAverageVelocity(velocities);
    const trend = this.metricsCalculator.calculateVelocityTrend(velocities);

    return {
      success: true,
      projectKey,
      sprintCount: sprints.length,
      averageVelocity,
      trend,
      sprints: sprintData
    };
  }
}

