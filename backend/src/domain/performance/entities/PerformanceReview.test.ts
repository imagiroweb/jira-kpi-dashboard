/**
 * TU — Modèle PerformanceReview
 */
import mongoose from 'mongoose';
import {
  PerformanceReview,
  OBJECTIVE_ASSESSMENT_STATUSES,
  PERFORMANCE_REVIEW_STATUSES,
  COMPETENCY_AXES
} from './PerformanceReview';

function baseReview() {
  return {
    user: new mongoose.Types.ObjectId(),
    cycle: new mongoose.Types.ObjectId(),
    createdBy: { id: 'u1', name: 'CTO', role: 'cto' }
  };
}

describe('PerformanceReview', () => {
  it('expose le modèle mongoose', () => {
    expect(PerformanceReview).toBeDefined();
    expect(PerformanceReview.modelName).toBe('PerformanceReview');
  });

  it('a un statut par défaut "dossier_manquant" parmi les statuts autorisés', () => {
    const schema = PerformanceReview.schema;
    expect(schema.paths.status.options.enum).toEqual(PERFORMANCE_REVIEW_STATUSES);
    expect(schema.paths.status.options.default).toBe('dossier_manquant');
  });

  it('expose les 4 axes de compétence', () => {
    expect(COMPETENCY_AXES).toEqual(['technique', 'impact', 'collaboration', 'leadership']);
  });

  it('refuse une fiche sans user/cycle/createdBy', () => {
    const review = new PerformanceReview({});
    const error = review.validateSync();
    expect(error?.errors.user).toBeDefined();
    expect(error?.errors.cycle).toBeDefined();
    expect(error?.errors.createdBy).toBeDefined();
  });

  it('accepte une fiche minimale valide (objectifs vides par défaut)', () => {
    const review = new PerformanceReview(baseReview());
    expect(review.validateSync()).toBeUndefined();
    expect(review.toObject().objectives).toEqual([]);
  });

  it('déclare les sous-champs qualitative et competencyScores sur le schéma', () => {
    const schema = PerformanceReview.schema;
    expect(schema.path('qualitative.successes.self')).toBeDefined();
    expect(schema.path('qualitative.successes.manager')).toBeDefined();
    expect(schema.path('qualitative.challenges.self')).toBeDefined();
    expect(schema.path('qualitative.growthAreas.self')).toBeDefined();
    expect(schema.path('qualitative.overallReview.self')).toBeDefined();
    COMPETENCY_AXES.forEach((axis) => {
      expect(schema.path(`competencyScores.${axis}.self`)).toBeDefined();
      expect(schema.path(`competencyScores.${axis}.manager`)).toBeDefined();
    });
  });

  it('accepte un objectif avec KR et historique de progression', () => {
    const review = new PerformanceReview({
      ...baseReview(),
      objectives: [
        {
          id: 'obj-1',
          title: 'Delivery produit',
          weight: 0.4,
          krs: [
            {
              id: 'kr-1',
              label: '100% des US en temps',
              weight: 0.4,
              progress: 60,
              progressHistory: [
                {
                  value: 60,
                  evidenceUrl: 'https://jira.adoria.fr/DEV-1',
                  updatedBy: { id: 'u1', name: 'Maxime Andres', role: 'collaborateur' },
                  updatedAt: new Date()
                }
              ]
            }
          ]
        }
      ]
    });
    const error = review.validateSync();
    expect(error).toBeUndefined();
    expect(review.toObject().objectives[0].krs[0].progressHistory).toHaveLength(1);
  });

  it('refuse un statut d\'objectif hors de l\'énumération autorisée', () => {
    const review = new PerformanceReview({
      ...baseReview(),
      objectives: [
        {
          id: 'obj-1',
          title: 'X',
          weight: 1,
          krs: [],
          selfAssessment: { status: 'invalide' as unknown as (typeof OBJECTIVE_ASSESSMENT_STATUSES)[number] }
        }
      ]
    });
    const error = review.validateSync();
    expect(error).toBeDefined();
  });

  it('déclare le sous-champ generalSelfAssessment (4 axes) sur le schéma', () => {
    const schema = PerformanceReview.schema;
    COMPETENCY_AXES.forEach((axis) => {
      expect(schema.path(`generalSelfAssessment.axes.${axis}`)).toBeDefined();
    });
  });

  it('remplit generalSelfAssessment avec les 4 axes vides par défaut', () => {
    const review = new PerformanceReview(baseReview());
    const axes = review.toObject().generalSelfAssessment.axes;
    COMPETENCY_AXES.forEach((axis) => {
      expect(axes[axis]).toEqual([]);
    });
  });

  it('accepte des sous-critères notés (1-5) par axe pour generalSelfAssessment', () => {
    const review = new PerformanceReview({
      ...baseReview(),
      generalSelfAssessment: {
        axes: {
          technique: [
            { label: 'Qualité du code & revues', score: 3 },
            { label: 'Autonomie & résolution de bugs', score: 4 },
            { label: 'Conception & architecture', score: 3 }
          ],
          impact: [],
          collaboration: [],
          leadership: []
        }
      }
    });
    const error = review.validateSync();
    expect(error).toBeUndefined();
    expect(review.toObject().generalSelfAssessment.axes.technique).toHaveLength(3);
  });

  it('refuse un score de sous-critère hors de la plage 1-5', () => {
    const review = new PerformanceReview({
      ...baseReview(),
      generalSelfAssessment: {
        axes: {
          technique: [{ label: 'Qualité du code & revues', score: 7 }],
          impact: [],
          collaboration: [],
          leadership: []
        }
      }
    });
    const error = review.validateSync();
    expect(error).toBeDefined();
  });

  it('applique la contrainte d\'unicité (user, cycle) au niveau de l\'index', () => {
    const indexes = PerformanceReview.schema.indexes();
    const uniqueUserCycle = indexes.find(
      ([fields, options]) => fields.user === 1 && fields.cycle === 1 && options.unique
    );
    expect(uniqueUserCycle).toBeDefined();
  });
});
