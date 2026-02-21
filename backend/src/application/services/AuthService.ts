import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { User, IUser } from '../../domain/user/entities/User';
import { Role, IPageVisibilities, PAGE_IDS } from '../../domain/user/entities/Role';
import { logger } from '../../utils/logger';

const SUPER_ADMIN_EMAIL = 'bdeguil-robin@adoria.com';

const ALL_PAGES_TRUE: IPageVisibilities = PAGE_IDS.reduce((acc, id) => ({ ...acc, [id]: true }), {} as IPageVisibilities);

// Password validation rules
const PASSWORD_RULES = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong' | 'very-strong';
  score: number;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  provider: 'local' | 'microsoft';
}

export interface LoginResult {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    provider: string;
    role?: 'super_admin' | string;
    roleName?: string;
    visiblePages?: IPageVisibilities;
  };
  /** True when user was just created (e.g. first Microsoft login) and must choose a role */
  firstLogin?: boolean;
  error?: string;
}

export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly saltRounds: number = 12;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
    
    if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
      logger.warn('JWT_SECRET not set in production environment!');
    }
  }

  /**
   * Validates password against security rules
   */
  validatePassword(password: string): PasswordValidationResult {
    const errors: string[] = [];
    let score = 0;

    // Check minimum length
    if (password.length < PASSWORD_RULES.minLength) {
      errors.push(`Le mot de passe doit contenir au moins ${PASSWORD_RULES.minLength} caractères`);
    } else {
      score += 20;
      // Bonus for longer passwords
      if (password.length >= 16) score += 10;
      if (password.length >= 20) score += 10;
    }

    // Check for uppercase letters
    if (PASSWORD_RULES.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Le mot de passe doit contenir au moins une lettre majuscule');
    } else if (/[A-Z]/.test(password)) {
      score += 15;
      // Bonus for multiple uppercase
      if ((password.match(/[A-Z]/g) || []).length >= 2) score += 5;
    }

    // Check for lowercase letters
    if (PASSWORD_RULES.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Le mot de passe doit contenir au moins une lettre minuscule');
    } else if (/[a-z]/.test(password)) {
      score += 15;
    }

    // Check for numbers
    if (PASSWORD_RULES.requireNumbers && !/[0-9]/.test(password)) {
      errors.push('Le mot de passe doit contenir au moins un chiffre');
    } else if (/[0-9]/.test(password)) {
      score += 15;
      // Bonus for multiple numbers
      if ((password.match(/[0-9]/g) || []).length >= 2) score += 5;
    }

    // Check for special characters
    const specialCharRegex = new RegExp(`[${PASSWORD_RULES.specialChars.replace(/[[\]\\^$.|?*+(){}]/g, '\\$&')}]`);
    if (PASSWORD_RULES.requireSpecialChars && !specialCharRegex.test(password)) {
      errors.push('Le mot de passe doit contenir au moins un caractère spécial (!@#$%^&*...)');
    } else if (specialCharRegex.test(password)) {
      score += 20;
      // Bonus for multiple special chars
      const specialMatches = password.split('').filter(c => PASSWORD_RULES.specialChars.includes(c));
      if (specialMatches.length >= 2) score += 10;
    }

    // Determine strength
    let strength: PasswordValidationResult['strength'];
    if (score < 40) {
      strength = 'weak';
    } else if (score < 60) {
      strength = 'medium';
    } else if (score < 80) {
      strength = 'strong';
    } else {
      strength = 'very-strong';
    }

    return {
      isValid: errors.length === 0,
      errors,
      strength,
      score: Math.min(score, 100)
    };
  }

  /**
   * Hash a password
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  /**
   * Compare password with hash
   */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT token
   */
  generateToken(payload: AuthTokenPayload): string {
    const options: SignOptions = {
      expiresIn: this.jwtExpiresIn as SignOptions['expiresIn']
    };
    return jwt.sign(payload, this.jwtSecret, options);
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): AuthTokenPayload | null {
    try {
      return jwt.verify(token, this.jwtSecret) as AuthTokenPayload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Register a new user with email/password. roleId optional: if provided, user gets that role; else default "Utilisateur".
   */
  async register(
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
    roleId?: string
  ): Promise<LoginResult> {
    try {
      // Validate password
      const validation = this.validatePassword(password);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.errors.join('. ')
        };
      }

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return {
          success: false,
          error: 'Un compte existe déjà avec cet email'
        };
      }

      // Hash password and create user
      const hashedPassword = await this.hashPassword(password);
      const user = await User.create({
        email: email.toLowerCase(),
        password: hashedPassword,
        firstName,
        lastName,
        provider: 'local',
        isActive: true
      });

      await this.ensureSuperAdmin(user.email);
      if (roleId) {
        const role = await Role.findById(roleId);
        if (role) await User.findByIdAndUpdate(user._id, { $set: { roleId: role._id }, $unset: { role: 1 } });
      } else {
        await this.assignDefaultRoleIfNeeded(user);
      }
      const refreshed = await User.findById(user._id).select('-password');
      if (!refreshed) throw new Error('User not found after create');

      const token = this.generateToken({
        userId: refreshed._id.toString(),
        email: refreshed.email,
        provider: 'local'
      });
      const userWithPerms = await this.buildUserWithPermissions(refreshed);

      logger.info(`New user registered: ${email}`);

      return {
        success: true,
        token,
        user: {
          id: userWithPerms.id,
          email: userWithPerms.email,
          firstName: userWithPerms.firstName,
          lastName: userWithPerms.lastName,
          provider: userWithPerms.provider,
          role: userWithPerms.role ?? undefined,
          roleName: userWithPerms.roleName,
          visiblePages: userWithPerms.visiblePages
        }
      };
    } catch (error) {
      logger.error('Registration error:', error);
      return {
        success: false,
        error: 'Erreur lors de la création du compte'
      };
    }
  }

  /**
   * Login with email/password
   */
  async login(email: string, password: string): Promise<LoginResult> {
    try {
      // Find user
      const user = await User.findOne({ 
        email: email.toLowerCase(),
        provider: 'local'
      });

      if (!user) {
        return {
          success: false,
          error: 'Email ou mot de passe incorrect'
        };
      }

      if (!user.isActive) {
        return {
          success: false,
          error: 'Ce compte a été désactivé'
        };
      }

      // Check password
      if (!user.password) {
        return {
          success: false,
          error: 'Ce compte utilise la connexion Microsoft'
        };
      }

      const isValidPassword = await this.comparePassword(password, user.password);
      if (!isValidPassword) {
        return {
          success: false,
          error: 'Email ou mot de passe incorrect'
        };
      }

      user.lastLogin = new Date();
      await user.save();
      await this.ensureSuperAdmin(user.email);

      const token = this.generateToken({
        userId: user._id.toString(),
        email: user.email,
        provider: 'local'
      });
      const userWithPerms = await this.buildUserWithPermissions(user);

      logger.info(`User logged in: ${email}`);

      return {
        success: true,
        token,
        user: {
          id: userWithPerms.id,
          email: userWithPerms.email,
          firstName: userWithPerms.firstName,
          lastName: userWithPerms.lastName,
          provider: userWithPerms.provider,
          role: userWithPerms.role ?? undefined,
          roleName: userWithPerms.roleName,
          visiblePages: userWithPerms.visiblePages
        }
      };
    } catch (error) {
      logger.error('Login error:', error);
      return {
        success: false,
        error: 'Erreur lors de la connexion'
      };
    }
  }

  /**
   * Handle Microsoft SSO callback
   */
  async handleMicrosoftSSO(
    microsoftId: string,
    email: string,
    firstName?: string,
    lastName?: string
  ): Promise<LoginResult> {
    try {
      // Find or create user
      let user = await User.findOne({
        $or: [
          { microsoftId },
          { email: email.toLowerCase(), provider: 'microsoft' }
        ]
      });

      let firstLogin = false;
      if (!user) {
        // Create new user from Microsoft SSO (must choose role on frontend)
        firstLogin = true;
        const newUser = await User.create({
          email: email.toLowerCase(),
          firstName,
          lastName,
          provider: 'microsoft',
          microsoftId,
          isActive: true
        });
        await this.ensureSuperAdmin(newUser.email);
        await this.assignDefaultRoleIfNeeded(newUser);
        const refreshed = await User.findById(newUser._id).select('-password');
        if (!refreshed) throw new Error('User not found after create');
        user = refreshed;
        logger.info(`New Microsoft SSO user created: ${email}`);
      } else {
        // Update last login and any changed info
        user.lastLogin = new Date();
        if (firstName) user.firstName = firstName;
        if (lastName) user.lastName = lastName;
        if (!user.microsoftId) user.microsoftId = microsoftId;
        await user.save();
      }

      if (!user.isActive) {
        return {
          success: false,
          error: 'Ce compte a été désactivé'
        };
      }

      await this.ensureSuperAdmin(user.email);
      const token = this.generateToken({
        userId: user._id.toString(),
        email: user.email,
        provider: 'microsoft'
      });
      const userWithPerms = await this.buildUserWithPermissions(user);

      logger.info(`Microsoft SSO login: ${email}`);

      return {
        success: true,
        token,
        firstLogin,
        user: {
          id: userWithPerms.id,
          email: userWithPerms.email,
          firstName: userWithPerms.firstName,
          lastName: userWithPerms.lastName,
          provider: userWithPerms.provider,
          role: userWithPerms.role ?? undefined,
          roleName: userWithPerms.roleName,
          visiblePages: userWithPerms.visiblePages
        }
      };
    } catch (error) {
      logger.error('Microsoft SSO error:', error);
      return {
        success: false,
        error: 'Erreur lors de la connexion Microsoft'
      };
    }
  }

  /**
   * Assign default role "Utilisateur" to user if not super_admin
   */
  async assignDefaultRoleIfNeeded(user: IUser): Promise<void> {
    if (user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) return;
    try {
      const defaultRole = await Role.findOne({ name: 'Utilisateur' });
      if (defaultRole) {
        await User.findByIdAndUpdate(user._id, { $set: { roleId: defaultRole._id }, $unset: { role: 1 } });
      }
    } catch (error) {
      logger.error('assignDefaultRoleIfNeeded error:', error);
    }
  }

  /**
   * Ensure user with this email is super_admin (for bdeguil-robin@adoria.com)
   */
  async ensureSuperAdmin(email: string): Promise<void> {
    if (email.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) return;
    try {
      const updated = await User.findOneAndUpdate(
        { email: email.toLowerCase() },
        { $set: { role: 'super_admin', roleId: null } },
        { new: true }
      );
      if (updated) logger.info(`Super admin role set for ${email}`);
    } catch (error) {
      logger.error('ensureSuperAdmin error:', error);
    }
  }

  /**
   * Get visible pages for a user (super_admin sees all including gestionUtilisateurs)
   */
  async getVisiblePages(user: IUser): Promise<IPageVisibilities> {
    if (user.role === 'super_admin') return ALL_PAGES_TRUE;
    if (user.roleId) {
      const role = await Role.findById(user.roleId).lean();
      if (role?.pageVisibilities) return role.pageVisibilities as IPageVisibilities;
    }
    return {
      dashboard: true,
      users: true,
      support: true,
      epics: true,
      marketing: true,
      produit: true,
      gestionUtilisateurs: false
    };
  }

  async buildUserWithPermissions(user: IUser): Promise<{ id: string; email: string; firstName?: string; lastName?: string; provider: string; role: 'super_admin' | string | null; roleName: string; visiblePages: IPageVisibilities }> {
    const visiblePages = await this.getVisiblePages(user);
    let roleName = 'Utilisateur';
    const role: 'super_admin' | string | null = user.role ?? (user.roleId ? user.roleId.toString() : null);
    if (user.role === 'super_admin') roleName = 'Super admin';
    else if (user.roleId) {
      const r = await Role.findById(user.roleId);
      if (r) roleName = r.name;
    }
    return {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      provider: user.provider,
      role: role ?? null,
      roleName,
      visiblePages
    };
  }

  /**
   * Set current user's role (for first-login role selection). Only allowed if user is not super_admin.
   */
  async setMyRole(userId: string, roleId: string): Promise<{ success: boolean; user?: LoginResult['user']; error?: string }> {
    try {
      const user = await User.findById(userId).select('-password');
      if (!user) return { success: false, error: 'Utilisateur non trouvé' };
      if (user.role === 'super_admin') return { success: false, error: 'Le rôle ne peut pas être modifié' };
      const role = await Role.findById(roleId);
      if (!role) return { success: false, error: 'Rôle invalide' };
      user.role = undefined;
      user.roleId = role._id;
      await user.save();
      const withPerms = await this.buildUserWithPermissions(user);
      return {
        success: true,
        user: {
          id: withPerms.id,
          email: withPerms.email,
          firstName: withPerms.firstName,
          lastName: withPerms.lastName,
          provider: withPerms.provider,
          role: withPerms.role ?? undefined,
          roleName: withPerms.roleName,
          visiblePages: withPerms.visiblePages
        }
      };
    } catch (error) {
      logger.error('setMyRole error:', error);
      return { success: false, error: 'Erreur serveur' };
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<IUser | null> {
    try {
      return await User.findById(userId).select('-password');
    } catch (error) {
      logger.error('Get user error:', error);
      return null;
    }
  }
}

export const authService = new AuthService();

