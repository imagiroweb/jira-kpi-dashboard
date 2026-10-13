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
    expect(normalizeName('Julie VANDERMEULEN')).toBe('julie vandermeulen');
    expect(normalizeName('Jérémy Lemoine')).toBe('jeremy lemoine');
    expect(normalizeName('Loïc Garnier')).toBe('loic garnier');
  });

  it('normalise les espaces multiples et les espaces en bordure', () => {
    expect(normalizeName('  Sandra   Roux-Chevalier  ')).toBe('sandra roux-chevalier');
  });

  it('produit le même résultat pour deux variantes de casse/accents du même nom', () => {
    expect(normalizeName('Sandra Roux-chevalier')).toBe(normalizeName('SANDRA ROUX-CHEVALIER'));
  });
});

describe('email Entra (1re lettre + nom)', () => {
  it('construit pmartin-durand à partir de Paul / Martin-Durand', () => {
    expect(expectedAdoriaLocalParts('Paul', 'Martin-Durand')).toEqual([
      'pmartin-durand',
      'pmartindurand'
    ]);
  });

  it('reconnaît le nom du fichier dans pmartin-durand@adoria.com', () => {
    expect(emailLocalMatchesLastName('pmartin-durand@adoria.com', 'Martin-Durand')).toBe(true);
    expect(emailLocalMatchesLastName('jvandermeulen@adoria.com', 'VANDERMEULEN')).toBe(true);
    expect(emailLocalMatchesLastName('pmartin-durand@adoria.com', 'Lemoine')).toBe(false);
  });
});

describe('parseInterviewFileName', () => {
  it('extrait le nom entre Adoria- et -BDR', () => {
    expect(parseInterviewFileName('Perf-Eval-H1-26-Adoria-Moreau-BDR.xlsx')).toBe('Moreau');
    expect(parseInterviewFileName('Perf-Eval-H1-26-Adoria-Van-Hoven-BDR.xlsx')).toBe('Van-Hoven');
    expect(parseInterviewFileName('Perf-Eval-H1-26-Adoria-Martin-Durand-BDR.ods')).toBe('Martin-Durand');
    expect(parseInterviewFileName('Perf-Eval-H1-26-Adoria-VANDERMEULEN-BDR.xlsx')).toBe(
      'VANDERMEULEN'
    );
  });

  it('retourne null si le fichier ne suit pas la convention', () => {
    expect(parseInterviewFileName('notes-bruno.xlsx')).toBeNull();
    expect(parseInterviewFileName('Perf-Eval-H1-26-Adoria-Moreau.xlsx')).toBeNull();
  });
});

describe('matchRosterUser', () => {
  const roster: RosterCandidate[] = [
    { id: 'u1', firstName: 'Julie', lastName: 'Vandermeulen', email: 'julie@adoria.com', teamId: 't1' },
    { id: 'u2', firstName: 'Jérémy', lastName: 'Lemoine', email: 'jeremy@adoria.com', teamId: 't2' },
    { id: 'u3', firstName: 'Homonyme', lastName: 'Dupont', email: 'homonyme1@adoria.com', teamId: 't3' },
    { id: 'u4', firstName: 'Homonyme', lastName: 'Dupont', email: 'homonyme2@adoria.com', teamId: 't4' }
  ];

  it('trouve un utilisateur du roster par correspondance exacte du nom normalisé', () => {
    const match = matchRosterUser('Julie VANDERMEULEN', roster);
    expect(match?.id).toBe('u1');
  });

  it('tolère les différences d\'accents et de casse entre le fichier Excel et le roster', () => {
    const match = matchRosterUser('jeremy lemoine', roster);
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
      { id: 'cto', firstName: null, lastName: null, email: 'pmartin-durand@adoria.com', teamId: null }
    ];
    expect(matchRosterUser('Paul Martin-Durand', entraRoster)?.id).toBe('cto');
  });
});

describe('matchRosterForInterviewToken', () => {
  const roster: RosterCandidate[] = [
    { id: 'u1', firstName: 'Julie', lastName: 'Vandermeulen', email: 'julie@adoria.com', teamId: 't1' },
    { id: 'u2', firstName: 'Caroline', lastName: 'Van-Hoven', email: 'caroline@adoria.com', teamId: 't2' },
    { id: 'u3', firstName: 'Paul', lastName: 'Martin-Durand', email: 'bruno@adoria.com', teamId: 't3' },
    { id: 'u4', firstName: 'Homonyme', lastName: 'Dupont', email: 'h1@adoria.com', teamId: 't4' },
    { id: 'u5', firstName: 'Autre', lastName: 'Dupont', email: 'h2@adoria.com', teamId: 't5' }
  ];

  it('rattache un nom de famille unique (casse ignorée)', () => {
    expect(matchRosterForInterviewToken('VANDERMEULEN', roster)?.id).toBe('u1');
  });

  it('rattache un nom composé du fichier (Van-Hoven)', () => {
    expect(matchRosterForInterviewToken('Van-Hoven', roster)?.id).toBe('u2');
  });

  it('rattache un jeton prénom+nom (Paul-Martin-Durand)', () => {
    expect(matchRosterForInterviewToken('Paul-Martin-Durand', roster)?.id).toBe('u3');
  });

  it('renvoie null si le nom de famille est partagé par plusieurs personnes', () => {
    expect(matchRosterForInterviewToken('Dupont', roster)).toBeNull();
  });

  it('renvoie null si personne ne correspond', () => {
    expect(matchRosterForInterviewToken('Inconnu', roster)).toBeNull();
  });

  it('rattache le fichier Martin-Durand à l’email Entra pmartin-durand@adoria.com', () => {
    const entraRoster: RosterCandidate[] = [
      {
        id: 'cto',
        firstName: 'Paul',
        lastName: 'Martin-Durand',
        email: 'pmartin-durand@adoria.com',
        teamId: null
      },
      {
        id: 'other',
        firstName: 'Julie',
        lastName: 'Vandermeulen',
        email: 'jvandermeulen@adoria.com',
        teamId: 't1'
      }
    ];
    expect(matchRosterForInterviewToken('Martin-Durand', entraRoster)?.id).toBe('cto');
    expect(matchRosterForInterviewToken('VANDERMEULEN', entraRoster)?.id).toBe('other');
  });

  it('rattache même si le roster n’a pas de prénom/nom, seulement l’email Entra', () => {
    const entraOnly: RosterCandidate[] = [
      { id: 'cto', firstName: null, lastName: null, email: 'pmartin-durand@adoria.com', teamId: null }
    ];
    expect(matchRosterForInterviewToken('Martin-Durand', entraOnly)?.email).toBe('pmartin-durand@adoria.com');
  });
});
