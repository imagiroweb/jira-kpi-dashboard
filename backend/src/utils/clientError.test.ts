import { clientErrorDetail } from './clientError';

describe('clientErrorDetail', () => {
  it('masque le détail technique en production', () => {
    expect(clientErrorDetail(new Error('connect ECONNREFUSED jira.internal:443'), { NODE_ENV: 'production' })).toBeUndefined();
  });

  it('renvoie le message hors production (debug)', () => {
    expect(clientErrorDetail(new Error('boom'), { NODE_ENV: 'development' })).toBe('boom');
    expect(clientErrorDetail('texte', { NODE_ENV: 'test' })).toBe('Unknown error');
  });
});
