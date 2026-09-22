import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computeObjectiveCoaching, type Objective } from '../domain/performance';
import { ObjectivePaceSummary } from './ObjectivePaceSummary';

const CYCLE = { startDate: '2026-07-01', endDate: '2026-12-31' };
const NOW = new Date('2026-10-01T00:00:00.000Z');

function objective(progress: number, weight = 0.4): Pick<Objective, 'weight' | 'krs'> {
  return {
    weight,
    krs: [{ id: 'kr-1', label: 'KR', weight: 1, progress, progressHistory: [] }]
  };
}

describe('ObjectivePaceSummary', () => {
  it('affiche le score pondéré, le statut et les 6 jalons mensuels', () => {
    const coaching = computeObjectiveCoaching(objective(80), CYCLE, NOW);
    render(<ObjectivePaceSummary coaching={coaching} />);

    expect(screen.getByText(/Score pondéré 32 \/ 40 pts/)).toBeInTheDocument();
    expect(screen.getByText('Performant')).toBeInTheDocument();
    expect(screen.getByText('M1')).toBeInTheDocument();
    expect(screen.getByText('M6')).toBeInTheDocument();
    expect(screen.getByText(/mois restants/)).toBeInTheDocument();
  });

  it('en mode compact, n’affiche pas la piste mensuelle', () => {
    const coaching = computeObjectiveCoaching(objective(20), CYCLE, NOW);
    render(<ObjectivePaceSummary compact title="Avancement total" coaching={coaching} />);

    expect(screen.getByText('Avancement total')).toBeInTheDocument();
    expect(screen.getByText('Action à mener')).toBeInTheDocument();
    expect(screen.queryByText('M3')).not.toBeInTheDocument();
  });

  it('adresse "Action requise" au collaborateur et affiche l’action du manager', () => {
    const coaching = computeObjectiveCoaching(objective(20), CYCLE, NOW);
    render(
      <ObjectivePaceSummary
        audience="self"
        coaching={coaching}
        coachingAction="Prioriser le KR incidents cette semaine"
      />
    );

    expect(screen.getByText('Action requise')).toBeInTheDocument();
    expect(screen.queryByText('Action à mener')).not.toBeInTheDocument();
    expect(screen.getByText(/Prioriser le KR incidents cette semaine/)).toBeInTheDocument();
    expect(screen.getByText(/Action à suivre/)).toBeInTheDocument();
  });
});
