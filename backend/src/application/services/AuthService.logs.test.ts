/**
 * TU — AuthService : enregistrement des logs de connexion (logLoginOncePerMinute via login)
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const mockUserFindOne = jest.fn();
const mockLogFindOne = jest.fn();
const mockLogCreate = jest.fn();

jest.mock('../../domain/user/entities/User', () => ({
  User: {
    findOne: (...args: unknown[]) => mockUserFindOne(...args),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOneAndUpdate: jest.fn(),
    create: jest.fn()
  }
}));

jest.mock('../../domain/user/entities/Role', () => ({
  Role: {
    findOne: jest.fn(),
    findById: jest.fn().mockResolvedValue({
      name: 'Utilisateur',
      pageVisibilities: {
        dashboard: true,
        users: true,
        support: true,
        epics: true,
        marketing: true,
        produit: true,
        gestionUtilisateurs: false
      }
    })
  },
  PAGE_IDS: ['dashboard', 'users', 'support', 'epics', 'marketing', 'produit', 'gestionUtilisateurs']
}));

jest.mock('../../domain/user/entities/UserActivityLog', () => ({
  UserActivityLog: {
    findOne: (...args: unknown[]) => mockLogFindOne(...args),
    create: (...args: unknown[]) => mockLogCreate(...args)
  }
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

import { AuthService } from './AuthService';

describe('AuthService (activity logs)', () => {
  let service: AuthService;
  const userId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService();
  });

  describe('login — création d’un log de connexion', () => {
    it('crée un log de connexion quand le login réussit et aucun log récent', async () => {
      const hashedPassword = await bcrypt.hash('ValidPass123!', 12);
      const mockUser = {
        _id: userId,
        email: 'user@test.com',
        password: hashedPassword,
        isActive: true,
        provider: 'local',
        save: jest.fn().mockResolvedValue(undefined)
      };

      mockUserFindOne.mockResolvedValue(mockUser);
      mockLogFindOne.mockResolvedValue(null);
      mockLogCreate.mockResolvedValue({});

      const result = await service.login('user@test.com', 'ValidPass123!');

      expect(result.success).toBe(true);
      expect(mockLogFindOne).toHaveBeenCalled();
      expect(mockLogCreate).toHaveBeenCalledTimes(1);
      expect(mockLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'login',
          timestamp: expect.any(Date)
        })
      );
    });

    it('ne crée pas de log si un log de connexion existe déjà dans la dernière minute', async () => {
      const hashedPassword = await bcrypt.hash('ValidPass123!', 12);
      const mockUser = {
        _id: userId,
        email: 'user@test.com',
        password: hashedPassword,
        isActive: true,
        provider: 'local',
        save: jest.fn().mockResolvedValue(undefined)
      };

      mockUserFindOne.mockResolvedValue(mockUser);
      mockLogFindOne.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

      const result = await service.login('user@test.com', 'ValidPass123!');

      expect(result.success).toBe(true);
      expect(mockLogFindOne).toHaveBeenCalled();
      expect(mockLogCreate).not.toHaveBeenCalled();
    });
  });
});
