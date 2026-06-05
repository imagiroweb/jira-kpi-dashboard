const mockAxiosGet = jest.fn();
const mockAxiosCreateGet = jest.fn();
const mockAxiosCreatePost = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      get: mockAxiosCreateGet,
      post: mockAxiosCreatePost
    })),
    get: mockAxiosGet
  }
}));

const mockLoggerWarn = jest.fn();
jest.mock('../../utils/logger', () => ({
  logger: { warn: mockLoggerWarn, info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { BrevoClient } from './BrevoClient';

describe('BrevoClient', () => {
  const initialApiKey = process.env.BREVO_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BREVO_API_KEY = 'test-key';
  });

  afterAll(() => {
    process.env.BREVO_API_KEY = initialApiKey;
  });

  it('isConfigured dépend de BREVO_API_KEY', () => {
    const client = new BrevoClient();
    expect(client.isConfigured()).toBe(true);
    process.env.BREVO_API_KEY = '   ';
    expect(client.isConfigured()).toBe(false);
  });

  it('getAccount retourne null en cas d’erreur API', async () => {
    mockAxiosCreateGet.mockRejectedValue({ response: { status: 401, data: { message: 'Unauthorized' } } });
    const client = new BrevoClient();
    const account = await client.getAccount();
    expect(account).toBeNull();
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it('getContactsCount/getLists retournent valeurs de fallback en erreur', async () => {
    mockAxiosCreateGet.mockRejectedValue(new Error('down'));
    const client = new BrevoClient();
    expect(await client.getContactsCount()).toBe(0);
    expect(await client.getLists()).toEqual([]);
  });

  it('getCampaigns utilise fallback sans statistiques si première réponse vide', async () => {
    mockAxiosCreateGet
      .mockResolvedValueOnce({ data: { campaigns: [] } })
      .mockResolvedValueOnce({ data: { campaigns: [{ id: 1, name: 'C', type: 'classic', status: 'sent' }] } });
    const client = new BrevoClient();
    const campaigns = await client.getCampaigns(10);
    expect(campaigns).toHaveLength(1);
    expect(mockAxiosCreateGet).toHaveBeenCalledTimes(2);
  });

  it('exportCampaignRecipients retourne processId si status 202', async () => {
    mockAxiosCreatePost.mockResolvedValue({ status: 202, data: { processId: 123 } });
    const client = new BrevoClient();
    await expect(client.exportCampaignRecipients(11, 'clickers')).resolves.toBe(123);
  });

  it('downloadExportFile retourne texte brut', async () => {
    mockAxiosGet.mockResolvedValue({ data: 'email\na@test.com' });
    const client = new BrevoClient();
    const csv = await client.downloadExportFile('https://export');
    expect(csv).toContain('a@test.com');
  });

  it('getAccount retourne le compte en cas de succès', async () => {
    mockAxiosCreateGet.mockResolvedValue({
      data: { email: 'admin@brevo.com', plan: [{ type: 'free' }] },
    });
    const client = new BrevoClient();
    await expect(client.getAccount()).resolves.toEqual({
      email: 'admin@brevo.com',
      plan: [{ type: 'free' }],
    });
  });

  it('getContactsCount et getLists retournent les données API', async () => {
    mockAxiosCreateGet
      .mockResolvedValueOnce({ data: { count: 42, contacts: [] } })
      .mockResolvedValueOnce({
        data: {
          lists: [{ id: 1, name: 'Newsletter', totalSubscribers: 10, totalBlacklisted: 0, uniqueSubscribers: 10 }],
          count: 1,
        },
      });
    const client = new BrevoClient();
    await expect(client.getContactsCount()).resolves.toBe(42);
    await expect(client.getLists()).resolves.toEqual([
      { id: 1, name: 'Newsletter', totalSubscribers: 10, totalBlacklisted: 0, uniqueSubscribers: 10 },
    ]);
  });

  it('getManualCampaigns utilise le fallback sans statistiques', async () => {
    mockAxiosCreateGet
      .mockResolvedValueOnce({ data: { campaigns: [] } })
      .mockResolvedValueOnce({ data: { campaigns: [{ id: 2, name: 'Manual', type: 'classic', status: 'sent' }] } });
    const client = new BrevoClient();
    const campaigns = await client.getManualCampaigns(5);
    expect(campaigns).toHaveLength(1);
    expect(mockAxiosCreateGet).toHaveBeenCalledTimes(2);
  });

  it('getTransactionalEvents retourne les événements ou une liste vide', async () => {
    mockAxiosCreateGet
      .mockResolvedValueOnce({ data: { events: [{ email: 'a@test.com', event: 'delivered', messageId: 'm1', date: '2026-01-01' }] } })
      .mockRejectedValueOnce(new Error('down'));
    const client = new BrevoClient();
    await expect(client.getTransactionalEvents({ days: 7, limit: 50 })).resolves.toHaveLength(1);
    await expect(client.getTransactionalEvents()).resolves.toEqual([]);
  });

  it('getProcess retourne le statut ou failed en erreur', async () => {
    mockAxiosCreateGet
      .mockResolvedValueOnce({ data: { status: 'completed', export_url: 'https://export' } })
      .mockRejectedValueOnce(new Error('down'));
    const client = new BrevoClient();
    await expect(client.getProcess(99)).resolves.toEqual({ status: 'completed', export_url: 'https://export' });
    await expect(client.getProcess(99)).resolves.toEqual({ status: 'failed' });
  });

  it('getCampaignRecipientEmails parse le CSV exporté', async () => {
    jest.useFakeTimers();
    mockAxiosCreatePost.mockResolvedValue({ status: 202, data: { processId: 55 } });
    mockAxiosCreateGet.mockResolvedValue({ data: { status: 'completed', export_url: 'https://export.csv' } });
    mockAxiosGet.mockResolvedValue({ data: 'email\nuser@test.com\nuser@test.com' });

    const client = new BrevoClient();
    const promise = client.getCampaignRecipientEmails(10, 'clickers');
    await jest.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toEqual(['user@test.com']);
    jest.useRealTimers();
  });
});
