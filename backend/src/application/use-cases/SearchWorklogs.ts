import { IWorklogRepository, WorklogSearchParams } from '../../domain/worklog/repositories/IWorklogRepository';
import { WorklogMetricsCalculator } from '../../domain/kpi/services/WorklogMetricsCalculator';
import { WorklogDTOMapper, WorklogSearchResponseDTO } from '../dto/WorklogDTO';

/**
 * Use Case: Search Worklogs
 * Orchestrates searching worklogs and calculating metrics
 */
export class SearchWorklogsUseCase {
  constructor(
    private readonly worklogRepository: IWorklogRepository,
    private readonly metricsCalculator: WorklogMetricsCalculator
  ) {}

  async execute(params: SearchWorklogsRequest): Promise<WorklogSearchResponseDTO> {
    // Search worklogs via repository
    const worklogs = await this.worklogRepository.search({
      from: params.from,
      to: params.to,
      projectKey: params.projectKey,
      issueKey: params.issueKey,
      accountId: params.accountId,
      teamName: params.teamName,
      openSprints: params.openSprints
    });

    // Calculate metrics using domain service
    const metrics = this.metricsCalculator.calculate(worklogs);

    // Return DTO
    return {
      success: true,
      filters: {
        from: params.from,
        to: params.to,
        projectKey: params.projectKey,
        issueKey: params.issueKey,
        accountId: params.accountId,
        teamName: params.teamName,
        openSprints: params.openSprints
      },
      count: worklogs.length,
      worklogs: WorklogDTOMapper.toDTOList(worklogs),
      metrics: WorklogDTOMapper.metricsToDTO(metrics)
    };
  }
}

export interface SearchWorklogsRequest {
  from?: string;
  to?: string;
  projectKey?: string;
  issueKey?: string;
  accountId?: string;
  teamName?: string;
  openSprints?: boolean;
}

