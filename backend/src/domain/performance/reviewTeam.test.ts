import { toIdString, uniqueLeadTeamByUser } from './reviewTeam';

describe('toIdString', () => {
  it('garde une string', () => {
    expect(toIdString('507f1f77bcf86cd799439a01')).toBe('507f1f77bcf86cd799439a01');
  });

  it('normalise un ObjectId-like', () => {
    expect(toIdString({ toString: () => '507f1f77bcf86cd799439a01' })).toBe('507f1f77bcf86cd799439a01');
  });

  it('ignore les valeurs vides', () => {
    expect(toIdString(null)).toBeUndefined();
    expect(toIdString('')).toBeUndefined();
    expect(toIdString({ toString: () => '[object Object]' })).toBeUndefined();
  });
});

describe('uniqueLeadTeamByUser', () => {
  it('associe un lead à son équipe unique', () => {
    const map = uniqueLeadTeamByUser([
      { _id: 'team-cook', name: 'Cook', leadIds: ['user-alex', 'user-jeremy'] },
      { _id: 'team-adoria', name: 'ADORIA', leadIds: ['user-bruno'] }
    ]);
    expect(map.get('user-alex')).toEqual({ teamId: 'team-cook', name: 'Cook' });
    expect(map.get('user-bruno')).toEqual({ teamId: 'team-adoria', name: 'ADORIA' });
  });

  it('ignore un utilisateur lead de plusieurs équipes', () => {
    const map = uniqueLeadTeamByUser([
      { id: 'a', name: 'A', leadIds: ['user-1'] },
      { id: 'b', name: 'B', leadIds: ['user-1'] }
    ]);
    expect(map.has('user-1')).toBe(false);
  });
});
