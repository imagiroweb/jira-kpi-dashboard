/**
 * TU — Rattachement organisation sur User (organizationId, isPlatformAdmin)
 */
import { User } from './User';

describe('User organization (TU)', () => {
  it('définit organizationId (référence Organization, nullable par défaut)', () => {
    const path = User.schema.path('organizationId');
    expect(path).toBeDefined();
    expect(path.options.ref).toBe('Organization');
    expect(path.options.default).toBeNull();
  });

  it('définit isPlatformAdmin (false par défaut)', () => {
    expect(User.schema.path('isPlatformAdmin').options.default).toBe(false);
    expect(new User({ email: 'a@b.fr', provider: 'microsoft' }).isPlatformAdmin).toBe(false);
  });
});
