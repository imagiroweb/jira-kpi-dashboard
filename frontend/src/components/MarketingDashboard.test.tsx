import { fireEvent, screen, waitFor } from '@testing-library/react';
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
const mockGetCampaignRecipients = vi.mocked(brevoApi.getCampaignRecipients);

/** Dates relatives pour rester dans le filtre « 30 derniers jours » du dashboard. */
function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(10, 0, 0, 0);
  return d.toISOString();
}

const TEST_CAMPAIGNS = [
  {
    id: 101,
    name: 'Newsletter franchiseurs Q1',
    subject: 'Actualités franchiseurs',
    type: 'classic',
    status: 'sent',
    sentDate: daysAgoIso(7),
    statistics: { sent: 1200, opened: 480, clicked: 96, delivered: 1180, unsubscribed: 3 },
  },
  {
    id: 102,
    name: 'Campagne produit',
    subject: 'Nouveautés',
    type: 'classic',
    status: 'sent',
    sentDate: daysAgoIso(5),
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

  it('affiche une erreur quand le chargement des stats échoue', async () => {
    mockGetStatus.mockResolvedValue({ success: true, configured: true });
    mockGetStats.mockResolvedValue({
      success: false,
      message: 'Service Brevo indisponible',
    } as Awaited<ReturnType<typeof brevoApi.getStats>> & { message: string });

    renderWithProviders(<MarketingDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText('Service Brevo indisponible')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument();
  });

  it('affiche une erreur réseau en cas d’exception', async () => {
    mockGetStatus.mockRejectedValue(new Error('Network timeout'));

    renderWithProviders(<MarketingDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText('Network timeout')).toBeInTheDocument();
    });
  });

  it('affiche l’état vide sans listes ni campagnes', async () => {
    mockGetStatus.mockResolvedValue({ success: true, configured: true });
    mockGetStats.mockResolvedValue({
      success: true,
      stats: {
        contactsCount: 100,
        listsCount: 0,
        totalSubscribers: 0,
        lists: [],
        recentCampaigns: [],
        manualCampaigns: [],
      },
    });

    renderWithProviders(<MarketingDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText('Aucune liste ou campagne récente.')).toBeInTheDocument();
      expect(screen.getByText('Aucun événement sur la période.')).toBeInTheDocument();
    });
  });

  it('affiche les événements transactionnels et permet de les actualiser', async () => {
    mockGetStatus.mockResolvedValue({ success: true, configured: true });
    mockGetStats.mockResolvedValue({ success: true, stats: TEST_BREVO_STATS });
    const transactionalEvents = [
      {
        date: '2026-06-01T10:00:00.000Z',
        email: 'client@example.com',
        event: 'requests' as const,
        messageId: 'msg-1',
        subject: 'Confirmation commande',
      },
      {
        date: '2026-06-01T10:05:00.000Z',
        email: 'client@example.com',
        event: 'delivered' as const,
        messageId: 'msg-1',
        subject: 'Confirmation commande',
      },
      {
        date: '2026-06-01T10:10:00.000Z',
        email: 'client@example.com',
        event: 'opened' as const,
        messageId: 'msg-1',
        subject: 'Confirmation commande',
      },
    ];
    mockGetTransactionalEvents.mockResolvedValue({ success: true, events: transactionalEvents });

    renderWithProviders(<MarketingDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText('client@example.com')).toBeInTheDocument();
      expect(screen.getByText('Confirmation commande')).toBeInTheDocument();
    });

    mockGetTransactionalEvents.mockClear();
    const refreshButtons = screen.getAllByRole('button', { name: /^Actualiser$/i });
    fireEvent.click(refreshButtons[refreshButtons.length - 1]);

    await waitFor(() => {
      expect(mockGetTransactionalEvents).toHaveBeenCalledWith({ days: 30, limit: 200 });
    });
  });

  it('filtre les campagnes par taux de clic et franchiseurs', async () => {
    mockGetStatus.mockResolvedValue({ success: true, configured: true });
    mockGetStats.mockResolvedValue({
      success: true,
      stats: TEST_BREVO_STATS,
    });

    renderWithProviders(<MarketingDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText('Newsletter franchiseurs Q1')).toBeInTheDocument();
      expect(screen.getByText('Campagne produit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Taux de clic > 0 %/i }));

    await waitFor(() => {
      expect(screen.getByText('Newsletter franchiseurs Q1')).toBeInTheDocument();
      expect(screen.queryByText('Campagne produit')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Franchiseurs$/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Newsletter franchiseurs Q1').length).toBeGreaterThan(0);
      expect(screen.queryByText('Campagne produit')).not.toBeInTheDocument();
    });
  });

  it('ouvre la modale détail clics et charge les emails destinataires', async () => {
    mockGetStatus.mockResolvedValue({ success: true, configured: true });
    mockGetStats.mockResolvedValue({
      success: true,
      stats: TEST_BREVO_STATS,
    });
    mockGetCampaignRecipients.mockResolvedValue({
      success: true,
      emails: ['cliqueur@example.com'],
    });

    renderWithProviders(<MarketingDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText('Newsletter franchiseurs Q1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Taux de clics/i }));

    await waitFor(() => {
      expect(screen.getByText('Emails ayant cliqué')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Voir la liste des emails/i }));

    await waitFor(() => {
      expect(mockGetCampaignRecipients).toHaveBeenCalledWith(101, 'clickers');
      expect(screen.getByText('cliqueur@example.com')).toBeInTheDocument();
    });
  });

  it('permet d’étendre une carte campagne pour voir les indicateurs', async () => {
    mockGetStatus.mockResolvedValue({ success: true, configured: true });
    mockGetStats.mockResolvedValue({
      success: true,
      stats: TEST_BREVO_STATS,
    });

    renderWithProviders(<MarketingDashboard />, { user: TEST_USER });

    await waitFor(() => {
      expect(screen.getByText('Newsletter franchiseurs Q1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Newsletter franchiseurs Q1/i }));

    await waitFor(() => {
      expect(screen.getByText('Indicateurs au clic')).toBeInTheDocument();
    });
  });
});
