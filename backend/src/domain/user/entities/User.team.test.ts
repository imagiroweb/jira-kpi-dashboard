/**
 * TU — Rattachement d'équipe sur User (teamId, canManageTeamAssignment)
 */
import { User } from './User';

describe('User team (TU)', () => {
  it('définit teamId (référence Team, nullable par défaut)', () => {
    const schema = User.schema;
    expect(schema.path('teamId')).toBeDefined();
    expect(schema.path('teamId').options.ref).toBe('Team');
    expect(schema.path('teamId').options.default).toBeNull();
  });

  it('définit canManageTeamAssignment (booléen, false par défaut)', () => {
    const schema = User.schema;
    expect(schema.path('canManageTeamAssignment')).toBeDefined();
    expect(schema.path('canManageTeamAssignment').options.default).toBe(false);
  });
});
