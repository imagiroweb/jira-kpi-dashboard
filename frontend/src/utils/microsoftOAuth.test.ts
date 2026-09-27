import { beforeEach, describe, expect, it } from 'vitest';
import {
  consumeOAuthRequestState,
  createOAuthRequestState,
  isSafeMicrosoftAccessToken,
  parseOAuthFragment
} from './microsoftOAuth';

describe('parseOAuthFragment', () => {
  it('parse access_token et préserve les +', () => {
    const params = parseOAuthFragment('#access_token=abc+def/ghi&token_type=Bearer');
    expect(params.access_token).toBe('abc+def/ghi');
    expect(params.token_type).toBe('Bearer');
  });

  it('décode les séquences percent-encoding', () => {
    const params = parseOAuthFragment(
      '#error=access_denied&error_description=Connexion%20annul%C3%A9e'
    );
    expect(params.error).toBe('access_denied');
    expect(params.error_description).toBe('Connexion annulée');
  });

  it('retourne {} pour un hash vide', () => {
    expect(parseOAuthFragment('')).toEqual({});
    expect(parseOAuthFragment('#')).toEqual({});
  });
});

describe('isSafeMicrosoftAccessToken', () => {
  it('accepte un token opaque / JWT typique', () => {
    expect(isSafeMicrosoftAccessToken('eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.sig')).toBe(true);
    expect(isSafeMicrosoftAccessToken('EwBYA8l6BAAU...')).toBe(true);
  });

  it('rejette JSON, espaces, CR/LF et non-string', () => {
    expect(isSafeMicrosoftAccessToken('{"access_token":"x"}')).toBe(false);
    expect(isSafeMicrosoftAccessToken('tok en')).toBe(false);
    expect(isSafeMicrosoftAccessToken('tok\nen')).toBe(false);
    expect(isSafeMicrosoftAccessToken('tok{en')).toBe(false);
    expect(isSafeMicrosoftAccessToken(null)).toBe(false);
    expect(isSafeMicrosoftAccessToken(undefined)).toBe(false);
    expect(isSafeMicrosoftAccessToken({ access_token: 'x' })).toBe(false);
  });
});

describe('createOAuthRequestState / consumeOAuthRequestState', () => {
  beforeEach(() => sessionStorage.clear());

  it('mémorise state et nonce puis les restitue une seule fois', () => {
    const { state, nonce } = createOAuthRequestState();
    expect(state).not.toBe(nonce);

    expect(consumeOAuthRequestState(state)).toEqual({ nonce });
    expect(consumeOAuthRequestState(state)).toBeNull();
  });

  it('refuse un state différent et efface la demande', () => {
    createOAuthRequestState();

    expect(consumeOAuthRequestState('autre')).toBeNull();
    expect(sessionStorage.getItem('ms_oauth_nonce')).toBeNull();
  });

  it('refuse un state absent', () => {
    createOAuthRequestState();
    expect(consumeOAuthRequestState(undefined)).toBeNull();
  });
});
