/**
 * TU — Résolution de portée d'accès Performance (CTO/lead/collaborateur)
 */
import { canAccessReviewForTeam, hasGlobalPerformanceAccess, resolveAuthorRole, PerformanceScopeActor } from './performanceScope';

function actor(overrides: Partial<PerformanceScopeActor> = {}): PerformanceScopeActor {
  return { isSuperAdmin: false, performanceGlobalAccess: false, ledTeamIds: [], ...overrides };
}

describe('hasGlobalPerformanceAccess', () => {
  it('true pour super_admin', () => {
    expect(hasGlobalPerformanceAccess(actor({ isSuperAdmin: true }))).toBe(true);
  });
  it('true pour performanceGlobalAccess', () => {
    expect(hasGlobalPerformanceAccess(actor({ performanceGlobalAccess: true }))).toBe(true);
  });
  it('false sinon', () => {
    expect(hasGlobalPerformanceAccess(actor())).toBe(false);
  });
});

describe('canAccessReviewForTeam', () => {
  it('le CTO/super_admin accède à toutes les fiches, même sans équipe', () => {
    expect(canAccessReviewForTeam(actor({ isSuperAdmin: true }), undefined)).toBe(true);
    expect(canAccessReviewForTeam(actor({ performanceGlobalAccess: true }), null)).toBe(true);
  });

  it("un lead accède aux fiches de son équipe", () => {
    expect(canAccessReviewForTeam(actor({ ledTeamIds: ['team-a'] }), 'team-a')).toBe(true);
  });

  it("un lead n'accède pas aux fiches d'une autre équipe", () => {
    expect(canAccessReviewForTeam(actor({ ledTeamIds: ['team-a'] }), 'team-b')).toBe(false);
  });

  it("un simple collaborateur n'accède à aucune fiche via cette fonction", () => {
    expect(canAccessReviewForTeam(actor(), 'team-a')).toBe(false);
  });

  it("un lead n'accède pas à une fiche sans équipe renseignée", () => {
    expect(canAccessReviewForTeam(actor({ ledTeamIds: ['team-a'] }), undefined)).toBe(false);
  });
});

describe('resolveAuthorRole', () => {
  it('cto pour un accès global', () => {
    expect(resolveAuthorRole(actor({ isSuperAdmin: true }), 'team-a')).toBe('cto');
  });
  it('lead pour un lead sur la bonne équipe', () => {
    expect(resolveAuthorRole(actor({ ledTeamIds: ['team-a'] }), 'team-a')).toBe('lead');
  });
  it('collaborateur sinon', () => {
    expect(resolveAuthorRole(actor({ ledTeamIds: ['team-a'] }), 'team-b')).toBe('collaborateur');
    expect(resolveAuthorRole(actor(), undefined)).toBe('collaborateur');
  });
});
