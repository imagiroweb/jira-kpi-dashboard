import type { Response } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Cookie de session : le JWT n'est plus exposé au JavaScript du navigateur (localStorage,
 * vulnérable au XSS) mais transporté dans un cookie HttpOnly, Secure, SameSite=Strict.
 *
 * En HTTPS (production / préprod), préfixe `__Host-` : le navigateur impose Secure, Path=/ et
 * l'absence de Domain (cookie limité à l'hôte exact, non partageable avec un sous-domaine).
 */
export function isSecureCookieEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SESSION_COOKIE_SECURE === 'false') return false;
  return env.NODE_ENV === 'production' || env.SESSION_COOKIE_SECURE === 'true';
}

export function sessionCookieName(env: NodeJS.ProcessEnv = process.env): string {
  return isSecureCookieEnv(env) ? '__Host-session' : 'session';
}

function cookieOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    httpOnly: true,
    secure: isSecureCookieEnv(env),
    sameSite: 'strict' as const,
    path: '/'
  };
}

/** Pose le cookie de session ; sa durée suit l'expiration du JWT. */
export function setSessionCookie(res: Response, token: string): void {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  const maxAge = decoded?.exp ? Math.max(0, decoded.exp * 1000 - Date.now()) : undefined;
  res.cookie(sessionCookieName(), token, { ...cookieOptions(), ...(maxAge !== undefined ? { maxAge } : {}) });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(sessionCookieName(), cookieOptions());
}

/** Lit un cookie dans un en-tête `Cookie` brut (sans dépendance cookie-parser). */
export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(value) || null;
    } catch {
      return null;
    }
  }
  return null;
}

export function readSessionCookie(cookieHeader: string | undefined): string | null {
  return readCookie(cookieHeader, sessionCookieName());
}
