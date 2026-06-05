import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { resetStore } from '@/test/mocks/store';
import { TEST_USER } from '@/test/fixtures/users';

const mockGetProjects = vi.hoisted(() => vi.fn());

vi.mock('../services/api', () => ({
  jiraApi: { getProjects: mockGetProjects },
}));

import { ProjectSelector } from './ProjectSelector';

const TEST_PROJECTS = [
  { key: 'PROJ', name: 'Projet Alpha' },
  { key: 'ABC', name: 'Projet Beta' },
  { key: 'XYZ', name: 'Projet Gamma' },
];

describe('ProjectSelector', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    onChange.mockClear();
    mockGetProjects.mockResolvedValue({
      success: true,
      data: TEST_PROJECTS,
      configuredProjects: ['PROJ'],
    });
  });

  it('affiche « Aucun projet » quand aucun projet n’est sélectionné', async () => {
    renderWithProviders(
      <ProjectSelector value={[]} onChange={onChange} />,
      { user: TEST_USER }
    );

    expect(screen.getByText('Aucun projet')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockGetProjects).toHaveBeenCalled();
    });
  });

  it('sélectionne un projet via le dropdown', async () => {
    renderWithProviders(
      <ProjectSelector value={[]} onChange={onChange} />,
      { user: TEST_USER }
    );

    await waitFor(() => {
      expect(mockGetProjects).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: /aucun projet/i }));

    await waitFor(() => {
      expect(screen.getByText('PROJ')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('PROJ'));

    expect(onChange).toHaveBeenCalledWith(['PROJ']);
  });

  it('sélectionne tous les projets via « Tout sélectionner »', async () => {
    renderWithProviders(
      <ProjectSelector value={[]} onChange={onChange} />,
      { user: TEST_USER }
    );

    await waitFor(() => {
      expect(mockGetProjects).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: /aucun projet/i }));

    await waitFor(() => {
      expect(screen.getByText('Tout sélectionner')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Tout sélectionner'));

    expect(onChange).toHaveBeenCalledWith(['PROJ', 'ABC', 'XYZ']);
  });

  it('affiche « Tous les projets » quand tous sont sélectionnés', async () => {
    renderWithProviders(
      <ProjectSelector value={['PROJ', 'ABC', 'XYZ']} onChange={onChange} />,
      { user: TEST_USER }
    );

    await waitFor(() => {
      expect(screen.getByText('Tous les projets')).toBeInTheDocument();
    });
  });
});
