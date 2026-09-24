/**
 * TU — AuthService : connexion locale selon l'organisation, invitation d'un compte local
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const mockUserFindOne = jest.fn();
const mockUserFindById = jest.fn();
const mockUserExists = jest.fn();
const mockUserCreate = jest.fn();
const mockUserUpdateOne = jest.fn();
const mockOrgFindById = jest.fn();
const mockOrgFindOne = jest.fn();
const mockRoleFindById = jest.fn();
const mockRoleFindOne = jest.fn();
const mockSendInvitation = jest.fn();

jest.mock('../../domain/user/entities/User', () => ({
  User: {
    findOne: (...a: unknown[]) => mockUserFindOne(...a),
    // .select().lean() (admin) ou await .select('-password') (création SSO)
    findById: (...a: unknown[]) => ({
      select: () => {
        const p = Promise.resolve(mockUserFindById(...a)) as Promise<unknown> & { lean?: () => unknown };
        p.lean = () => mockUserFindById(...a);
        return p;
      }
    }),
    exists: (...a: unknown[]) => mockUserExists(...a),
    create: (...a: unknown[]) => mockUserCreate(...a),
    updateOne: (...a: unknown[]) => mockUserUpdateOne(...a),
    findByIdAndUpdate: jest.fn(),
    findOneAndUpdate: jest.fn()
  }
}));

jest.mock('../../domain/organization/entities/Organization', () => ({
  Organization: {
    findOne: (...a: unknown[]) => ({ lean: () => mockOrgFindOne(...a) }),
    findById: (...a: unknown[]) => {
      const lean = () => mockOrgFindById(...a);
      return { select: () => ({ lean }), lean };
    }
  }
}));

jest.mock('../../domain/user/entities/Role', () => ({
  Role: {
    findById: (...a: unknown[]) => ({ select: () => ({ lean: () => mockRoleFindById(...a) }) }),
    findOne: (...a: unknown[]) => mockRoleFindOne(...a)
  },
  PAGE_IDS: ['dashboard']
}));

jest.mock('../../domain/team/entities/Team', () => ({
  Team: { find: () => ({ select: () => ({ lean: () => Promise.resolve([]) }) }) }
}));

jest.mock('../../domain/user/entities/UserActivityLog', () => ({
  UserActivityLog: { findOne: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) }
}));

jest.mock('../../infrastructure/email/NodemailerEmailService', () => ({
  emailService: { sendAccountInvitationEmail: (...a: unknown[]) => mockSendInvitation(...a) }
}));

jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));

import { AuthService } from './AuthService';

const ORG_ID = new mongoose.Types.ObjectId();
const ADMIN_ID = new mongoose.Types.ObjectId().toString();
const activeOrg = {
  _id: ORG_ID,
  slug: 'adoria',
  isActive: true,
  allowLocalAccounts: true,
  allowedEmailDomains: ['adoria.com']
};

describe('AuthService — organisation', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService();
    mockUserUpdateOne.mockResolvedValue({});
    mockSendInvitation.mockResolvedValue(true);
  });

  describe('login local', () => {
    async function localUser(overrides: Record<string, unknown> = {}) {
      return {
        _id: new mongoose.Types.ObjectId(),
        email: 'jean@adoria.com',
        password: await bcrypt.hash('ValidPass123!', 4),
        isActive: true,
        provider: 'local',
        organizationId: ORG_ID,
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides
      };
    }

    it('refuse la connexion si l’organisation n’autorise pas les comptes locaux', async () => {
      mockUserFindOne.mockResolvedValue(await localUser());
      mockOrgFindById.mockResolvedValue({ isActive: true, allowLocalAccounts: false });

      const result = await service.login('jean@adoria.com', 'ValidPass123!');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/SSO/);
      expect(result.token).toBeUndefined();
    });

    it('refuse la connexion si l’organisation est inactive', async () => {
      mockUserFindOne.mockResolvedValue(await localUser());
      mockOrgFindById.mockResolvedValue({ isActive: false, allowLocalAccounts: true });

      expect((await service.login('jean@adoria.com', 'ValidPass123!')).success).toBe(false);
    });

    it('refuse la connexion d’un utilisateur sans organisation', async () => {
      mockUserFindOne.mockResolvedValue(await localUser({ organizationId: undefined }));

      expect((await service.login('jean@adoria.com', 'ValidPass123!')).success).toBe(false);
      expect(mockOrgFindById).not.toHaveBeenCalled();
    });

    it('ne révèle rien sur l’organisation si le mot de passe est faux', async () => {
      mockUserFindOne.mockResolvedValue(await localUser());

      const result = await service.login('jean@adoria.com', 'Mauvais123!!');

      expect(result.error).toBe('Email ou mot de passe incorrect');
      expect(mockOrgFindById).not.toHaveBeenCalled();
    });
  });

  describe('inviteLocalUser', () => {
    beforeEach(() => {
      mockUserFindById.mockResolvedValue({ organizationId: ORG_ID });
      mockOrgFindById.mockResolvedValue(activeOrg);
      mockUserExists.mockResolvedValue(null);
      mockUserCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
        _id: new mongoose.Types.ObjectId(),
        ...doc
      }));
      mockRoleFindOne.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    });

    it('crée le compte dans l’organisation de l’admin et envoie une invitation valable 72 h', async () => {
      const before = Date.now();
      const result = await service.inviteLocalUser(ADMIN_ID, { email: ' Marie@Adoria.com ', firstName: 'Marie' });

      expect(result).toEqual(expect.objectContaining({ success: true, emailSent: true }));
      expect(mockUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'marie@adoria.com', provider: 'local', organizationId: ORG_ID })
      );
      // mot de passe aléatoire haché, jamais un mot de passe choisi par l'admin
      const created = mockUserCreate.mock.calls[0][0] as { password: string };
      expect(created.password).toMatch(/^\$2[aby]\$/);

      const tokenUpdate = mockUserUpdateOne.mock.calls.find(
        (c) => (c[1] as { $set?: Record<string, unknown> }).$set?.passwordResetToken
      );
      expect(tokenUpdate).toBeDefined();
      const expires = (tokenUpdate![1] as { $set: { passwordResetExpires: Date } }).$set.passwordResetExpires;
      expect(expires.getTime() - before).toBeGreaterThanOrEqual(72 * 3600 * 1000 - 1000);

      const [to, url, hours] = mockSendInvitation.mock.calls[0];
      expect(to).toEqual({ email: 'marie@adoria.com', firstName: 'Marie' });
      expect(url).toMatch(/\/reset-password\?token=[0-9a-f]{64}$/);
      expect(hours).toBe(72);
    });

    it('refuse si l’organisation n’autorise pas les comptes locaux', async () => {
      mockOrgFindById.mockResolvedValue({ ...activeOrg, allowLocalAccounts: false });

      const result = await service.inviteLocalUser(ADMIN_ID, { email: 'marie@adoria.com' });

      expect(result.success).toBe(false);
      expect(mockUserCreate).not.toHaveBeenCalled();
    });

    it('refuse un domaine d’email non autorisé', async () => {
      const result = await service.inviteLocalUser(ADMIN_ID, { email: 'marie@gmail.com' });

      expect(result).toEqual(expect.objectContaining({ success: false, status: 400 }));
      expect(mockUserCreate).not.toHaveBeenCalled();
    });

    it('refuse un email déjà utilisé (409)', async () => {
      mockUserExists.mockResolvedValue({ _id: 'x' });

      const result = await service.inviteLocalUser(ADMIN_ID, { email: 'marie@adoria.com' });

      expect(result.status).toBe(409);
    });

    it('refuse un rôle inexistant', async () => {
      mockRoleFindById.mockResolvedValue(null);

      const result = await service.inviteLocalUser(ADMIN_ID, { email: 'marie@adoria.com', roleId: 'r1' });

      expect(result).toEqual(expect.objectContaining({ success: false, error: 'Rôle invalide' }));
    });

    it('refuse si l’administrateur n’a pas d’organisation', async () => {
      mockUserFindById.mockResolvedValue({ organizationId: null });

      const result = await service.inviteLocalUser(ADMIN_ID, { email: 'marie@adoria.com' });

      expect(result.success).toBe(false);
      expect(mockOrgFindById).not.toHaveBeenCalled();
    });
  });

  describe('handleMicrosoftSSO (liste blanche des tenants)', () => {
    const TENANT = '8f2c1d3e-1234-4abc-9def-0123456789ab';
    const identity = { tenantId: TENANT, objectId: 'oid-1', email: 'jean@adoria.com', firstName: 'Jean', lastName: 'Dupont' };

    function ssoUser(overrides: Record<string, unknown> = {}) {
      return {
        _id: new mongoose.Types.ObjectId(),
        email: 'jean@adoria.com',
        provider: 'microsoft',
        isActive: true,
        organizationId: ORG_ID,
        microsoftId: 'oid-1',
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides
      };
    }

    beforeEach(() => {
      mockOrgFindOne.mockResolvedValue(activeOrg);
      mockRoleFindOne.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    });

    it('cherche l’organisation active correspondant au tenant du jeton', async () => {
      mockUserFindOne.mockResolvedValue(ssoUser());

      await service.handleMicrosoftSSO(identity);

      expect(mockOrgFindOne).toHaveBeenCalledWith({
        isActive: true,
        sso: { $elemMatch: { provider: 'microsoft', tenantId: TENANT } }
      });
    });

    it('refuse (403) un tenant qui ne correspond à aucune organisation', async () => {
      mockOrgFindOne.mockResolvedValue(null);

      const result = await service.handleMicrosoftSSO({ ...identity, tenantId: '9188040d-6c67-4c5b-b112-36a304b66dad' });

      expect(result).toEqual(expect.objectContaining({ success: false, status: 403 }));
      expect(mockUserFindOne).not.toHaveBeenCalled();
      expect(mockUserCreate).not.toHaveBeenCalled();
    });

    it('refuse (403) un domaine d’email hors de l’organisation', async () => {
      const result = await service.handleMicrosoftSSO({ ...identity, email: 'jean@partenaire.fr' });

      expect(result).toEqual(expect.objectContaining({ success: false, status: 403 }));
      expect(mockUserCreate).not.toHaveBeenCalled();
    });

    it('refuse un compte rattaché à une autre organisation', async () => {
      mockUserFindOne.mockResolvedValue(ssoUser({ organizationId: new mongoose.Types.ObjectId() }));

      const result = await service.handleMicrosoftSSO(identity);

      expect(result).toEqual(expect.objectContaining({ success: false, status: 403 }));
    });

    it('crée un nouveau compte dans l’organisation du tenant, rôle par défaut', async () => {
      mockUserFindOne.mockResolvedValue(null);
      const created = ssoUser();
      mockUserCreate.mockResolvedValue(created);
      mockUserFindById.mockResolvedValue(created);

      const result = await service.handleMicrosoftSSO(identity);

      expect(result.success).toBe(true);
      expect(result.firstLogin).toBe(true);
      expect(mockUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'jean@adoria.com', microsoftId: 'oid-1', organizationId: ORG_ID, provider: 'microsoft' })
      );
      expect(result.user?.role).toBeUndefined();
    });

    it('rattache à l’organisation un compte existant qui n’en avait pas', async () => {
      const user = ssoUser({ organizationId: undefined, microsoftId: undefined });
      mockUserFindOne.mockResolvedValue(user);

      const result = await service.handleMicrosoftSSO(identity);

      expect(result.success).toBe(true);
      expect(user.organizationId).toBe(ORG_ID);
      expect(user.microsoftId).toBe('oid-1');
      expect(user.save).toHaveBeenCalled();
    });

    it('refuse un compte désactivé sans émettre de jeton', async () => {
      mockUserFindOne.mockResolvedValue(ssoUser({ isActive: false }));

      const result = await service.handleMicrosoftSSO(identity);

      expect(result.success).toBe(false);
      expect(result.token).toBeUndefined();
    });

    it('refuse un profil sans email', async () => {
      const result = await service.handleMicrosoftSSO({ ...identity, email: null });

      expect(result).toEqual(expect.objectContaining({ success: false, status: 401 }));
    });
  });
});
