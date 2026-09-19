/**
 * TU — Logique pure du rattachement d'un collaborateur à une équipe
 */
import { canAssignUserToTeam, hasGlobalTeamManagementAccess, TeamAssignmentActor } from './teamAssignment';

function actor(overrides: Partial<TeamAssignmentActor> = {}): TeamAssignmentActor {
  return {
    isSuperAdmin: false,
    performanceGlobalAccess: false,
    canManageTeamAssignment: false,
    ledTeamIds: [],
    ...overrides
  };
}

describe('hasGlobalTeamManagementAccess', () => {
  it('true pour super_admin', () => {
    expect(hasGlobalTeamManagementAccess({ isSuperAdmin: true, performanceGlobalAccess: false })).toBe(true);
  });

  it('true pour performanceGlobalAccess', () => {
    expect(hasGlobalTeamManagementAccess({ isSuperAdmin: false, performanceGlobalAccess: true })).toBe(true);
  });

  it('false sinon', () => {
    expect(hasGlobalTeamManagementAccess({ isSuperAdmin: false, performanceGlobalAccess: false })).toBe(false);
  });
});

describe('canAssignUserToTeam', () => {
  it('autorise le super_admin à rattacher à n\'importe quelle équipe', () => {
    const decision = canAssignUserToTeam(actor({ isSuperAdmin: true }), { isLeadOfAnyTeam: false }, 'team-x');
    expect(decision.allowed).toBe(true);
  });

  it('autorise le CTO (performanceGlobalAccess) à détacher un collaborateur (teamId null)', () => {
    const decision = canAssignUserToTeam(actor({ performanceGlobalAccess: true }), { isLeadOfAnyTeam: false }, null);
    expect(decision.allowed).toBe(true);
  });

  it('refuse un utilisateur sans canManageTeamAssignment ni accès global', () => {
    const decision = canAssignUserToTeam(actor(), { isLeadOfAnyTeam: false }, 'team-x');
    expect(decision.allowed).toBe(false);
  });

  it('refuse un lead qui tente de détacher un collaborateur (teamId null)', () => {
    const decision = canAssignUserToTeam(
      actor({ canManageTeamAssignment: true, ledTeamIds: ['team-a'] }),
      { isLeadOfAnyTeam: false },
      null
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/CTO|administrateur/i);
  });

  it("refuse un lead qui tente de rattacher à une équipe qu'il ne dirige pas", () => {
    const decision = canAssignUserToTeam(
      actor({ canManageTeamAssignment: true, ledTeamIds: ['team-a'] }),
      { isLeadOfAnyTeam: false },
      'team-b'
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/propre équipe/i);
  });

  it('refuse un lead qui tente de déplacer un autre lead', () => {
    const decision = canAssignUserToTeam(
      actor({ canManageTeamAssignment: true, ledTeamIds: ['team-a'] }),
      { isLeadOfAnyTeam: true },
      'team-a'
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/lead/i);
  });

  it('autorise un lead à rattacher un collaborateur (non-lead) à sa propre équipe', () => {
    const decision = canAssignUserToTeam(
      actor({ canManageTeamAssignment: true, ledTeamIds: ['team-a'] }),
      { isLeadOfAnyTeam: false },
      'team-a'
    );
    expect(decision.allowed).toBe(true);
  });
});
