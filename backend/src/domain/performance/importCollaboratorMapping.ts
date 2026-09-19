/**
 * Table de correspondance collaborateur ↔ équipe ↔ fichier d'entretien, établie à partir de
 * l'analyse documentée dans `OKR-entretien/documentation-dashboard/02-mapping-collaborateurs.md`.
 * `interviewFilePath` est relatif à `Entretiens-eval-perf/` ; `null` pour les 6 collaborateurs
 * sans dossier d'entretien (statut "Dossier manquant" conservé tel quel, pas d'objectifs à importer
 * pour eux). `Guillaume Bely` n'a pas de fichier d'entretien et n'apparaît donc pas ici — voir le
 * futur import des scores de compétences pour son cas.
 */
export interface ImportCollaboratorEntry {
  name: string;
  /** Nom d'équipe tel qu'affiché dans le dashboard existant — à recouper avec les équipes réelles au moment de l'import. */
  team: string;
  interviewFilePath: string | null;
}

export const IMPORT_COLLABORATOR_MAPPING: ImportCollaboratorEntry[] = [
  { name: 'Alexandre Parjouet', team: 'Front', interviewFilePath: 'cook/Perf-Eval-H1-26-Adoria-Parjouet-BDR.xlsx' },
  { name: 'Bruno Ignace', team: 'Front', interviewFilePath: null },
  {
    name: 'Caroline Wan-Meenen',
    team: 'Front',
    interviewFilePath: 'calson/Perf-Eval-H1-26-Adoria-Wan-Meenen-BDR.xlsx'
  },
  { name: 'Esther Beaudouin', team: 'QA', interviewFilePath: 'QA/Perf-Eval-H1-26-Adoria-Beaudouin-BDR.xlsx' },
  { name: 'Frederic Saintout', team: 'QA', interviewFilePath: null },
  { name: 'Guilhem Vasselin', team: 'Calson', interviewFilePath: 'calson/Perf-Eval-H1-26-Adoria-Vasselin-BDR.xlsx' },
  { name: 'Guillaume Gobin', team: 'Choco', interviewFilePath: 'choco/Perf-Eval-H1-26-Adoria-Gobin-BDR.xlsx' },
  {
    name: 'Julie Andrianalimanana',
    team: 'Calson',
    interviewFilePath: 'calson/Perf-Eval-H1-26-Adoria-ANDRIANALIMANANA-BDR.xlsx'
  },
  { name: 'Jérémy Baudet', team: 'COOK', interviewFilePath: 'cook/Perf-Eval-H1-26-Adoria-Baudet-BDR.ods' },
  { name: 'Louis Marriott', team: 'Choco', interviewFilePath: 'choco/Perf-Eval-H1-26-Adoria-Marriott-BDR.xlsx' },
  { name: 'Loïc Bitter', team: 'Calson', interviewFilePath: 'calson/Perf-Eval-H1-26-Adoria-Bitter-BDR.xlsx' },
  { name: 'Marjolaine Belay', team: 'QA', interviewFilePath: 'QA/Perf-Eval-H1-26-Adoria-BELAY-BDR.xlsx' },
  { name: 'Maxime Andres', team: 'Front', interviewFilePath: 'choco/Perf-Eval-H1-26-Adoria-Andres-BDR.xlsx' },
  { name: 'Michel Piac', team: 'Choco', interviewFilePath: null },
  { name: 'Quentin Besson', team: 'Calson', interviewFilePath: 'calson/Perf-Eval-H1-26-Adoria-Besson-BDR.xlsx' },
  {
    name: 'Sandra Dubois-Coutand',
    team: 'QA',
    interviewFilePath: 'QA/Perf-Eval-H1-26-Adoria-Dubois-coutand-BDR.xlsx'
  },
  { name: 'Sylvain Ruchat', team: 'Choco', interviewFilePath: 'choco/Perf-Eval-H1-26-Adoria-RUCHAT-BDR.xlsx' },
  { name: 'Thibault Demars', team: 'Front', interviewFilePath: null },
  { name: 'Yoann Benes', team: 'Front', interviewFilePath: null },
  { name: 'Sylvain Megret', team: 'COOK', interviewFilePath: null }
];

/** Un collaborateur du roster (`GET /api/teams/roster`), tel que vu côté import. */
export interface RosterCandidate {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  teamId: string | null;
}

/** Minuscules, sans accents, espaces normalisés — pour comparer "Julie ANDRIANALIMANANA" et "Julie Andrianalimanana". */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Fait correspondre un nom du fichier d'entretien à un utilisateur du roster, par égalité exacte
 * du nom complet normalisé. Retourne `null` si aucun utilisateur ne correspond, ou si plusieurs
 * correspondent (ambiguïté) : dans les deux cas, mieux vaut laisser le rapport d'import signaler
 * le cas pour une résolution manuelle que de deviner et risquer de mélanger deux personnes.
 */
export function matchRosterUser(excelFullName: string, roster: RosterCandidate[]): RosterCandidate | null {
  const target = normalizeName(excelFullName);
  const matches = roster.filter((u) => normalizeName(`${u.firstName ?? ''} ${u.lastName ?? ''}`) === target);
  return matches.length === 1 ? matches[0] : null;
}
