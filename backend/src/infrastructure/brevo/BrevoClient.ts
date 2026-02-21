import axios, { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger';

const BREVO_BASE_URL = 'https://api.brevo.com/v3';

export interface BrevoAccount {
  email: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  plan: Array<{
    type: string;
    credits?: number;
    creditsType?: string;
  }>;
}

export interface BrevoContactList {
  id: number;
  name: string;
  totalSubscribers: number;
  totalBlacklisted: number;
  uniqueSubscribers: number;
}

export interface BrevoContactsResponse {
  contacts: Array<Record<string, unknown>>;
  count: number;
}

export interface BrevoListsResponse {
  lists: BrevoContactList[];
  count: number;
}

export interface BrevoEmailCampaign {
  id: number;
  name: string;
  subject?: string;
  type: string;
  status: string;
  scheduledAt?: string;
  sentDate?: string;
  statistics?: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    unsubscribed: number;
    hardBounces: number;
    softBounces: number;
  };
}

export interface BrevoCampaignsResponse {
  campaigns: BrevoEmailCampaign[];
  count: number;
}

/** Event types for transactional email activity (GET /smtp/statistics/events) */
export type BrevoTransactionalEventType =
  | 'requests'
  | 'delivered'
  | 'hardBounces'
  | 'softBounces'
  | 'bounces'
  | 'opened'
  | 'clicks'
  | 'spam'
  | 'invalid'
  | 'deferred'
  | 'blocked'
  | 'unsubscribed'
  | 'error'
  | 'loadedByProxy';

export interface BrevoTransactionalEvent {
  date: string;
  email: string;
  event: BrevoTransactionalEventType;
  messageId: string;
  subject?: string;
  tag?: string;
  templateId?: number;
  from?: string;
  ip?: string;
  link?: string;
  reason?: string;
}

export interface BrevoTransactionalEventsResponse {
  events: BrevoTransactionalEvent[];
}

/**
 * Client for Brevo (ex-Sendinblue) API v3.
 * Requires BREVO_API_KEY in environment.
 */
export class BrevoClient {
  private readonly client: AxiosInstance;

  constructor(apiKey?: string) {
    const raw = apiKey || process.env.BREVO_API_KEY;
    const key = typeof raw === 'string' ? raw.trim() : '';
    if (!key) {
      logger.warn('BrevoClient: BREVO_API_KEY not set or empty');
    }
    this.client = axios.create({
      baseURL: BREVO_BASE_URL,
      headers: {
        'api-key': key,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
  }

  isConfigured(): boolean {
    return Boolean(process.env.BREVO_API_KEY?.trim());
  }

  /**
   * GET /account - Account details and plan
   */
  async getAccount(): Promise<BrevoAccount | null> {
    try {
      const { data } = await this.client.get<BrevoAccount>('/account');
      return data;
    } catch (err: unknown) {
      const res = (err as { response?: { status: number; data?: unknown } })?.response;
      const status = res?.status;
      const body = res?.data;
      const msg = typeof body === 'object' && body !== null && 'message' in body
        ? (body as { message?: string }).message
        : typeof body === 'object' && body !== null && 'error' in body
          ? JSON.stringify((body as { error?: unknown }).error)
          : String(body ?? err);
      logger.warn(`Brevo getAccount failed: ${status} - ${msg}`);
      return null;
    }
  }

  /**
   * GET /contacts?limit=1 - Returns total count of contacts
   */
  async getContactsCount(): Promise<number> {
    try {
      const { data } = await this.client.get<BrevoContactsResponse>('/contacts', {
        params: { limit: 1, offset: 0 }
      });
      return data?.count ?? 0;
    } catch (err: unknown) {
      logBrevoError('getContactsCount', err);
      return 0;
    }
  }

  /**
   * GET /contacts/lists - All lists with totalSubscribers
   */
  async getLists(): Promise<BrevoContactList[]> {
    try {
      const { data } = await this.client.get<BrevoListsResponse>('/contacts/lists', {
        params: { limit: 100, offset: 0 }
      });
      return data?.lists ?? [];
    } catch (err: unknown) {
      logBrevoError('getLists', err);
      return [];
    }
  }

  /**
   * GET /emailCampaigns - Campaigns with optional stats (last 6 months).
   * Tries with statistics=globalStats first; if empty or error, falls back to without stats.
   */
  async getCampaigns(limit = 20): Promise<BrevoEmailCampaign[]> {
    try {
      const { data } = await this.client.get<{ campaigns: BrevoEmailCampaign[] }>('/emailCampaigns', {
        params: { limit, offset: 0, sort: 'desc', statistics: 'globalStats' }
      });
      const campaigns = data?.campaigns ?? [];
      if (campaigns.length > 0) return campaigns;
      const fallback = await this.client.get<{ campaigns: BrevoEmailCampaign[] }>('/emailCampaigns', {
        params: { limit, offset: 0, sort: 'desc' }
      });
      return fallback?.data?.campaigns ?? [];
    } catch (err: unknown) {
      logBrevoError('getCampaigns', err);
      try {
        const { data } = await this.client.get<{ campaigns: BrevoEmailCampaign[] }>('/emailCampaigns', {
          params: { limit, offset: 0, sort: 'desc' }
        });
        return data?.campaigns ?? [];
      } catch {
        return [];
      }
    }
  }

  /**
   * GET /emailCampaigns?type=classic - Manual (classic) email campaigns only.
   * Tries with statistics=globalStats first; if empty or error, falls back to without stats.
   */
  async getManualCampaigns(limit = 50): Promise<BrevoEmailCampaign[]> {
    try {
      const { data } = await this.client.get<{ campaigns: BrevoEmailCampaign[] }>('/emailCampaigns', {
        params: { limit, offset: 0, sort: 'desc', type: 'classic', statistics: 'globalStats' }
      });
      const campaigns = data?.campaigns ?? [];
      if (campaigns.length > 0) return campaigns;
      const fallback = await this.client.get<{ campaigns: BrevoEmailCampaign[] }>('/emailCampaigns', {
        params: { limit, offset: 0, sort: 'desc', type: 'classic' }
      });
      return fallback?.data?.campaigns ?? [];
    } catch (err: unknown) {
      logBrevoError('getManualCampaigns', err);
      try {
        const { data } = await this.client.get<{ campaigns: BrevoEmailCampaign[] }>('/emailCampaigns', {
          params: { limit, offset: 0, sort: 'desc', type: 'classic' }
        });
        return data?.campaigns ?? [];
      } catch {
        return [];
      }
    }
  }

  /**
   * POST /emailCampaigns/{campaignId}/exportRecipients - Start export of recipients by type.
   * Returns processId (202). Use getProcess() to poll and get export_url when completed.
   */
  async exportCampaignRecipients(
    campaignId: number,
    recipientsType: 'clickers' | 'unsubscribed' | 'openers'
  ): Promise<number | null> {
    try {
      const { data, status } = await this.client.post<{ processId: number }>(
        `/emailCampaigns/${campaignId}/exportRecipients`,
        { recipientsType }
      );
      if (status === 202 && data?.processId) return data.processId;
      return null;
    } catch (err: unknown) {
      logBrevoError('exportCampaignRecipients', err);
      return null;
    }
  }

  /**
   * GET /processes/{processId} - Get process status and export_url when completed.
   */
  async getProcess(processId: number): Promise<{ status: string; export_url?: string | null }> {
    try {
      const { data } = await this.client.get<{ status: string; export_url?: string | null }>(
        `/processes/${processId}`
      );
      return { status: data?.status ?? 'unknown', export_url: data?.export_url };
    } catch (err: unknown) {
      logBrevoError('getProcess', err);
      return { status: 'failed' };
    }
  }

  /**
   * Download export file (CSV) from Brevo. Uses same API key.
   */
  async downloadExportFile(exportUrl: string): Promise<string> {
    const key = process.env.BREVO_API_KEY?.trim() ?? '';
    const { data } = await axios.get<string>(exportUrl, {
      headers: { 'api-key': key },
      timeout: 30000,
      responseType: 'text'
    });
    return typeof data === 'string' ? data : '';
  }

  /**
   * Export campaign recipients (clickers or unsubscribed), poll until completed, download CSV and parse emails.
   * Polls every 2s, max 60s.
   */
  async getCampaignRecipientEmails(
    campaignId: number,
    recipientsType: 'clickers' | 'unsubscribed'
  ): Promise<string[]> {
    const processId = await this.exportCampaignRecipients(campaignId, recipientsType);
    if (processId == null) return [];
    const maxAttempts = 30;
    const pollMs = 2000;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, pollMs));
      const { status, export_url } = await this.getProcess(processId);
      if (status === 'completed' && export_url) {
        const csv = await this.downloadExportFile(export_url);
        return parseEmailsFromCsv(csv);
      }
      if (status === 'failed' || status === 'cancelled') return [];
    }
    logger.warn(`Brevo getCampaignRecipientEmails: process ${processId} did not complete in time`);
    return [];
  }

  /**
   * GET /smtp/statistics/events - Transactional email activity (unaggregated events).
   * Default: last 30 days. Max range: 90 days. No mandatory filter.
   */
  async getTransactionalEvents(options?: {
    days?: number;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
    event?: BrevoTransactionalEventType;
    sort?: 'asc' | 'desc';
  }): Promise<BrevoTransactionalEvent[]> {
    try {
      const params: Record<string, unknown> = {
        limit: options?.limit ?? 500,
        offset: options?.offset ?? 0,
        sort: options?.sort ?? 'desc'
      };
      if (options?.days != null) {
        params.days = options.days;
      } else if (options?.startDate && options?.endDate) {
        params.startDate = options.startDate;
        params.endDate = options.endDate;
      }
      if (options?.event) params.event = options.event;
      const { data } = await this.client.get<BrevoTransactionalEventsResponse>('/smtp/statistics/events', {
        params
      });
      return data?.events ?? [];
    } catch (err: unknown) {
      logBrevoError('getTransactionalEvents', err);
      return [];
    }
  }
}

/** Parse CSV content and return list of email addresses (from column "email" or first column). */
function parseEmailsFromCsv(csvContent: string): string[] {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase();
  const sep = header.includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  const emailIdx = headers.findIndex((h) => h === 'email' || h === 'EMAIL' || h === 'e-mail');
  const colIdx = emailIdx >= 0 ? emailIdx : 0;
  const emails: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep).map((c) => c.trim());
    const val = cells[colIdx];
    if (val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) emails.push(val);
  }
  return [...new Set(emails)];
}

function logBrevoError(method: string, err: unknown): void {
  const res = (err as { response?: { status: number; data?: unknown } })?.response;
  const status = res?.status;
  const body = res?.data;
  const msg = typeof body === 'object' && body !== null && 'message' in body
    ? (body as { message?: string }).message
    : typeof body === 'object' && body !== null && 'error' in body
      ? JSON.stringify((body as { error?: unknown }).error)
      : body != null
        ? JSON.stringify(body)
        : String(err);
  logger.warn(`Brevo ${method} failed: ${status} - ${msg}`);
}

let brevoClientInstance: BrevoClient | null = null;

export function getBrevoClient(): BrevoClient {
  if (!brevoClientInstance) {
    brevoClientInstance = new BrevoClient();
  }
  return brevoClientInstance;
}
