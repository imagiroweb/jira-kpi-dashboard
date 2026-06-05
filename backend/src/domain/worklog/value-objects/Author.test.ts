import { Author } from './Author';

describe('Author', () => {
  it('create remplace displayName vide par Unknown', () => {
    const a = Author.create('id1', '');
    expect(a.displayName).toBe('Unknown');
  });

  it('unknown() fabrique un auteur inconnu', () => {
    const u = Author.unknown();
    expect(u.accountId).toBe('unknown');
    expect(u.displayName).toBe('Unknown User');
  });

  it('rejette accountId vide', () => {
    expect(() => Author.create('', 'Name')).toThrow(/accountId is required/);
  });

  it('initials sur plusieurs mots', () => {
    expect(Author.create('1', 'Jean Dupont').initials).toBe('JD');
    expect(Author.create('2', 'Single').initials).toBe('S');
  });

  it('equals, toString, toJSON', () => {
    const a = Author.create('x', 'Bob', 'http://avatar');
    const b = Author.create('x', 'Other');
    expect(a.equals(b)).toBe(true);
    expect(a.toString()).toBe('Bob');
    expect(a.toJSON()).toEqual({ accountId: 'x', displayName: 'Bob', avatarUrl: 'http://avatar' });
  });
});
