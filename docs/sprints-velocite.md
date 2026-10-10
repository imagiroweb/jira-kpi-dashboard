# Sprints, tableau de bord et vélocité

## 1. Objectif

Suivre l'avancement du sprint (ou d'une période) pour les boards Jira configurés : points d'effort (SP), tickets par statut, temps passé, backlog, burndown et tickets résolus par jour. Public : équipes et management (page `dashboard`).

## 2. Parcours utilisateur

| Action | Détail |
|---|---|
| Choisir le mode | « Sprint actif » (défaut) ou période personnalisée (from / to). |
| Lire les cartes | SP par statut, estimation en jours, tickets par statut, backlog, temps passé. |
| Graphique « résolus par jour » | Mode tickets ou points, sprint actif ou période. |
| Burndown | Courbe réelle contre courbe idéale. |
| Snapshots | Enregistrer l'état affiché, lister (50 derniers), rouvrir, supprimer. Droit `dashboard`. |
| Synchroniser | Vide le cache et recharge (voir [Temps réel et planificateur](temps-reel-planificateur.md)). |

## 3. Règles métier

### Classement d'un ticket (ordre de priorité)

| Ordre | Statut KPI | Condition (catégorie Jira ou nom du statut) |
|---|---|---|
| 1 | Résolu | catégorie « done », ou nom contenant done, résolu, resolved, closed, complete, terminé, livré |
| 2 | QA | nom contenant qa, test, testing, validation, recette |
| 3 | En cours | catégorie « indeterminate », ou in progress, en cours, wip, en progression |
| 4 | À faire | catégorie « new », ou to do, à faire, open, backlog, nouveau |

`taux de complétion = arrondi(résolus / total x 100)`.

### Choix du sprint et des boards

- Boards : variable d'environnement, ou liste enregistrée dans les paramètres si elle a été configurée en base (voir [Intégrations et paramètres](integrations-parametres.md)).
- Mode « Sprint actif » : sprint actif du board, sinon dernier sprint clos (par date de fin).
- Mode période : tickets du projet du board dont la date de mise à jour est dans la plage, sans filtre de sprint. Le temps passé et le backlog valent alors 0.

### Cartes

- Estimation en jours = estimation originale (secondes) / 3600 / 8.
- Affichage des durées : < 1 h en minutes, < 8 h en heures, >= 8 h en jours (1 jour = 8 h).
- Temps du sprint = somme des worklogs de tous les tickets du sprint.
- Backlog = tickets correspondant au filtre du board, sinon repli sur le projet.

### Burndown fidèle

- Reconstitué à partir de l'historique des changements de périmètre du sprint (API interne Jira).
- Périmètre initial : événements jusqu'à 2 h après le début du sprint.
- Idéal : `max(0, initial x (1 - jours ouvrés écoulés / jours ouvrés totaux))`, jours ouvrés du lundi au vendredi, sans jours fériés. Maximum 200 jours.
- Valeurs arrondies à 0,01 ; écart = idéal - reste.
- Boards QA comptés en tickets, les autres en SP.

### Tickets résolus par jour

Trois variantes selon la configuration : par équipe (par défaut quand un projet est configuré), par type de ticket (US, Tâche Tech, Bug dev par défaut), ou par board (historique : résolution Jira, sinon statut « Terminé »).

### Vélocité (historique des sprints clos)

| Indicateur | Formule |
|---|---|
| Engagé | somme des SP de tous les tickets du sprint, état courant |
| Réalisé | SP des tickets terminés |
| Taux | arrondi(réalisé / engagé x 100) |
| Écart | réalisé - engagé |
| Moyenne | arrondi(somme des réalisés / n, à 0,1) |
| Tendance | si n < 3 : stable. Sinon sur 3 sprints : variation = (dernier - premier) / premier x 100 ; > 10 % : hausse, < -10 % : baisse, sinon stable |

Nombre de sprints par défaut : 10. Droit `dashboard` ou `users`.

## 4. Données

| Entité | Champs |
|---|---|
| Ticket de sprint | clé, résumé, statut et catégorie, type, assigné, SP, estimation, temps passé, équipe |
| Sprint | nom, dates de début et de fin, état |
| Snapshot dashboard | nom, date, auteur (partie locale de l'email), données figées |

Sources : Jira (API agile, REST, API interne `scopechangeburndownchart`). Champ SP configurable (défaut `customfield_10127`).

## 5. Limites connues

- L'historique de vélocité est exposé par l'API mais aucun écran ne l'appelle.
- Tendance de vélocité : les sprints étant triés du plus récent au plus ancien, les « 3 derniers » éléments pourraient être les 3 plus anciens ; non confirmé. Division par zéro possible si le premier vaut 0.
- Engagé = état courant du sprint (pas le périmètre au démarrage) : les ajouts en cours de sprint gonflent l'engagé.
- Mode période : temps passé et backlog à 0.
- Idéal du burndown sans jours fériés.
- Le classement par nom de statut est textuel : un statut au libellé inattendu tombe dans la catégorie Jira.

## 6. Références code

- `backend/src/domain/kpi/services/SprintMetricsCalculator.ts` : classement et taux.
- `backend/src/domain/sprint/entities/SprintIssue.ts` : statuts d'un ticket.
- `backend/src/application/services/WorklogApplicationService.ts` : dashboard, burndown, résolus par jour.
- `backend/src/application/use-cases/GetVelocityHistory.ts` : vélocité.
- `backend/src/infrastructure/jira/JiraSprintRepository.ts` : lecture Jira des sprints.
- `backend/src/routes/jiraRoutes.ts` : routes dashboard et snapshots.
- `frontend/src/components/SprintDashboard.tsx` : écran.
