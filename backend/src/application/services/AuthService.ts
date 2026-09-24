import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { User, IUser } from '../../domain/user/entities/User';
import { Role, IPageVisibilities, PAGE_IDS } from '../../domain/user/entities/Role';
import { Team } from '../../domain/team/entities/Team';
import { Organization } from '../../domain/organization/entities/Organization';
import { isEmailDomainAllowed } from '../../domain/organization/emailDomain';
import { UserActivityLog } from '../../domain/user/entities/UserActivityLog';
import { emailService } from '../../infrastructure/email/NodemailerEmailService';
import type { MicrosoftIdentity } from '../../infrastructure/microsoft/MicrosoftIdTokenVerifier';
import { logger } from '../../utils/logger';

const SUPER_ADMIN_EMAIL = 'bdeguil-robin@adoria.com';

/** Validité du lien d'invitation d'un compte local (72 h). */
const INVITATION_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

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
    /** Portée CTO sur la section Performance — voir `Role.performanceGlobalAccess`. */
    performanceGlobalAccess?: boolean;
    /** Équipe actuelle du collaborateur — voir `User.teamId`. */
    teamId?: string | null;
    /** Ids des équipes où ce collaborateur figure dans `Team.leadIds`. */
    leadTeamIds?: string[];
    /** Droit délégué de rattacher un collaborateur à sa propre équipe — voir `User.canManageTeamAssignment`. */
    canManageTeamAssignment?: boolean;
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

    // Check for special characters (escape - so it is not interpreted as range in character class)
    const specialCharRegex = new RegExp(`[${PASSWORD_RULES.specialChars.replace(/[[\]\\^$.|?*+(){}-]/g, '\\$&')}]`);
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
   * Crée un compte local (email / mot de passe) dans l'organisation de l'administrateur, puis
   * envoie une invitation : lien de définition du mot de passe à usage unique (72 h).
   * Remplace l'inscription libre, supprimée pour raisons de sécurité : un compte n'existe que
   * rattaché à une organisation, via son SSO ou créé par l'un de ses administrateurs.
   */
  async inviteLocalUser(
    adminUserId: string,
    input: { email: string; firstName?: string; lastName?: string; roleId?: string }
  ): Promise<{ success: boolean; userId?: string; emailSent?: boolean; error?: string; status?: number }> {
    try {
      const admin = await User.findById(adminUserId).select('organizationId').lean();
      if (!admin?.organizationId) {
        return { success: false, status: 400, error: 'Administrateur sans organisation' };
      }
      const organization = await Organization.findById(admin.organizationId).lean();
      if (!organization || !organization.isActive) {
        return { success: false, status: 400, error: 'Organisation introuvable ou inactive' };
      }
      if (!organization.allowLocalAccounts) {
        return {
          success: false,
          status: 400,
          error: 'Les comptes locaux ne sont pas autorisés pour cette organisation (connexion SSO uniquement)'
        };
      }

      const email = input.email.trim().toLowerCase();
      if (!isEmailDomainAllowed(email, organization.allowedEmailDomains)) {
        return { success: false, status: 400, error: 'Domaine d’email non autorisé pour cette organisation' };
      }
      if (await User.exists({ email })) {
        return { success: false, status: 409, error: 'Un compte existe déjà avec cet email' };
      }

      let roleId: IUser['roleId'] | undefined;
      if (input.roleId) {
        const role = await Role.findById(input.roleId).select('_id').lean();
        if (!role) return { success: false, status: 400, error: 'Rôle invalide' };
        roleId = role._id as IUser['roleId'];
      }

      // Mot de passe aléatoire inutilisable : l'utilisateur définit le sien via le lien d'invitation.
      const unusablePassword = await this.hashPassword(crypto.randomBytes(32).toString('base64url'));
      const user = await User.create({
        email,
        password: unusablePassword,
        firstName: input.firstName,
        lastName: input.lastName,
        provider: 'local',
        isActive: true,
        organizationId: organization._id
      });
      if (roleId) {
        await User.updateOne({ _id: user._id }, { $set: { roleId } });
      } else {
        await this.assignDefaultRoleIfNeeded(user);
      }

      const { plainToken } = await this.issuePasswordToken(user._id, INVITATION_TOKEN_TTL_MS);
      const emailSent = await emailService.sendAccountInvitationEmail(
        { email: user.email, firstName: user.firstName },
        this.passwordLinkUrl(plainToken),
        INVITATION_TOKEN_TTL_MS / 3_600_000
      );

      logger.info(`Compte local créé par invitation : ${user._id} (organisation ${organization.slug})`);
      return { success: true, userId: String(user._id), emailSent };
    } catch (error) {
      logger.error('inviteLocalUser error:', error);
      return { success: false, status: 500, error: 'Erreur lors de la création du compte' };
    }
  }

  /** Génère un jeton de (ré)initialisation du mot de passe ; seul son hash SHA-256 est stocké. */
  private async issuePasswordToken(
    userId: IUser['_id'],
    ttlMs: number
  ): Promise<{ plainToken: string }> {
    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    await User.updateOne(
      { _id: userId },
      { $set: { passwordResetToken: tokenHash, passwordResetExpires: new Date(Date.now() + ttlMs) } }
    );
    return { plainToken };
  }

  private passwordLinkUrl(plainToken: string): string {
    const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
    return `${appBaseUrl}/reset-password?token=${plainToken}`;
  }

  /**
   * La connexion par mot de passe est-elle autorisée pour l'organisation de cet utilisateur ?
   */
  private async isLocalLoginAllowed(user: IUser): Promise<boolean> {
    if (!user.organizationId) return false;
    const organization = await Organization.findById(user.organizationId)
      .select('isActive allowLocalAccounts')
      .lean();
    return Boolean(organization?.isActive && organization.allowLocalAccounts);
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

      if (!(await this.isLocalLoginAllowed(user))) {
        return {
          success: false,
          error: 'La connexion par mot de passe n’est pas autorisée pour votre organisation : utilisez la connexion SSO'
        };
      }

      user.lastLogin = new Date();
      await user.save();
      await this.ensureSuperAdmin(user.email);

      await this.logLoginOncePerMinute(user._id);

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
          visiblePages: userWithPerms.visiblePages,
          performanceGlobalAccess: userWithPerms.performanceGlobalAccess,
          teamId: userWithPerms.teamId,
          leadTeamIds: userWithPerms.leadTeamIds,
          canManageTeamAssignment: userWithPerms.canManageTeamAssignment
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
   * Connexion SSO Microsoft à partir d'une identité issue d'un id_token déjà validé
   * (signature, audience, émetteur, nonce — voir MicrosoftIdTokenVerifier).
   *
   * Liste blanche des tenants : le `tid` du jeton doit correspondre à une organisation active ;
   * l'email doit appartenir à ses domaines autorisés. L'utilisateur est identifié par son `oid`
   * (immuable), l'email ne sert qu'à rattacher un compte SSO existant de la même organisation.
   */
  async handleMicrosoftSSO(identity: MicrosoftIdentity): Promise<LoginResult & { status?: number }> {
    try {
      const organization = await Organization.findOne({
        isActive: true,
        sso: { $elemMatch: { provider: 'microsoft', tenantId: identity.tenantId } }
      }).lean();
      if (!organization) {
        logger.warn(`SSO Microsoft refusé : tenant non autorisé (${identity.tenantId})`);
        return {
          success: false,
          status: 403,
          error: 'Votre organisation n’est pas autorisée à se connecter à cette application'
        };
      }

      const normalizedEmail = identity.email;
      if (!normalizedEmail) {
        return { success: false, status: 401, error: 'Profil Microsoft sans adresse e-mail exploitable' };
      }
      if (!isEmailDomainAllowed(normalizedEmail, organization.allowedEmailDomains)) {
        logger.warn(`SSO Microsoft refusé : domaine non autorisé pour l’organisation ${organization.slug}`);
        return { success: false, status: 403, error: 'Domaine d’email non autorisé pour votre organisation' };
      }

      const orgId = String(organization._id);
      let user = await User.findOne({
        $or: [
          { microsoftId: identity.objectId },
          { email: normalizedEmail, provider: 'microsoft' },
        ],
      });

      if (user && user.organizationId && String(user.organizationId) !== orgId) {
        logger.warn(`SSO Microsoft refusé : compte ${user._id} rattaché à une autre organisation`);
        return { success: false, status: 403, error: 'Ce compte appartient à une autre organisation' };
      }

      let firstLogin = false;
      if (!user) {
        // Nouveau compte SSO : rôle par défaut « Utilisateur », les accès sont attribués par un administrateur.
        firstLogin = true;
        const newUser = await User.create({
          email: normalizedEmail,
          firstName: identity.firstName,
          lastName: identity.lastName,
          provider: 'microsoft',
          microsoftId: identity.objectId,
          isActive: true,
          organizationId: organization._id,
        });
        await this.assignDefaultRoleIfNeeded(newUser);
        const refreshed = await User.findById(newUser._id).select('-password');
        if (!refreshed) throw new Error('User not found after create');
        user = refreshed;
        logger.info(`Nouveau compte SSO Microsoft : ${user._id} (organisation ${organization.slug})`);
      } else {
        user.lastLogin = new Date();
        if (identity.firstName) user.firstName = identity.firstName;
        if (identity.lastName) user.lastName = identity.lastName;
        if (!user.microsoftId) user.microsoftId = identity.objectId;
        if (!user.organizationId) user.organizationId = organization._id as IUser['organizationId'];
        await user.save();
      }

      if (!user.isActive) {
        return {
          success: false,
          status: 401,
          error: 'Ce compte a été désactivé',
        };
      }

      await this.logLoginOncePerMinute(user._id);

      const token = this.generateToken({
        userId: user._id.toString(),
        email: user.email,
        provider: 'microsoft',
      });
      const userWithPerms = await this.buildUserWithPermissions(user);

      logger.info(`Connexion SSO Microsoft : ${user._id}`);

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
          visiblePages: userWithPerms.visiblePages,
          performanceGlobalAccess: userWithPerms.performanceGlobalAccess,
          teamId: userWithPerms.teamId,
          leadTeamIds: userWithPerms.leadTeamIds,
          canManageTeamAssignment: userWithPerms.canManageTeamAssignment
        }
      };
    } catch (error) {
      logger.error('Microsoft SSO error:', error);
      return {
        success: false,
        status: 500,
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
   * Log a login event at most once per user per minute (avoids duplicate logs from double frontend calls).
   */
  private async logLoginOncePerMinute(userId: IUser['_id']): Promise<void> {
    try {
      const oneMinuteAgo = new Date(Date.now() - 60_000);
      const existing = await UserActivityLog.findOne({
        userId,
        type: 'login',
        timestamp: { $gte: oneMinuteAgo }
      });
      if (existing) return;
      await UserActivityLog.create({
        userId,
        type: 'login',
        timestamp: new Date()
      });
    } catch (err) {
      logger.error('Failed to log user login activity', err);
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
      pointHebdo: true,
      gestionUtilisateurs: false,
      performance: true,
      performanceDashboard: false,
      couts: false
    };
  }

  async buildUserWithPermissions(user: IUser): Promise<{
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    provider: string;
    role: 'super_admin' | string | null;
    roleName: string;
    visiblePages: IPageVisibilities;
    performanceGlobalAccess: boolean;
    teamId: string | null;
    leadTeamIds: string[];
    canManageTeamAssignment: boolean;
  }> {
    const visiblePages = await this.getVisiblePages(user);
    let roleName = 'Utilisateur';
    let performanceGlobalAccess = user.role === 'super_admin';
    const role: 'super_admin' | string | null = user.role ?? (user.roleId ? user.roleId.toString() : null);
    if (user.role === 'super_admin') {
      roleName = 'Super admin';
    } else if (user.roleId) {
      const r = await Role.findById(user.roleId);
      if (r) {
        roleName = r.name;
        performanceGlobalAccess = r.performanceGlobalAccess ?? false;
      }
    }

    const ledTeams = await Team.find({ leadIds: user._id }).select('_id').lean();

    return {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      provider: user.provider,
      role: role ?? null,
      roleName,
      visiblePages,
      performanceGlobalAccess,
      teamId: user.teamId ? user.teamId.toString() : null,
      leadTeamIds: ledTeams.map((t) => String(t._id)),
      canManageTeamAssignment: user.canManageTeamAssignment ?? false
    };
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

  /**
   * Demande de réinitialisation de mot de passe.
   * Génère un token sécurisé, stocke son hash SHA-256 en DB et envoie l'email.
   * Répond toujours avec succès pour éviter l'énumération d'emails (RGPD / sécurité).
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await User.findOne({
        email: email.toLowerCase(),
        provider: 'local'
      }).select('+passwordResetToken +passwordResetExpires');

      // Toujours répondre avec succès — ne pas révéler si l'email existe
      if (!user || !user.isActive) {
        return { success: true };
      }

      // Token aléatoire 32 octets (64 caractères hex) — seul son hash est stocké, valide 1 heure
      const { plainToken } = await this.issuePasswordToken(user._id, 60 * 60 * 1000);
      const resetUrl = this.passwordLinkUrl(plainToken);

      const sent = await emailService.sendPasswordResetEmail(
        { email: user.email, firstName: user.firstName },
        resetUrl
      );

      if (!sent) {
        // Annuler le token pour ne pas laisser l'état incohérent
        await User.updateOne(
          { _id: user._id },
          { $unset: { passwordResetToken: '', passwordResetExpires: '' } }
        );
        // Log la tentative échouée
        await UserActivityLog.create({
          userId: user._id,
          type: 'password_reset_request',
          timestamp: new Date(),
          meta: { emailSent: false }
        });
        return {
          success: false,
          error: 'Impossible d\'envoyer l\'email de réinitialisation. Vérifiez la configuration SMTP.'
        };
      }

      // Log la demande réussie
      await UserActivityLog.create({
        userId: user._id,
        type: 'password_reset_request',
        timestamp: new Date(),
        meta: { emailSent: true }
      });

      logger.info(`Demande de réinitialisation de mot de passe pour : ${user.email}`);
      return { success: true };
    } catch (error) {
      logger.error('requestPasswordReset error:', error);
      return { success: false, error: 'Erreur serveur lors de la demande de réinitialisation' };
    }
  }

  /**
   * Réinitialise le mot de passe via un token valide (usage unique, expire en 1h).
   */
  async resetPassword(plainToken: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const validation = this.validatePassword(newPassword);
      if (!validation.isValid) {
        return { success: false, error: validation.errors.join('. ') };
      }

      const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');

      const user = await User.findOne({
        passwordResetToken: tokenHash,
        passwordResetExpires: { $gt: new Date() }
      }).select('+passwordResetToken +passwordResetExpires');

      if (!user) {
        return {
          success: false,
          error: 'Ce lien de réinitialisation est invalide ou a expiré.'
        };
      }

      const userId = user._id;
      const hashedPassword = await this.hashPassword(newPassword);

      await User.updateOne(
        { _id: userId },
        {
          $set: { password: hashedPassword },
          $unset: { passwordResetToken: '', passwordResetExpires: '' }
        }
      );

      await UserActivityLog.create({
        userId,
        type: 'password_reset_complete',
        timestamp: new Date()
      });

      logger.info(`Mot de passe réinitialisé pour : ${user.email}`);
      return { success: true };
    } catch (error) {
      logger.error('resetPassword error:', error);
      return { success: false, error: 'Erreur serveur lors de la réinitialisation du mot de passe' };
    }
  }
}

export const authService = new AuthService();

