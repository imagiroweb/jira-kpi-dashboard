import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';

vi.mock('../services/api', () => ({
  jiraApi: { getClaudeUsStats: vi.fn(), getClaudeUsIssues: vi.fn() },
}));

import { jiraApi } from '../services/api';
import { ClaudeUsKpiPanel } from './ClaudeUsKpiPanel';

const mockGetClaudeUsStats = vi.mocked(jiraApi.getClaudeUsStats);
const mockGetClaudeUsIssues = vi.mocked(jiraApi.getClaudeUsIssues);

const jqls = (p: string) => ({ claudeJql: `${p}-c`, nonClaudeJql: `${p}-n`, allJql: `${p}-a` });

const STATS = {
  success: true,
  year: 2026,
  quarter: 'Q3' as const,
  from: '2026-07-01',
  toExclusive: '2026-10-01',
  criterion: { kind: 'label' as const, value: 'claude-us' },
  done: {
    claudeCount: 4,
    nonClaudeCount: 6,
    totalCount: 10,
    claudePercent: 40,
    ...jqls('done'),
    byTeam: [
      { id: 810, name: 'Calson', claudeCount: 3, nonClaudeCount: 2, totalCount: 5, claudePercent: 60, ...jqls('d1') },
      { id: 843, name: 'Choco', claudeCount: 1, nonClaudeCount: 4, totalCount: 5, claudePercent: 20, ...jqls('d2') },
    ],
  },
  created: {
    claudeCount: 7,
    nonClaudeCount: 13,
    totalCount: 20,
    claudePercent: 35,
    ...jqls('created'),
    byTeam: [
      { id: 810, name: 'Calson', claudeCount: 5, nonClaudeCount: 5, totalCount: 10, claudePercent: 50, ...jqls('c1') },
      { id: 843, name: 'Choco', claudeCount: 2, nonClaudeCount: 8, totalCount: 10, claudePercent: 20, ...jqls('c2') },
    ],
  },
};

describe('ClaudeUsKpiPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche les séries US terminées et US créées pour le trimestre', async () => {
    mockGetClaudeUsStats.mockResolvedValue(STATS);

    renderWithProviders(<ClaudeUsKpiPanel quarter="Q3" />);

    await waitFor(() => expect(screen.getByText('40.0 %')).toBeInTheDocument());
    expect(screen.getByText('35.0 %')).toBeInTheDocument();
    expect(screen.getByText('US Claude terminées')).toBeInTheDocument();
    expect(screen.getByText('US Claude créées')).toBeInTheDocument();
    expect(screen.getByText(/label « claude-us »/)).toBeInTheDocument();
    expect(screen.getByText(/Boards : Calson, Choco/)).toBeInTheDocument();
    expect(mockGetClaudeUsStats).toHaveBeenCalledWith('Q3', new Date().getFullYear());
  });

  it('détaille chaque encart par équipe', async () => {
    mockGetClaudeUsStats.mockResolvedValue(STATS);

    renderWithProviders(<ClaudeUsKpiPanel quarter="Q3" />);

    const done = await screen.findByRole('list', { name: 'US Claude terminées par équipe' });
    expect(within(done).getByText('Calson').nextSibling).toHaveTextContent('3');
    const nonClaude = screen.getByRole('list', { name: 'US non Claude terminées par équipe' });
    expect(within(nonClaude).getByText('Choco').nextSibling).toHaveTextContent('4');
    const created = screen.getByRole('list', { name: 'US Claude créées par équipe' });
    expect(within(created).getByText('Calson').nextSibling).toHaveTextContent('5');
    const createdPercent = screen.getByRole('list', { name: '% US IA créées par équipe' });
    expect(within(createdPercent).getByText('Choco').nextSibling).toHaveTextContent('20.0 %');
  });

  it("n'affiche pas de détail par équipe en repli projet", async () => {
    mockGetClaudeUsStats.mockResolvedValue({
      ...STATS,
      done: { ...STATS.done, byTeam: [] },
      created: { ...STATS.created, byTeam: [] },
    });

    renderWithProviders(<ClaudeUsKpiPanel quarter="Q3" />);

    await screen.findByText(/Périmètre projet/);
    expect(screen.queryByRole('list', { name: 'US Claude terminées par équipe' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Sur 20 US créée(s).')).toHaveLength(3);
  });

  it("ouvre le détail de l'équipe au clic sur sa valeur", async () => {
    mockGetClaudeUsStats.mockResolvedValue(STATS);
    mockGetClaudeUsIssues.mockResolvedValue({ success: true, jql: 'x', label: 'claude-us', issues: [] });

    renderWithProviders(<ClaudeUsKpiPanel quarter="Q1" />);

    const created = await screen.findByRole('list', { name: 'US Claude créées par équipe' });
    fireEvent.click(within(created).getByTitle(/Calson — voir le détail/));

    expect(await screen.findByRole('dialog', { name: /US Claude créées · Calson · Q1/ })).toBeInTheDocument();
    expect(mockGetClaudeUsIssues).toHaveBeenCalledWith({
      quarter: 'Q1',
      year: new Date().getFullYear(),
      basis: 'created',
      kind: 'claude',
      boardId: 810,
    });
  });

  it('ouvre le détail global (toutes équipes) au clic sur la valeur principale', async () => {
    mockGetClaudeUsStats.mockResolvedValue(STATS);
    mockGetClaudeUsIssues.mockResolvedValue({ success: true, jql: 'x', label: 'claude-us', issues: [] });

    renderWithProviders(<ClaudeUsKpiPanel quarter="Q3" />);

    fireEvent.click(await screen.findByText('40.0 %'));

    await screen.findByRole('dialog');
    expect(mockGetClaudeUsIssues).toHaveBeenCalledWith(
      expect.objectContaining({ basis: 'done', kind: 'all', boardId: undefined })
    );
  });

  it('recharge quand le trimestre change', async () => {
    mockGetClaudeUsStats.mockResolvedValue(STATS);

    const { rerender } = renderWithProviders(<ClaudeUsKpiPanel quarter="Q3" />);
    await waitFor(() => expect(mockGetClaudeUsStats).toHaveBeenCalledTimes(1));

    rerender(<ClaudeUsKpiPanel quarter="Q4" />);
    await waitFor(() => expect(mockGetClaudeUsStats).toHaveBeenLastCalledWith('Q4', new Date().getFullYear()));
  });

  it("affiche un message d'erreur si Jira échoue", async () => {
    mockGetClaudeUsStats.mockRejectedValue(new Error('boom'));

    renderWithProviders(<ClaudeUsKpiPanel quarter="all" />);

    await waitFor(() => expect(screen.getByText(/Impossible de charger les US Claude/)).toBeInTheDocument());
  });
});
