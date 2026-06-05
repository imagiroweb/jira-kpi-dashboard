import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { TEST_USER } from '@/test/fixtures/users';
import { resetStore } from '@/test/mocks/store';

vi.mock('./DateRangePicker', () => ({
  DateRangePicker: () => null,
}));

vi.mock('../services/api', () => ({
  brevoApi: {
    getStatus: vi.fn(),
    getStats: vi.fn(),
    getTransactionalEvents: vi.fn(),
    getCampaignRecipients: vi.fn(),
  },
}));

import { brevoApi } from '../services/api';
import { MarketingDashboard } from './MarketingDashboard';

const mockGetStatus = vi.mocked(brevoApi.getStatus);
const mockGetStats = vi.mocked(brevoApi.getStats);
const mockGetTransactionalEvents = vi.mocked(brevoApi.getTransactionalEvents);

const TEST_CAMPAIGNS = [
  {
    id: 101,
    name: 'Newsletter franchiseurs Q1',
    subject: 'Actualités franchiseurs',
    type: 'classic',
    status: 'sent',
    sentDate: '2026-06-01T10:00:00.000Z',
    statistics: { sent: 1200, opened: 480, clicked: 96, delivered: 1180, unsubscribed: 3 },
  },
  {
    id: 102,
    name: 'Campagne produit',
    subject: 'Nouveautés',
    type: 'classic',
    status: 'sent',
    sentDate: '2026-06-03T10:00:00.000Z',
    statistics: { sent: 800, opened: 200, clicked: 0, delivered: 790, unsubscribed: 1 },
  },
];

const TEST_BREVO_STATS = {
  contactsCount: 5000,
  listsCount: 3,
  totalSubscribers: 4800,
  lists: [],
  recentCampaigns: [TEST_CAMPAIGNS[0]],
  manualCampaigns: [TEST_CAMPAIGNS[1]],
};

describe('MarketingDashboard', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    mockGetTransactionalEvents.mockResolvedValue({ success: true, events: [] });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
  });

  it('affiche le chargement puis Brevo non configuré', async () => {
    mockGetStatus.mockResolvedValueOnce({ success: true, configured: false });
    mockGetStats.mockResolvedValueOnce({ success: true });

    renderWithProviders(<MarketingDashboard />, { user: TEST_USER });

    expect(screen.getByText(/Chargement des données Brevo/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Brevo non configuré')).toBeInTheDocument();
    });
  });

  it('affiche les campagnes quand Brevo est configuré', async () => {
    mockGetStatus.mockResolvedValue({ success: true, configured: true });
    mockGetStats.mockResolvedValue({
      success: true,
      stats: TEST_BREVO_STATS,
    });

    renderWithProviders(<MarketingDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText('Newsletter franchiseurs Q1')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Campagnes récentes').length).toBeGreaterThan(0);
    expect(screen.getByText('Campagnes marketing manuelles (Brevo)')).toBeInTheDocument();
  });

  it('affiche l’écran d’auth Brevo invalide', async () => {
    mockGetStatus.mockResolvedValue({ success: true, configured: true });
    mockGetStats.mockResolvedValue({
      success: true,
      brevoAuthFailed: true,
      stats: TEST_BREVO_STATS,
    });

    renderWithProviders(<MarketingDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText('Clé API Brevo invalide (401)')).toBeInTheDocument();
    });
  });
});
