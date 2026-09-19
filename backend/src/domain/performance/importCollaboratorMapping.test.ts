import {
  IMPORT_COLLABORATOR_MAPPING,
  normalizeName,
  matchRosterUser,
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
});

describe('IMPORT_COLLABORATOR_MAPPING', () => {
  it('contient les 20 collaborateurs identifiés dans la cartographie', () => {
    expect(IMPORT_COLLABORATOR_MAPPING).toHaveLength(20);
  });

  it('recense exactement 6 collaborateurs sans dossier d\'entretien ("Dossier manquant")', () => {
    const withoutInterview = IMPORT_COLLABORATOR_MAPPING.filter((entry) => entry.interviewFilePath === null);
    expect(withoutInterview).toHaveLength(6);
  });

  it('ne contient aucun nom en double', () => {
    const names = IMPORT_COLLABORATOR_MAPPING.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('n\'inclut pas Guillaume Bely (aucun dossier d\'entretien, cas traité à part)', () => {
    const bely = IMPORT_COLLABORATOR_MAPPING.find((entry) => normalizeName(entry.name) === normalizeName('Guillaume Bely'));
    expect(bely).toBeUndefined();
  });
});
