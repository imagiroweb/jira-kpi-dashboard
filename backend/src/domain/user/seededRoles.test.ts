import { PAGE_IDS } from './entities/Role';
import { SEEDED_ROLES } from './seededRoles';

describe('SEEDED_ROLES', () => {
  it('chaque rôle semé renseigne toutes les pages (liste complète exigée par la gestion des rôles)', () => {
    expect(PAGE_IDS).toContain('wip');
    for (const role of SEEDED_ROLES) {
      expect(Object.keys(role.pageVisibilities).sort()).toEqual([...PAGE_IDS].sort());
    }
  });

  it('CT-61 : Suivi WIP visible pour Dev et PO seulement', () => {
    const wip = Object.fromEntries(SEEDED_ROLES.map((r) => [r.name, r.pageVisibilities.wip]));
    expect(wip).toEqual({ Utilisateur: false, Dev: true, PO: true, Product: false, Marketing: false });
  });
});
