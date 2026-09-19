/**
 * TU — Modèle Team
 * Vérifie la structure du schéma (sans base réelle).
 */
import mongoose from 'mongoose';
import { Team } from './Team';

describe('Team', () => {
  it('expose le modèle mongoose', () => {
    expect(Team).toBeDefined();
    expect(Team.modelName).toBe('Team');
  });

  it('a un schéma avec name (requis) et leadIds (référence User)', () => {
    const schema = Team.schema;
    expect(schema.paths.name).toBeDefined();
    expect(schema.paths.name.options.required).toBe(true);
    expect(schema.paths.leadIds).toBeDefined();
    expect(schema.paths.leadIds.options.ref).toBe('User');
  });

  it('refuse une équipe sans nom', () => {
    const team = new Team({});
    const error = team.validateSync();
    expect(error?.errors.name).toBeDefined();
  });

  it('accepte une équipe avec un ou plusieurs leads, leadIds vide par défaut sinon', () => {
    const withoutLead = new Team({ name: 'QA' });
    expect(withoutLead.validateSync()).toBeUndefined();
    expect(withoutLead.leadIds).toEqual([]);

    const leadId = new mongoose.Types.ObjectId();
    const withLead = new Team({ name: 'Choco', leadIds: [leadId] });
    expect(withLead.validateSync()).toBeUndefined();
    expect(withLead.leadIds).toHaveLength(1);
  });
});
