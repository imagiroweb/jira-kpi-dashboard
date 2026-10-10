# Performance (cycles, objectifs, évaluations, import OKR)

## 1. Objectif

Suivre les objectifs semestriels de chaque collaborateur (objectifs, résultats clés ou KR), leur avancement, l'auto-évaluation, l'évaluation du manager et la grille d'évaluation générale. Public : collaborateurs (leur fiche), leads (fiches de leurs équipes), accès global (tout). Pages `performance` (ma fiche, équipe) et `performanceDashboard` (vue d'ensemble).

## 2. Parcours utilisateur

| Qui | Actions |
|---|---|
| Collaborateur | Consulter sa fiche ; mettre à jour l'avancement d'un KR (valeur, note, lien de preuve) ; s'auto-évaluer par objectif ; faire évoluer le statut de ses actions à mener. |
| Lead | Voir les fiches de ses équipes ; définir les objectifs et KR ; évaluer chaque objectif ; saisir la grille générale ; gérer les actions à mener (pas sur sa propre fiche) ; clôturer la fiche. |
| Accès global (super admin ou rôle `performanceGlobalAccess`) | Tout ce qui précède pour toutes les équipes ; créer et activer les cycles ; gérer le référentiel de la grille ; importer les OKR et les grilles. |

## 3. Règles métier

### Cycles

- Statuts : brouillon, actif, clos. Un seul cycle actif : en activer un ferme les autres. Libellé unique. Création et modification réservées à l'accès global ; liste ouverte à tous.
- Une fiche par collaborateur et par cycle, créée à la volée sur le cycle actif uniquement. L'équipe est copiée à la création.

### Statut de la fiche

| Statut | Condition |
|---|---|
| Dossier manquant | aucun objectif |
| En cours | au moins un objectif |
| Complète | uniquement par l'action « clôturer » : >= 1 objectif, un statut d'évaluation manager sur chaque objectif, et grille générale manager complète (4 axes ayant chacun au moins un sous-critère) |

### Objectifs

- Maximum 4 objectifs. Somme des poids des objectifs = 1 (tolérance 0,01). Pour chaque objectif ayant des KR, somme des poids des KR = 1. Identifiants uniques, titre obligatoire.
- Mise à jour par fusion : l'avancement des éléments conservés est gardé, un élément absent de la liste est supprimé.
- Axes de compétence suggérés par mots-clés (2 maximum).

### Avancement

| Indicateur | Formule |
|---|---|
| Avancement d'un KR | valeur 0 à 100 (arrondie, bornée), historique conservé |
| Avancement d'un objectif | somme(poids KR x avancement KR) / somme(poids KR) |
| Score de la fiche | somme(poids objectif x avancement objectif) / somme(poids objectif) |
| Score pondéré d'un objectif | poids x avancement (affiché « x / y pts ») |
| Statut d'un KR | >= 80 : dans les temps ; >= 50 : en progression ; sinon à risque |

Le collaborateur ne peut saisir l'avancement que si le cycle est actif.

### Rythme du cycle et coaching

- Cycle de 6 mois. `ratio écoulé = bornage 0 à 1 de (maintenant - début) / (fin - début)` ; attendu = ratio x 100.
- Tolérance de 8 points : avancement > attendu + 8 : performant ; < attendu - 8 : action à mener ; sinon en progression.

### Évaluations

- Par objectif : statut (non atteint, partiellement atteint, atteint, dépassé) et commentaire, en auto-évaluation et côté manager. Bilan qualitatif (réussites, difficultés, axes de progrès, appréciation globale) en deux colonnes : collaborateur et manager. Textes libres chiffrés en base.
- L'évaluation manager ne crée jamais la fiche.

### Actions à mener (par objectif)

| Règle | Valeur |
|---|---|
| Créer / modifier / supprimer | lead de l'équipe ou accès global, jamais sur sa propre fiche (sauf accès global) |
| Statuts | à faire, en cours, terminé |
| Collaborateur | peut changer uniquement le statut |
| Libellé / nombre | 500 caractères max ; 20 actions max par objectif |
| En retard | non terminée et échéance dépassée (à partir du lendemain) |
| Taux de réalisation | terminées / total x 100 |

L'ancien texte libre d'action de coaching est repris comme une action.

### Grille d'évaluation générale

- 4 axes x 3 sous-critères, notes de 1 à 5. Score d'un axe = moyenne de ses sous-critères ; score global = moyenne des axes renseignés (vide si rien noté).
- Auto-évaluation : alimentée par import. Évaluation manager : choix d'une réponse parmi 5 du référentiel du profil (dev_back, dev_front, qa, dba) ; le score est déduit de la réponse côté serveur ; le profil est mémorisé sur la fiche.
- Référentiel modifiable par l'accès global : chaque critère a exactement 5 réponses valant 1 à 5 points.

### Portée

| Qui | Voit |
|---|---|
| Accès global | toutes les fiches |
| Lead | fiches de ses équipes |
| Collaborateur | la sienne |
| Fiche sans équipe | accès global uniquement |

### Import

| Import | Règle |
|---|---|
| OKR | fichiers .xlsx / .ods, onglet « OBJECTIFS S2-26 », 5 emplacements d'objectif sur lignes fixes |
| Grilles d'évaluation | nom lu en B3, notes en colonne F lignes 7 à 18 ; les fichiers agrégés sont ignorés |
| Communs | accès global ; 8 Mo par fichier, 40 fichiers max ; simulation possible ; écriture seulement sur un cycle actif ; rapprochement par email ou nom avec le roster |

## 4. Données

| Entité | Champs importants |
|---|---|
| Cycle | libellé, dates, statut |
| Fiche | collaborateur, cycle, équipe, statut, objectifs, grille, profil de poste |
| Objectif | titre, poids, KR, évaluation collaborateur et manager, axes, actions |
| KR | titre, poids, avancement, historique (date, valeur, note, preuve) |
| Action | libellé, échéance, statut |
| Référentiel de grille | profil, critères, 5 réponses notées |

## 5. Limites connues

- Pas de saisie manuelle de l'auto-évaluation générale : seulement par import.
- Durée de cycle de 6 mois fixée pour le calcul du rythme.
- Après anonymisation d'un utilisateur, ses fiches restent pour les statistiques, sans texte libre.
- Format d'import figé (onglet, cellules) : tout autre modèle est rejeté ou mal lu.
- Éléments lus dans le code sans parcours écran vérifié : les libellés exacts des écrans peuvent différer.

## 6. Références code

- `backend/src/routes/performanceRoutes.ts` : toutes les routes `/api/performance`.
- `backend/src/domain/performance/performanceReview.ts` : formules et statuts.
- `backend/src/domain/performance/performanceScope.ts` : portée.
- `backend/src/domain/performance/objectiveActions.ts` : actions à mener.
- `backend/src/domain/performance/generalAssessmentReferential.ts` : grille.
- `backend/src/domain/performance/importObjectives.ts`, `importGeneralAssessment.ts` : imports.
- `backend/src/domain/performance/entities/PerformanceCycle.ts`.
- `backend/src/scripts/import-okr/` : scripts d'import en ligne de commande.
- `frontend/src/domain/performance.ts` : calculs côté écran.
- `frontend/src/components/MyPerformancePage.tsx`, `TeamPerformancePage.tsx`, `GeneralAssessmentSummary.tsx`, `GeneralManagerAssessmentForm.tsx`, `ObjectivePaceSummary.tsx`, `ObjectiveActionsPanel.tsx`.
