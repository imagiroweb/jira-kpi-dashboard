import mongoose, { Document, Schema } from 'mongoose';

/**
 * Fiche de performance d'un collaborateur pour un cycle donné (une par
 * couple user × cycle). Reprend la structure des fichiers Excel
 * `Entretiens-eval-perf` (objectifs S2-26, bilan, grille de compétences),
 * voir OKR-entretien/documentation-dashboard/04-spec-jira-kpi-performance.md.
 */

export const OBJECTIVE_ASSESSMENT_STATUSES = [
  'non_atteint',
  'partiellement_atteint',
  'atteint',
  'depasse'
] as const;
export type ObjectiveAssessmentStatus = (typeof OBJECTIVE_ASSESSMENT_STATUSES)[number];

export const PERFORMANCE_REVIEW_STATUSES = ['dossier_manquant', 'en_cours', 'complete'] as const;
export type PerformanceReviewStatus = (typeof PERFORMANCE_REVIEW_STATUSES)[number];

export const COMPETENCY_AXES = ['technique', 'impact', 'collaboration', 'leadership'] as const;
export type CompetencyAxis = (typeof COMPETENCY_AXES)[number];

export const REVIEW_AUTHOR_ROLES = ['collaborateur', 'lead', 'cto'] as const;
export type ReviewAuthorRole = (typeof REVIEW_AUTHOR_ROLES)[number];

/** Auteur d'une action sur la fiche (définition d'objectif, mise à jour, évaluation). */
export interface IReviewAuthor {
  id: string;
  name: string;
  role?: ReviewAuthorRole;
}

/**
 * Une mise à jour d'avancement d'un KR. Chaque mise à jour est conservée
 * (pas seulement la dernière valeur) pour donner la trajectoire du KR sur
 * le semestre, avec sa preuve éventuelle (lien Jira/Confluence).
 */
export interface IProgressUpdate {
  value: number;
  note?: string;
  evidenceUrl?: string;
  updatedBy: IReviewAuthor;
  updatedAt: Date;
}

export interface IKeyResult {
  id: string;
  label: string;
  weight: number;
  /** Valeur actuelle (dernière entrée de progressHistory, dupliquée ici pour un accès direct). */
  progress: number;
  progressHistory: IProgressUpdate[];
}

export interface IObjectiveAssessment {
  status?: ObjectiveAssessmentStatus;
  comment?: string;
}

export interface IObjective {
  id: string;
  title: string;
  description?: string;
  weight: number;
  krs: IKeyResult[];
  selfAssessment: IObjectiveAssessment;
  managerAssessment: IObjectiveAssessment;
}

/** Un champ texte du bilan qualitatif, rempli des deux côtés (comme les fichiers Excel actuels). */
export interface IQualitativeEntry {
  self?: string;
  manager?: string;
}

export interface IQualitative {
  successes: IQualitativeEntry;
  challenges: IQualitativeEntry;
  growthAreas: IQualitativeEntry;
  overallReview: IQualitativeEntry;
}

export interface ICompetencyScore {
  self?: number;
  manager?: number;
}

export type ICompetencyScores = Record<CompetencyAxis, ICompetencyScore>;

export interface IPerformanceReview extends Document {
  user: mongoose.Types.ObjectId;
  cycle: mongoose.Types.ObjectId;
  /** Équipe au moment de ce cycle — recopiée à la création, indépendante d'un changement d'équipe ultérieur. */
  team?: mongoose.Types.ObjectId;
  teamNameSnapshot?: string;
  objectives: IObjective[];
  qualitative: IQualitative;
  competencyScores: ICompetencyScores;
  status: PerformanceReviewStatus;
  /** Qui a défini les objectifs de cette fiche (un lead pour son équipe, ou le CTO). */
  definedBy?: IReviewAuthor;
  createdBy: IReviewAuthor;
  updatedBy?: IReviewAuthor;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewAuthorSchema = new Schema<IReviewAuthor>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: REVIEW_AUTHOR_ROLES }
  },
  { _id: false }
);

const ProgressUpdateSchema = new Schema<IProgressUpdate>(
  {
    value: { type: Number, required: true, min: 0, max: 100 },
    note: { type: String, trim: true },
    evidenceUrl: { type: String, trim: true },
    updatedBy: { type: ReviewAuthorSchema, required: true },
    updatedAt: { type: Date, required: true, default: Date.now }
  },
  { _id: false }
);

const KeyResultSchema = new Schema<IKeyResult>(
  {
    id: { type: String, required: true },
    label: { type: String, default: '', trim: true },
    weight: { type: Number, default: 0, min: 0, max: 1 },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    progressHistory: { type: [ProgressUpdateSchema], default: [] }
  },
  { _id: false }
);

const ObjectiveAssessmentSchema = new Schema<IObjectiveAssessment>(
  {
    status: { type: String, enum: OBJECTIVE_ASSESSMENT_STATUSES },
    comment: { type: String, trim: true }
  },
  { _id: false }
);

const ObjectiveSchema = new Schema<IObjective>(
  {
    id: { type: String, required: true },
    title: { type: String, default: '', trim: true },
    description: { type: String, trim: true },
    weight: { type: Number, default: 0, min: 0, max: 1 },
    krs: { type: [KeyResultSchema], default: [] },
    selfAssessment: { type: ObjectiveAssessmentSchema, default: () => ({}) },
    managerAssessment: { type: ObjectiveAssessmentSchema, default: () => ({}) }
  },
  { _id: false }
);

const QualitativeEntrySchema = new Schema<IQualitativeEntry>(
  {
    self: { type: String, trim: true },
    manager: { type: String, trim: true }
  },
  { _id: false }
);

const QualitativeSchema = new Schema<IQualitative>(
  {
    successes: { type: QualitativeEntrySchema, default: () => ({}) },
    challenges: { type: QualitativeEntrySchema, default: () => ({}) },
    growthAreas: { type: QualitativeEntrySchema, default: () => ({}) },
    overallReview: { type: QualitativeEntrySchema, default: () => ({}) }
  },
  { _id: false }
);

const CompetencyScoreSchema = new Schema<ICompetencyScore>(
  {
    self: { type: Number, min: 1, max: 5 },
    manager: { type: Number, min: 1, max: 5 }
  },
  { _id: false }
);

const CompetencyScoresSchema = new Schema<ICompetencyScores>(
  {
    technique: { type: CompetencyScoreSchema, default: () => ({}) },
    impact: { type: CompetencyScoreSchema, default: () => ({}) },
    collaboration: { type: CompetencyScoreSchema, default: () => ({}) },
    leadership: { type: CompetencyScoreSchema, default: () => ({}) }
  },
  { _id: false }
);

const PerformanceReviewSchema = new Schema<IPerformanceReview>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    cycle: { type: Schema.Types.ObjectId, ref: 'PerformanceCycle', required: true },
    team: { type: Schema.Types.ObjectId, ref: 'Team' },
    teamNameSnapshot: { type: String, trim: true },
    objectives: { type: [ObjectiveSchema], default: [] },
    qualitative: {
      type: QualitativeSchema,
      default: () => ({ successes: {}, challenges: {}, growthAreas: {}, overallReview: {} })
    },
    competencyScores: {
      type: CompetencyScoresSchema,
      default: () => ({ technique: {}, impact: {}, collaboration: {}, leadership: {} })
    },
    status: { type: String, enum: PERFORMANCE_REVIEW_STATUSES, default: 'dossier_manquant' },
    definedBy: { type: ReviewAuthorSchema },
    createdBy: { type: ReviewAuthorSchema, required: true },
    updatedBy: { type: ReviewAuthorSchema }
  },
  { timestamps: true }
);

// Une seule fiche par collaborateur et par cycle.
PerformanceReviewSchema.index({ user: 1, cycle: 1 }, { unique: true });
PerformanceReviewSchema.index({ team: 1, cycle: 1 });
PerformanceReviewSchema.index({ cycle: 1, status: 1 });

export const PerformanceReview = mongoose.model<IPerformanceReview>(
  'PerformanceReview',
  PerformanceReviewSchema
);
