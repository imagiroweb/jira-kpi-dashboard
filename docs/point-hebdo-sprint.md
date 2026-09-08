# Page Point hebdo sprint (Dev & QA)

Documentation fonctionnelle et technique de la page **Point hebdo** (`PointHebdoPage.tsx`) : un
document de réunion partagé, éditable et persisté, qui sert de support au point hebdomadaire entre
les leads Dev et QA.

## FR — Vue d’ensemble

Contrairement aux autres pages de l’application, qui affichent des données calculées en lecture
seule, cette page est un **document collaboratif** : plusieurs personnes le remplissent pendant la
réunion, chaque modification est enregistrée en base, et le point est reconduit d’une semaine à
l’autre.

### Déroulé de la séance

La séance est cadrée à 60 minutes réparties en quatre phases (`MEETING_PHASES`). Le minuteur est
local au navigateur (non persisté) : il décompte le budget de la phase courante et passe en rouge
en cas de dépassement, l’affichage devenant négatif.

| Phase | Intitulé | Budget |
|-------|----------|--------|
| 1 | Avancée du sprint — les chiffres | 20 min |
| 2 | Points bloquants | 15 min |
| 3 | Interactions entre équipes | 10 min |
| 4 | Amélioration continue | 15 min |

Cliquer sur une phase de l’agenda recale le minuteur sur son budget et fait défiler la page jusqu’à
la section correspondante.

### Contenu du document

- **Chiffres par équipe** : une carte par équipe (rôle Dev ou QA), avec des indicateurs
  `libellé / valeur / cible`. Une barre d’avancement apparaît dès que la cible est un nombre
  strictement positif (`computeMetricProgress`, borné à 100 %).
- **Points bloquants** : sévérité (`Faible`, `Moyen`, `Élevé`, `Critique`), description, ce qu’il
  faut pour lever le blocage, responsable, case « Levé ».
- **Interactions entre équipes** : émetteur → destinataire, sujet, statut (`À traiter`, `En cours`,
  `OK`).
- **Amélioration continue** : rétro à trois colonnes (Continuer / Arrêter / Essayer) et suivi
  d’actions (action, responsable, échéance, statut `À faire` / `En cours` / `Fait`).

### Préremplissage depuis Jira

Chaque équipe peut être rattachée à un board Jira configuré. Les chiffres sont alors repris du
sprint actif du board (ou du dernier sprint clos), via `GET /api/jira/dashboard/sprint-issues-all`
sans paramètre de date — c’est le backend qui résout le sprint courant.

| Indicateur | Source |
|------------|--------|
| Points engagés | `storyPointsByStatus.total` |
| Points réalisés | `storyPointsByStatus.resolved` |
| Tickets en cours | `statusCounts.inProgress` |
| Tickets terminés | `statusCounts.resolved` |
| Tickets en QA | `statusCounts.qa` |
| Bugs ouverts | issues de type bug dont `statusCategoryKey ≠ done` |
| Bugs détectés | issues de type bug du sprint |

Le rapprochement se fait sur le **libellé de l’indicateur**, normalisé (minuscules, accents
supprimés). Renommer un indicateur le déconnecte donc du préremplissage. Les indicateurs QA sans
équivalent dans Jira (cas de test exécutés, taux de réussite, couverture, bugs critiques) restent
en saisie manuelle.

Deux déclenchements :

- **automatique**, une seule fois à l’ouverture d’un point dont les équipes rattachées à un board
  n’ont encore aucune valeur (cas d’un point fraîchement reconduit) ; silencieux en cas d’échec ;
- **manuel**, via le bouton « Préremplir depuis Jira ».

Dans les deux cas, une valeur saisie à la main n’est **jamais** écrasée : seules les cases vides et
celles déjà issues de Jira (`source: 'jira'`) sont mises à jour. Toute saisie manuelle repasse
l’indicateur en `source: 'manual'`.

### Sauvegarde

Chaque modification met à jour l’état local puis planifie un `PATCH` après 500 ms d’inactivité ;
les modifications successives sont fusionnées en un seul appel. L’indicateur de la barre d’outils
affiche « Enregistrement… », « Sauvegardé » ou « Enregistrement impossible ». La dernière écriture
gagne : il n’y a pas de résolution de conflit si deux personnes modifient la même ligne au même
moment.

### Nouveau point

Le bouton « Nouveau point » crée le point suivant (`POST /api/meetings/:id/next`) :

- le numéro de sprint est incrémenté s’il est numérique, sinon conservé tel quel ;
- les équipes, les libellés d’indicateurs, leurs cibles et le board associé sont reconduits, mais
  les valeurs sont vidées ;
- les actions dont le statut n’est pas `Fait` sont reportées — c’est le fil rouge de l’amélioration
  continue ;
- objectif, blocages, interactions et rétro repartent de zéro.

### Compte-rendu et impression

« Copier le compte-rendu » place dans le presse-papier un texte structuré prêt à coller dans un
canal d’équipe (`buildMeetingReport`). Si le navigateur refuse l’accès au presse-papier, le texte
s’affiche dans une modale pour une copie manuelle. « Imprimer / PDF » s’appuie sur les règles
`@media print` de `index.css`, qui masquent le minuteur, la navigation et les boutons d’édition et
basculent sur un rendu clair. Les zones de texte longues ne s’étendent pas à l’impression : c’est
la limite connue de l’export papier, le compte-rendu texte reste la voie fiable pour un contenu
volumineux.

## Backend

- **Modèle** : `WeeklySprintMeeting` (`backend/src/domain/meeting/entities/WeeklySprintMeeting.ts`),
  sous-schémas embarqués sans `_id`, identifiants de ligne fournis par le client, `timestamps`,
  index sur `sprint.date`, `createdAt` et `createdBy.id`.
- **Logique pure** : `backend/src/domain/meeting/weeklySprintMeeting.ts` — structure par défaut,
  reconduction (`buildNextMeetingDraft`) et validation des payloads
  (`parseWeeklyMeetingPatch`, seules les sections présentes dans le corps sont retenues, plafonds de
  taille et énumérations vérifiés).
- **Routes** (`backend/src/routes/meetingRoutes.ts`, montées sur `/api/meetings`) : toutes derrière
  `authenticate`.

| Verbe | Chemin | Rôle |
|-------|--------|------|
| `GET` | `/api/meetings` | liste résumée, 30 par défaut, 100 au maximum |
| `GET` | `/api/meetings/latest` | dernier point ; en crée un vierge s’il n’en existe aucun |
| `GET` | `/api/meetings/:id` | détail complet |
| `POST` | `/api/meetings` | nouveau point vierge |
| `POST` | `/api/meetings/:id/next` | point suivant, avec reconduction |
| `PATCH` | `/api/meetings/:id` | mise à jour partielle (sauvegarde automatique) |
| `DELETE` | `/api/meetings/:id` | suppression |

## Permissions

La page est déclarée sous l’identifiant `pointHebdo` dans `PAGE_IDS` (`Role.ts`), le type `PageId`
du store, la `Sidebar` et le rendu de `App.tsx`. Le seed des rôles l’active pour Dev, PO et Product,
et la laisse désactivée pour Utilisateur et Marketing. Les rôles déjà en base sont mis à jour au
démarrage du backend, la clé étant réécrite par le seed.

## Tests

- **Backend** : `weeklySprintMeeting.test.ts` (structure, reconduction, validation) et
  `meetingRoutes.test.ts` (routes, codes 400/401/404/500).
- **Frontend** : `pointHebdoSprint.test.ts` (minuteur, avancement, préremplissage, compte-rendu) et
  `PointHebdoPage.test.tsx` (affichage, sauvegarde automatique, édition des sections, minuteur,
  préremplissage, historique, nouveau point).
