import { hasCostAccess, isInCostList } from './costList';

describe('isInCostList', () => {
  it('inclut les comptes SSO Microsoft', () => {
    expect(isInCostList({ provider: 'microsoft' })).toBe(true);
  });

  it("n'inclut un compte non SSO que s'il a été ajouté manuellement", () => {
    expect(isInCostList({ provider: 'local' })).toBe(false);
    expect(isInCostList({ provider: 'local', includedInCosts: false })).toBe(false);
    expect(isInCostList({ provider: 'local', includedInCosts: true })).toBe(true);
  });
});

describe('hasCostAccess', () => {
  it('autorise toujours le super admin', () => {
    expect(hasCostAccess({ isSuperAdmin: true })).toBe(true);
  });

  it('autorise un rôle ayant la page Coûts (ex. Finance) et refuse les autres', () => {
    expect(hasCostAccess({ isSuperAdmin: false, pageVisibilities: { couts: true } })).toBe(true);
    expect(hasCostAccess({ isSuperAdmin: false, pageVisibilities: { couts: false } })).toBe(false);
    expect(hasCostAccess({ isSuperAdmin: false, pageVisibilities: {} })).toBe(false);
    expect(hasCostAccess({ isSuperAdmin: false, pageVisibilities: null })).toBe(false);
  });
});
