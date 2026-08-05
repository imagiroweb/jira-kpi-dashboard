import { sanitizeMicrosoftAccessToken } from './sanitizeMicrosoftAccessToken';

describe('sanitizeMicrosoftAccessToken (TU)', () => {
  it('accepte un token valide', () => {
    expect(sanitizeMicrosoftAccessToken('  eyJhbGciOiJSUzI1NiJ9.payload.sig  ')).toBe(
      'eyJhbGciOiJSUzI1NiJ9.payload.sig'
    );
  });

  it('rejette JSON, espaces internes, CR/LF et types invalides', () => {
    expect(sanitizeMicrosoftAccessToken('{"a":1}')).toBeNull();
    expect(sanitizeMicrosoftAccessToken('tok en')).toBeNull();
    expect(sanitizeMicrosoftAccessToken('tok\nen')).toBeNull();
    expect(sanitizeMicrosoftAccessToken('tok{en')).toBeNull();
    expect(sanitizeMicrosoftAccessToken(null)).toBeNull();
    expect(sanitizeMicrosoftAccessToken(undefined)).toBeNull();
    expect(sanitizeMicrosoftAccessToken({ token: 'x' })).toBeNull();
    expect(sanitizeMicrosoftAccessToken('')).toBeNull();
  });
});
