import mongoose, { Document, Schema } from 'mongoose';
import { CompetencyAxis } from './PerformanceReview';

/**
 * Profil de référentiel de notation détaillée — un profil par grande famille de poste. La
 * composante Technique varie selon le profil (voir `evaluations-individuelles/*.xlsx`, onglet
 * "Référentiel évaluation" : 3 variantes constatées sur les 21 fichiers réels — Dev, QA, DBA) ;
 * `dev_back` et `dev_front` partagent aujourd'hui le même contenu technique ("Dev"), mais sont
 * stockés comme deux profils distincts pour pouvoir diverger plus tard sans changement de schéma.
 * Les 3 autres axes (Impact/Collaboration/Leadership) sont identiques d'un profil à l'autre dans
 * les fichiers sources, mais sont dupliqués par profil pour la même raison.
 */
export const ROLE_PROFILES = ['dev_back', 'dev_front', 'qa', 'dba'] as const;
export type RoleProfile = (typeof ROLE_PROFILES)[number];

/**
 * Une réponse verbeuse possible pour un sous-critère, avec ses points. Les points sont stockés
 * explicitement (pas déduits de la position dans `answers`) pour rester modifiables indépendamment
 * de l'ordre d'affichage, si le barème doit évoluer sans toucher au texte des réponses.
 */
export interface IReferentialAnswer {
  text: string;
  points: number;
}

/** Un sous-critère noté : toujours 5 réponses, de la moins bonne à la meilleure. */
export interface IReferentialCriterion {
  label: string;
  answers: IReferentialAnswer[];
}

export type IReferentialAxes = Record<CompetencyAxis, IReferentialCriterion[]>;

export interface IGeneralAssessmentReferentialProfile extends Document {
  roleProfile: RoleProfile;
  /** Libellé d'affichage, ex. "Dev Back", "QA". */
  label: string;
  axes: IReferentialAxes;
  updatedBy?: { id: string; name: string };
  createdAt: Date;
  updatedAt: Date;
}

const ReferentialAnswerSchema = new Schema<IReferentialAnswer>(
  {
    text: { type: String, required: true, trim: true },
    points: { type: Number, required: true, min: 1, max: 5 }
  },
  { _id: false }
);

const ReferentialCriterionSchema = new Schema<IReferentialCriterion>(
  {
    label: { type: String, required: true, trim: true },
    answers: { type: [ReferentialAnswerSchema], default: [] }
  },
  { _id: false }
);

const ReferentialUpdatedBySchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true }
  },
  { _id: false }
);

const GeneralAssessmentReferentialProfileSchema = new Schema<IGeneralAssessmentReferentialProfile>(
  {
    roleProfile: { type: String, enum: ROLE_PROFILES, required: true, unique: true },
    label: { type: String, required: true, trim: true },
    axes: {
      technique: { type: [ReferentialCriterionSchema], default: [] },
      impact: { type: [ReferentialCriterionSchema], default: [] },
      collaboration: { type: [ReferentialCriterionSchema], default: [] },
      leadership: { type: [ReferentialCriterionSchema], default: [] }
    },
    updatedBy: { type: ReferentialUpdatedBySchema }
  },
  { timestamps: true }
);

export const GeneralAssessmentReferentialProfile = mongoose.model<IGeneralAssessmentReferentialProfile>(
  'GeneralAssessmentReferentialProfile',
  GeneralAssessmentReferentialProfileSchema
);

