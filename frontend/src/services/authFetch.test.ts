import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authFetch } from './authFetch';

describe('authFetch', () => {
  const mockFetch = vi.fn().mockResolvedValue(new Response('{}'));

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockClear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('envoie le cookie de session (credentials: include) sans en-tête Authorization', async () => {
    localStorage.setItem('auth_token', 'ancien-jwt');

    await authFetch('/api/worklog/search?x=1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/worklog/search?x=1');
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    localStorage.clear();
  });

  it('conserve les options fournies', async () => {
    await authFetch('/api/x', { method: 'POST', headers: { 'X-Test': '1' } });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('X-Test')).toBe('1');
  });
});
