const mockUpdateMany = jest.fn();
jest.mock('../../domain/user/entities/Role', () => ({
  Role: { updateMany: (...args: unknown[]) => mockUpdateMany(...args) },
}));
jest.mock('../../utils/logger', () => jest.requireActual('../../test/mocks/logger').loggerMockFactory());

import { grantWipPageToLeadRoles, LEAD_ROLE_NAME } from './wipPageAccess';

describe('grantWipPageToLeadRoles', () => {
  beforeEach(() => jest.clearAllMocks());

  it('active la page pour les rôles « lead » qui ne l\'ont pas encore réglée', async () => {
    mockUpdateMany.mockResolvedValue({ modifiedCount: 2 });
    expect(await grantWipPageToLeadRoles()).toBe(2);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      { name: LEAD_ROLE_NAME, 'pageVisibilities.wip': { $exists: false } },
      { $set: { 'pageVisibilities.wip': true } }
    );
  });

  it('CT-76 : reconnaît le mot « lead », pas « Leadership »', () => {
    expect(['Lead dev', 'Tech leads', 'lead'].every((n) => LEAD_ROLE_NAME.test(n))).toBe(true);
    expect(['Leadership', 'Mislead', 'Dev'].some((n) => LEAD_ROLE_NAME.test(n))).toBe(false);
  });

  it('ne touche rien si aucun rôle ne correspond', async () => {
    mockUpdateMany.mockResolvedValue({ modifiedCount: 0 });
    expect(await grantWipPageToLeadRoles()).toBe(0);
  });
});
