# Suivi des épics (frontend)

Ce document décrit l’écran **Suivi épics** du tableau de bord : progression, KPI et détail des story points par statut.

## Accès

- Menu / navigation interne vers la page `EpicProgressPage` (composant React).
- Données : API `epicApi` (`/jira/epic-progress`, `/jira/epic/:key/details`, `/jira/epic-search`).

## Indicateurs principaux

- **Liste d’épics** : pagination, filtres par type (epic / légende), statut Jira, préfixe de clé (`INT`, `FAC`, `CLI`, `OPT`, `NIM`).
- **Pour chaque ligne** : temps (estimé / passé), story points agrégés, barre de progression, dépassement éventuel, équipes.
- **Détail d’un épic** (modale) : arborescence des tickets enfants, sous-totaux, barres **Tickets par statut** et **Story points par statut**.

## Catégories de statut Jira

La logique métier regroupe les tickets selon `statusCategoryKey` :

| Clé API | Libellé UI |
|---------|------------|
| `new` | À faire / reste à faire |
| `indeterminate` | En cours |
| `done` | Terminé |
| `null` ou autre | Traités comme **En cours** (même règle que `indeterminate` pour les agrégats liste détail SP). |

Les **pourcentages** affichés sur les barres empilées sont calculés via `ticketStatusPercents` (arrondis entiers, ajustement du segment « en cours » pour que la somme fasse 100 %).

## Détail « Story points par statut »

- **Depuis la fiche épic** : la carte KPI « Story points par statut » propose **Voir le détail**. Les données proviennent des enfants déjà chargés (`getDetails`), sans requête supplémentaire.
- **Depuis la liste** : clic sur la zone story points d’une ligne → chargement `getDetails(epicKey)` puis ouverture de la même modale de détail.

La modale liste **tous les nœuds** de l’arbre (pas seulement les feuilles), dans l’ordre :

1. Reste à faire  
2. En cours  
3. Terminé  

Dans chaque section, tri : **points décroissants**, puis **clé** (`localeCompare` `fr`).

La logique pure est centralisée dans `frontend/src/domain/epicProgress.ts` (`buildStoryPointsDetailRows`, agrégats SP, comptage feuilles, etc.), couverte par `frontend/src/domain/epicProgress.test.ts`.

## Raccourcis clavier

- **Échappement** : ferme d’abord la modale « détail story points » si elle est ouverte ; un second appui peut fermer la modale épic selon le flux (détail liste géré au niveau page pour éviter de tout fermer d’un coup).

## Tests

```bash
cd frontend && npm run test -- src/domain/epicProgress.test.ts
```

Ou toute la suite : `npm run test`.
