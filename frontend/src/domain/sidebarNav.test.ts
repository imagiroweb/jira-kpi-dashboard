import { describe, expect, it } from 'vitest';
import { groupOfPage, resolveNav, type NavEntry } from './sidebarNav';

type P = 'dashboard' | 'performance' | 'performanceDashboard' | 'gestionUtilisateurs' | 'couts';

const NAV: NavEntry<P>[] = [
  { kind: 'page', id: 'dashboard' },
  { kind: 'group', id: 'suiviPerformance', pages: ['performance', 'performanceDashboard'] },
  { kind: 'group', id: 'parametres', pages: ['gestionUtilisateurs', 'couts'] },
];

describe('resolveNav', () => {
  it('garde les groupes entiers quand toutes leurs pages sont visibles', () => {
    expect(resolveNav(NAV, () => true)).toEqual(NAV);
  });

  it('retire les pages invisibles, remplace un groupe à une seule page par cette page, supprime un groupe vide', () => {
    const visible = new Set<P>(['dashboard', 'performance']);

    expect(resolveNav(NAV, (p) => visible.has(p))).toEqual([
      { kind: 'page', id: 'dashboard' },
      { kind: 'page', id: 'performance' },
    ]);
  });

  it('ne garde dans un groupe que ses pages visibles', () => {
    const entries: NavEntry<P>[] = [{ kind: 'group', id: 'g', pages: ['dashboard', 'performance', 'couts'] }];

    expect(resolveNav(entries, (p) => p !== 'performance')).toEqual([{ kind: 'group', id: 'g', pages: ['dashboard', 'couts'] }]);
  });
});

describe('groupOfPage', () => {
  it('trouve le groupe de la page courante', () => {
    expect(groupOfPage(NAV, 'couts')).toBe('parametres');
    expect(groupOfPage(NAV, 'dashboard')).toBeNull();
  });
});
