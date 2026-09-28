/**
 * Anonymisation d'une fiche de performance (RGPD : droit à l'effacement, fin de durée de
 * conservation) — à la place d'une suppression, pour conserver les statistiques des cycles passés.
 *
 * Conservé : cycle, équipe, statut, objectifs et KR (intitulés, pondérations, avancement et son
 * historique chiffré), statuts d'évaluation, scores de la grille de compétences (et la réponse du
 * référentiel choisie), statuts et échéances des actions.
 *
 * Effacé : tout le texte libre rédigé sur la personne — bilans qualitatifs (collaborateur et
 * manager), commentaires d'évaluation, actions d'accompagnement, notes et liens de preuve des mises
 * à jour de KR, libellés des actions. Le lien vers le compte est rompu (nouvel identifiant
 * aléatoire) et le nom de la personne, lorsqu'elle est l'autrice d'une entrée, est remplacé.
 */
export const ANONYMIZED_REVIEW_SUBJECT = { firstName: 'Collaborateur', lastName: 'anonymisé' } as const;
export const ANONYMIZED_ACTION_LABEL = 'Action anonymisée';
export const ANONYMIZED_AUTHOR_LABEL = 'Collaborateur anonymisé';

interface Author {
  id: string;
  name: string;
  role?: string;
}

interface ReviewLike {
  objectives?: Array<{
    selfAssessment?: { comment?: string; coachingAction?: string; [k: string]: unknown };
    managerAssessment?: { comment?: string; coachingAction?: string; [k: string]: unknown };
    krs?: Array<{ progressHistory?: Array<{ note?: string; evidenceUrl?: string; updatedBy?: Author; [k: string]: unknown }>; [k: string]: unknown }>;
    actions?: Array<{ label?: string; createdBy?: Author; updatedBy?: Author; [k: string]: unknown }>;
    [k: string]: unknown;
  }>;
  qualitative?: Record<string, { self?: string; manager?: string } | undefined>;
  definedBy?: Author;
  createdBy?: Author;
  updatedBy?: Author;
}

function anonymizeAuthor(author: Author | undefined, subjectId: string, newId: string): Author | undefined {
  if (!author || author.id !== subjectId) return author;
  return { ...author, id: newId, name: ANONYMIZED_AUTHOR_LABEL };
}

function withoutText<T extends { comment?: string; coachingAction?: string }>(assessment: T | undefined): T | undefined {
  if (!assessment) return assessment;
  const copy = { ...assessment };
  delete copy.comment;
  delete copy.coachingAction;
  return copy;
}

/**
 * Calcule les champs anonymisés d'une fiche (objet simple, sans effet de bord).
 * `subjectId` = identifiant du compte de la personne, `newId` = identifiant aléatoire qui le remplace.
 */
export function anonymizeReviewContent(review: ReviewLike, subjectId: string, newId: string) {
  const objectives = (review.objectives ?? []).map((objective) => ({
    ...objective,
    selfAssessment: withoutText(objective.selfAssessment),
    managerAssessment: withoutText(objective.managerAssessment),
    krs: (objective.krs ?? []).map((kr) => ({
      ...kr,
      progressHistory: (kr.progressHistory ?? []).map((update) => {
        const copy = { ...update, updatedBy: anonymizeAuthor(update.updatedBy, subjectId, newId) };
        delete copy.note;
        delete copy.evidenceUrl;
        return copy;
      })
    })),
    actions: (objective.actions ?? []).map((action) => ({
      ...action,
      label: ANONYMIZED_ACTION_LABEL,
      createdBy: anonymizeAuthor(action.createdBy, subjectId, newId),
      updatedBy: anonymizeAuthor(action.updatedBy, subjectId, newId)
    }))
  }));

  const qualitative = Object.fromEntries(
    Object.keys(review.qualitative ?? {}).map((key) => [key, {}])
  ) as Record<string, Record<string, never>>;
  for (const key of ['successes', 'challenges', 'growthAreas', 'overallReview']) {
    qualitative[key] = {};
  }

  return {
    objectives,
    qualitative,
    definedBy: anonymizeAuthor(review.definedBy, subjectId, newId),
    createdBy: anonymizeAuthor(review.createdBy, subjectId, newId),
    updatedBy: anonymizeAuthor(review.updatedBy, subjectId, newId)
  };
}
