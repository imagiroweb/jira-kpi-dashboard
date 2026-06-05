import type {
  EpicDetailsResponse,
  EpicProgressItem,
  EpicProgressResponse,
  EpicSearchResponse,
  JiraBoard,
} from '@/services/api';
import type { BoardStats } from '@/store/useStore';

export const TEST_JIRA_BOARDS: JiraBoard[] = [
  { id: 1, name: 'Board 1', projectKey: 'PROJ' },
  { id: 2, name: 'Board 2', projectKey: 'ABC' },
];

export const TEST_EPIC_PROGRESS_ITEM: EpicProgressItem = {
  epicKey: 'PROJ-100',
  summary: 'Epic CLI',
  issueType: 'Epic',
  status: 'In Progress',
  statusCategoryKey: 'indeterminate',
  childIssueCount: 3,
  originalEstimateSeconds: 28800,
  timeSpentSeconds: 14400,
  macroChiffrageSeconds: 36000,
  totalStoryPoints: 13,
  progressPercent: 50,
  isOverrun: false,
  teams: ['Team A'],
  ticketsDone: 1,
  ticketsTodo: 1,
  ticketsInProgress: 1,
  storyPointsDone: 5,
  storyPointsTodo: 3,
  storyPointsInProgress: 5,
};

export const TEST_EPIC_PROGRESS_RESPONSE: EpicProgressResponse = {
  boardId: 1,
  boardName: 'Board 1',
  projectKey: 'PROJ',
  epicCount: 1,
  total: 1,
  page: 1,
  pageSize: 20,
  epics: [TEST_EPIC_PROGRESS_ITEM],
};

export const TEST_EPIC_SEARCH_RESPONSE: EpicSearchResponse = {
  boardId: 1,
  query: 'CLI',
  results: [
    {
      epicKey: 'PROJ-100',
      summary: 'Epic CLI',
      issueType: 'Epic',
      status: 'In Progress',
      statusCategoryKey: 'indeterminate',
    },
  ],
};

export const TEST_EPIC_DETAILS_RESPONSE: EpicDetailsResponse = {
  epicKey: 'PROJ-100',
  summary: 'Epic CLI',
  issueType: 'Epic',
  status: 'In Progress',
  statusCategoryKey: 'indeterminate',
  originalEstimateSeconds: 28800,
  timeSpentSeconds: 14400,
  macroChiffrageSeconds: 36000,
  totalStoryPoints: 13,
  progressPercent: 50,
  isOverrun: false,
  children: [
    {
      issueKey: 'PROJ-101',
      summary: 'Story 1',
      issueType: 'Story',
      status: 'Done',
      statusCategoryKey: 'done',
      originalEstimateSeconds: 7200,
      timeSpentSeconds: 7200,
      storyPoints: 5,
      parentKey: 'PROJ-100',
      hierarchyLevel: 1,
    },
  ],
};

export const TEST_BOARD_STATS: BoardStats[] = [
  {
    boardId: 1,
    name: 'Board 1',
    projectKey: 'PROJ',
    color: '#336699',
    totalPoints: 20,
    todoPoints: 5,
    inProgressPoints: 8,
    qaPoints: 2,
    resolvedPoints: 5,
    estimatedPoints: 22,
    totalTickets: 10,
    todoTickets: 2,
    inProgressTickets: 3,
    qaTickets: 1,
    resolvedTickets: 4,
    totalTimeHours: 40,
    backlogTickets: 1,
    backlogPoints: 3,
  },
];
