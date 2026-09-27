import { parseBoardIdList, toIntegrationSettingsView, type IIntegrationSettings } from './integrationSettings';

describe('parseBoardIdList', () => {
  it('accepte une chaîne, un tableau, ignore les doublons et les valeurs invalides', () => {
    expect(parseBoardIdList('810, 843\n12;12')).toEqual([810, 843, 12]);
    expect(parseBoardIdList([810, '843', 'x', 0, -1])).toEqual([810, 843]);
    expect(parseBoardIdList(null)).toEqual([]);
  });
});

describe('toIntegrationSettingsView', () => {
  const previous = { ...process.env };

  afterEach(() => {
    process.env = { ...previous };
  });

  it('retombe sur les variables d’environnement tant que les boards ne sont pas enregistrés', () => {
    process.env.JIRA_URL = 'https://jira.example';
    process.env.JIRA_EMAIL = 'a@b.c';
    process.env.JIRA_API_TOKEN = 'env-token';
    process.env.JIRA_BOARD_ID = '1,2';
    process.env.JIRA_QA_BOARD_ID = '9';

    const doc = {
      key: 'default',
      jiraUrl: '',
      jiraEmail: '',
      jiraApiToken: '',
      mondayApiKey: '',
      boardsConfigured: false,
      dashboardBoardIds: [810],
      qaBoardIds: []
    } as IIntegrationSettings;

    expect(toIntegrationSettingsView(doc)).toMatchObject({
      jiraUrl: 'https://jira.example',
      jiraEmail: 'a@b.c',
      jiraApiTokenSet: true,
      jiraApiTokenFromDatabase: false,
      dashboardBoardIds: [1, 2],
      qaBoardIds: [9],
      boardsConfigured: false
    });
  });

  it('utilise les boards de la base une fois la configuration enregistrée', () => {
    process.env.JIRA_BOARD_ID = '1';
    const doc = {
      key: 'default',
      jiraUrl: 'https://db.example',
      jiraEmail: 'db@b.c',
      jiraApiToken: 'db-token',
      mondayApiKey: 'monday',
      boardsConfigured: true,
      dashboardBoardIds: [810, 843],
      qaBoardIds: [946]
    } as IIntegrationSettings;

    expect(toIntegrationSettingsView(doc)).toMatchObject({
      jiraUrl: 'https://db.example',
      jiraApiTokenFromDatabase: true,
      mondayApiKeyFromDatabase: true,
      dashboardBoardIds: [810, 843],
      qaBoardIds: [946],
      boardsConfigured: true
    });
  });
});
