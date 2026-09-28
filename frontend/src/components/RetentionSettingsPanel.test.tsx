import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';

const mocks = vi.hoisted(() => ({ getMine: vi.fn(), updateRetention: vi.fn() }));
vi.mock('../services/api', () => ({ organizationApi: mocks }));

import { RetentionSettingsPanel } from './RetentionSettingsPanel';

const ORG = {
  name: 'Adoria',
  slug: 'adoria',
  allowedEmailDomains: ['adoria.com'],
  allowLocalAccounts: true,
  retention: { activityLogMonths: 12, performanceReviewYears: null, inactiveAccountMonths: null },
};

describe('RetentionSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMine.mockResolvedValue(ORG);
  });

  it('affiche les durées actuelles (vide = pas de purge)', async () => {
    renderWithProviders(<RetentionSettingsPanel />);

    expect(await screen.findByLabelText('Logs d’activité (connexions, pages vues)')).toHaveValue(12);
    expect(screen.getByLabelText('Fiches de performance')).toHaveValue(null);
  });

  it('enregistre les durées ; un champ vidé devient null', async () => {
    mocks.updateRetention.mockResolvedValue(ORG);
    renderWithProviders(<RetentionSettingsPanel />);

    const logs = await screen.findByLabelText('Logs d’activité (connexions, pages vues)');
    fireEvent.change(logs, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Fiches de performance'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(screen.getByText('Durées de conservation enregistrées.')).toBeInTheDocument());
    expect(mocks.updateRetention).toHaveBeenCalledWith({
      activityLogMonths: null,
      performanceReviewYears: 5,
      inactiveAccountMonths: null,
    });
  });

  it('affiche les erreurs de validation du serveur', async () => {
    mocks.updateRetention.mockRejectedValue({ response: { data: { errors: ['activityLogMonths : entier entre 1 et 120, ou null'] } } });
    renderWithProviders(<RetentionSettingsPanel />);

    await screen.findByLabelText('Logs d’activité (connexions, pages vues)');
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(await screen.findByText(/entier entre 1 et 120/)).toBeInTheDocument();
  });
});
