import { ISprintRepository } from '../../domain/sprint/repositories/ISprintRepository';
import { SprintMetricsCalculator } from '../../domain/kpi/services/SprintMetricsCalculator';
import { SprintDTOMapper, SprintIssuesResponseDTO } from '../dto/SprintDTO';

/**
 * Use Case: Get Sprint Issues
 * Retrieves all issues in open sprints for a project with calculated metrics
 */
export class GetSprintIssuesUseCase {
  constructor(
    private readonly sprintRepository: ISprintRepository,
    private readonly metricsCalculator: SprintMetricsCalculator
  ) {}

  async execute(projectKey: string): Promise<SprintIssuesResponseDTO> {
    // Fetch sprint issues and backlog in parallel for better performance
    const [issues, backlogIssues] = await Promise.all([
      this.sprintRepository.findOpenSprintIssues(projectKey),
      this.sprintRepository.findBacklogIssues(projectKey)
    ]);
    
    // Calculate metrics using domain service
    const metrics = this.metricsCalculator.calculate(issues);
    
    // Calculate backlog stats
    const backlog = {
      ticketCount: backlogIssues.length,
      storyPoints: backlogIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0)
    };

    return SprintDTOMapper.toSprintIssuesResponse(projectKey, issues, metrics, backlog);
  }
}

