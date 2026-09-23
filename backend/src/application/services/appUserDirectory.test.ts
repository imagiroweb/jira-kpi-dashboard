const mockUserFind = jest.fn();
const mockUserFindById = jest.fn();
const mockRoleFindById = jest.fn();

jest.mock('../../domain/user/entities/User', () => ({
  User: { find: (...a: unknown[]) => mockUserFind(...a), findById: (...a: unknown[]) => mockUserFindById(...a) },
}));
jest.mock('../../domain/user/entities/Role', () => ({
  Role: { findById: (...a: unknown[]) => mockRoleFindById(...a) },
}));

import { getCostActor, loadAppUsersForMatching, userHasCostAccess } from './appUserDirectory';

const RATES = [
  { startDate: null, rate: 50 },
  { startDate: '2026-07-01', rate: 60 },
];

const leanChain = (value: unknown) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });

describe('appUserDirectory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadAppUsersForMatching', () => {
    it('renvoie nom du rôle et coût horaire (seulement pour la liste des coûts)', async () => {
      mockUserFind.mockReturnValue({
        select: () => ({
          populate: () => ({
            lean: () =>
              Promise.resolve([
                { email: 'a@x.com', firstName: 'A', lastName: 'B', roleId: { name: 'Dev' }, hourlyRates: RATES, provider: 'microsoft' },
                { email: 'admin@x.com', role: 'super_admin', provider: 'microsoft' },
                { email: 'c@x.com', roleId: null },
                { email: 'local@x.com', provider: 'local', hourlyRates: [{ startDate: null, rate: 30 }] },
                { email: 'added@x.com', provider: 'local', includedInCosts: true, hourlyRates: [{ startDate: null, rate: 35 }] },
              ]),
          }),
        }),
      });

      await expect(loadAppUsersForMatching()).resolves.toEqual([
        { email: 'a@x.com', firstName: 'A', lastName: 'B', roleName: 'Dev', hourlyRates: RATES },
        { email: 'admin@x.com', firstName: undefined, lastName: undefined, roleName: 'Super admin', hourlyRates: [] },
        { email: 'c@x.com', firstName: undefined, lastName: undefined, roleName: null, hourlyRates: [] },
        // Compte non SSO non ajouté à la page des coûts : ses coûts horaires sont ignorés.
        { email: 'local@x.com', firstName: undefined, lastName: undefined, roleName: null, hourlyRates: [] },
        { email: 'added@x.com', firstName: undefined, lastName: undefined, roleName: null, hourlyRates: [{ startDate: null, rate: 35 }] },
      ]);
    });
  });

  describe('userHasCostAccess', () => {
    it('autorise le super admin', async () => {
      mockUserFindById.mockReturnValue(leanChain({ role: 'super_admin' }));

      await expect(userHasCostAccess('u1')).resolves.toBe(true);
      expect(mockRoleFindById).not.toHaveBeenCalled();
    });

    it('autorise un rôle ayant la page Coûts (Finance) et refuse les autres', async () => {
      mockUserFindById.mockReturnValue(leanChain({ roleId: 'r1' }));
      mockRoleFindById
        .mockReturnValueOnce(leanChain({ pageVisibilities: { couts: true } }))
        .mockReturnValueOnce(leanChain({ pageVisibilities: { couts: false } }));

      await expect(userHasCostAccess('u1')).resolves.toBe(true);
      await expect(userHasCostAccess('u1')).resolves.toBe(false);
    });

    it('refuse un utilisateur sans rôle ou introuvable', async () => {
      mockUserFindById.mockReturnValueOnce(leanChain({})).mockReturnValueOnce(leanChain(null));

      await expect(userHasCostAccess('u1')).resolves.toBe(false);
      await expect(userHasCostAccess('u2')).resolves.toBe(false);
    });
  });

  describe('getCostActor', () => {
    it("distingue l'accès aux coûts du droit de gérer la liste (super admin)", async () => {
      mockUserFindById.mockReturnValueOnce(leanChain({ role: 'super_admin' }));
      await expect(getCostActor('u1')).resolves.toEqual({ hasAccess: true, isSuperAdmin: true });

      mockUserFindById.mockReturnValueOnce(leanChain({ roleId: 'r1' }));
      mockRoleFindById.mockReturnValueOnce(leanChain({ pageVisibilities: { couts: true } }));
      await expect(getCostActor('u2')).resolves.toEqual({ hasAccess: true, isSuperAdmin: false });
    });
  });
});
