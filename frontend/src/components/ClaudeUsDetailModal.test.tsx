import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';

vi.mock('../services/api', () => ({
  jiraApi: { getClaudeUsIssues: vi.fn() },
}));

import { jiraApi } from '../services/api';
import { ClaudeUsDetailModal } from './ClaudeUsDetailModal';

const mockGetClaudeUsIssues = vi.mocked(jiraApi.getClaudeUsIssues);

const PARAMS = { quarter: 'Q1' as const, year: 2026, basis: 'created' as const, kind: 'claude' as const };

describe('ClaudeUsDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche les dates de création, résolution et ajout du label', async () => {
    mockGetClaudeUsIssues.mockResolvedValue({
      success: true,
      jql: 'x',
      label: 'claude-us',
      issues: [
        {
          key: 'AD-1',
          summary: 'US de janvier',
          status: 'Terminé',
          created: '2026-01-15T10:00:00.000+0100',
          resolved: '2026-02-20T10:00:00.000+0100',
          isClaude: true,
          labelAddedAt: '2026-07-10T10:00:00.000+0200',
        },
      ],
    });

    renderWithProviders(<ClaudeUsDetailModal title="US Claude créées" params={PARAMS} periodEnd="2026-04-01" onClose={vi.fn()} />);

    expect(await screen.findByText('US de janvier')).toBeInTheDocument();
    expect(screen.getByText('15/01/2026')).toBeInTheDocument();
    expect(screen.getByText('20/02/2026')).toBeInTheDocument();
    expect(screen.getByText('10/07/2026')).toHaveAttribute('title', 'Label ajouté après la fin de la période');
    expect(screen.getByText(/1 US étiquetée\(s\) après la fin de la période/)).toBeInTheDocument();
  });

  it("n'alerte pas si le label a été ajouté pendant la période et signale un label introuvable", async () => {
    mockGetClaudeUsIssues.mockResolvedValue({
      success: true,
      jql: 'x',
      label: 'claude-us',
      issues: [
        { key: 'AD-2', summary: 'A', status: 'En cours', created: '2026-02-01', resolved: null, isClaude: true, labelAddedAt: '2026-02-03' },
        { key: 'AD-3', summary: 'B', status: 'En cours', created: '2026-02-01', resolved: null, isClaude: true, labelAddedAt: null },
      ],
    });

    renderWithProviders(<ClaudeUsDetailModal title="US" params={PARAMS} periodEnd="2026-04-01" onClose={vi.fn()} />);

    expect(await screen.findByText('Non trouvé')).toBeInTheDocument();
    expect(screen.queryByText(/après la fin de la période/)).not.toBeInTheDocument();
  });

  it('se ferme via le bouton Fermer', async () => {
    mockGetClaudeUsIssues.mockResolvedValue({ success: true, jql: 'x', label: 'claude-us', issues: [] });
    const onClose = vi.fn();

    renderWithProviders(<ClaudeUsDetailModal title="US" params={PARAMS} periodEnd="2026-04-01" onClose={onClose} />);

    await screen.findByText('Aucune US.');
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalled();
  });

  it("affiche une erreur si Jira échoue", async () => {
    mockGetClaudeUsIssues.mockRejectedValue(new Error('boom'));

    renderWithProviders(<ClaudeUsDetailModal title="US" params={PARAMS} periodEnd="2026-04-01" onClose={vi.fn()} />);

    expect(await screen.findByText(/Impossible de charger le détail/)).toBeInTheDocument();
  });
});
