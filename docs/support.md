# Support (board Support)

## 1. Objectif

Piloter l'activité du board Support : volumes par statut, pondération, temps de résolution, délai de premier retour, résolution rapide et part du temps consacré au support face au build. Public : rôles ayant la page `support` (Dev par défaut). Les choix de cache et de performance sont détaillés dans [support-board-perf.md](support-board-perf.md).

## 2. Parcours utilisateur

| Action | Détail |
|---|---|
| Choisir la période | Sprint actif (défaut) ou plage de dates. |
| Lire les KPI | Statuts, pondération, agrégats, délais, ratio support / build. |
| Graphe d'évolution | Du début du sprint à min(fin du sprint, aujourd'hui). |
| Snapshots | Enregistrer (nom du sprint obligatoire, notes), lister (50), rouvrir, supprimer. |

## 3. Règles métier

### Périmètre

- Projet support configurable (défaut `SB`).
- Sprint actif : tickets des sprints ouverts. Période : tickets créés entre from et to. Backlog : sans sprint et non terminés.

### Compteurs de statut

Comparaison insensible à la casse du nom du statut et de la catégorie. Les compteurs ne sont pas exclusifs.

| Compteur | Condition |
|---|---|
| À faire | catégorie new, ou « à faire » / « todo » |
| En cours | catégorie indeterminate, ou « en cours » / « progress » |
| QA | « qa », « test » ou « recette » |
| Résolu | catégorie done, ou « terminé » / « done » / « résolu » |

### Pondération

Chaque ticket porte une pondération numérique (champ Jira).

| Niveau | Plage |
|---|---|
| Faible | 1 à 11 |
| Moyen | 12 à 15 |
| Élevé | 16 à 20 |
| Très élevé | >= 21 |

0 ou vide : ignoré. Agrégats par type, assigné (« Non assigné »), label et équipe (« Sans équipe »).

### Délais

| Indicateur | Règle |
|---|---|
| Temps de résolution | tickets terminés avec dates de début et de fin ; jours ouvrés inclusifs lundi-vendredi (même jour = 1) ; moyenne en jours, x 8 pour les heures |
| Premier retour | même calcul, de la création à la date de début |
| Résolution rapide (pondération 16-20) | rapide si jours ouvrés x 8 < 72, soit <= 8 jours ouvrés |
| Résolution rapide (pondération >= 21) | rapide si jours ouvrés x 8 < 24, soit <= 2 jours ouvrés |

Résultat en pourcentage arrondi.

### Ratio support / build

`ratio = heures du projet support / (heures des projets configurés + projet de release + projet support) x 100`, arrondi à 0,1.

- Sprint actif : worklogs sur la plage du sprint du premier board.
- Cumul annuel : lu dans un historique quotidien en base, alimenté par le planificateur (3 derniers jours à chaque cycle).

## 4. Données

| Entité | Champs |
|---|---|
| Ticket support | clé, type, statut, assigné, labels, équipe, pondération, dates de création / début / fin |
| Heures quotidiennes | projet, jour, heures |
| Snapshot support | nom du sprint, notes, plage de dates, KPI figés |

Sources : Jira ; cache KPI 30 min, ratio 60 min.

## 5. Limites connues

- Seuils de résolution rapide : le commentaire du code évoque 9 jours ouvrés, le calcul donne 8 (et 2 pour le seuil 24 h) ; le comportement documenté ici est celui du calcul.
- Champ de pondération : deux valeurs par défaut différentes dans le code (10535 pour les KPI, 10727 pour la lecture des worklogs) ; à fixer par configuration.
- Compteurs de statut non exclusifs : leur somme peut dépasser le total.
- Cumul annuel potentiellement sous-estimé si l'historique n'est que partiellement rempli.
- Snapshots : la plage de dates enregistrée vaut la date du jour par défaut.

## 6. Références code

- `backend/src/application/services/WorklogApplicationService.ts` : KPI support (`getSupportBoardKPI`).
- `backend/src/routes/worklogRoutes.ts` : routes et snapshots support.
- `backend/src/infrastructure/jira/JiraWorklogRepository.ts`.
- `frontend/src/components/SupportDashboard.tsx`.
- `frontend/src/domain/supportTicketTimeline.ts`.
