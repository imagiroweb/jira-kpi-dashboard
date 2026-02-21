export const TRANSACTIONAL_EVENT_LABELS: Record<string, string> = {
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
  loadedByProxy: 'Proxy',
};

/** Niveau de satisfaction : 0 Envoyé, 1 Livré, 2 Ouvert, 3 Clic ; -1 = négatif */
export const TRANSACTIONAL_EVENT_SATISFACTION: Record<string, number> = {
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
  loadedByProxy: -1,
};

const EVENT_BADGE_CLASSES: Record<number, string> = {
  0: 'bg-surface-600/80 text-surface-300',
  1: 'bg-blue-500/25 text-blue-400',
  2: 'bg-teal-500/25 text-teal-400',
  3: 'bg-green-500/25 text-green-400',
  [-1]: 'bg-red-500/20 text-red-400/90',
};

export function getTransactionalEventBadgeClass(event: string): string {
  const level = TRANSACTIONAL_EVENT_SATISFACTION[event] ?? -1;
  return `px-1.5 py-0.5 rounded text-xs font-medium ${EVENT_BADGE_CLASSES[level] ?? EVENT_BADGE_CLASSES[-1]}`;
}
