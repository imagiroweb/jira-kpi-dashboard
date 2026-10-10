# Suivi des épics

## 1. Objectif

Suivre l'avancement des épics et légendes Jira : temps passé contre estimation, story points (SP) par statut, équipes concernées, et temps / coût par personne. Public : rôles ayant la page `epics` (PO par défaut).

## 2. Parcours utilisateur

| Action | Détail |
|---|---|
| Liste d'épics | Pagination (20 par page, 100 max), filtres par type (épic / légende / tous), statut Jira (tous / terminé / à faire / en cours) et préfixe de clé (`INT`, `FAC`, `CLI`, `OPT`, `NIM`). Un board est obligatoire. |
| Recherche | Autocomplétion par clé ou titre (20 résultats). |
| Ligne de la liste | Temps (estimé / passé), SP agrégés, barre de progression, dépassement éventuel, équipes. |
| Détail d'un épic (modale) | Arborescence des tickets enfants, sous-totaux, barres « Tickets par statut » et « Story points par statut ». |
| Détail « Story points par statut » | Depuis la fiche épic : « Voir le détail » (données déjà chargées). Depuis la liste : clic sur la zone SP (chargement du détail puis même modale). |
| Temps par personne | Panneau dans la fiche épic : heures, part en %, poste et, selon les droits, taux et coût. |
| Clavier | Échap ferme d'abord la modale « détail story points », un second appui ferme la modale épic. |

## 3. Règles métier

### Catégories de statut

| Catégorie Jira | Libellé | Remarque |
|---|---|---|
| `new` | À faire / reste à faire | |
| `indeterminate` | En cours | |
| `done` | Terminé | |
| vide ou autre | En cours | même règle pour les tickets et les SP |

Les pourcentages des barres empilées sont des entiers dont la somme fait 100 % (le segment « en cours » absorbe l'arrondi).

### Détail des SP par statut

La modale liste tous les nœuds de l'arbre (pas seulement les feuilles), par section : Reste à faire, En cours, Terminé. Dans chaque section : points décroissants, puis clé (ordre alphabétique français).

### Progression

| Indicateur | Règle |
|---|---|
| Référence | macro chiffrage de l'épic si > 0 (en jours-homme convertis en heures, 7,5 h par jour par défaut), sinon estimation originale |
| Progression | `arrondi(temps passé / référence x 100)` ; 0 si la référence est nulle |
| Dépassement | temps passé > référence |
| Légende | enfants = épics rattachées, puis leurs US |
| Temps / estimation d'une US | valeurs agrégées ou propres, plus sous-tâches ; si le temps passé est 0, repli sur la somme des worklogs de chaque ticket |
| Équipes | champ équipe de l'épic et de ses descendants |

Types recherchés : Epic, Legend ; « tous » ajoute Feature et Initiative.

### Temps par personne (issue #44)

- Worklogs de tous les tickets de l'arbre, agrégés par auteur Jira. Cache 15 min.
- Rattachement à un utilisateur de l'application par email, sinon par nom normalisé (« Prénom Nom » ou « Nom Prénom ») ; les homonymes ne sont pas rattachés. Le poste affiché est le nom du rôle.
- Coût = somme (secondes du jour / 3600 x taux en vigueur ce jour), arrondi au centime. Part (`percent`) arrondie à 0,1.
- Droits : le coût total est visible de tous les utilisateurs de la page ; le détail par personne et par rôle (taux, coût) est réservé au super admin et aux rôles ayant la page `couts`.
- « Personnes sans coût » = nombre de personnes sans taux. Voir [Coûts et taux horaires](couts-horaires.md).

## 4. Données

| Entité | Champs |
|---|---|
| Épic / légende | clé, titre, statut et catégorie, équipes, temps estimé / passé, macro chiffrage, SP |
| Ticket enfant | clé, type, statut, SP, temps, enfants |
| Temps par personne | auteur, heures, part, poste, taux, coût |

Source : Jira (champ macro chiffrage `customfield_10992` par défaut, champ équipe `customfield_10001`). Lots de lecture de 3 à 12 épics (8 par défaut).

## 5. Limites connues

- Rattachement des auteurs Jira aux utilisateurs par nom : fragile en cas d'homonymes ou de noms différents.
- Un ticket sans catégorie est compté « en cours ».
- Le préfixe de clé est limité à cinq valeurs fixes.
- Temps passé 0 sur un parent : repli sur les worklogs, plus coûteux (lecture ticket par ticket).

## 6. Références code

- `frontend/src/components/EpicProgressPage.tsx` : page et modales.
- `frontend/src/components/EpicTimeByUserPanel.tsx` : temps par personne.
- `frontend/src/domain/epicProgress.ts` (+ `epicProgress.test.ts`) : agrégats, pourcentages, lignes de détail.
- `backend/src/routes/jiraRoutes.ts` : `/epic-progress`, `/epic-search`, `/epic/:key/details`, `/epic/:key/time-by-user`.
- `backend/src/application/services/WorklogApplicationService.ts` : calculs de progression et de coût.
- Tests : `cd frontend && yarn test src/domain/epicProgress.test.ts`.
