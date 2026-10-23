import type { IPageVisibilities } from './entities/Role';

/**
 * Rôles semés au démarrage (créés ou réécrits à chaque lancement du serveur) avec leurs pages
 * visibles. La page « Suivi WIP » (`wip`, issue #79) est ouverte aux rôles Dev et PO.
 */
export const SEEDED_ROLES: Array<{ name: string; pageVisibilities: IPageVisibilities }> = [
  {
    name: 'Utilisateur',
    pageVisibilities: {
      dashboard: true,
      users: false,
      support: false,
      epics: false,
      marketing: false,
      produit: false,
      pointHebdo: false,
      gestionUtilisateurs: false,
      performance: true,
      performanceDashboard: false,
      couts: false,
      wip: false
    }
  },
  {
    name: 'Dev',
    pageVisibilities: {
      dashboard: true,
      users: false,
      support: true,
      epics: false,
      marketing: false,
      produit: false,
      pointHebdo: true,
      gestionUtilisateurs: false,
      performance: true,
      performanceDashboard: false,
      couts: false,
      wip: true
    }
  },
  {
    name: 'PO',
    pageVisibilities: {
      dashboard: true,
      users: true,
      support: false,
      epics: true,
      marketing: false,
      produit: false,
      pointHebdo: true,
      gestionUtilisateurs: false,
      performance: true,
      performanceDashboard: false,
      couts: false,
      wip: true
    }
  },
  {
    name: 'Product',
    pageVisibilities: {
      dashboard: true,
      users: false,
      support: false,
      epics: false,
      marketing: false,
      produit: true,
      pointHebdo: true,
      gestionUtilisateurs: false,
      performance: true,
      performanceDashboard: false,
      couts: false,
      wip: false
    }
  },
  {
    name: 'Marketing',
    pageVisibilities: {
      dashboard: true,
      users: false,
      support: false,
      epics: false,
      marketing: true,
      produit: false,
      pointHebdo: false,
      gestionUtilisateurs: false,
      performance: true,
      performanceDashboard: false,
      couts: false,
      wip: false
    }
  }
];
