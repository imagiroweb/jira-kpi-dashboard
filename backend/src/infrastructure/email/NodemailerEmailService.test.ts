const mockSendMail = jest.fn();
const mockVerify = jest.fn();
const mockCreateTransport = jest.fn();
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: mockCreateTransport
  }
}));

jest.mock('../../utils/logger', () => ({
  logger: mockLogger
}));

describe('NodemailerEmailService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockCreateTransport.mockReturnValue({
      sendMail: mockSendMail,
      verify: mockVerify
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('reste non configuré si variables SMTP manquantes', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    process.env.NODE_ENV = 'production';
    const { NodemailerEmailService } = await import('./NodemailerEmailService');
    const service = new NodemailerEmailService();

    expect(service.isConfigured).toBe(false);
    expect(await service.sendPasswordResetEmail({ email: 'a@test.com' }, 'https://reset')).toBe(false);
  });

  it('retourne true en dev sans SMTP et log le lien', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    process.env.NODE_ENV = 'development';
    const { NodemailerEmailService } = await import('./NodemailerEmailService');
    const service = new NodemailerEmailService();

    await expect(service.sendPasswordResetEmail({ email: 'dev@test.com' }, 'https://reset')).resolves.toBe(true);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('configure transport et envoie un email', async () => {
    process.env.SMTP_HOST = 'smtp.local';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'smtp-user';
    process.env.SMTP_PASS = 'smtp-pass';
    process.env.EMAIL_FROM = 'noreply@test.com';
    process.env.EMAIL_FROM_NAME = 'KPI';

    const { NodemailerEmailService } = await import('./NodemailerEmailService');
    const service = new NodemailerEmailService();
    mockSendMail.mockResolvedValueOnce({});

    await expect(
      service.sendPasswordResetEmail({ email: 'user@test.com', firstName: 'Ana' }, 'https://reset')
    ).resolves.toBe(true);

    expect(service.isConfigured).toBe(true);
    expect(mockCreateTransport).toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@test.com',
        from: '"KPI" <noreply@test.com>'
      })
    );
  });

  it('retourne false si adresse expéditeur vide', async () => {
    process.env.SMTP_HOST = 'smtp.local';
    process.env.SMTP_USER = '   ';
    process.env.SMTP_PASS = 'smtp-pass';
    process.env.EMAIL_FROM = '';
    const { NodemailerEmailService } = await import('./NodemailerEmailService');
    const service = new NodemailerEmailService();

    await expect(service.sendPasswordResetEmail({ email: 'user@test.com' }, 'https://reset')).resolves.toBe(false);
  });

  it('retourne false si sendMail échoue et verify log en warning', async () => {
    process.env.SMTP_HOST = 'smtp.local';
    process.env.SMTP_USER = 'smtp-user';
    process.env.SMTP_PASS = 'smtp-pass';
    process.env.EMAIL_FROM = 'noreply@test.com';
    mockSendMail.mockRejectedValueOnce({ message: 'down', code: 'ECONNREFUSED' });
    mockVerify.mockRejectedValueOnce({ message: 'verify-fail' });
    const { NodemailerEmailService } = await import('./NodemailerEmailService');
    const service = new NodemailerEmailService();

    await expect(service.sendPasswordResetEmail({ email: 'user@test.com' }, 'https://reset')).resolves.toBe(false);
    await service.verify();
    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
