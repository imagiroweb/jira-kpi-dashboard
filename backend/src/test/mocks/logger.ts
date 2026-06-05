/** Logger partagé mocké — réinitialiser via jest.clearAllMocks() dans beforeEach */
export const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

export function loggerMockFactory() {
  return { logger: mockLogger };
}
