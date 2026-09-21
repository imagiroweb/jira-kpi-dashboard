/**
 * Correspondance fichier d'entretien ↔ utilisateur du roster.
 *
 * Source de vérité = les fichiers sous `Entretiens-eval-perf/` (scan récursif), pas une table
 * nominative. Convention de nommage constatée :
 *   `Perf-Eval-<période>-Adoria-<nom>-BDR.xlsx` (ou `.ods`)
 * où `<nom>` est en général le nom de famille (éventuellement composé : Wan-Meenen, Deguil-Robin).
 *
 * Lien avec Entra : l'email Adoria est `1re lettre du prénom` + `nom de famille` + `@adoria.com`
 * (ex. Bruno Deguil-Robin → `bdeguil-robin@adoria.com`). Le jeton du fichier (`Deguil-Robin`)
 * est cherché dans la partie locale de cet email.
 *
 * `IMPORT_FILE_NAME_OVERRIDES` n'existe que pour les exceptions (homonymes, fichier hors
 * convention). Un nouveau fichier qui suit la convention n'a rien à ajouter ici.
 */

/** Chemin relatif à `Entretiens-eval-perf/` → nom complet roster, si le fichier n'est pas univoque. */
export const IMPORT_FILE_NAME_OVERRIDES: Record<string, string> = {};

const INTERVIEW_NAME_PATTERN = /Adoria-(.+)-BDR\.(xlsx|ods)$/i;

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
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeHyphenatedName(name: string): string {
  return normalizeName(name.replace(/-/g, ' '));
}

export function emailLocalPart(email: string): string {
  return normalizeName((email.split('@')[0] ?? '').replace(/\s+/g, ''));
}

/** Variantes du nom pour l'email Entra : tirets conservés ou retirés (`deguil-robin` / `deguilrobin`). */
export function lastNameEmailKeys(lastNameToken: string): string[] {
  const withHyphen = normalizeName(lastNameToken.replace(/\s+/g, '-'));
  const compact = normalizeHyphenatedName(lastNameToken).replace(/ /g, '');
  return [...new Set([withHyphen, compact].filter(Boolean))];
}

/**
 * Email Entra : `bdeguil-robin@adoria.com` = 1re lettre du prénom + nom.
 * Le jeton fichier `Deguil-Robin` doit être le suffixe de la partie locale, précédé d'une lettre.
 */
export function emailLocalMatchesLastName(email: string, lastNameToken: string): boolean {
  const local = emailLocalPart(email);
  return lastNameEmailKeys(lastNameToken).some((key) => local.length === key.length + 1 && local.endsWith(key));
}

export function expectedAdoriaLocalParts(firstName: string, lastName: string): string[] {
  const initial = normalizeName(firstName).charAt(0);
  if (!initial) return [];
  return lastNameEmailKeys(lastName).map((key) => `${initial}${key}`);
}

/**
 * Extrait le jeton de nom entre `Adoria-` et `-BDR` (`Parjouet`, `Wan-Meenen`, `Deguil-Robin`).
 * `null` si le fichier ne suit pas la convention — à traiter via override ou à renommer.
 */
export function parseInterviewFileName(fileName: string): string | null {
  const match = fileName.match(INTERVIEW_NAME_PATTERN);
  return match?.[1]?.trim() || null;
}

/**
 * Fait correspondre un nom du fichier d'entretien à un utilisateur du roster, par égalité exacte
 * du nom complet normalisé. Retourne `null` si aucun utilisateur ne correspond, ou si plusieurs
 * correspondent (ambiguïté) : dans les deux cas, mieux vaut laisser le rapport d'import signaler
 * le cas pour une résolution manuelle que de deviner et risquer de mélanger deux personnes.
 */
export function matchRosterUser(excelFullName: string, roster: RosterCandidate[]): RosterCandidate | null {
  const target = normalizeName(excelFullName);
  const byName = roster.filter((u) => normalizeName(`${u.firstName ?? ''} ${u.lastName ?? ''}`) === target);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) return null;

  const parts = normalizeHyphenatedName(excelFullName).split(' ').filter(Boolean);
  if (parts.length < 2) return matchRosterByLastNameInEmail(excelFullName, roster);

  const locals = expectedAdoriaLocalParts(parts[0], parts.slice(1).join(' '));
  const byEmail = roster.filter((u) => locals.includes(emailLocalPart(u.email)));
  return byEmail.length === 1 ? byEmail[0] : null;
}

export function matchRosterByLastNameInEmail(
  lastNameToken: string,
  roster: RosterCandidate[]
): RosterCandidate | null {
  const tokens = [lastNameToken];
  const hyphenParts = lastNameToken.split('-').filter(Boolean);
  if (hyphenParts.length > 1) {
    tokens.push(hyphenParts.slice(1).join('-'));
  }
  const matches = roster.filter((u) => tokens.some((token) => emailLocalMatchesLastName(u.email, token)));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Rattache le jeton du fichier au roster :
 * 1. email Entra (`b` + `deguil-robin` → `bdeguil-robin@adoria.com`) ;
 * 2. nom de famille unique / prénom+nom / suffixe, si l'email ne suffit pas.
 * `null` si 0 ou plusieurs candidats — le dry-run le signale.
 */
export function matchRosterForInterviewToken(
  token: string,
  roster: RosterCandidate[]
): RosterCandidate | null {
  const tokenNorm = normalizeName(token);
  const tokenSpaces = normalizeHyphenatedName(token);
  if (!tokenNorm) return null;

  const byEmail = matchRosterByLastNameInEmail(token, roster);
  if (byEmail) return byEmail;

  const byLast = roster.filter((u) => {
    const last = normalizeName(u.lastName ?? '');
    const lastSpaces = normalizeHyphenatedName(u.lastName ?? '');
    return last === tokenNorm || lastSpaces === tokenSpaces;
  });
  if (byLast.length === 1) return byLast[0];
  if (byLast.length > 1) return null;

  const byFull = roster.filter((u) => {
    const fullSpaces = normalizeHyphenatedName(`${u.firstName ?? ''} ${u.lastName ?? ''}`);
    return fullSpaces === tokenSpaces;
  });
  if (byFull.length === 1) return byFull[0];

  const bySuffix = roster.filter((u) => {
    const lastSpaces = normalizeHyphenatedName(u.lastName ?? '');
    return lastSpaces.length > 0 && (tokenSpaces === lastSpaces || tokenSpaces.endsWith(` ${lastSpaces}`));
  });
  return bySuffix.length === 1 ? bySuffix[0] : null;
}

export function rosterDisplayName(user: RosterCandidate): string {
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
}
