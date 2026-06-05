/** Factory pour mocker getMondayClient() dans les tests de routes Monday */
export function createMondayClientMock() {
  return {
    isConfigured: jest.fn().mockReturnValue(true),
    getMe: jest.fn(),
    getWorkspaces: jest.fn(),
    getBoards: jest.fn(),
    getBoardWithItems: jest.fn(),
    getBoardViews: jest.fn(),
  };
}

export type MondayClientMock = ReturnType<typeof createMondayClientMock>;

/** Factory pour mocker getBrevoClient() dans les tests de routes Brevo */
export function createBrevoClientMock() {
  return {
    isConfigured: jest.fn().mockReturnValue(true),
    getAccount: jest.fn(),
    getContactsCount: jest.fn(),
    getLists: jest.fn(),
    getCampaigns: jest.fn(),
    getManualCampaigns: jest.fn(),
    exportCampaignRecipients: jest.fn(),
    getProcess: jest.fn(),
    downloadExportFile: jest.fn(),
    getCampaignRecipientEmails: jest.fn(),
    getTransactionalEvents: jest.fn(),
  };
}

export type BrevoClientMock = ReturnType<typeof createBrevoClientMock>;
