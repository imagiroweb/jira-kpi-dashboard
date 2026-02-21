import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authService } from '../application/services/AuthService';
import { authenticate, requireSuperAdmin } from '../middleware/authMiddleware';
import { User } from '../domain/user/entities/User';
import { Role, IPageVisibilities, PAGE_IDS } from '../domain/user/entities/Role';
import { logger } from '../utils/logger';

// Microsoft Graph API profile response type
interface MicrosoftGraphProfile {
  id: string;
  mail?: string;
  userPrincipalName: string;
  givenName?: string;
  surname?: string;
  displayName?: string;
}

const router = Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 12
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Validation error
 */
router.post(
  '/register',
  [
    body('email')
      .isEmail()
      .withMessage('Email invalide')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 12 })
      .withMessage('Le mot de passe doit contenir au moins 12 caractères'),
    body('firstName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Le prénom doit contenir entre 1 et 50 caractères'),
    body('lastName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Le nom doit contenir entre 1 et 50 caractères'),
    body('roleId')
      .optional()
      .isString()
      .withMessage('roleId invalide')
  ],
  async (req: Request, res: Response) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map((e: { msg?: string }) => e.msg)
        });
      }

      const { email, password, firstName, lastName, roleId } = req.body;

      const result = await authService.register(email, password, firstName, lastName, roleId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      res.status(201).json({
        success: true,
        token: result.token,
        user: result.user,
        firstLogin: result.firstLogin
      });
    } catch (error) {
      logger.error('Registration route error:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur serveur lors de la création du compte'
      });
    }
  }
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post(
  '/login',
  [
    body('email')
      .isEmail()
      .withMessage('Email invalide')
      .normalizeEmail(),
    body('password')
      .notEmpty()
      .withMessage('Mot de passe requis')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map(e => e.msg)
        });
      }

      const { email, password } = req.body;

      const result = await authService.login(email, password);

      if (!result.success) {
        return res.status(401).json({
          success: false,
          error: result.error
        });
      }

      res.json({
        success: true,
        token: result.token,
        user: result.user
      });
    } catch (error) {
      logger.error('Login route error:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur serveur lors de la connexion'
      });
    }
  }
);

/**
 * @swagger
 * /api/auth/validate-password:
 *   post:
 *     summary: Validate password strength
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password validation result
 */
router.post(
  '/validate-password',
  [body('password').isString().withMessage('Mot de passe requis')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map(e => e.msg)
        });
      }

      const { password } = req.body;
      const validation = authService.validatePassword(password);

      res.json({
        success: true,
        validation
      });
    } catch (error) {
      logger.error('Password validation error:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur de validation'
      });
    }
  }
);

/**
 * @swagger
 * /api/auth/microsoft/callback:
 *   post:
 *     summary: Handle Microsoft SSO callback
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accessToken
 *             properties:
 *               accessToken:
 *                 type: string
 *                 description: Microsoft access token
 *     responses:
 *       200:
 *         description: SSO login successful
 *       401:
 *         description: Invalid token
 */
router.post('/microsoft/callback', async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Token Microsoft manquant'
      });
    }

    // Verify the token with Microsoft Graph API
    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!graphResponse.ok) {
      return res.status(401).json({
        success: false,
        error: 'Token Microsoft invalide'
      });
    }

    const profile = await graphResponse.json() as MicrosoftGraphProfile;

    // Handle SSO login/registration
    const result = await authService.handleMicrosoftSSO(
      profile.id,
      profile.mail || profile.userPrincipalName,
      profile.givenName,
      profile.surname
    );

    if (!result.success) {
      return res.status(401).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      token: result.token,
      user: result.user,
      firstLogin: result.firstLogin
    });
  } catch (error) {
    logger.error('Microsoft SSO callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la connexion Microsoft'
    });
  }
});

/**
 * @swagger
 * /api/auth/roles/for-signup:
 *   get:
 *     summary: List roles for signup / first-login role selection (no auth)
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: List of roles (id, name)
 */
router.get('/roles/for-signup', async (_req: Request, res: Response) => {
  try {
    const roles = await Role.find().select('name').lean();
    res.json({
      success: true,
      roles: roles.map((r: { _id: { toString: () => string }; name: string }) => ({ id: r._id.toString(), name: r.name }))
    });
  } catch (error) {
    logger.error('Roles for signup error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/**
 * @swagger
 * /api/auth/microsoft/config:
 *   get:
 *     summary: Get Microsoft SSO configuration
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Microsoft SSO configuration
 */
router.get('/microsoft/config', (req: Request, res: Response) => {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
  
  if (!clientId) {
    return res.status(503).json({
      success: false,
      error: 'Microsoft SSO non configuré',
      enabled: false
    });
  }

  res.json({
    success: true,
    enabled: true,
    clientId,
    tenantId,
    redirectUri: process.env.MICROSOFT_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/auth/microsoft/callback`
  });
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user info
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user info
 *       401:
 *         description: Not authenticated
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await authService.getUserById(req.user!.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const withPerms = await authService.buildUserWithPermissions(user);

    res.json({
      success: true,
      user: {
        id: withPerms.id,
        email: withPerms.email,
        firstName: withPerms.firstName,
        lastName: withPerms.lastName,
        provider: withPerms.provider,
        lastLogin: user.lastLogin,
        role: withPerms.role,
        roleName: withPerms.roleName,
        visiblePages: withPerms.visiblePages
      }
    });
  } catch (error) {
    logger.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

/**
 * @swagger
 * /api/auth/me/role:
 *   patch:
 *     summary: Set current user role (first-login selection)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId]
 *             properties:
 *               roleId: { type: string }
 *     responses:
 *       200:
 *         description: Role updated
 *       400:
 *         description: Invalid role or not allowed
 */
router.patch(
  '/me/role',
  authenticate,
  [body('roleId').isString().notEmpty().withMessage('roleId requis')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array().map((e: { msg?: string }) => e.msg) });
      }
      const { roleId } = req.body;
      const result = await authService.setMyRole(req.user!.userId, roleId);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      res.json({ success: true, user: result.user });
    } catch (error) {
      logger.error('Set my role error:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
);

/**
 * @swagger
 * /api/auth/verify:
 *   get:
 *     summary: Verify JWT token validity
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *       401:
 *         description: Token is invalid
 */
router.get('/verify', authenticate, (req: Request, res: Response) => {
  res.json({
    success: true,
    valid: true,
    user: req.user
  });
});

// ---------- Super admin: user & role management ----------

/**
 * GET /api/auth/users - List all users with role (super_admin only)
 */
router.get('/users', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const users = await User.find().select('-password').populate('roleId', 'name').lean();
    const roles = await Role.find().lean();
    const list = users.map((u: { _id: { toString: () => string }; email: string; firstName?: string; lastName?: string; roleId?: { toString: () => string }; role?: string }) => ({
      id: u._id.toString(),
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      provider: u.provider,
      isActive: u.isActive,
      role: u.role ?? null,
      roleId: u.roleId ? (u.roleId._id ?? u.roleId).toString() : null,
      roleName: u.role === 'super_admin' ? 'Super admin' : (u.roleId?.name ?? '—')
    }));
    res.json({ success: true, users: list, roles: roles.map((r: { _id: { toString: () => string }; name: string; pageVisibilities?: unknown }) => ({ id: r._id.toString(), name: r.name, pageVisibilities: r.pageVisibilities })) });
  } catch (error) {
    logger.error('List users error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/**
 * PATCH /api/auth/users/:id - Update user role (super_admin only)
 */
router.patch(
  '/users/:id',
  authenticate,
  requireSuperAdmin,
  [body('role').optional().isIn(['super_admin']).withMessage('role invalide'), body('roleId').optional()],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array().map((e: { msg?: string }) => e.msg) });
      const { id } = req.params;
      const { role, roleId } = req.body;
      const user = await User.findById(id);
      if (!user) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
      if (role === 'super_admin') {
        user.role = 'super_admin';
        user.roleId = undefined;
      } else if (roleId !== undefined) {
        if (roleId === null || roleId === '') {
          user.role = undefined;
          user.roleId = undefined;
        } else {
          const roleExists = await Role.findById(roleId);
          if (!roleExists) return res.status(400).json({ success: false, error: 'Rôle non trouvé' });
          user.role = undefined;
          user.roleId = roleExists._id;
        }
      }
      await user.save();
      const withPerms = await authService.buildUserWithPermissions(user);
      res.json({
        success: true,
        user: {
          id: withPerms.id,
          email: withPerms.email,
          firstName: withPerms.firstName,
          lastName: withPerms.lastName,
          provider: withPerms.provider,
          role: withPerms.role,
          roleName: withPerms.roleName,
          visiblePages: withPerms.visiblePages
        }
      });
    } catch (error) {
      logger.error('Update user role error:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
);

/**
 * GET /api/auth/roles - List roles with page visibilities (super_admin only)
 */
router.get('/roles', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const roles = await Role.find().lean();
    res.json({
      success: true,
      roles: roles.map((r) => ({
        id: r._id.toString(),
        name: r.name,
        pageVisibilities: r.pageVisibilities
      }))
    });
  } catch (error) {
    logger.error('List roles error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

const pageVisibilitiesValidator = () =>
  body('pageVisibilities')
    .optional()
    .isObject()
    .custom((v) => {
      for (const key of PAGE_IDS) {
        if (typeof (v as Record<string, unknown>)[key] !== 'boolean') return false;
      }
      return true;
    })
    .withMessage('pageVisibilities doit contenir les clés: ' + PAGE_IDS.join(', '));

/**
 * POST /api/auth/roles - Create role (super_admin only)
 */
router.post(
  '/roles',
  authenticate,
  requireSuperAdmin,
  [body('name').trim().notEmpty().withMessage('Nom requis'), pageVisibilitiesValidator()],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array().map((e) => e.msg) });
      const { name, pageVisibilities } = req.body;
      const existing = await Role.findOne({ name });
      if (existing) return res.status(400).json({ success: false, error: 'Un rôle avec ce nom existe déjà' });
      const role = await Role.create({
        name,
        pageVisibilities: pageVisibilities ?? {
          dashboard: true,
          users: true,
          support: true,
          epics: true,
          marketing: true,
          produit: true,
          gestionUtilisateurs: false
        }
      });
      res.status(201).json({
        success: true,
        role: { id: role._id.toString(), name: role.name, pageVisibilities: role.pageVisibilities }
      });
    } catch (error) {
      logger.error('Create role error:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
);

/**
 * PATCH /api/auth/roles/:id - Update role (super_admin only)
 */
router.patch(
  '/roles/:id',
  authenticate,
  requireSuperAdmin,
  [body('name').optional().trim().notEmpty(), pageVisibilitiesValidator()],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array().map((e) => e.msg) });
      const { id } = req.params;
      const { name, pageVisibilities } = req.body;
      const role = await Role.findById(id);
      if (!role) return res.status(404).json({ success: false, error: 'Rôle non trouvé' });
      if (name !== undefined) role.name = name;
      if (pageVisibilities !== undefined) role.pageVisibilities = pageVisibilities as IPageVisibilities;
      await role.save();
      res.json({
        success: true,
        role: { id: role._id.toString(), name: role.name, pageVisibilities: role.pageVisibilities }
      });
    } catch (error) {
      logger.error('Update role error:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
);

export { router as authRoutes };

