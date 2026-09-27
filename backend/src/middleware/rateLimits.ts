import { Request } from 'express';
import rateLimit, { Options, RateLimitRequestHandler } from 'express-rate-limit';

/**
 * Limitations de débit des routes d'authentification (anti brute force / credential stuffing).
 * En plus du limiteur global (200 req/min/IP sur /api).
 *
 * Stockage en mémoire : suffisant pour une instance unique du backend. Pour plusieurs
 * instances, brancher un store partagé (Redis) via `store`.
 */

const MINUTE = 60 * 1000;

/** Désactivé pendant les tests de routes (les limiteurs sont testés à part, voir rateLimits.test.ts). */
const isTestEnv = () => process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_IN_TESTS !== 'true';

function tooMany(message: string) {
  return { success: false, error: message };
}

function normalizedEmail(req: Request): string {
  const raw = (req.body as { email?: unknown } | undefined)?.email;
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function limiter(options: Partial<Options>): RateLimitRequestHandler {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    skip: isTestEnv,
    ...options
  });
}

/** Échecs de connexion par couple IP + email : 5 par 15 minutes (les connexions réussies ne comptent pas). */
export function createLoginPerAccountLimiter(overrides: Partial<Options> = {}) {
  return limiter({
    windowMs: 15 * MINUTE,
    max: 5,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${req.ip}|${normalizedEmail(req)}`,
    message: tooMany('Trop de tentatives de connexion pour ce compte. Réessayez dans 15 minutes.'),
    ...overrides
  });
}

/** Échecs de connexion par IP, tous comptes confondus : 20 par 15 minutes (credential stuffing). */
export function createLoginPerIpLimiter(overrides: Partial<Options> = {}) {
  return limiter({
    windowMs: 15 * MINUTE,
    max: 20,
    skipSuccessfulRequests: true,
    message: tooMany('Trop de tentatives de connexion depuis cette adresse. Réessayez dans 15 minutes.'),
    ...overrides
  });
}

/** Demandes de lien de réinitialisation : 5 par IP par 15 minutes. */
export function createForgotPasswordLimiter(overrides: Partial<Options> = {}) {
  return limiter({
    windowMs: 15 * MINUTE,
    max: 5,
    message: tooMany('Trop de tentatives. Veuillez réessayer dans 15 minutes.'),
    ...overrides
  });
}

/** Utilisation d'un lien de réinitialisation / définition du mot de passe : 10 par IP par 15 minutes. */
export function createResetPasswordLimiter(overrides: Partial<Options> = {}) {
  return limiter({
    windowMs: 15 * MINUTE,
    max: 10,
    message: tooMany('Trop de tentatives de réinitialisation. Réessayez dans 15 minutes.'),
    ...overrides
  });
}

/** Retours SSO Microsoft : 20 par IP par 5 minutes. */
export function createSsoCallbackLimiter(overrides: Partial<Options> = {}) {
  return limiter({
    windowMs: 5 * MINUTE,
    max: 20,
    message: tooMany('Trop de tentatives de connexion SSO. Réessayez dans quelques minutes.'),
    ...overrides
  });
}

/** Routes publiques utilitaires (validation de mot de passe) : 30 par IP par minute. */
export function createPublicUtilityLimiter(overrides: Partial<Options> = {}) {
  return limiter({
    windowMs: MINUTE,
    max: 30,
    message: tooMany('Trop de requêtes. Réessayez dans une minute.'),
    ...overrides
  });
}

/** Invitations de comptes locaux : 20 par administrateur par heure. */
export function createInvitationLimiter(overrides: Partial<Options> = {}) {
  return limiter({
    windowMs: 60 * MINUTE,
    max: 20,
    keyGenerator: (req) => req.user?.userId ?? req.ip ?? 'anonymous',
    message: tooMany('Trop d’invitations envoyées. Réessayez dans une heure.'),
    ...overrides
  });
}

export const loginPerAccountLimiter = createLoginPerAccountLimiter();
export const loginPerIpLimiter = createLoginPerIpLimiter();
export const forgotPasswordLimiter = createForgotPasswordLimiter();
export const resetPasswordLimiter = createResetPasswordLimiter();
export const ssoCallbackLimiter = createSsoCallbackLimiter();
export const publicUtilityLimiter = createPublicUtilityLimiter();
export const invitationLimiter = createInvitationLimiter();
