import {
  aggregateWorklogsByAuthor,
  buildEpicTimeByUser,
  collectIssueKeys,
  findAppUser,
  normalizeName,
} from './epicTimeByUser';

const CAROLINE = { email: 'caroline.martin@adoria.com', firstName: 'Caroline', lastName: 'Martin', roleName: 'Développeuse', hourlyRates: [{ startDate: null, rate: 50 }] };
const GUILHEM = { email: 'guilhem.leroy@adoria.com', firstName: 'Guilhem', lastName: 'Leroy', roleName: 'QA', hourlyRates: [] };
const USERS = [CAROLINE, GUILHEM];

const caroline = { accountId: 'acc-c', displayName: 'Caroline Martin', avatarUrls: { '48x48': 'https://a/c.png' } };
const guilhem = { accountId: 'acc-g', displayName: 'Guilhem Leroy' };
const inconnu = { accountId: 'acc-x', displayName: 'Prestataire Externe' };

const WORKLOGS = new Map([
  [
    'AD-2',
    [
      { author: caroline, timeSpentSeconds: 7200, started: '2026-03-02T09:00:00.000+0100' },
      { author: guilhem, timeSpentSeconds: 3600, started: '2026-03-05T09:00:00.000+0100' },
    ],
  ],
  ['AD-3', [{ author: caroline, timeSpentSeconds: 30600, started: '2026-02-01T09:00:00.000+0100' }]],
  ['AD-4', [{ author: inconnu, timeSpentSeconds: 1800, started: '2026-03-10T09:00:00.000+0100' }]],
]);

describe('collectIssueKeys', () => {
  it("parcourt tout l'arbre, épic incluse, sans doublon", () => {
    expect(
      collectIssueKeys('AD-1', [
        { issueKey: 'AD-2', children: [{ issueKey: 'AD-3' }, { issueKey: 'AD-4', children: [{ issueKey: 'AD-5' }] }] },
        { issueKey: 'AD-3' },
      ])
    ).toEqual(['AD-1', 'AD-2', 'AD-3', 'AD-4', 'AD-5']);
  });
});

describe('normalizeName', () => {
  it('ignore la casse, les accents et les espaces superflus', () => {
    expect(normalizeName('  Hélène   DUPRÉ ')).toBe('helene dupre');
  });
});

describe('findAppUser', () => {
  it("retrouve l'utilisateur par email en priorité", () => {
    expect(findAppUser({ displayName: 'Autre nom', emailAddress: 'Guilhem.Leroy@adoria.com' }, USERS)).toBe(GUILHEM);
  });

  it('retrouve par nom, dans les deux ordres et sans accents', () => {
    expect(findAppUser({ displayName: 'caroline martin' }, USERS)).toBe(CAROLINE);
    expect(findAppUser({ displayName: 'LEROY Guilhem' }, USERS)).toBe(GUILHEM);
  });

  it('retourne null si introuvable ou ambigu', () => {
    expect(findAppUser({ displayName: 'Inconnu Total' }, USERS)).toBeNull();
    const homonymes = [...USERS, { ...CAROLINE, email: 'c2@adoria.com', roleName: 'PO' }];
    expect(findAppUser({ displayName: 'Caroline Martin' }, homonymes)).toBeNull();
  });
});

describe('aggregateWorklogsByAuthor', () => {
  it('cumule le temps par auteur sur tous les tickets, trié par temps décroissant', () => {
    const { totalSeconds, authors } = aggregateWorklogsByAuthor(WORKLOGS);

    expect(totalSeconds).toBe(43200);
    expect(authors.map((a) => [a.accountId, a.timeSpentSeconds, a.issueCount, a.worklogCount])).toEqual([
      ['acc-c', 37800, 2, 2],
      ['acc-g', 3600, 1, 1],
      ['acc-x', 1800, 1, 1],
    ]);
    expect(authors[0]).toMatchObject({
      avatarUrl: 'https://a/c.png',
      firstWorklogAt: '2026-02-01T09:00:00.000+0100',
      lastWorklogAt: '2026-03-02T09:00:00.000+0100',
      secondsByDay: { '2026-03-02': 7200, '2026-02-01': 30600 },
    });
  });

  it('ignore les worklogs sans durée', () => {
    expect(aggregateWorklogsByAuthor(new Map([['AD-1', [{ author: guilhem, timeSpentSeconds: 0 }]]]))).toEqual({
      totalSeconds: 0,
      authors: [],
    });
  });
});

describe('buildEpicTimeByUser', () => {
  const aggregate = aggregateWorklogsByAuthor(WORKLOGS);

  it('renseigne le poste et répartit le temps par rôle, sans aucun champ de coût', () => {
    const result = buildEpicTimeByUser(aggregate, USERS, { withCosts: false });

    expect(result.people.map((p) => [p.displayName, p.role, p.percent])).toEqual([
      ['Caroline Martin', 'Développeuse', 87.5],
      ['Guilhem Leroy', 'QA', 8.3],
      ['Prestataire Externe', null, 4.2],
    ]);
    expect(result.byRole).toEqual([
      { role: 'Développeuse', timeSpentSeconds: 37800, percent: 87.5, peopleCount: 1 },
      { role: 'QA', timeSpentSeconds: 3600, percent: 8.3, peopleCount: 1 },
      { role: null, timeSpentSeconds: 1800, percent: 4.2, peopleCount: 1 },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/cost/i);
  });

  it('calcule les coûts avec le coût horaire, et compte les personnes sans coût', () => {
    const result = buildEpicTimeByUser(aggregate, USERS, { withCosts: true });

    expect(result.people.map((p) => [p.displayName, p.hourlyRates, p.cost])).toEqual([
      ['Caroline Martin', [{ startDate: null, rate: 50 }], 525],
      ['Guilhem Leroy', [], null],
      ['Prestataire Externe', [], null],
    ]);
    expect(result.byRole).toEqual([
      { role: 'Développeuse', timeSpentSeconds: 37800, percent: 87.5, peopleCount: 1, cost: 525, peopleWithoutCost: 0 },
      { role: 'QA', timeSpentSeconds: 3600, percent: 8.3, peopleCount: 1, cost: null, peopleWithoutCost: 1 },
      { role: null, timeSpentSeconds: 1800, percent: 4.2, peopleCount: 1, cost: null, peopleWithoutCost: 1 },
    ]);
    expect(result.totalCost).toBe(525);
    expect(result.peopleWithoutCost).toBe(2);
  });

  it('additionne les coûts des personnes d’un même rôle', () => {
    const dev2 = { email: 'dev2@adoria.com', firstName: 'Paul', lastName: 'Durand', roleName: 'Développeuse', hourlyRates: [{ startDate: null, rate: 40.5 }] };
    const agg = aggregateWorklogsByAuthor(
      new Map([
        [
          'AD-1',
          [
            { author: caroline, timeSpentSeconds: 3600, started: '2026-03-02T09:00:00.000+0100' },
            { author: { accountId: 'acc-p', displayName: 'Paul Durand' }, timeSpentSeconds: 5400, started: '2026-03-02T10:00:00.000+0100' },
          ],
        ],
      ])
    );

    const { byRole, totalCost } = buildEpicTimeByUser(agg, [CAROLINE, dev2], { withCosts: true });

    expect(byRole).toEqual([
      { role: 'Développeuse', timeSpentSeconds: 9000, percent: 100, peopleCount: 2, cost: 110.75, peopleWithoutCost: 0 },
    ]);
    expect(totalCost).toBe(110.75);
  });

  it('valorise le temps au coût horaire en vigueur à la date de chaque saisie', () => {
    const withChange = {
      ...CAROLINE,
      hourlyRates: [
        { startDate: null, rate: 50 },
        { startDate: '2026-03-01', rate: 60 },
      ],
    };
    // Février (30600 s = 8,5 h) à 50 €/h, mars (7200 s = 2 h) à 60 €/h.
    const { people } = buildEpicTimeByUser(aggregate, [withChange, GUILHEM], { withCosts: true });

    expect(people[0].cost).toBe(545);
    expect(people[0].hourlyRates).toEqual(withChange.hourlyRates);
  });

  it("n'expose pas le détail des saisies par jour", () => {
    const { people } = buildEpicTimeByUser(aggregate, USERS, { withCosts: true });

    expect(people[0]).not.toHaveProperty('secondsByDay');
  });
});
