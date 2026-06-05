import { AuthTokenPayload } from '../../application/services/AuthService';

/** ObjectId MongoDB valide utilisé dans les tests de routes */
export const TEST_USER_ID = '507f1f77bcf86cd799439011';

/** Utilisateur authentifié par défaut (super admin mocké côté User.findById) */
export const TEST_USER: AuthTokenPayload = {
  userId: TEST_USER_ID,
  email: 'admin@test.com',
  provider: 'local',
};
