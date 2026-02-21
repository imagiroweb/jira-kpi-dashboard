import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Megaphone,
  Users,
  List,
  Mail,
  TrendingUp,
  Loader2,
  AlertCircle,
  RefreshCw,
  Send,
  CheckCircle,
  MousePointer,
  Edit3,
  ChevronDown,
  ChevronUp,
  UserX,
  Filter,
  FileText,
  X
} from 'lucide-react';
import { brevoApi, BrevoStats, BrevoCampaign, BrevoTransactionalEvent } from '../services/api';
import { DateRangePicker } from './DateRangePicker';

const TRANSACTIONAL_EVENT_LABELS: Record<string, string> = {
  requests: 'Envoyé',
  delivered: 'Livré',
  opened: 'Ouvert',
  clicks: 'Clic',
  hardBounces: 'Rebond hard',
  softBounces: 'Rebond soft',
  bounces: 'Rebond',
  spam: 'Spam',
  invalid: 'Invalide',
  deferred: 'Différé',
  blocked: 'Bloqué',
  unsubscribed: 'Désabonnement',
  error: 'Erreur',
  loadedByProxy: 'Proxy'
};

/** Niveau de satisfaction : 0 Envoyé, 1 Livré, 2 Ouvert, 3 Clic ; -1 = négatif (bounces, erreurs, etc.) */
const TRANSACTIONAL_EVENT_SATISFACTION: Record<string, number> = {
  requests: 0,
  delivered: 1,
  opened: 2,
  clicks: 3,
  hardBounces: -1,
  softBounces: -1,
  bounces: -1,
  spam: -1,
  invalid: -1,
  deferred: -1,
  blocked: -1,
  unsubscribed: -1,
  error: -1,
  loadedByProxy: -1
};

const EVENT_BADGE_CLASSES: Record<number, string> = {
  0: 'bg-surface-600/80 text-surface-300',           // Envoyé
  1: 'bg-blue-500/25 text-blue-400',                // Livré
  2: 'bg-teal-500/25 text-teal-400',                // Ouvert
  3: 'bg-green-500/25 text-green-400',              // Clic
  [-1]: 'bg-red-500/20 text-red-400/90'             // Négatif
};

function getTransactionalEventBadgeClass(event: string): string {
  const level = TRANSACTIONAL_EVENT_SATISFACTION[event] ?? -1;
  return `px-1.5 py-0.5 rounded text-xs font-medium ${EVENT_BADGE_CLASSES[level] ?? EVENT_BADGE_CLASSES[-1]}`;
}

function getTransactionalGlobalStats(events: BrevoTransactionalEvent[] | null): {
  sent: number;
  uniqueRecipients: number;
  deliveryRate: number | null;
  openRate: number | null;
  clickRate: number | null;
} {
  if (!events?.length) return { sent: 0, uniqueRecipients: 0, deliveryRate: null, openRate: null, clickRate: null };
  const requestEvents = events.filter((e) => e.event === 'requests');
  const sent = requestEvents.length;
  const uniqueRecipients = new Set(requestEvents.map((e) => e.email)).size;
  const delivered = events.filter((e) => e.event === 'delivered').length;
  const opened = events.filter((e) => e.event === 'opened').length;
  const clicked = events.filter((e) => e.event === 'clicks').length;
  return {
    sent,
    uniqueRecipients,
    deliveryRate: sent > 0 ? (delivered / sent) * 100 : null,
    openRate: sent > 0 ? (opened / sent) * 100 : null,
    clickRate: sent > 0 ? (clicked / sent) * 100 : null
  };
}

/** Une ligne = un mail envoyé (messageId), avec les dates de chaque étape pour tooltip */
interface TransactionalEmailRow {
  messageId: string;
  email: string;
  subject: string;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
}

function groupTransactionalEventsByEmail(events: BrevoTransactionalEvent[]): TransactionalEmailRow[] {
  const byMessageId = new Map<string, BrevoTransactionalEvent[]>();
  for (const evt of events) {
    const list = byMessageId.get(evt.messageId) ?? [];
    list.push(evt);
    byMessageId.set(evt.messageId, list);
  }
  const rows: TransactionalEmailRow[] = [];
  for (const [messageId, evts] of byMessageId) {
    const sent = evts.find((e) => e.event === 'requests');
    if (!sent) continue; // on n'affiche que les mails effectivement envoyés
    const delivered = evts.find((e) => e.event === 'delivered');
    const opened = evts.find((e) => e.event === 'opened');
    const clicked = evts.find((e) => e.event === 'clicks');
    rows.push({
      messageId,
      email: sent.email,
      subject: sent.subject ?? '',
      sentAt: sent.date ?? null,
      deliveredAt: delivered?.date ?? null,
      openedAt: opened?.date ?? null,
      clickedAt: clicked?.date ?? null
    });
  }
  rows.sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''));
  return rows;
}

function campaignRates(sent?: number, opened?: number, clicked?: number, unsubscribed?: number) {
  if (sent == null || sent === 0) return { openRate: null, clickRate: null, unsubscribeRate: null };
  return {
    openRate: opened != null ? (opened / sent) * 100 : null,
    clickRate: clicked != null ? (clicked / sent) * 100 : null,
    unsubscribeRate: unsubscribed != null ? (unsubscribed / sent) * 100 : null
  };
}

function hasPositiveClickRate(campaign: BrevoCampaign): boolean {
  const s = campaign.statistics;
  const sent = s?.sent ?? 0;
  if (sent === 0) return false;
  const clicked = s?.clicked;
  if (clicked == null) return false;
  return (clicked / sent) * 100 > 0;
}

function isFranchiseursCampaign(campaign: BrevoCampaign): boolean {
  return campaign.name.toLowerCase().includes('franchiseurs');
}

function filterCampaigns(
  campaigns: BrevoCampaign[],
  onlyPositiveClick: boolean,
  onlyFranchiseurs: boolean
): BrevoCampaign[] {
  if (!onlyPositiveClick && !onlyFranchiseurs) return campaigns;
  return campaigns.filter((c) => {
    if (onlyPositiveClick && !hasPositiveClickRate(c)) return false;
    if (onlyFranchiseurs && !isFranchiseursCampaign(c)) return false;
    return true;
  });
}

function campaignsInDateRange(campaigns: BrevoCampaign[], from: string, to: string): BrevoCampaign[] {
  const fromTime = new Date(from).setHours(0, 0, 0, 0);
  const toTime = new Date(to).setHours(23, 59, 59, 999);
  return campaigns.filter((c) => {
    const sent = c.sentDate ? new Date(c.sentDate).getTime() : null;
    if (sent == null) return false;
    return sent >= fromTime && sent <= toTime;
  });
}

function aggregateCampaignStats(campaigns: BrevoCampaign[]): {
  sent: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  openRate: number | null;
  clickRate: number | null;
  unsubscribeRate: number | null;
} {
  let sent = 0;
  let opened = 0;
  let clicked = 0;
  let unsubscribed = 0;
  for (const c of campaigns) {
    const s = c.statistics;
    sent += s?.sent ?? 0;
    opened += s?.opened ?? 0;
    clicked += s?.clicked ?? 0;
    unsubscribed += s?.unsubscribed ?? 0;
  }
  return {
    sent,
    opened,
    clicked,
    unsubscribed,
    openRate: sent > 0 ? (opened / sent) * 100 : null,
    clickRate: sent > 0 ? (clicked / sent) * 100 : null,
    unsubscribeRate: sent > 0 ? (unsubscribed / sent) * 100 : null,
  };
}

function getCampaignDateRangeLast30Days(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

function CampaignCard({
  campaign,
  isExpanded,
  onToggle
}: {
  campaign: BrevoCampaign;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const s = campaign.statistics;
  const sent = s?.sent ?? 0;
  const rates = campaignRates(s?.sent, s?.opened, s?.clicked, s?.unsubscribed);
  const hasClickRate = rates.clickRate != null && rates.clickRate > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle()}
      className={`p-4 rounded-xl border transition-colors cursor-pointer ${
        hasClickRate
          ? 'bg-green-500/5 border-l-4 border-l-green-500 border-surface-600/50 hover:border-green-500/50'
          : 'bg-surface-800/50 border border-surface-700/50 hover:border-surface-600'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div>
            <div className="font-medium text-surface-100 flex items-center gap-2">
              {campaign.name}
              {hasClickRate && rates.clickRate != null && (
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
                  Taux de clic {rates.clickRate.toFixed(1)} %
                </span>
              )}
            </div>
            {campaign.subject && (
              <div className="text-sm text-surface-500 mt-0.5">{campaign.subject}</div>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-surface-400 shrink-0" />
          ) : (
            <ChevronDown className="w-5 h-5 text-surface-400 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 rounded-md text-xs font-medium ${
              campaign.status === 'sent'
                ? 'bg-green-500/20 text-green-400'
                : campaign.status === 'draft'
                  ? 'bg-surface-600 text-surface-400'
                  : 'bg-amber-500/20 text-amber-400'
            }`}
          >
            {campaign.status}
          </span>
          {campaign.sentDate && (
            <span className="text-xs text-surface-500">
              {new Date(campaign.sentDate).toLocaleDateString('fr-FR')}
            </span>
          )}
        </div>
      </div>
      {s && (
        <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-surface-700/50 text-sm">
          {s.sent != null && (
            <span className="flex items-center gap-1.5 text-surface-400">
              <Send className="w-3.5 h-3.5" />
              {s.sent.toLocaleString()} envoyés
            </span>
          )}
          {s.opened != null && (
            <span className="flex items-center gap-1.5 text-surface-400">
              <Mail className="w-3.5 h-3.5" />
              {s.opened.toLocaleString()} ouverts
            </span>
          )}
          {s.clicked != null && (
            <span className="flex items-center gap-1.5 text-surface-400">
              <MousePointer className="w-3.5 h-3.5" />
              {s.clicked.toLocaleString()} clics
            </span>
          )}
          {s.delivered != null && (
            <span className="flex items-center gap-1.5 text-green-400/80">
              <CheckCircle className="w-3.5 h-3.5" />
              {s.delivered.toLocaleString()} livrés
            </span>
          )}
        </div>
      )}
      {isExpanded && s && (
        <div className="mt-4 pt-4 border-t border-surface-600/50">
          <div className="text-xs font-medium text-surface-500 uppercase tracking-wide mb-3">Indicateurs au clic</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-surface-500 mb-0.5">Destinataires</div>
              <div className="text-lg font-semibold text-surface-100">{sent.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-surface-500 mb-0.5">Taux d&apos;ouverture</div>
              <div className="text-lg font-semibold text-surface-100">
                {rates.openRate != null ? `${rates.openRate.toFixed(1)} %` : '–'}
              </div>
            </div>
            <div>
              <div className="text-xs text-surface-500 mb-0.5">Taux de clic</div>
              <div className="text-lg font-semibold text-surface-100">
                {rates.clickRate != null ? `${rates.clickRate.toFixed(1)} %` : '–'}
              </div>
            </div>
            <div>
              <div className="text-xs text-surface-500 mb-0.5">Taux de désabonnement</div>
              <div className="text-lg font-semibold text-surface-100 flex items-center gap-1">
                {rates.unsubscribeRate != null ? `${rates.unsubscribeRate.toFixed(1)} %` : '–'}
                {rates.unsubscribeRate != null && (
                  <UserX className="w-4 h-4 text-surface-500" aria-hidden />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MarketingDashboard() {
  const [stats, setStats] = useState<BrevoStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [brevoAuthFailed, setBrevoAuthFailed] = useState(false);
  const [expandedCampaignId, setExpandedCampaignId] = useState<number | null>(null);
  const [filterPositiveClickOnly, setFilterPositiveClickOnly] = useState(false);
  const [filterFranchiseursOnly, setFilterFranchiseursOnly] = useState(false);
  const [campaignDateRange, setCampaignDateRange] = useState<{ from: string; to: string }>(() => getCampaignDateRangeLast30Days());
  const [transactionalEvents, setTransactionalEvents] = useState<BrevoTransactionalEvent[] | null>(null);
  const [transactionalLoading, setTransactionalLoading] = useState(false);
  const [detailModal, setDetailModal] = useState<'clics' | 'unsub' | null>(null);
  const [loadingRecipients, setLoadingRecipients] = useState<{ campaignId: number; type: 'clickers' | 'unsubscribed' } | null>(null);
  const [loadedEmails, setLoadedEmails] = useState<Record<string, string[]>>({});
  const stickyBarRef = useRef<HTMLDivElement>(null);

  const loadCampaignEmails = useCallback(async (campaignId: number, type: 'clickers' | 'unsubscribed') => {
    setLoadingRecipients({ campaignId, type });
    try {
      const res = await brevoApi.getCampaignRecipients(campaignId, type);
      if (res.success && res.emails) {
        setLoadedEmails((prev) => ({ ...prev, [`${campaignId}-${type}`]: res.emails ?? [] }));
      }
    } finally {
      setLoadingRecipients(null);
    }
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setBrevoAuthFailed(false);
    try {
      const [statusRes, statsRes] = await Promise.all([
        brevoApi.getStatus(),
        brevoApi.getStats()
      ]);
      if (!statusRes.success || !statusRes.configured) {
        setConfigured(false);
        setStats(null);
        return;
      }
      setConfigured(true);
      if (statsRes.brevoAuthFailed) {
        setBrevoAuthFailed(true);
        setStats(statsRes.stats ?? null);
        return;
      }
      if (statsRes.success && statsRes.stats) {
        setStats(statsRes.stats);
      } else {
        setError((statsRes as { message?: string }).message || 'Erreur chargement Brevo');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau');
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadTransactionalEvents = useCallback(async () => {
    setTransactionalLoading(true);
    try {
      const res = await brevoApi.getTransactionalEvents({ days: 30, limit: 200 });
      if (res.success && res.events) setTransactionalEvents(res.events);
      else setTransactionalEvents([]);
    } catch {
      setTransactionalEvents([]);
    } finally {
      setTransactionalLoading(false);
    }
  }, []);

  useEffect(() => {
    if (stats && configured && !brevoAuthFailed) loadTransactionalEvents();
    else setTransactionalEvents(null);
  }, [stats, configured, brevoAuthFailed, loadTransactionalEvents]);

  useEffect(() => {
    const el = stickyBarRef.current;
    if (!el) return;
    const setScrollMargin = () => {
      const h = el.offsetHeight;
      document.documentElement.style.setProperty('--marketing-sticky-height', `${h}px`);
    };
    setScrollMargin();
    const ro = new ResizeObserver(setScrollMargin);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stats]);

  if (isLoading && !stats) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-12 h-12 text-primary-400 animate-spin mb-4" />
        <p className="text-surface-400">Chargement des données Brevo...</p>
      </div>
    );
  }

  if (configured === false) {
    return (
      <div className="p-8">
        <div className="card-glass p-8 max-w-xl mx-auto text-center">
          <div className="p-4 bg-amber-500/20 rounded-2xl inline-flex mb-4">
            <AlertCircle className="w-12 h-12 text-amber-400" />
          </div>
          <h2 className="text-xl font-semibold text-surface-100 mb-2">Brevo non configuré</h2>
          <p className="text-surface-400 text-sm mb-4">
            Ajoutez <code className="px-1.5 py-0.5 rounded bg-surface-800 text-primary-300">BREVO_API_KEY</code> dans
            le fichier <code className="px-1.5 py-0.5 rounded bg-surface-800 text-surface-400">.env</code> du backend
            pour afficher les données marketing.
          </p>
          <p className="text-xs text-surface-500">
            Clé API : Paramètres → SMTP &amp; API → Clés API (Brevo)
          </p>
        </div>
      </div>
    );
  }

  if (brevoAuthFailed) {
    return (
      <div className="p-8">
        <div className="card-glass p-8 max-w-xl mx-auto text-center">
          <div className="p-4 bg-amber-500/20 rounded-2xl inline-flex mb-4">
            <AlertCircle className="w-12 h-12 text-amber-400" />
          </div>
          <h2 className="text-xl font-semibold text-surface-100 mb-2">Clé API Brevo invalide (401)</h2>
          <p className="text-surface-400 text-sm mb-4">
            Le service renvoie 0 car Brevo refuse les requêtes (erreur d&apos;authentification). Vérifiez la clé dans
            le <code className="px-1.5 py-0.5 rounded bg-surface-800 text-surface-400">.env</code> du backend (
            <code className="px-1.5 py-0.5 rounded bg-surface-800 text-primary-300">BREVO_API_KEY</code>).
          </p>
          <ul className="text-sm text-surface-500 text-left max-w-md mx-auto mb-4 list-disc list-inside">
            <li>Brevo → Paramètres → SMTP &amp; API → Clés API : recopiez ou régénérez la clé</li>
            <li>Redémarrez le backend après modification du .env</li>
            <li>Consultez les logs backend pour le message exact renvoyé par Brevo</li>
          </ul>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="p-8">
        <div className="card-glass p-8 max-w-xl mx-auto text-center">
          <AlertCircle className="w-12 h-12 text-danger-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-surface-100 mb-2">Erreur</h2>
          <p className="text-surface-400 text-sm mb-4">{error}</p>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* En-tête + KPI fixés en haut au scroll (hauteur utilisée pour scroll-margin des ancres) */}
      <div ref={stickyBarRef} className="sticky top-0 z-10 -mx-8 px-8 pt-8 pb-4 bg-surface-950/95 backdrop-blur-sm border-b border-surface-800/80 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary-500/20 rounded-lg">
              <Megaphone className="w-6 h-6 text-primary-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-surface-100">Marketing</h1>
              <p className="text-surface-500 text-xs">Données Brevo (contacts, listes, campagnes)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-surface-800 border border-surface-600 text-surface-300 hover:bg-surface-700 hover:text-surface-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>

        {stats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <div className="card-glass p-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <Users className="w-4 h-4 text-primary-400 shrink-0" />
                  <span className="text-xs font-medium text-surface-500 truncate">Contacts</span>
                </div>
                <div className="text-lg font-bold text-surface-100 tabular-nums">{stats.contactsCount.toLocaleString()}</div>
              </div>
              <div className="card-glass p-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <List className="w-4 h-4 text-accent-400 shrink-0" />
                  <span className="text-xs font-medium text-surface-500 truncate">Listes</span>
                </div>
                <div className="text-lg font-bold text-surface-100 tabular-nums">{stats.listsCount}</div>
              </div>
              <div className="card-glass p-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <Mail className="w-4 h-4 text-green-400 shrink-0" />
                  <span className="text-xs font-medium text-surface-500 truncate">Abonnés</span>
                </div>
                <div className="text-lg font-bold text-surface-100 tabular-nums">{stats.totalSubscribers.toLocaleString()}</div>
              </div>
              <a
                href="#campagnes-recentes"
                className="card-glass p-3 block no-underline text-inherit hover:border-amber-500/30 transition-colors"
                title="Aller à la liste Campagnes récentes"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <Send className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-medium text-surface-500 truncate">Campagnes récentes</span>
                </div>
                <div className="text-lg font-bold text-surface-100 tabular-nums">{stats.recentCampaigns?.length ?? 0}</div>
              </a>
              <a
                href="#campagnes-manuelles"
                className="card-glass p-3 block no-underline text-inherit hover:border-primary-500/30 transition-colors"
                title="Aller à la liste Campagnes manuelles"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <Edit3 className="w-4 h-4 text-primary-400 shrink-0" />
                  <span className="text-xs font-medium text-surface-500 truncate">Campagnes manuelles</span>
                </div>
                <div className="text-lg font-bold text-surface-100 tabular-nums">{stats.manualCampaigns?.length ?? 0}</div>
              </a>
              <a
                href="#logs-transactionnels"
                className="card-glass p-3 block no-underline text-inherit hover:border-accent-500/30 transition-colors"
                title="Aller aux logs des emails transactionnels"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <FileText className="w-4 h-4 text-accent-400 shrink-0" />
                  <span className="text-xs font-medium text-surface-500 truncate">Logs transactionnels</span>
                </div>
                <div className="text-lg font-bold text-surface-100 tabular-nums">
                  {transactionalEvents !== null ? transactionalEvents.length : '–'}
                </div>
              </a>
            </div>

            {/* Période campagnes + résultats sur la période */}
            {(() => {
              const allCampaigns = [...(stats.recentCampaigns ?? []), ...(stats.manualCampaigns ?? [])];
              const inRange = campaignsInDateRange(allCampaigns, campaignDateRange.from, campaignDateRange.to);
              const agg = aggregateCampaignStats(inRange);
              return (
                <div className="mt-4 pt-4 border-t border-surface-700/50">
                  <div className="flex flex-wrap items-center gap-4 mb-3">
                    <span className="text-sm font-medium text-surface-400">Campagnes email sur la période :</span>
                    <DateRangePicker value={campaignDateRange} onChange={setCampaignDateRange} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <div className="card-glass p-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Send className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-xs font-medium text-surface-500 truncate">Emails envoyés</span>
                      </div>
                      <div className="text-lg font-bold text-surface-100 tabular-nums">{agg.sent.toLocaleString()}</div>
                    </div>
                    <div className="card-glass p-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Mail className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="text-xs font-medium text-surface-500 truncate">Taux d&apos;ouverture</span>
                      </div>
                      <div className="text-lg font-bold text-surface-100 tabular-nums">
                        {agg.openRate != null ? `${agg.openRate.toFixed(1)} %` : '–'}
                      </div>
                    </div>
                    <div className="card-glass p-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Users className="w-4 h-4 text-primary-400 shrink-0" />
                        <span className="text-xs font-medium text-surface-500 truncate">Destinataires</span>
                      </div>
                      <div className="text-lg font-bold text-surface-100 tabular-nums">{agg.sent.toLocaleString()}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailModal('clics')}
                      className="card-glass p-3 text-left w-full cursor-pointer hover:border-green-500/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <MousePointer className="w-4 h-4 text-green-400 shrink-0" />
                        <span className="text-xs font-medium text-surface-500 truncate">Taux de clics</span>
                      </div>
                      <div className="text-lg font-bold text-surface-100 tabular-nums">
                        {agg.clickRate != null ? `${agg.clickRate.toFixed(1)} %` : '–'}
                      </div>
                      <span className="text-[10px] text-surface-500 mt-0.5 block">Cliquer pour le détail</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailModal('unsub')}
                      className="card-glass p-3 text-left w-full cursor-pointer hover:border-surface-500/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <UserX className="w-4 h-4 text-surface-400 shrink-0" />
                        <span className="text-xs font-medium text-surface-500 truncate">Désinscriptions</span>
                      </div>
                      <div className="text-lg font-bold text-surface-100 tabular-nums">{agg.unsubscribed.toLocaleString()}</div>
                      {agg.unsubscribeRate != null && agg.sent > 0 && (
                        <div className="text-[10px] text-surface-500 mt-0.5">{agg.unsubscribeRate.toFixed(2)} %</div>
                      )}
                      <span className="text-[10px] text-surface-500 mt-0.5 block">Cliquer pour le détail</span>
                    </button>
                  </div>
                  <p className="text-xs text-surface-500 mt-1">
                    {inRange.length} campagne(s) envoyée(s) entre le {new Date(campaignDateRange.from).toLocaleDateString('fr-FR')} et le {new Date(campaignDateRange.to).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              );
            })()}
          </>
        )}

        {/* Filtres campagnes (dans le sticky) */}
        {stats && (stats.manualCampaigns?.length ?? 0) + (stats.recentCampaigns?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-surface-700/50">
            <button
              type="button"
              onClick={() => setFilterPositiveClickOnly((v) => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-left ${
                filterPositiveClickOnly
                  ? 'bg-green-500/10 border-green-500/50 text-green-400'
                  : 'bg-surface-800/50 border-surface-700/50 text-surface-400 hover:border-surface-600'
              }`}
              title="Afficher uniquement les campagnes avec un taux de clic &gt; 0 %"
            >
              <Filter className="w-4 h-4 shrink-0" />
              <span className="text-xs font-medium">Taux de clic &gt; 0 %</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterFranchiseursOnly((v) => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-left ${
                filterFranchiseursOnly
                  ? 'bg-primary-500/10 border-primary-500/50 text-primary-400'
                  : 'bg-surface-800/50 border-surface-700/50 text-surface-400 hover:border-surface-600'
              }`}
              title="Afficher uniquement les campagnes dont le titre contient « franchiseurs »"
            >
              <Filter className="w-4 h-4 shrink-0" />
              <span className="text-xs font-medium">Franchiseurs</span>
            </button>
          </div>
        )}
      </div>

      {stats && (
        <>

          {/* Lists */}
          {stats.lists && stats.lists.length > 0 && (
            <div className="card-glass p-6 mb-8">
              <h2 className="text-lg font-semibold text-surface-100 mb-4 flex items-center gap-2">
                <List className="w-5 h-5 text-accent-400" />
                Listes de contacts
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-surface-500 border-b border-surface-700">
                      <th className="pb-3 pr-4 font-medium">Nom</th>
                      <th className="pb-3 pr-4 font-medium text-right">Abonnés</th>
                      <th className="pb-3 pr-4 font-medium text-right">Uniques</th>
                      <th className="pb-3 font-medium text-right">Blacklistés</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.lists.map((list) => (
                      <tr key={list.id} className="border-b border-surface-800 hover:bg-surface-800/30">
                        <td className="py-3 pr-4 text-surface-200">{list.name}</td>
                        <td className="py-3 pr-4 text-right text-surface-300">{list.totalSubscribers.toLocaleString()}</td>
                        <td className="py-3 pr-4 text-right text-surface-300">{list.uniqueSubscribers?.toLocaleString() ?? '-'}</td>
                        <td className="py-3 text-right text-surface-500">{list.totalBlacklisted?.toLocaleString() ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Manual marketing campaigns (Brevo) */}
          {stats.manualCampaigns && stats.manualCampaigns.length > 0 && (() => {
            const inRange = campaignsInDateRange(stats.manualCampaigns, campaignDateRange.from, campaignDateRange.to);
            const filtered = filterCampaigns(inRange, filterPositiveClickOnly, filterFranchiseursOnly);
            return (
              <div
                id="campagnes-manuelles"
                className="card-glass p-6 mb-8"
                style={{ scrollMarginTop: 'var(--marketing-sticky-height, 11rem)' }}
              >
                <h2 className="text-lg font-semibold text-surface-100 mb-4 flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-primary-400" />
                  Campagnes marketing manuelles (Brevo)
                  {(filterPositiveClickOnly || filterFranchiseursOnly) && (
                    <span className="text-xs font-normal text-surface-500">
                      ({filtered.length} affichée{filtered.length !== 1 ? 's' : ''})
                    </span>
                  )}
                </h2>
                <p className="text-sm text-surface-500 mb-4">
                  Campagnes email de type « classique » créées manuellement dans Brevo. Cliquez sur une campagne pour afficher le nombre de destinataires et les taux (ouverture, clic, désabonnement).
                </p>
                <div className="space-y-4">
                  {filtered.length === 0 ? (
                    <p className="text-surface-500 text-sm py-4">Aucune campagne ne correspond aux filtres.</p>
                  ) : (
                    filtered.map((campaign) => (
                      <CampaignCard
                        key={campaign.id}
                        campaign={campaign}
                        isExpanded={expandedCampaignId === campaign.id}
                        onToggle={() =>
                          setExpandedCampaignId((id) => (id === campaign.id ? null : campaign.id))
                        }
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })()}

          {/* Recent campaigns */}
          {stats.recentCampaigns && stats.recentCampaigns.length > 0 && (() => {
            const inRange = campaignsInDateRange(stats.recentCampaigns, campaignDateRange.from, campaignDateRange.to);
            const filtered = filterCampaigns(inRange, filterPositiveClickOnly, filterFranchiseursOnly);
            return (
              <div
                id="campagnes-recentes"
                className="card-glass p-6"
                style={{ scrollMarginTop: 'var(--marketing-sticky-height, 11rem)' }}
              >
                <h2 className="text-lg font-semibold text-surface-100 mb-4 flex items-center gap-2">
                  <Send className="w-5 h-5 text-amber-400" />
                  Campagnes récentes
                  {(filterPositiveClickOnly || filterFranchiseursOnly) && (
                    <span className="text-xs font-normal text-surface-500">
                      ({filtered.length} affichée{filtered.length !== 1 ? 's' : ''})
                    </span>
                  )}
                </h2>
                <p className="text-sm text-surface-500 mb-4">
                  Cliquez sur une campagne pour afficher le nombre de destinataires et les taux (ouverture, clic, désabonnement).
                </p>
                <div className="space-y-4">
                  {filtered.length === 0 ? (
                    <p className="text-surface-500 text-sm py-4">Aucune campagne ne correspond aux filtres.</p>
                  ) : (
                    filtered.map((campaign) => (
                      <CampaignCard
                        key={campaign.id}
                        campaign={campaign}
                        isExpanded={expandedCampaignId === campaign.id}
                        onToggle={() =>
                          setExpandedCampaignId((id) => (id === campaign.id ? null : campaign.id))
                        }
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })(          )}

          {/* Logs emails transactionnels */}
          {stats && (
            <div
              id="logs-transactionnels"
              className="card-glass p-6 mt-8"
              style={{ scrollMarginTop: 'var(--marketing-sticky-height, 11rem)' }}
            >
              <h2 className="text-lg font-semibold text-surface-100 mb-2 flex items-center gap-2">
                <Send className="w-5 h-5 text-accent-400" />
                Logs des emails transactionnels
              </h2>
              <p className="text-sm text-surface-500 mb-3">
                Activité des 30 derniers jours (envoyés, livrés, ouverts, clics, bounces, etc.). Source : Brevo API <code className="text-xs">/smtp/statistics/events</code>.
              </p>
              {transactionalEvents !== null && (() => {
                const { sent, uniqueRecipients, deliveryRate, openRate, clickRate } = getTransactionalGlobalStats(transactionalEvents);
                return (
                  <div className="flex flex-wrap gap-4 mb-4 p-3 rounded-lg bg-surface-800/50 border border-surface-700/50">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-surface-500">Destinataires</span>
                      <span className="text-base font-bold text-surface-100 tabular-nums">{uniqueRecipients.toLocaleString()}</span>
                      <span className="text-xs text-surface-500">(uniques)</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-surface-500">Envois</span>
                      <span className="text-base font-bold text-surface-300 tabular-nums">{sent.toLocaleString()}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-surface-500">Taux livraison</span>
                      <span className="text-base font-bold text-blue-400 tabular-nums">
                        {deliveryRate != null ? `${deliveryRate.toFixed(1)} %` : '–'}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-surface-500">Taux ouverture</span>
                      <span className="text-base font-bold text-teal-400 tabular-nums">
                        {openRate != null ? `${openRate.toFixed(1)} %` : '–'}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-surface-500">Taux clic</span>
                      <span className="text-base font-bold text-green-400 tabular-nums">
                        {clickRate != null ? `${clickRate.toFixed(1)} %` : '–'}
                      </span>
                    </div>
                  </div>
                );
              })()}
              {transactionalLoading ? (
                <div className="flex items-center gap-2 py-8 text-surface-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Chargement des événements…</span>
                </div>
              ) : transactionalEvents && transactionalEvents.length > 0 ? (
                (() => {
                  const emailRows = groupTransactionalEventsByEmail(transactionalEvents);
                  const formatTooltip = (iso: string | null) =>
                    iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }) : '';
                  return (
                    <>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-sm text-surface-500">{emailRows.length} mail(s) envoyé(s)</span>
                        <button
                          type="button"
                          onClick={loadTransactionalEvents}
                          disabled={transactionalLoading}
                          className="text-xs px-2 py-1 rounded bg-surface-800 text-surface-400 hover:text-surface-200"
                        >
                          Actualiser
                        </button>
                      </div>
                      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-surface-900/95">
                            <tr className="text-left text-surface-500 border-b border-surface-700">
                              <th className="pb-2 pr-3 font-medium">Date envoi</th>
                              <th className="pb-2 pr-3 font-medium">Destinataire</th>
                              <th className="pb-2 pr-3 font-medium">Sujet</th>
                              <th className="pb-2 pr-2 font-medium text-center" title="Envoyé">Env.</th>
                              <th className="pb-2 pr-2 font-medium text-center" title="Livré">Liv.</th>
                              <th className="pb-2 pr-2 font-medium text-center" title="Ouvert">Ouv.</th>
                              <th className="pb-2 font-medium text-center" title="Clic">Clic</th>
                            </tr>
                          </thead>
                          <tbody>
                            {emailRows.map((row) => (
                              <tr key={row.messageId} className="border-b border-surface-800/50">
                                <td className="py-2 pr-3 text-surface-400 whitespace-nowrap">
                                  {row.sentAt ? new Date(row.sentAt).toLocaleString('fr-FR') : '–'}
                                </td>
                                <td className="py-2 pr-3 text-surface-300 truncate max-w-[180px]">{row.email}</td>
                                <td className="py-2 pr-3 text-surface-400 truncate max-w-[240px]" title={row.subject}>
                                  {row.subject || '–'}
                                </td>
                                <td className="py-2 pr-2 text-center">
                                  <span
                                    className="inline-flex w-6 h-6 rounded-full bg-surface-600/80 items-center justify-center text-surface-300 text-xs"
                                    title={formatTooltip(row.sentAt)}
                                  >
                                    ✓
                                  </span>
                                </td>
                                <td className="py-2 pr-2 text-center">
                                  {row.deliveredAt ? (
                                    <span
                                      className="inline-flex w-6 h-6 rounded-full bg-blue-500/30 items-center justify-center text-blue-400 text-xs"
                                      title={formatTooltip(row.deliveredAt)}
                                    >
                                      ✓
                                    </span>
                                  ) : (
                                    <span className="inline-flex w-6 h-6 rounded-full bg-surface-800 items-center justify-center text-surface-600 text-xs">–</span>
                                  )}
                                </td>
                                <td className="py-2 pr-2 text-center">
                                  {row.openedAt ? (
                                    <span
                                      className="inline-flex w-6 h-6 rounded-full bg-teal-500/30 items-center justify-center text-teal-400 text-xs"
                                      title={formatTooltip(row.openedAt)}
                                    >
                                      ✓
                                    </span>
                                  ) : (
                                    <span className="inline-flex w-6 h-6 rounded-full bg-surface-800 items-center justify-center text-surface-600 text-xs">–</span>
                                  )}
                                </td>
                                <td className="py-2 text-center">
                                  {row.clickedAt ? (
                                    <span
                                      className="inline-flex w-6 h-6 rounded-full bg-green-500/30 items-center justify-center text-green-400 text-xs"
                                      title={formatTooltip(row.clickedAt)}
                                    >
                                      ✓
                                    </span>
                                  ) : (
                                    <span className="inline-flex w-6 h-6 rounded-full bg-surface-800 items-center justify-center text-surface-600 text-xs">–</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()
              ) : transactionalEvents && transactionalEvents.length === 0 ? (
                <p className="text-surface-500 text-sm py-4">Aucun événement sur la période.</p>
              ) : null}
            </div>
          )}

          {(!stats.lists?.length) && (!stats.recentCampaigns?.length) && (!stats.manualCampaigns?.length) && (
            <div className="card-glass p-8 text-center text-surface-500">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Aucune liste ou campagne récente.</p>
            </div>
          )}
        </>
      )}

      {/* Modal détail: emails ayant cliqué / désinscriptions */}
      {detailModal && stats && (() => {
        const allCampaigns = [...(stats.recentCampaigns ?? []), ...(stats.manualCampaigns ?? [])];
        const inRange = campaignsInDateRange(allCampaigns, campaignDateRange.from, campaignDateRange.to);
        const type: 'clickers' | 'unsubscribed' = detailModal === 'clics' ? 'clickers' : 'unsubscribed';
        const campaignsWithData = inRange.filter((c) => {
          const v = detailModal === 'clics' ? (c.statistics?.clicked ?? 0) : (c.statistics?.unsubscribed ?? 0);
          return v > 0;
        });
        const title = detailModal === 'clics' ? 'Emails ayant cliqué' : 'Désinscriptions';
        const icon = detailModal === 'clics' ? MousePointer : UserX;
        const Icon = icon;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setDetailModal(null)}>
            <div className="bg-surface-900 border border-surface-700 rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-surface-700">
                <h3 className="text-lg font-semibold text-surface-100 flex items-center gap-2">
                  <Icon className="w-5 h-5 text-green-400" />
                  {title}
                </h3>
                <button type="button" onClick={() => setDetailModal(null)} className="p-2 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-surface-200">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                {campaignsWithData.length === 0 ? (
                  <p className="text-surface-500 text-sm">Aucune campagne avec des données sur la période choisie.</p>
                ) : (
                  <ul className="space-y-4">
                    {campaignsWithData.map((campaign) => {
                      const key = `${campaign.id}-${type}`;
                      const emails = loadedEmails[key];
                      const isLoading = loadingRecipients?.campaignId === campaign.id && loadingRecipients?.type === type;
                      const count = detailModal === 'clics' ? (campaign.statistics?.clicked ?? 0) : (campaign.statistics?.unsubscribed ?? 0);
                      return (
                        <li key={campaign.id} className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <span className="font-medium text-surface-200 text-sm truncate">{campaign.name}</span>
                            <span className="text-xs text-surface-500 tabular-nums">{count} {detailModal === 'clics' ? 'clic(s)' : 'désinscription(s)'}</span>
                          </div>
                          {emails == null ? (
                            <button
                              type="button"
                              onClick={() => loadCampaignEmails(campaign.id, type)}
                              disabled={isLoading}
                              className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-2 disabled:opacity-50"
                            >
                              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                              {isLoading ? 'Chargement...' : 'Voir la liste des emails'}
                            </button>
                          ) : (
                            <div className="mt-2">
                              <p className="text-xs text-surface-500 mb-2">{emails.length} email(s)</p>
                              <ul className="text-sm text-surface-300 space-y-1 max-h-48 overflow-y-auto">
                                {emails.map((email) => (
                                  <li key={email} className="font-mono truncate" title={email}>{email}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export { TRANSACTIONAL_EVENT_LABELS, getTransactionalEventBadgeClass };
