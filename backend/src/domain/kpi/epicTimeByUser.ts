/**
 * Temps passé (et coût) par personne et par rôle sur une épic / légende (issue #44), sans appel réseau.
 */
import { costOfDailySeconds, type HourlyRate } from '../user/hourlyRates';

/** Worklog Jira réduit à ce qui sert ici. */
export interface WorklogLike {
  author?: { accountId?: string; displayName?: string; emailAddress?: string; avatarUrls?: Record<string, string> };
  timeSpentSeconds?: number;
  started?: string;
}

/** Utilisateur de l'app : poste (nom du rôle) et coût horaire d'un auteur Jira. */
export interface AppUserForMatching {
  email: string;
  firstName?: string;
  lastName?: string;
  roleName: string | null;
  /** Coûts horaires par période, saisis dans la page « Coûts horaires » (vide si aucun). */
  hourlyRates: HourlyRate[];
}

/** Temps d'un auteur Jira, avant rattachement à un utilisateur de l'app. */
export interface AuthorTime {
  accountId: string;
  displayName: string;
  emailAddress: string | null;
  avatarUrl: string | null;
  timeSpentSeconds: number;
  worklogCount: number;
  issueCount: number;
  firstWorklogAt: string | null;
  lastWorklogAt: string | null;
  /** Temps par jour de saisie (YYYY-MM-DD), pour valoriser chaque jour au coût horaire en vigueur. */
  secondsByDay: Record<string, number>;
}

export interface EpicTimeByUserRow extends Omit<AuthorTime, 'emailAddress' | 'secondsByDay'> {
  /** Poste = nom du rôle de l'utilisateur de l'app correspondant (null si non retrouvé). */
  role: string | null;
  /** Part du temps total de l'épic, arrondie à 0,1. */
  percent: number;
  /** Présents seulement avec l'accès aux coûts : coûts horaires par période, et coût du temps passé. */
  hourlyRates?: HourlyRate[];
  cost?: number | null;
}

export interface EpicTimeByRoleRow {
  /** null = poste non renseigné. */
  role: string | null;
  timeSpentSeconds: number;
  percent: number;
  peopleCount: number;
  /** Présents seulement avec l'accès aux coûts : somme des coûts connus, et personnes sans coût horaire. */
  cost?: number | null;
  peopleWithoutCost?: number;
}

/** Clés de tous les tickets de l'arbre (épic incluse), sans doublon. */
export function collectIssueKeys(rootKey: string, children: Array<{ issueKey: string; children?: unknown[] }>): string[] {
  const keys = new Set<string>([rootKey]);
  const walk = (items: Array<{ issueKey: string; children?: unknown[] }>) => {
    for (const item of items) {
      keys.add(item.issueKey);
      if (item.children?.length) walk(item.children as Array<{ issueKey: string; children?: unknown[] }>);
    }
  };
  walk(children);
  return [...keys];
}

/** Minuscules, sans accents ni espaces superflus. */
export function normalizeName(v: string | null | undefined): string {
  return (v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Utilisateur de l'app correspondant à un auteur Jira : par email si Jira l'expose, sinon par nom
 * (« Prénom Nom » ou « Nom Prénom »). null si introuvable ou ambigu (homonymes).
 */
export function findAppUser(
  author: { displayName?: string; emailAddress?: string | null },
  users: AppUserForMatching[]
): AppUserForMatching | null {
  const email = (author.emailAddress ?? '').trim().toLowerCase();
  if (email) {
    const byEmail = users.find((u) => u.email.trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  const name = normalizeName(author.displayName);
  if (!name) return null;
  const byName = users.filter((u) => {
    const first = normalizeName(u.firstName);
    const last = normalizeName(u.lastName);
    if (!first || !last) return false;
    return name === `${first} ${last}` || name === `${last} ${first}`;
  });
  return byName.length === 1 ? byName[0] : null;
}

const roundPercent = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);
const roundCost = (v: number) => Math.round(v * 100) / 100;

/** Agrège les worklogs de tous les tickets par auteur Jira, triés par temps passé décroissant. */
export function aggregateWorklogsByAuthor(worklogsByIssue: Map<string, WorklogLike[]>): {
  totalSeconds: number;
  authors: AuthorTime[];
} {
  const byAuthor = new Map<string, Omit<AuthorTime, 'issueCount'> & { issues: Set<string> }>();
  let totalSeconds = 0;

  for (const [issueKey, worklogs] of worklogsByIssue) {
    for (const w of worklogs) {
      const seconds = w.timeSpentSeconds ?? 0;
      if (seconds <= 0) continue;
      const accountId = w.author?.accountId || 'unknown';
      const entry = byAuthor.get(accountId) ?? {
        accountId,
        displayName: w.author?.displayName || 'Inconnu',
        emailAddress: w.author?.emailAddress ?? null,
        avatarUrl: w.author?.avatarUrls?.['48x48'] ?? null,
        timeSpentSeconds: 0,
        worklogCount: 0,
        issues: new Set<string>(),
        firstWorklogAt: null,
        lastWorklogAt: null,
        secondsByDay: {},
      };
      entry.timeSpentSeconds += seconds;
      // Jour calendaire de la saisie, dans le fuseau du worklog (ex. 2026-03-02T09:00:00.000+0100).
      const day = w.started?.slice(0, 10);
      if (day) entry.secondsByDay[day] = (entry.secondsByDay[day] ?? 0) + seconds;
      entry.worklogCount += 1;
      entry.issues.add(issueKey);
      if (w.started) {
        if (!entry.firstWorklogAt || w.started < entry.firstWorklogAt) entry.firstWorklogAt = w.started;
        if (!entry.lastWorklogAt || w.started > entry.lastWorklogAt) entry.lastWorklogAt = w.started;
      }
      byAuthor.set(accountId, entry);
      totalSeconds += seconds;
    }
  }

  const authors = [...byAuthor.values()]
    .map(({ issues, ...e }) => ({ ...e, issueCount: issues.size }))
    .sort((a, b) => b.timeSpentSeconds - a.timeSpentSeconds || a.displayName.localeCompare(b.displayName));
  return { totalSeconds, authors };
}

/**
 * Rattache les auteurs aux utilisateurs de l'app (poste, coût horaire) et répartit le temps par rôle.
 * Sans `withCosts`, aucun champ de coût n'est présent dans le résultat (donnée réservée).
 */
export function buildEpicTimeByUser(
  aggregate: { totalSeconds: number; authors: AuthorTime[] },
  users: AppUserForMatching[],
  { withCosts }: { withCosts: boolean }
): {
  people: EpicTimeByUserRow[];
  byRole: EpicTimeByRoleRow[];
  totalCost?: number;
  peopleWithoutCost?: number;
} {
  const { totalSeconds } = aggregate;
  const people: EpicTimeByUserRow[] = aggregate.authors.map(({ emailAddress, secondsByDay, ...a }) => {
    const user = findAppUser({ displayName: a.displayName, emailAddress }, users);
    const row: EpicTimeByUserRow = { ...a, role: user?.roleName ?? null, percent: roundPercent(a.timeSpentSeconds, totalSeconds) };
    if (withCosts) {
      const hourlyRates = user?.hourlyRates ?? [];
      row.hourlyRates = hourlyRates;
      // `?? {}` : agrégat mis en cache avant l'ajout du détail par jour.
      row.cost = costOfDailySeconds(hourlyRates, secondsByDay ?? {});
    }
    return row;
  });

  const roles = new Map<string | null, EpicTimeByRoleRow>();
  for (const p of people) {
    const r = roles.get(p.role) ?? {
      role: p.role,
      timeSpentSeconds: 0,
      percent: 0,
      peopleCount: 0,
      ...(withCosts ? { cost: null, peopleWithoutCost: 0 } : {}),
    };
    r.timeSpentSeconds += p.timeSpentSeconds;
    r.peopleCount += 1;
    if (withCosts) {
      if (p.cost == null) r.peopleWithoutCost = (r.peopleWithoutCost ?? 0) + 1;
      else r.cost = roundCost((r.cost ?? 0) + p.cost);
    }
    roles.set(p.role, r);
  }
  const byRole = [...roles.values()]
    .map((r) => ({ ...r, percent: roundPercent(r.timeSpentSeconds, totalSeconds) }))
    // Poste non renseigné en dernier.
    .sort((a, b) => (a.role === null ? 1 : 0) - (b.role === null ? 1 : 0) || b.timeSpentSeconds - a.timeSpentSeconds);

  if (!withCosts) return { people, byRole };
  return {
    people,
    byRole,
    totalCost: roundCost(people.reduce((sum, p) => sum + (p.cost ?? 0), 0)),
    peopleWithoutCost: people.filter((p) => p.cost == null).length,
  };
}
