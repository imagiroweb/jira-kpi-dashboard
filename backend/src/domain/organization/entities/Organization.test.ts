/**
 * TU — Modèle Organization (sans base réelle)
 */
import { Organization, isTenantId } from './Organization';

const TENANT = '8f2c1d3e-1234-4abc-9def-0123456789ab';

describe('Organization', () => {
  it('exige name et slug', () => {
    const error = new Organization({}).validateSync();
    expect(error?.errors.name).toBeDefined();
    expect(error?.errors.slug).toBeDefined();
  });

  it('refuse les comptes locaux par défaut et normalise les domaines', () => {
    const org = new Organization({ name: 'Adoria', slug: 'adoria', allowedEmailDomains: [' Adoria.COM '] });
    expect(org.validateSync()).toBeUndefined();
    expect(org.allowLocalAccounts).toBe(false);
    expect(org.isActive).toBe(true);
    expect(org.allowedEmailDomains).toEqual(['adoria.com']);
  });

  it('valide le tenantId Microsoft (GUID) et le met en minuscules', () => {
    const ok = new Organization({ name: 'A', slug: 'a', sso: [{ provider: 'microsoft', tenantId: TENANT.toUpperCase() }] });
    expect(ok.validateSync()).toBeUndefined();
    expect(ok.sso[0].tenantId).toBe(TENANT);

    const ko = new Organization({ name: 'A', slug: 'a', sso: [{ provider: 'microsoft', tenantId: 'common' }] });
    expect(ko.validateSync()).toBeDefined();
  });

  it('refuse un slug invalide', () => {
    const error = new Organization({ name: 'A', slug: 'Pas un slug!' }).validateSync();
    expect(error?.errors.slug).toBeDefined();
  });
});

describe('isTenantId', () => {
  it('reconnaît un GUID et refuse les alias Microsoft', () => {
    expect(isTenantId(TENANT)).toBe(true);
    expect(isTenantId('common')).toBe(false);
    expect(isTenantId('organizations')).toBe(false);
    expect(isTenantId(undefined)).toBe(false);
  });
});
