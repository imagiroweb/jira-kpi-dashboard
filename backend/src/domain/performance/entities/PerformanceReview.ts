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

/**
 * Profils de poste utilisés pour la notation manager de la grille générale (voir
 * `GeneralAssessmentReferentialProfile`) : la composante Technique de la grille varie selon le
 * poste (3 variantes réelles constatées sur les fichiers `evaluations-individuelles/*.xlsx` —
 * Dev, QA, DBA — `dev_back`/`dev_front` partageant le même référentiel technique). Défini ici
 * (plutôt que dans `GeneralAssessmentReferentialProfile.ts`, qui importe déjà `CompetencyAxis`
 * depuis ce fichier) pour éviter un import circulaire avec `IPerformanceReview.generalAssessmentRoleProfile`
 * ci-dessous ; ré-exporté depuis `GeneralAssessmentReferentialProfile.ts` pour ne pas casser les
 * imports existants.
 */
export const ROLE_PROFILES = ['dev_back', 'dev_front', 'qa', 'dba'] as const;
export type RoleProfile = (typeof ROLE_PROFILES)[number];

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
  /** Jusqu'à 2 axes de compétence associés à cet objectif (rapprochement OKR / grille de compétences). */
  competencyAxes?: CompetencyAxis[];
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

/**
 * Un sous-critère noté (1-5) de l'auto-évaluation générale — distincte du bilan de cycle
 * (`qualitative` / `competencyScores` ci-dessus, remplis à chaque cycle par le collaborateur et
 * son manager). Reprend la grille à 4 axes × 3 sous-critères des fichiers
 * `evaluations-individuelles/*.xlsx` : une évaluation plus large des compétences, distincte du
 * bilan des objectifs du cycle en cours (voir `applyGeneralSelfAssessment` dans
 * `performanceReview.ts`).
 */
export interface IGeneralAssessmentSubCriterion {
  label: string;
  /** Score 1-5, voir le référentiel des fichiers d'évaluation. */
  score: number;
  /**
   * Réponse verbeuse choisie (texte exact d'une des 5 réponses du référentiel, voir
   * `GeneralAssessmentReferentialProfile`) — uniquement renseignée côté évaluation manager, où le
   * score ci-dessus est toujours résolu serveur à partir de cette réponse (jamais fourni tel quel
   * par le client). Absente pour l'auto-évaluation (import Excel : le score y est déjà connu).
   */
  answer?: string;
}

export type IGeneralAssessmentAxes = Record<CompetencyAxis, IGeneralAssessmentSubCriterion[]>;

export interface IGeneralAssessmentGrid {
  axes: IGeneralAssessmentAxes;
}

/** Alias conservé pour compatibilité : l'auto-évaluation générale du collaborateur, même forme que la grille manager. */
export type IGeneralSelfAssessment = IGeneralAssessmentGrid;
/** Évaluation manager sur la même grille (mêmes 4 axes × sous-critères) — voir `GENERAL_ASSESSMENT_REFERENTIAL` dans `performanceReview.ts` pour les libellés de référence. */
export type IGeneralManagerAssessment = IGeneralAssessmentGrid;

export interface IPerformanceReview extends Document {
  user: mongoose.Types.ObjectId;
  cycle: mongoose.Types.ObjectId;
  /** Équipe au moment de ce cycle — recopiée à la création, indépendante d'un changement d'équipe ultérieur. */
  team?: mongoose.Types.ObjectId;
  teamNameSnapshot?: string;
  objectives: IObjective[];
  qualitative: IQualitative;
  competencyScores: ICompetencyScores;
  /** Auto-évaluation générale (4 axes × 3 sous-critères, score global calculé) — voir `IGeneralSelfAssessment`. */
  generalSelfAssessment: IGeneralSelfAssessment;
  /** Évaluation manager sur la même grille, pour rapprochement avec l'auto-évaluation (repérer les désaccords sous-critère par sous-critère). */
  generalManagerAssessment: IGeneralManagerAssessment;
  /**
   * Profil de poste choisi par le lead/CTO pour la notation manager de la grille générale — fixé
   * sur la fiche (comme `team`/`teamNameSnapshot` ci-dessus) plutôt que dérivé d'un champ sur
   * `User`, qui n'a pas de notion de profil de poste : c'est le manager qui le choisit au moment
   * de noter, pas une propriété intrinsèque et durable du collaborateur.
   */
  generalAssessmentRoleProfile?: RoleProfile;
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
    competencyAxes: { type: [String], enum: COMPETENCY_AXES, default: [] },
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

const GeneralAssessmentSubCriterionSchema = new Schema<IGeneralAssessmentSubCriterion>(
  {
    label: { type: String, required: true, trim: true },
    score: { type: Number, required: true, min: 1, max: 5 },
    answer: { type: String, trim: true }
  },
  { _id: false }
);

const GeneralAssessmentGridSchema = new Schema<IGeneralAssessmentGrid>(
  {
    axes: {
      technique: { type: [GeneralAssessmentSubCriterionSchema], default: [] },
      impact: { type: [GeneralAssessmentSubCriterionSchema], default: [] },
      collaboration: { type: [GeneralAssessmentSubCriterionSchema], default: [] },
      leadership: { type: [GeneralAssessmentSubCriterionSchema], default: [] }
    }
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
    generalSelfAssessment: {
      type: GeneralAssessmentGridSchema,
      default: () => ({ axes: { technique: [], impact: [], collaboration: [], leadership: [] } })
    },
    generalManagerAssessment: {
      type: GeneralAssessmentGridSchema,
      default: () => ({ axes: { technique: [], impact: [], collaboration: [], leadership: [] } })
    },
    generalAssessmentRoleProfile: { type: String, enum: ROLE_PROFILES },
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
