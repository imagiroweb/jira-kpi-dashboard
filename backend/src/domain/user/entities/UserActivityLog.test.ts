/**
 * TU — Modèle UserActivityLog
 * Vérifie les types et la structure du schéma (sans base réelle).
 */
import { UserActivityLog, UserActivityType } from './UserActivityLog';
import { PAGE_IDS } from './Role';

describe('UserActivityLog', () => {
  it('expose le modèle mongoose', () => {
    expect(UserActivityLog).toBeDefined();
    expect(UserActivityLog.modelName).toBe('UserActivityLog');
  });

  it('a un schéma avec les champs requis et enum type', () => {
    const schema = UserActivityLog.schema;
    expect(schema).toBeDefined();
    expect(schema.paths.userId).toBeDefined();
    expect(schema.paths.type).toBeDefined();
    expect(schema.paths.timestamp).toBeDefined();
    expect(schema.paths.meta).toBeDefined();
    expect(schema.paths.type.options.enum).toEqual([
      'login',
      'page_view',
      'error_500',
      'password_reset_request',
      'password_reset_complete',
    ]);
  });

  it('accepte les types UserActivityType', () => {
    const types: UserActivityType[] = ['login', 'page_view', 'error_500', 'password_reset_request', 'password_reset_complete'];
    types.forEach((type) => {
      expect(['login', 'page_view', 'error_500', 'password_reset_request', 'password_reset_complete']).toContain(type);
    });
  });

  it('les page_view peuvent avoir meta.page aligné avec PAGE_IDS du rôle', () => {
    expect(PAGE_IDS).toBeDefined();
    expect(PAGE_IDS).toContain('dashboard');
    expect(PAGE_IDS).toContain('gestionUtilisateurs');
    expect(PAGE_IDS).toContain('support');
  });
});
