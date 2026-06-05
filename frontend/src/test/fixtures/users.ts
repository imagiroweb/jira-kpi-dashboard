import type { User, VisiblePages } from '@/store/useStore';

/** Identifiant utilisateur stable pour les tests */
export const TEST_USER_ID = '507f1f77bcf86cd799439011';

export const TEST_VISIBLE_PAGES_ALL: VisiblePages = {
  dashboard: true,
  users: true,
  support: true,
  epics: true,
  marketing: true,
  produit: true,
  gestionUtilisateurs: true,
};

export const TEST_VISIBLE_PAGES_DASHBOARD_ONLY: VisiblePages = {
  dashboard: true,
  users: false,
  support: false,
  epics: false,
  marketing: false,
  produit: false,
  gestionUtilisateurs: false,
};

/** Utilisateur connecté par défaut (toutes les pages visibles) */
export const TEST_USER: User = {
  id: TEST_USER_ID,
  email: 'admin@test.com',
  firstName: 'Admin',
  lastName: 'Test',
  provider: 'local',
  roleName: 'Admin',
  visiblePages: TEST_VISIBLE_PAGES_ALL,
};

/** Utilisateur Microsoft pour les tests SSO */
export const TEST_MICROSOFT_USER: User = {
  id: '507f1f77bcf86cd799439012',
  email: 'ms@test.com',
  provider: 'microsoft',
  roleName: 'Utilisateur',
  visiblePages: TEST_VISIBLE_PAGES_DASHBOARD_ONLY,
};
