/**
 * Logique métier pure du référentiel de notation détaillée (réponses verbeuses + points par
 * profil de poste) : extraction depuis les fichiers Excel sources, validation d'un payload de
 * (re)définition, résolution des points d'une réponse. Voir `entities/GeneralAssessmentReferentialProfile.ts`
 * pour le modèle de données et `evaluations-individuelles/*.xlsx` (onglet "Référentiel évaluation")
 * pour la structure source : ligne = sous-critère, colonne C = libellé, colonnes D à H = les 5
 * réponses possibles de la moins bonne à la meilleure.
 */
import type ExcelJS from 'exceljs';
import { COMPETENCY_AXES, CompetencyAxis } from './entities/PerformanceReview';
import { IReferentialAnswer, IReferentialAxes, IReferentialCriterion } from './entities/GeneralAssessmentReferentialProfile';
import type { GeneralAssessmentAxesInput } from './performanceReview';

const LABEL_COL = 'C';
const ANSWER_COLS = ['D', 'E', 'F', 'G', 'H'];
const ANSWER_COUNT = ANSWER_COLS.length;

/** Bornes de lignes du sous-critère → axe, constatées identiques sur les 21 fichiers réels inspectés. */
const AXIS_ROW_RANGES: { start: number; end: number; axis: CompetencyAxis }[] = [
  { start: 6, end: 8, axis: 'technique' },
  { start: 9, end: 11, axis: 'impact' },
  { start: 12, end: 14, axis: 'collaboration' },
  { start: 15, end: 17, axis: 'leadership' }
];

function cellText(worksheet: ExcelJS.Worksheet, address: string): string {
  const value = worksheet.getCell(address).value;
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim();
  return String(value).trim();
}

function emptyReferentialAxes(): IReferentialAxes {
  return { technique: [], impact: [], collaboration: [], leadership: [] };
}

export interface ParseReferentialResult {
  axes: IReferentialAxes;
  warnings: string[];
}

/**
 * Extrait les 12 sous-critères (4 axes × 3) et leurs 5 réponses de l'onglet "Référentiel
 * évaluation" d'un fichier `evaluations-individuelles/<nom>.xlsx`. Les points sont dérivés de la
 * position de la réponse (1 à 5) au moment de l'extraction — ils restent ensuite librement
 * modifiables en base, indépendamment du texte ou de l'ordre. Un sous-critère avec moins de 5
 * réponses trouvées est ignoré (signalé en avertissement) plutôt que d'enregistrer une grille
 * incomplète.
 */
export function parseReferentialFromWorksheet(worksheet: ExcelJS.Worksheet): ParseReferentialResult {
  const warnings: string[] = [];
  const axes = emptyReferentialAxes();

  for (const { start, end, axis } of AXIS_ROW_RANGES) {
    for (let row = start; row <= end; row++) {
      const label = cellText(worksheet, `${LABEL_COL}${row}`);
      if (!label) {
        warnings.push(`Ligne ${row} (axe ${axis}) : libellé de sous-critère manquant — ignorée.`);
        continue;
      }

      const answers: IReferentialAnswer[] = [];
      ANSWER_COLS.forEach((col, index) => {
        const text = cellText(worksheet, `${col}${row}`);
        if (!text) return;
        answers.push({ text, points: index + 1 });
      });

      if (answers.length !== ANSWER_COUNT) {
        warnings.push(`Ligne ${row} (${label}) : ${answers.length}/${ANSWER_COUNT} réponse(s) trouvée(s) — ignorée.`);
        continue;
      }

      axes[axis].push({ label, answers });
    }
  }

  return { axes, warnings };
}

export interface ReferentialAxesValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Valide un payload de (re)définition complète des 4 axes d'un profil (`PUT
 * /general-assessment-referential/:roleProfile`) : les 4 axes doivent être présents, chaque
 * critère avoir un libellé et exactement 5 réponses, chaque réponse un texte et des points 1-5.
 * Ne mute rien, ne consulte pas la base.
 */
export function validateReferentialAxes(axes: unknown): ReferentialAxesValidation {
  const errors: string[] = [];

  if (!axes || typeof axes !== 'object' || Array.isArray(axes)) {
    return { valid: false, errors: ['axes doit être un objet'] };
  }

  const record = axes as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!(COMPETENCY_AXES as readonly string[]).includes(key)) {
      errors.push(`Axe inconnu : ${key}`);
    }
  }

  for (const axis of COMPETENCY_AXES) {
    const criteria = record[axis];
    if (criteria === undefined) {
      errors.push(`L'axe ${axis} est requis`);
      continue;
    }
    if (!Array.isArray(criteria)) {
      errors.push(`L'axe ${axis} doit être un tableau de critères`);
      continue;
    }
    criteria.forEach((criterion: unknown, index: number) => {
      const c = criterion as Partial<IReferentialCriterion> | undefined;
      if (!c?.label?.trim()) {
        errors.push(`Axe ${axis}, critère ${index + 1} : libellé requis`);
      }
      if (!Array.isArray(c?.answers) || c.answers.length !== ANSWER_COUNT) {
        errors.push(`Axe ${axis}, critère ${index + 1} : exactement ${ANSWER_COUNT} réponses requises`);
        return;
      }
      c.answers.forEach((answer: unknown, answerIndex: number) => {
        const a = answer as Partial<IReferentialAnswer> | undefined;
        if (!a?.text?.trim()) {
          errors.push(`Axe ${axis}, critère ${index + 1}, réponse ${answerIndex + 1} : texte requis`);
        }
        if (typeof a?.points !== 'number' || a.points < 1 || a.points > 5) {
          errors.push(`Axe ${axis}, critère ${index + 1}, réponse ${answerIndex + 1} : points requis entre 1 et 5`);
        }
      });
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Résout les points attribués à une réponse choisie, à partir du référentiel courant d'un profil
 * — c'est la seule source de vérité pour transformer une réponse verbeuse en score numérique.
 * `undefined` si le sous-critère ou la réponse ne sont pas (ou plus) reconnus dans le référentiel
 * (ex. libellé renommé, réponse retirée) plutôt que de deviner un score.
 */
export function resolveAnswerPoints(
  axes: IReferentialAxes,
  axis: CompetencyAxis,
  criterionLabel: string,
  answerText: string
): number | undefined {
  const criterion = axes[axis].find((entry) => entry.label === criterionLabel);
  return criterion?.answers.find((answer) => answer.text === answerText)?.points;
}

/**
 * Un sous-critère tel que noté par le manager : uniquement la réponse verbeuse choisie (son
 * texte exact, tel qu'il apparaît dans le référentiel du profil de poste ciblé) — jamais de note
 * brute. Décision produit : le manager sélectionne une réponse parmi les 5 du référentiel plutôt
 * que de saisir un chiffre, pour que le score reste toujours traçable à une réponse réelle (voir
 * `resolveManagerAxesAnswers`).
 */
export interface GeneralAssessmentManagerSubCriterionInput {
  label: string;
  answer: string;
}

/** (Re)notation manager, axe par axe — même absence-vaut-non-modifié que `GeneralAssessmentAxesInput`. */
export type GeneralAssessmentManagerAxesInput = Partial<Record<CompetencyAxis, GeneralAssessmentManagerSubCriterionInput[]>>;

export interface ManagerAxesValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Valide la FORME d'une notation manager (axes connus, libellé et réponse non vides pour chaque
 * sous-critère) — ne résout PAS les points de chaque réponse, qui nécessite le référentiel du
 * profil de poste ciblé : voir `resolveManagerAxesAnswers`, appelée séparément une fois le profil
 * connu.
 */
export function validateGeneralAssessmentManagerAxes(input: GeneralAssessmentManagerAxesInput): ManagerAxesValidation {
  const errors: string[] = [];

  for (const key of Object.keys(input)) {
    if (!(COMPETENCY_AXES as readonly string[]).includes(key)) {
      errors.push(`Axe inconnu : ${key}`);
    }
  }

  for (const axis of COMPETENCY_AXES) {
    const subCriteria = input[axis];
    if (subCriteria === undefined) continue;
    if (!Array.isArray(subCriteria)) {
      errors.push(`L'axe ${axis} doit être un tableau de sous-critères`);
      continue;
    }
    subCriteria.forEach((subCriterion, index) => {
      if (!subCriterion?.label?.trim()) {
        errors.push(`Axe ${axis}, sous-critère ${index + 1} : libellé requis`);
      }
      if (!subCriterion?.answer?.trim()) {
        errors.push(`Axe ${axis}, sous-critère ${index + 1} : réponse requise`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

export interface ResolvedManagerAxes {
  /** Prêt à passer à `applyGeneralAssessmentAxes` : chaque sous-critère porte son score résolu ET la réponse d'origine. */
  axes: GeneralAssessmentAxesInput;
  errors: string[];
}

/**
 * Résout chaque réponse verbeuse choisie par le manager en son score (1-5), à partir du
 * référentiel COURANT du profil de poste ciblé — jamais de score fourni par le client. Une
 * réponse introuvable dans le référentiel (texte modifié ou retiré entre-temps côté admin, ou
 * réponse invalide envoyée par le client) est signalée en erreur plutôt que notée à 0 en
 * silence, pour ne jamais enregistrer une note qui ne correspondrait à aucune réponse réelle.
 * Un axe absent de `input` n'apparaît pas dans le résultat (même sémantique "non modifié" que
 * `applyGeneralAssessmentAxes`).
 */
export function resolveManagerAxesAnswers(
  input: GeneralAssessmentManagerAxesInput,
  referentialAxes: IReferentialAxes
): ResolvedManagerAxes {
  const errors: string[] = [];
  const axes: GeneralAssessmentAxesInput = {};

  for (const axis of COMPETENCY_AXES) {
    const subCriteria = input[axis];
    if (subCriteria === undefined) continue;

    axes[axis] = subCriteria.map((subCriterion) => {
      const points = resolveAnswerPoints(referentialAxes, axis, subCriterion.label, subCriterion.answer);
      if (points === undefined) {
        errors.push(
          `Axe ${axis}, sous-critère "${subCriterion.label}" : réponse "${subCriterion.answer}" introuvable dans le référentiel`
        );
      }
      return { label: subCriterion.label, score: points ?? 0, answer: subCriterion.answer };
    });
  }

  return { axes, errors };
}
