import {
  emailLocalMatchesLastName,
  expectedAdoriaLocalParts,
  matchRosterForInterviewToken,
  matchRosterUser,
  normalizeName,
  parseInterviewFileName,
  type RosterCandidate
} from './importCollaboratorMapping';

describe('normalizeName', () => {
  it('met en minuscules et retire les accents', () => {
    expect(normalizeName('Julie ANDRIANALIMANANA')).toBe('julie andrianalimanana');
    expect(normalizeName('Jérémy Baudet')).toBe('jeremy baudet');
    expect(normalizeName('Loïc Bitter')).toBe('loic bitter');
  });

  it('normalise les espaces multiples et les espaces en bordure', () => {
    expect(normalizeName('  Sandra   Dubois-Coutand  ')).toBe('sandra dubois-coutand');
  });

  it('produit le même résultat pour deux variantes de casse/accents du même nom', () => {
    expect(normalizeName('Sandra Dubois-coutand')).toBe(normalizeName('SANDRA DUBOIS-COUTAND'));
  });
});

describe('email Entra (1re lettre + nom)', () => {
  it('construit bdeguil-robin à partir de Bruno / Deguil-Robin', () => {
    expect(expectedAdoriaLocalParts('Bruno', 'Deguil-Robin')).toEqual([
      'bdeguil-robin',
      'bdeguilrobin'
    ]);
  });

  it('reconnaît le nom du fichier dans bdeguil-robin@adoria.com', () => {
    expect(emailLocalMatchesLastName('bdeguil-robin@adoria.com', 'Deguil-Robin')).toBe(true);
    expect(emailLocalMatchesLastName('jandrianalimanana@adoria.com', 'ANDRIANALIMANANA')).toBe(true);
    expect(emailLocalMatchesLastName('bdeguil-robin@adoria.com', 'Baudet')).toBe(false);
  });
});

describe('parseInterviewFileName', () => {
  it('extrait le nom entre Adoria- et -BDR', () => {
    expect(parseInterviewFileName('Perf-Eval-H1-26-Adoria-Parjouet-BDR.xlsx')).toBe('Parjouet');
    expect(parseInterviewFileName('Perf-Eval-H1-26-Adoria-Wan-Meenen-BDR.xlsx')).toBe('Wan-Meenen');
    expect(parseInterviewFileName('Perf-Eval-H1-26-Adoria-Deguil-Robin-BDR.ods')).toBe('Deguil-Robin');
    expect(parseInterviewFileName('Perf-Eval-H1-26-Adoria-ANDRIANALIMANANA-BDR.xlsx')).toBe(
      'ANDRIANALIMANANA'
    );
  });

  it('retourne null si le fichier ne suit pas la convention', () => {
    expect(parseInterviewFileName('notes-bruno.xlsx')).toBeNull();
    expect(parseInterviewFileName('Perf-Eval-H1-26-Adoria-Parjouet.xlsx')).toBeNull();
  });
});

describe('matchRosterUser', () => {
  const roster: RosterCandidate[] = [
    { id: 'u1', firstName: 'Julie', lastName: 'Andrianalimanana', email: 'julie@adoria.com', teamId: 't1' },
    { id: 'u2', firstName: 'Jérémy', lastName: 'Baudet', email: 'jeremy@adoria.com', teamId: 't2' },
    { id: 'u3', firstName: 'Homonyme', lastName: 'Dupont', email: 'homonyme1@adoria.com', teamId: 't3' },
    { id: 'u4', firstName: 'Homonyme', lastName: 'Dupont', email: 'homonyme2@adoria.com', teamId: 't4' }
  ];

  it('trouve un utilisateur du roster par correspondance exacte du nom normalisé', () => {
    const match = matchRosterUser('Julie ANDRIANALIMANANA', roster);
    expect(match?.id).toBe('u1');
  });

  it('tolère les différences d\'accents et de casse entre le fichier Excel et le roster', () => {
    const match = matchRosterUser('jeremy baudet', roster);
    expect(match?.id).toBe('u2');
  });

  it('renvoie null quand aucun utilisateur ne correspond', () => {
    expect(matchRosterUser('Personne Inconnue', roster)).toBeNull();
  });

  it('renvoie null en cas d\'ambiguïté (plusieurs utilisateurs avec le même nom normalisé)', () => {
    expect(matchRosterUser('Homonyme Dupont', roster)).toBeNull();
  });

  it('retrouve un utilisateur via l’email Entra si le nom roster ne correspond pas', () => {
    const entraRoster: RosterCandidate[] = [
      { id: 'cto', firstName: null, lastName: null, email: 'bdeguil-robin@adoria.com', teamId: null }
    ];
    expect(matchRosterUser('Bruno Deguil-Robin', entraRoster)?.id).toBe('cto');
  });
});

describe('matchRosterForInterviewToken', () => {
  const roster: RosterCandidate[] = [
    { id: 'u1', firstName: 'Julie', lastName: 'Andrianalimanana', email: 'julie@adoria.com', teamId: 't1' },
    { id: 'u2', firstName: 'Caroline', lastName: 'Wan-Meenen', email: 'caroline@adoria.com', teamId: 't2' },
    { id: 'u3', firstName: 'Bruno', lastName: 'Deguil-Robin', email: 'bruno@adoria.com', teamId: 't3' },
    { id: 'u4', firstName: 'Homonyme', lastName: 'Dupont', email: 'h1@adoria.com', teamId: 't4' },
    { id: 'u5', firstName: 'Autre', lastName: 'Dupont', email: 'h2@adoria.com', teamId: 't5' }
  ];

  it('rattache un nom de famille unique (casse ignorée)', () => {
    expect(matchRosterForInterviewToken('ANDRIANALIMANANA', roster)?.id).toBe('u1');
  });

  it('rattache un nom composé du fichier (Wan-Meenen)', () => {
    expect(matchRosterForInterviewToken('Wan-Meenen', roster)?.id).toBe('u2');
  });

  it('rattache un jeton prénom+nom (Bruno-Deguil-Robin)', () => {
    expect(matchRosterForInterviewToken('Bruno-Deguil-Robin', roster)?.id).toBe('u3');
  });

  it('renvoie null si le nom de famille est partagé par plusieurs personnes', () => {
    expect(matchRosterForInterviewToken('Dupont', roster)).toBeNull();
  });

  it('renvoie null si personne ne correspond', () => {
    expect(matchRosterForInterviewToken('Inconnu', roster)).toBeNull();
  });

  it('rattache le fichier Deguil-Robin à l’email Entra bdeguil-robin@adoria.com', () => {
    const entraRoster: RosterCandidate[] = [
      {
        id: 'cto',
        firstName: 'Bruno',
        lastName: 'Deguil-Robin',
        email: 'bdeguil-robin@adoria.com',
        teamId: null
      },
      {
        id: 'other',
        firstName: 'Julie',
        lastName: 'Andrianalimanana',
        email: 'jandrianalimanana@adoria.com',
        teamId: 't1'
      }
    ];
    expect(matchRosterForInterviewToken('Deguil-Robin', entraRoster)?.id).toBe('cto');
    expect(matchRosterForInterviewToken('ANDRIANALIMANANA', entraRoster)?.id).toBe('other');
  });

  it('rattache même si le roster n’a pas de prénom/nom, seulement l’email Entra', () => {
    const entraOnly: RosterCandidate[] = [
      { id: 'cto', firstName: null, lastName: null, email: 'bdeguil-robin@adoria.com', teamId: null }
    ];
    expect(matchRosterForInterviewToken('Deguil-Robin', entraOnly)?.email).toBe('bdeguil-robin@adoria.com');
  });
});
