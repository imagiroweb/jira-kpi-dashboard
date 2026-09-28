/**
 * TU — Cookie de session
 */
import jwt from 'jsonwebtoken';
import { isSecureCookieEnv, readCookie, sessionCookieName, setSessionCookie, clearSessionCookie } from './sessionCookie';

describe('sessionCookie', () => {
  const originalEnv = process.env;
  afterEach(() => {
    process.env = originalEnv;
  });

  it('utilise le préfixe __Host- et Secure en production', () => {
    expect(isSecureCookieEnv({ NODE_ENV: 'production' })).toBe(true);
    expect(sessionCookieName({ NODE_ENV: 'production' })).toBe('__Host-session');
    expect(sessionCookieName({ NODE_ENV: 'development' })).toBe('session');
    expect(isSecureCookieEnv({ NODE_ENV: 'development', SESSION_COOKIE_SECURE: 'true' })).toBe(true);
    expect(isSecureCookieEnv({ NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'false' })).toBe(false);
  });

  it('pose un cookie HttpOnly, SameSite=Strict, Path=/ dont la durée suit le JWT', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };
    const token = jwt.sign({ userId: 'u1' }, 's', { expiresIn: 3600 });

    setSessionCookie(res as never, token);

    const [name, value, options] = res.cookie.mock.calls[0];
    expect(name).toBe('__Host-session');
    expect(value).toBe(token);
    expect(options).toEqual(expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict', path: '/' }));
    expect(options.maxAge).toBeGreaterThan(3590 * 1000);
    expect(options.maxAge).toBeLessThanOrEqual(3600 * 1000);

    clearSessionCookie(res as never);
    expect(res.clearCookie).toHaveBeenCalledWith('__Host-session', expect.objectContaining({ httpOnly: true, path: '/' }));
  });

  it('lit un cookie dans un en-tête brut', () => {
    expect(readCookie('a=1; session=abc%2Bdef; b=2', 'session')).toBe('abc+def');
    expect(readCookie('xsession=1', 'session')).toBeNull();
    expect(readCookie(undefined, 'session')).toBeNull();
    expect(readCookie('session=', 'session')).toBeNull();
    expect(readCookie('session=%E0%A4%A', 'session')).toBeNull();
  });
});
