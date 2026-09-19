/**
 * TU — Section Performance sur Role (PAGE_IDS, visibilités par défaut, portée CTO)
 */
import { Role, PAGE_IDS } from './Role';

describe('Role performance (TU)', () => {
  it('déclare les pages "performance" et "performanceDashboard" dans PAGE_IDS', () => {
    expect(PAGE_IDS).toContain('performance');
    expect(PAGE_IDS).toContain('performanceDashboard');
  });

  it('rend "Ma performance" visible par défaut et "Performance équipe" masquée par défaut', () => {
    const schema = Role.schema;
    const pageVisibilitiesSchema = (schema.path('pageVisibilities') as unknown as { schema: typeof Role.schema })
      .schema;
    expect(pageVisibilitiesSchema.path('performance').options.default).toBe(true);
    expect(pageVisibilitiesSchema.path('performanceDashboard').options.default).toBe(false);
  });

  it('définit performanceGlobalAccess (portée CTO), booléen, false par défaut', () => {
    const schema = Role.schema;
    expect(schema.path('performanceGlobalAccess')).toBeDefined();
    expect(schema.path('performanceGlobalAccess').options.default).toBe(false);
  });

  it('un rôle créé sans pageVisibilities reçoit les valeurs par défaut pour la performance', () => {
    const role = new Role({ name: 'Test' });
    expect(role.validateSync()).toBeUndefined();
    const plain = role.toObject();
    expect(plain.pageVisibilities.performance).toBe(true);
    expect(plain.pageVisibilities.performanceDashboard).toBe(false);
    expect(plain.performanceGlobalAccess).toBe(false);
  });
});
