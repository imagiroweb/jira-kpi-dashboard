/**
 * TU — Modèle GeneralAssessmentReferentialProfile
 */
import { GeneralAssessmentReferentialProfile, ROLE_PROFILES } from './GeneralAssessmentReferentialProfile';

const FIVE_ANSWERS = [
  { text: 'Très faible', points: 1 },
  { text: 'Faible', points: 2 },
  { text: 'Correct', points: 3 },
  { text: 'Bon', points: 4 },
  { text: 'Excellent', points: 5 }
];

function baseProfile() {
  return {
    roleProfile: 'dev_back' as const,
    label: 'Dev Back'
  };
}

describe('GeneralAssessmentReferentialProfile', () => {
  it('expose le modèle mongoose', () => {
    expect(GeneralAssessmentReferentialProfile).toBeDefined();
    expect(GeneralAssessmentReferentialProfile.modelName).toBe('GeneralAssessmentReferentialProfile');
  });

  it('expose les 4 profils de poste', () => {
    expect(ROLE_PROFILES).toEqual(['dev_back', 'dev_front', 'qa', 'dba']);
  });

  it('refuse un profil sans roleProfile/label', () => {
    const profile = new GeneralAssessmentReferentialProfile({});
    const error = profile.validateSync();
    expect(error?.errors.roleProfile).toBeDefined();
    expect(error?.errors.label).toBeDefined();
  });

  it('refuse un roleProfile hors de l’énumération autorisée', () => {
    const profile = new GeneralAssessmentReferentialProfile({ roleProfile: 'stagiaire', label: 'Stagiaire' });
    const error = profile.validateSync();
    expect(error?.errors.roleProfile).toBeDefined();
  });

  it('accepte un profil minimal valide, avec les 4 axes vides par défaut', () => {
    const profile = new GeneralAssessmentReferentialProfile(baseProfile());
    const error = profile.validateSync();
    expect(error).toBeUndefined();
    const axes = profile.toObject().axes;
    expect(axes.technique).toEqual([]);
    expect(axes.impact).toEqual([]);
    expect(axes.collaboration).toEqual([]);
    expect(axes.leadership).toEqual([]);
  });

  it('accepte un axe avec un critère et ses 5 réponses', () => {
    const profile = new GeneralAssessmentReferentialProfile({
      ...baseProfile(),
      axes: {
        technique: [{ label: 'Qualité du code & revues', answers: FIVE_ANSWERS }],
        impact: [],
        collaboration: [],
        leadership: []
      }
    });
    const error = profile.validateSync();
    expect(error).toBeUndefined();
    expect(profile.toObject().axes.technique[0].answers).toHaveLength(5);
  });

  it('refuse des points de réponse hors de la plage 1-5', () => {
    const profile = new GeneralAssessmentReferentialProfile({
      ...baseProfile(),
      axes: {
        technique: [
          {
            label: 'Qualité du code & revues',
            answers: [...FIVE_ANSWERS.slice(0, 4), { text: 'Excellent', points: 9 }]
          }
        ],
        impact: [],
        collaboration: [],
        leadership: []
      }
    });
    const error = profile.validateSync();
    expect(error).toBeDefined();
  });

  it('applique la contrainte d’unicité sur roleProfile au niveau de l’index', () => {
    const indexes = GeneralAssessmentReferentialProfile.schema.indexes();
    const uniqueRoleProfile = indexes.find(
      ([fields, options]) => fields.roleProfile === 1 && options.unique
    );
    expect(uniqueRoleProfile).toBeDefined();
  });
});
