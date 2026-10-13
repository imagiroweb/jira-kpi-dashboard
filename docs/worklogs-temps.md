# Worklogs et temps passé

## 1. Objectif

Mesurer le temps saisi dans Jira par utilisateur, projet, jour et type de ticket. Public : managers et PO (page `users`, « Détail Utilisateurs »).

## 2. Parcours utilisateur

| Action | Détail |
|---|---|
| Choisir les projets | Au moins un projet obligatoire : sans sélection, aucune donnée n'est chargée. |
| Choisir la période | Sélecteur de dates, ou bouton « Sprint actif » (dates du sprint du premier board configuré). |
| Lire | Graphique de charge par utilisateur et graphique des tickets par utilisateur. |
| Actualiser | Rafraîchissement automatique après une synchronisation. |

## 3. Règles métier

- Rapport : regroupement par jour, utilisateur ou projet.
- Sélection des projets : liste explicite > projet unique > projets configurés.
- Recherche sur la date de saisie du worklog ; sans dates : 30 derniers jours. Le filtre par jour utilise le fuseau Europe/Paris par défaut.
- Total heures = somme des secondes / 3600. Répartitions par utilisateur, projet, type de ticket (heures décroissantes) et par jour (date croissante).
- Facturable : tous les worklogs sont considérés facturables, donc heures facturables = total et non facturables = 0.
- Convention : 1 jour = 8 h pour les conversions.

## 4. Données

| Entité | Champs |
|---|---|
| Worklog | ticket, auteur Jira, secondes passées, date de début, projet, type de ticket |
| Rapport | total heures, par utilisateur / projet / jour / type |

Source : Jira, worklog lu ticket par ticket.

## 5. Limites connues

- La facturation n'est pas gérée (tout est facturable).
- Le regroupement par jour utilise la date UTC alors que le filtre utilise Paris : un worklog proche de minuit peut apparaître sur un autre jour.
- Un lot de tickets volumineux ralentit le rapport (lecture ticket par ticket).
- Les routes de découverte de rapports et de rapports sauvegardés existent mais renvoient des listes vides.

## 6. Références code

- `backend/src/routes/worklogRoutes.ts` : routes `/api/worklog/...`.
- `backend/src/infrastructure/jira/JiraWorklogRepository.ts` : lecture Jira.
- `backend/src/domain/worklog/entities/Worklog.ts` : entité.
- `backend/src/domain/kpi/services/WorklogMetricsCalculator.ts` : métriques.
- `backend/src/infrastructure/jira/mappers/WorklogMapper.ts`.
- `frontend/src/components/UserDetailPage.tsx`, `UserWorkloadChart.tsx`, `UserTicketsChart.tsx`.
