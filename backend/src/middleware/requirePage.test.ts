/**
 * TU — Middleware requirePage (contrôle d'accès par page du rôle)
 */
import type { Request, Response, NextFunction } from 'express';

const mockFindById = jest.fn();
const mockGetVisiblePages = jest.fn();

jest.mock('../domain/user/entities/User', () => ({
  User: { findById: (...a: unknown[]) => ({ select: () => mockFindById(...a) }) }
}));
jest.mock('../application/services/AuthService', () => ({
  authService: { getVisiblePages: (...a: unknown[]) => mockGetVisiblePages(...a) }
}));
jest.mock('../utils/logger', () => ({ logger: { error: jest.fn() } }));

import { requirePage } from './requirePage';

function run(mw: ReturnType<typeof requirePage>, user?: { userId: string }) {
  const req = { user } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() } as unknown as Response & {
    status: jest.Mock;
  };
  const next = jest.fn() as NextFunction;
  return mw(req, res, next).then(() => ({ res, next }));
}

describe('requirePage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('laisse passer si une des pages est visible pour le rôle', async () => {
    mockFindById.mockResolvedValue({ isActive: true });
    mockGetVisiblePages.mockResolvedValue({ users: false, support: true });

    const { next, res } = await run(requirePage('users', 'support'), { userId: 'u1' });

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('refuse (403) si aucune page n’est visible', async () => {
    mockFindById.mockResolvedValue({ isActive: true });
    mockGetVisiblePages.mockResolvedValue({ users: false, marketing: false });

    const { next, res } = await run(requirePage('marketing'), { userId: 'u1' });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('refuse (401) sans utilisateur authentifié', async () => {
    const { res } = await run(requirePage('users'));
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('refuse (401) un compte désactivé ou supprimé, même avec un JWT valide', async () => {
    mockFindById.mockResolvedValue({ isActive: false });
    expect((await run(requirePage('users'), { userId: 'u1' })).res.status).toHaveBeenCalledWith(401);

    mockFindById.mockResolvedValue(null);
    expect((await run(requirePage('users'), { userId: 'u1' })).res.status).toHaveBeenCalledWith(401);
    expect(mockGetVisiblePages).not.toHaveBeenCalled();
  });

  it('retourne 500 en cas d’erreur base', async () => {
    mockFindById.mockRejectedValue(new Error('db'));
    expect((await run(requirePage('users'), { userId: 'u1' })).res.status).toHaveBeenCalledWith(500);
  });
});
