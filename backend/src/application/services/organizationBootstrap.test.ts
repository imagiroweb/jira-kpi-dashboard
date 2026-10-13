/**
 * TU — Amorçage de l'organisation par défaut
 */
const mockOrgCount = jest.fn();
const mockOrgCreate = jest.fn();
const mockOrgFind = jest.fn();
const mockUserUpdateMany = jest.fn();
const mockUserCount = jest.fn();

jest.mock('../../domain/organization/entities/Organization', () => {
  const actual = jest.requireActual('../../domain/organization/entities/Organization');
  return {
    ...actual,
    Organization: {
      countDocuments: (...a: unknown[]) => mockOrgCount(...a),
      create: (...a: unknown[]) => mockOrgCreate(...a),
      find: (...a: unknown[]) => ({
        select: () => ({ limit: () => ({ lean: () => mockOrgFind(...a) }) })
      })
    }
  };
});
jest.mock('../../domain/user/entities/User', () => ({
  User: {
    updateMany: (...a: unknown[]) => mockUserUpdateMany(...a),
    countDocuments: (...a: unknown[]) => mockUserCount(...a)
  }
}));
jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import {
  ensureDefaultOrganization,
  readDefaultOrganizationConfig,
  slugify
} from './organizationBootstrap';

const TENANT = '8f2c1d3e-1234-4abc-9def-0123456789ab';

beforeEach(() => jest.clearAllMocks());

describe('readDefaultOrganizationConfig', () => {
  it('lit les variables DEFAULT_ORG_* avec des valeurs par défaut sûres', () => {
    expect(readDefaultOrganizationConfig({})).toEqual({
      name: 'Adoria',
      slug: 'adoria',
      tenantId: null,
      allowedEmailDomains: [],
      allowLocalAccounts: true
    });
  });

  it('reprend MICROSOFT_TENANT_ID seulement si c’est un GUID', () => {
    expect(readDefaultOrganizationConfig({ MICROSOFT_TENANT_ID: TENANT.toUpperCase() }).tenantId).toBe(TENANT);
    expect(readDefaultOrganizationConfig({ MICROSOFT_TENANT_ID: 'common' }).tenantId).toBeNull();
    expect(
      readDefaultOrganizationConfig({ MICROSOFT_TENANT_ID: 'common', DEFAULT_ORG_TENANT_ID: TENANT }).tenantId
    ).toBe(TENANT);
  });

  it('parse domaines et comptes locaux', () => {
    const cfg = readDefaultOrganizationConfig({
      DEFAULT_ORG_NAME: 'Société Test',
      DEFAULT_ORG_EMAIL_DOMAINS: 'test.fr, @Test.com',
      DEFAULT_ORG_ALLOW_LOCAL_ACCOUNTS: 'false'
    });
    expect(cfg.slug).toBe('societe-test');
    expect(cfg.allowedEmailDomains).toEqual(['test.fr', 'test.com']);
    expect(cfg.allowLocalAccounts).toBe(false);
  });
});

describe('slugify', () => {
  it('produit un slug sans accents ni caractères spéciaux', () => {
    expect(slugify('  Éditions & Co ')).toBe('editions-co');
  });
});

describe('ensureDefaultOrganization', () => {
  const config = {
    name: 'Adoria',
    slug: 'adoria',
    tenantId: TENANT,
    allowedEmailDomains: ['adoria.com'],
    allowLocalAccounts: true
  };

  it('crée l’organisation si aucune n’existe et y rattache les utilisateurs orphelins', async () => {
    mockOrgCount.mockResolvedValue(0);
    mockOrgFind.mockResolvedValue([{ _id: 'org1', slug: 'adoria' }]);
    mockUserUpdateMany.mockResolvedValue({ modifiedCount: 12 });

    const result = await ensureDefaultOrganization(config);

    expect(mockOrgCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'adoria',
        sso: [{ provider: 'microsoft', tenantId: TENANT }],
        allowedEmailDomains: ['adoria.com'],
        allowLocalAccounts: true
      })
    );
    expect(mockUserUpdateMany).toHaveBeenCalledWith({ organizationId: null }, { $set: { organizationId: 'org1' } });
    expect(result).toEqual({ created: true, organizationId: 'org1', attachedUsers: 12 });
  });

  it('crée une organisation sans SSO si le tenant est inconnu', async () => {
    mockOrgCount.mockResolvedValue(0);
    mockOrgFind.mockResolvedValue([{ _id: 'org1', slug: 'adoria' }]);
    mockUserUpdateMany.mockResolvedValue({ modifiedCount: 0 });

    await ensureDefaultOrganization({ ...config, tenantId: null });

    expect(mockOrgCreate).toHaveBeenCalledWith(expect.objectContaining({ sso: [] }));
  });

  it('est idempotent : ne recrée pas une organisation existante', async () => {
    mockOrgCount.mockResolvedValue(1);
    mockOrgFind.mockResolvedValue([{ _id: 'org1', slug: 'adoria' }]);
    mockUserUpdateMany.mockResolvedValue({ modifiedCount: 0 });

    const result = await ensureDefaultOrganization(config);

    expect(mockOrgCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ created: false, organizationId: 'org1', attachedUsers: 0 });
  });

  it('ne rattache personne automatiquement s’il existe plusieurs organisations', async () => {
    mockOrgCount.mockResolvedValue(2);
    mockOrgFind.mockResolvedValue([{ _id: 'org1' }, { _id: 'org2' }]);
    mockUserCount.mockResolvedValue(3);

    const result = await ensureDefaultOrganization(config);

    expect(mockUserUpdateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ created: false, organizationId: null, attachedUsers: 0 });
  });
});
