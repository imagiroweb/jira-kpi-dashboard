import { describe, expect, it } from 'vitest';
import { getTransactionalEventBadgeClass } from './transactionalEvents';

describe('getTransactionalEventBadgeClass', () => {
  const baseClasses = 'px-1.5 py-0.5 rounded text-xs font-medium';

  it('retourne les classes neutres pour requests (niveau 0)', () => {
    expect(getTransactionalEventBadgeClass('requests')).toBe(
      `${baseClasses} bg-surface-600/80 text-surface-300`
    );
  });

  it('retourne les classes bleues pour delivered (niveau 1)', () => {
    expect(getTransactionalEventBadgeClass('delivered')).toBe(
      `${baseClasses} bg-blue-500/25 text-blue-400`
    );
  });

  it('retourne les classes teal pour opened (niveau 2)', () => {
    expect(getTransactionalEventBadgeClass('opened')).toBe(
      `${baseClasses} bg-teal-500/25 text-teal-400`
    );
  });

  it('retourne les classes vertes pour clicks (niveau 3)', () => {
    expect(getTransactionalEventBadgeClass('clicks')).toBe(
      `${baseClasses} bg-green-500/25 text-green-400`
    );
  });

  it('retourne les classes rouges pour hardBounces (négatif)', () => {
    expect(getTransactionalEventBadgeClass('hardBounces')).toBe(
      `${baseClasses} bg-red-500/20 text-red-400/90`
    );
  });

  it('retourne les classes rouges pour softBounces', () => {
    expect(getTransactionalEventBadgeClass('softBounces')).toContain('bg-red-500/20');
  });

  it('retourne les classes rouges pour bounces', () => {
    expect(getTransactionalEventBadgeClass('bounces')).toContain('text-red-400/90');
  });

  it('retourne les classes rouges pour spam', () => {
    expect(getTransactionalEventBadgeClass('spam')).toContain('bg-red-500/20');
  });

  it('retourne les classes rouges pour invalid', () => {
    expect(getTransactionalEventBadgeClass('invalid')).toContain('bg-red-500/20');
  });

  it('retourne les classes rouges pour deferred', () => {
    expect(getTransactionalEventBadgeClass('deferred')).toContain('bg-red-500/20');
  });

  it('retourne les classes rouges pour blocked', () => {
    expect(getTransactionalEventBadgeClass('blocked')).toContain('bg-red-500/20');
  });

  it('retourne les classes rouges pour unsubscribed', () => {
    expect(getTransactionalEventBadgeClass('unsubscribed')).toContain('bg-red-500/20');
  });

  it('retourne les classes rouges pour error', () => {
    expect(getTransactionalEventBadgeClass('error')).toContain('bg-red-500/20');
  });

  it('retourne les classes rouges pour loadedByProxy', () => {
    expect(getTransactionalEventBadgeClass('loadedByProxy')).toContain('bg-red-500/20');
  });

  it('retourne les classes rouges pour un événement inconnu', () => {
    expect(getTransactionalEventBadgeClass('unknownEvent')).toBe(
      `${baseClasses} bg-red-500/20 text-red-400/90`
    );
  });
});
