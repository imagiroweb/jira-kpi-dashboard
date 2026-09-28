/**
 * TU — AuthService : validation et révocation des sessions
 */
const mockFindById = jest.fn();
const mockUpdateOne = jest.fn();

jest.mock('../../domain/user/entities/User', () => ({
  User: {
    findById: (...a: unknown[]) => ({ select: () => ({ lean: () => mockFindById(...a) }) }),
    updateOne: (...a: unknown[]) => mockUpdateOne(...a)
  }
}));
jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));

import jwt from 'jsonwebtoken';
import { AuthService } from './AuthService';

describe('AuthService — sessions', () => {
  const service = new AuthService();
  const base = { userId: 'u1', email: 'a@b.fr', provider: 'local' as const };

  beforeEach(() => jest.clearAllMocks());

  it('accepte un jeton valide pour un compte actif de même version', async () => {
    mockFindById.mockResolvedValue({ isActive: true, tokenVersion: 3 });
    const token = service.generateToken({ ...base, tv: 3 });

    await expect(service.validateSession(token)).resolves.toEqual(expect.objectContaining({ userId: 'u1', tv: 3 }));
  });

  it('refuse un compte désactivé', async () => {
    mockFindById.mockResolvedValue({ isActive: false, tokenVersion: 0 });
    await expect(service.validateSession(service.generateToken({ ...base, tv: 0 }))).resolves.toBeNull();
  });

  it('refuse un compte supprimé', async () => {
    mockFindById.mockResolvedValue(null);
    await expect(service.validateSession(service.generateToken(base))).resolves.toBeNull();
  });

  it('refuse un jeton émis avant une révocation (version différente)', async () => {
    mockFindById.mockResolvedValue({ isActive: true, tokenVersion: 1 });
    await expect(service.validateSession(service.generateToken({ ...base, tv: 0 }))).resolves.toBeNull();
  });

  it('traite un ancien jeton sans tv comme version 0', async () => {
    mockFindById.mockResolvedValue({ isActive: true });
    await expect(service.validateSession(service.generateToken(base))).resolves.not.toBeNull();
  });

  it('refuse un jeton mal signé sans interroger la base', async () => {
    const forged = jwt.sign(base, 'autre-secret');
    await expect(service.validateSession(forged)).resolves.toBeNull();
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('refuse un jeton « alg: none »', async () => {
    const none = jwt.sign(base, '', { algorithm: 'none' });
    await expect(service.validateSession(none)).resolves.toBeNull();
  });

  it('retourne null si la base est indisponible', async () => {
    mockFindById.mockRejectedValue(new Error('db down'));
    await expect(service.validateSession(service.generateToken(base))).resolves.toBeNull();
  });

  it('revokeSessions incrémente la version des sessions', async () => {
    await service.revokeSessions('u1');
    expect(mockUpdateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $inc: { tokenVersion: 1 } });
  });
});
