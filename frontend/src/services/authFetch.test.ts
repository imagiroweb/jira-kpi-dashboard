import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authFetch } from './authFetch';

describe('authFetch', () => {
  const mockFetch = vi.fn().mockResolvedValue(new Response('{}'));

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockClear();
    localStorage.clear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('ajoute le jeton de session en en-tête Authorization', async () => {
    localStorage.setItem('auth_token', 'jwt-123');

    await authFetch('/api/worklog/search?x=1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/worklog/search?x=1');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer jwt-123');
  });

  it('n’ajoute rien sans jeton et conserve les options', async () => {
    await authFetch('/api/x', { method: 'POST', headers: { 'X-Test': '1' } });

    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(init.method).toBe('POST');
    expect(headers.get('X-Test')).toBe('1');
    expect(headers.has('Authorization')).toBe(false);
  });
});
