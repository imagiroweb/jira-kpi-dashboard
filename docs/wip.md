# Suivi WIP

## 1. Objectif

Suivre chaque semaine le travail en cours (WIP) des équipes de développement et le comparer à un seuil par équipe (nombre de devs × tickets max par dev), avec le nombre de tickets terminés dans la semaine. Public : leads dev, PO et devs (page `wip`) ; les réglages sont réservés aux super admins. Spec : issue #79.

## 2. Parcours utilisateur

| Écran / action | Qui | Ce qui se passe |
|---|---|---|
| Menu « Suivi WIP » | Rôles avec la page `wip`, super admin | Ouvre la page. Voir [Utilisateurs et rôles](utilisateurs-roles-authentification.md). |
| Période (Du / Au + « Appliquer ») | Idem | Par défaut, les 12 dernières semaines, semaine en cours comprise (lundi → dimanche). Message si dates absentes, début après fin, ou plus de 52 semaines. |
| « Recharger » | Idem | Relance le calcul (le cache serveur peut répondre). La page se recharge aussi après une synchronisation (bouton ou planifiée). |
| Filtre « Équipes » | Idem | « Toutes » (vue globale) ou une sélection de plusieurs équipes. Chaque équipe garde sa couleur. |
| Indicateurs | Idem | « WIP fin de période » (dernière semaine affichée, rouge + « Seuil dépassé de N » si dépassement), « Terminés dernière semaine », « Seuil global » ou « Seuil de la sélection » avec son libellé. |
| Graphique « WIP et terminés par semaine » | Idem | Barres : terminés. Courbe : WIP global ou de la sélection, point rouge agrandi si seuil dépassé. Courbes pointillées par équipe si au moins 2 équipes sélectionnées. Ligne rouge du seuil si défini. Sous-titre : nombre de tickets analysés et boards suivis (ou projets en repli). |
| Infobulle d'une semaine | Idem | Dates, instant de mesure (« vendredi 11/09 à 14:00 »), WIP, terminés, seuil et écart (WIP − seuil), « Seuil dépassé », détail par équipe si plusieurs. |
| Tableau « Seuils par équipe » | Idem | Par équipe : devs, max / dev, seuil (ou « Seuil non défini »), WIP de la dernière semaine (rouge si dépassé). |
| « Modifier les réglages » | Super admin uniquement | Statuts de départ, statuts d'arrivée (listes séparées par des virgules), tickets max par dev par défaut, et par équipe : devs et max / dev (vide = défaut). Les autres voient « Seuls les super admins peuvent les modifier. » |

## 3. Règles métier

### Périmètre

| Élément | Règle |
|---|---|
| Équipes = boards | Une équipe = un board Jira existant : les boards du dashboard (réglage « Connexions et boards » ou `JIRA_BOARD_ID`, boards QA exclus), ou `JIRA_WIP_BOARD_IDS` s'il est défini. Le périmètre de chaque équipe est le filtre de son board ; un ticket présent sur plusieurs boards compte pour chacun, mais une seule fois dans le total. Tous les boards suivis apparaissent dans le filtre, même sans ticket sur la période. Un board sans filtre lisible est ignoré. |
| Projets (repli) | Seulement si aucun board n'est exploitable : `JIRA_WIP_PROJECT_KEYS` (liste séparée par des virgules), sinon tous les projets Jira configurés sauf le projet Support (`JIRA_SUPPORT_PROJECT_KEY`, défaut SB). |
| Types suivis | `JIRA_WIP_ISSUE_TYPES` ; défaut : US, Tâche Tech, Bug, Bug dev (comparaison insensible à la casse). Un type absent de Jira est ignoré (avertissement dans les logs). Sous-tâches, épics et légendes toujours exclues. |
| Équipe (repli) | Sans board exploitable : valeur actuelle du champ équipe Jira (`JIRA_TEAM_FIELD`, défaut `customfield_10001` ; texte, option ou première valeur d'une liste). Vide : « Sans équipe ». |
| Statuts | Historique lu via `changelog/bulkfetch` (dates en millisecondes epoch, converties en ISO). Défaut : départ « In Progress », arrivée « Go Prod ». Noms comparés sans tenir compte de la casse, des accents, des espaces ni de la ponctuation : « In Progress » vise aussi « --In Progress-- » et « Go Prod » vise « --Go Prod-- », « GO-PROD »… (statuts décorés des workflows Jira). |

### Entrée, sortie et retours dans le WIP

Calcul sur l'historique des statuts de chaque ticket, dans l'ordre chronologique :

| Événement | Effet |
|---|---|
| Premier passage dans un statut de départ | Entre dans le WIP. |
| Ticket créé directement dans un statut de départ (statut initial lu dans l'historique, ou statut actuel s'il n'a jamais changé) | Dans le WIP depuis sa date de création. |
| Passage dans un statut d'arrivée | Sort du WIP ; compté terminé à cette date. |
| Passage dans un autre statut de catégorie Jira « terminé » (ex. annulé) | Sort du WIP, non compté terminé. |
| Retour dans un statut non terminé après une sortie | Revient dans le WIP (quel que soit ce statut, « À faire » compris). |
| Passage dans un statut non terminé pendant le WIP (ex. retour en « À faire ») | Reste dans le WIP. |
| Passage en statut d'arrivée sans être jamais passé par un statut de départ | Ni WIP ni terminé. |

Date de terminaison d'un ticket = son **dernier** passage en statut d'arrivée (après une entrée dans le WIP).

### Mesure hebdomadaire

| Notion | Règle |
|---|---|
| Semaine | Lundi → dimanche. Les semaines futures ne sont pas affichées. |
| Point de mesure | Vendredi 14:00, heure de Paris. Semaine en cours avant ce point : maintenant. |
| WIP de la semaine | Tickets dans le WIP au point de mesure : entrée ≤ point < sortie (ou pas encore sortis). |
| Terminés de la semaine | Tickets dont la date de terminaison est dans ]point de mesure précédent (vendredi d'avant 14:00) ; point de mesure]. Un ticket terminé le samedi compte donc la semaine suivante. |
| Plusieurs équipes | Toutes les équipes : total de la semaine (ticket compté une fois). Sélection : somme des équipes sélectionnées. |

### Seuils

| Règle | Détail |
|---|---|
| Seuil d'une équipe | devs × max par dev de l'équipe (ou valeur par défaut, 3 au départ). |
| Pas de seuil | Équipe non réglée, 0 dev, ou « Sans équipe » (ne peut pas avoir de seuil). |
| Seuil global / de la sélection | Somme des seuils définis des équipes prises en compte. |
| Seuil partiel | Au moins une équipe prise en compte sans seuil alors qu'une autre en a un : « Seuil partiel : N ». Aucune équipe avec seuil : « Seuil non défini ». |
| Dépassement | WIP strictement supérieur au seuil ; écart = WIP − seuil. |
| Correspondance équipe | Nom comparé sans tenir compte de la casse. |

### Bornes de saisie

| Champ | Bornes |
|---|---|
| Période | 52 semaines au maximum (lundi → dimanche touchés), début ≤ fin. 12 semaines par défaut. |
| Statuts de départ / d'arrivée | 1 à 20 chacun, 100 caractères max, sans `"` ni `\` ; doublons retirés ; un statut ne peut pas être à la fois de départ et d'arrivée ; refusé s'il n'existe pas dans Jira (« Statut inconnu dans Jira », vérification sautée si Jira ne répond pas). |
| Tickets max par dev (défaut et par équipe) | Entier de 1 à 20 ; par équipe, vide = défaut. |
| Devs par équipe | Entier de 0 à 50. Laissé vide : l'équipe est retirée des réglages. |
| Équipes | 200 au maximum ; nom obligatoire, 100 caractères max, pas de doublon (casse ignorée), pas « Sans équipe ». |

L'enregistrement remplace l'ensemble des réglages. Un changement de statuts relance le calcul.

## 4. Données

| Entité | Champs importants |
|---|---|
| Réglages WIP (document unique partagé) | statuts de départ, statuts d'arrivée, max par dev par défaut, équipes (nom, devs, max par dev), auteur de la dernière modification |
| Semaine calculée (non stockée) | lundi, dimanche, instant de mesure, WIP et terminés au total et par équipe |

Sources externes : Jira (tickets, champ équipe, historique des changements de statut, liste des statuts et de leur catégorie).

| Variable d'environnement | Rôle | Défaut |
|---|---|---|
| `JIRA_WIP_BOARD_IDS` | Boards suivis (une équipe par board) | boards du dashboard |
| `JIRA_WIP_PROJECT_KEYS` | Projets suivis en repli (sans board) | projets configurés hors Support |
| `JIRA_WIP_ISSUE_TYPES` | Types suivis | US, Tâche Tech, Bug, Bug dev |
| `WIP_WEEKLY_CACHE_TTL_MINUTES` | Durée du cache du calcul | 30 |
| `JIRA_TEAM_FIELD` | Champ équipe Jira | customfield_10001 |

## 5. Limites connues

- L'appartenance **actuelle** du ticket à un board est appliquée à tout son historique : un ticket qui change de board (ou d'équipe) bascule rétroactivement.
- Un ticket présent sur deux boards sélectionnés ensemble est compté dans chacun : la somme d'une sélection peut dépasser le total.
- Pas d'historique des seuils : les réglages courants s'appliquent à toutes les semaines passées.
- Résultat en cache mémoire (30 min par défaut, par instance), vidé à chaque synchronisation et à l'enregistrement des réglages. Pendant ce délai, la mesure « maintenant » de la semaine en cours n'avance pas (le calcul repart de Jira au passage du vendredi 14:00).
- Les dates de la requête Jira sont lues dans le fuseau du compte Jira : une marge d'un jour est prise de chaque côté (et la recherche part du vendredi précédant la 1re semaine) ; le filtrage exact se fait ensuite sur l'historique.
- Les statuts de catégorie « terminé » sont lus via l'API Jira : si elle ne répond pas, seuls les statuts d'arrivée font sortir du WIP (un ticket annulé reste alors compté).
- Performance : l'historique des statuts de chaque ticket est lu à chaque calcul ; une longue période (jusqu'à 52 semaines) peut être lente.
- Les tickets « Sans équipe » rendent le seuil global partiel dès qu'un autre seuil est défini.
- La période par défaut est calculée sur la date du navigateur.

## 6. Références code

- `backend/src/domain/wip/wipWeekly.ts` : entrée/sortie du WIP, point de mesure, agrégation par semaine.
- `backend/src/domain/wip/wipSettings.ts` : validation des réglages, seuil d'équipe.
- `backend/src/domain/wip/entities/WipSettings.ts` : réglages en base.
- `backend/src/application/services/WipService.ts` : lecture Jira, périmètre, cache.
- `backend/src/application/services/wipPageAccess.ts` : activation de la page pour les rôles de lead.
- `backend/src/infrastructure/jira/jql.ts` : `buildWipJql`.
- `backend/src/routes/wipRoutes.ts` : `GET /api/wip/weekly`, `GET` et `PUT /api/wip/settings`.
- `frontend/src/components/WipPage.tsx` : page.
- `frontend/src/domain/wipChart.ts` : période, seuils cumulés, lignes du graphique.
