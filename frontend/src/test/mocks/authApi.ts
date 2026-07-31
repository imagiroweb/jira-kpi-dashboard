import { vi } from 'vitest';

/** Mock complet de authApi pour les tests de composants */
export function createAuthApiMock() {
  return {
    login: vi.fn(),
    register: vi.fn(),
    validatePassword: vi.fn(),
    verifyToken: vi.fn(),
    getCurrentUser: vi.fn(),
    getMicrosoftConfig: vi.fn(),
    microsoftCallback: vi.fn(),
    getRolesForSignup: vi.fn(),
    getUsersAndRoles: vi.fn(),
    updateUserRole: vi.fn(),
    getRoles: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    updateMyRole: vi.fn(),
    recordPageView: vi.fn(),
    getRoadmapAdoria2026DefaultFilters: vi.fn().mockResolvedValue({
      trimestre: 'all',
      statut: [],
      team: [],
    }),
    saveRoadmapAdoria2026DefaultFilters: vi.fn().mockImplementation(async (filters) => filters),
    getUserLogs: vi.fn(),
    getUserPageStats: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  };
}

/**
 * Usage dans un test composant :
 * ```ts
 * vi.mock('@/services/authApi', () => ({ authApi: createAuthApiMock() }));
 * ```
 */
export function authApiModuleMock() {
  return { authApi: createAuthApiMock() };
}
