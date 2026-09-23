/**
 * Structure du menu latéral : pages et groupes de pages (ex. « Paramètres »), résolus selon les
 * pages visibles de l'utilisateur. Sans rendu : les libellés et icônes restent dans Sidebar.
 */

export type NavEntry<P extends string> = { kind: 'page'; id: P } | { kind: 'group'; id: string; pages: P[] };

/**
 * Filtre le menu selon les droits : un groupe sans page visible disparaît ; un groupe avec une seule
 * page visible est remplacé par cette page (inutile d'ouvrir un groupe pour un seul lien).
 */
export function resolveNav<P extends string>(entries: NavEntry<P>[], canSee: (page: P) => boolean): NavEntry<P>[] {
  const out: NavEntry<P>[] = [];
  for (const entry of entries) {
    if (entry.kind === 'page') {
      if (canSee(entry.id)) out.push(entry);
      continue;
    }
    const pages = entry.pages.filter(canSee);
    if (pages.length === 1) out.push({ kind: 'page', id: pages[0] });
    else if (pages.length > 1) out.push({ ...entry, pages });
  }
  return out;
}

/** Groupe contenant la page courante (à ouvrir par défaut), ou null. */
export function groupOfPage<P extends string>(entries: NavEntry<P>[], page: P): string | null {
  const group = entries.find((e) => e.kind === 'group' && e.pages.includes(page));
  return group ? group.id : null;
}
