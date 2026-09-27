/**
 * TU — Domaines d'email d'une organisation
 */
import { emailDomain, isEmailDomainAllowed, normalizeEmailDomains } from './emailDomain';

describe('emailDomain', () => {
  it('extrait le domaine en minuscules', () => {
    expect(emailDomain('Jean.Dupont@Adoria.COM')).toBe('adoria.com');
  });

  it('retourne null pour un email invalide', () => {
    expect(emailDomain('')).toBeNull();
    expect(emailDomain('sans-arobase')).toBeNull();
    expect(emailDomain('@adoria.com')).toBeNull();
    expect(emailDomain('jean@')).toBeNull();
  });
});

describe('normalizeEmailDomains', () => {
  it('accepte une liste CSV, retire @, espaces, vides et doublons', () => {
    expect(normalizeEmailDomains(' @Adoria.com, adoria.com,,imagiro.fr ')).toEqual(['adoria.com', 'imagiro.fr']);
  });

  it('accepte un tableau ou une valeur absente', () => {
    expect(normalizeEmailDomains(['A.fr', 'a.fr'])).toEqual(['a.fr']);
    expect(normalizeEmailDomains(undefined)).toEqual([]);
    expect(normalizeEmailDomains(null)).toEqual([]);
  });
});

describe('isEmailDomainAllowed', () => {
  it('autorise tout si la liste est vide', () => {
    expect(isEmailDomainAllowed('x@gmail.com', [])).toBe(true);
  });

  it('exige une correspondance exacte du domaine', () => {
    const domains = ['adoria.com'];
    expect(isEmailDomainAllowed('jean@adoria.com', domains)).toBe(true);
    expect(isEmailDomainAllowed('JEAN@ADORIA.COM', domains)).toBe(true);
    expect(isEmailDomainAllowed('jean@evil-adoria.com', domains)).toBe(false);
    expect(isEmailDomainAllowed('jean@adoria.com.evil.io', domains)).toBe(false);
    expect(isEmailDomainAllowed('jean@sub.adoria.com', domains)).toBe(false);
    expect(isEmailDomainAllowed('invalide', domains)).toBe(false);
  });
});
