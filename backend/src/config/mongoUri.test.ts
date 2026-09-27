import { describeMongoUri } from './mongoUri';

describe('describeMongoUri', () => {
  it('détecte une connexion avec le compte root', () => {
    expect(describeMongoUri('mongodb://admin:pw@mongodb:27017/jira-kpi?authSource=admin').usesRootAccount).toBe(true);
  });

  it('accepte un utilisateur applicatif authentifié sur jira-kpi', () => {
    expect(describeMongoUri('mongodb://jira_kpi_app:pw@mongodb:27017/jira-kpi?authSource=jira-kpi')).toEqual({
      username: 'jira_kpi_app',
      authSource: 'jira-kpi',
      usesRootAccount: false
    });
  });

  it('sans identifiants (dev local) ou URI invalide : pas d’alerte', () => {
    expect(describeMongoUri('mongodb://localhost:27017/jira-kpi').usesRootAccount).toBe(false);
    expect(describeMongoUri('pas une uri').usesRootAccount).toBe(false);
  });
});
