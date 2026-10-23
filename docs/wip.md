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
| Graphique « WIP et terminés par semaine » | Idem | Barres : terminés. « Toutes » : courbe « WIP global ». Une équipe cochée : une courbe à son nom. Plusieurs équipes : une courbe par équipe, sans courbe de somme. Point rouge agrandi si le seuil de la courbe globale ou de l'équipe unique est dépassé. Ligne rouge du seuil si défini. Sous-titre : nombre de tickets analysés et boards suivis (ou projets en repli). |
| Infobulle d'une semaine | Idem | Dates, instant de mesure (« vendredi 11/09 à 14:00 »), WIP, terminés, seuil et écart (WIP − seuil), « Seuil dépassé », détail par équipe si plusieurs. |
| Cartes « Plus de 2 tickets » | Idem | Uniquement les collaborateurs au-dessus de 2 tickets dans le WIP (assigné actuel, dernier point de mesure). Chaque carte montre le nombre. Un clic ouvre le détail : clé et statut de chaque ticket. Suit le filtre d'équipes. Un ticket sur plusieurs équipes compte une fois. |
| Répartition par statut | Idem | Nombre de tickets encore dans le WIP au dernier point de mesure, selon le statut qu'ils avaient à cet instant. « --à faire-- » et « --Terminé-- » n'y figurent pas. Suit le filtre d'équipes. Un ticket sur plusieurs équipes compte une fois. |
| Tableau « Seuils par équipe » | Idem | Par équipe : devs, max / dev, seuil (ou « Seuil non défini »), WIP de la dernière semaine (rouge si dépassé). |
| « Modifier les réglages » | Super admin uniquement | Statuts de départ, statuts d'arrivée (listes séparées par des virgules), tickets max par dev par défaut, et par équipe : devs et max / dev (vide = défaut). Les autres voient « Seuls les super admins peuvent les modifier. » |

## 3. Règles métier

### Périmètre

| Élément | Règle |
|---|---|
| Équipes = boards | Une équipe affichée = un board Jira existant, chargé par son id numérique : les boards du dashboard (réglage « Connexions et boards » ou `JIRA_BOARD_ID`, boards QA exclus), ou `JIRA_WIP_BOARD_IDS` s'il est défini. Le périmètre de dev de chaque board est son filtre actuel. Le nom affiché est le nom actuel du board, même s'il a été renommé. Un board sans filtre lisible est ignoré. Tous les boards suivis apparaissent dans le filtre, même sans ticket sur la période. |
| Répartition dans le temps | L'équipe d'un ticket à une semaine est l'id du champ Team (`JIRA_TEAM_FIELD`) à cet instant (valeur actuelle et historique). Un board dont le filtre ne cite qu'un id Team affiche cet id sous le nom actuel du board. Un board qui en cite plusieurs (Choco et Supply sur le board Supply) garde le nom de chaque id : ils ne sont pas fusionnés. Un id précédent, vu sur un ticket de ces boards, charge aussi les tickets qui le portent encore, sous le nom porté par le champ. Sans id Team, le ticket reste sur le ou les boards qui l'ont renvoyé. Vide : « Sans équipe ». |
| Espace Support | Les Bug et Support du projet Support (`JIRA_SUPPORT_PROJECT_KEY`, défaut SB) sont ajoutés au calcul et rangés selon leur id Team. Leur flux est distinct : entrée à « En cours... » (ou « In Progress »), toujours dans le WIP ensuite (« To test », « Ready to Deploy », « En attente », « RÉOUVERT »…), sortie comptée à « Résolu » ou « Terminé ». « Not a ticket » et « À faire » sortent sans compter terminé. Un type absent de Jira est ignoré. |
| Projets (repli) | Seulement si aucun board n'est exploitable : `JIRA_WIP_PROJECT_KEYS` (liste séparée par des virgules), sinon tous les projets Jira configurés sauf le projet Support. Les Bug et Support de SB restent ajoutés. |
| Types suivis | `JIRA_WIP_ISSUE_TYPES` ; défaut : US, Tâche Tech, Bug, Bug dev (comparaison insensible à la casse). Un type absent de Jira est ignoré (avertissement dans les logs). Sous-tâches, épics et légendes toujours exclues. |
| Statuts | Historique lu via `changelog/bulkfetch` (dates en millisecondes epoch, converties en ISO). Défaut enregistré : départ « --In Progress-- », arrivée « --GO PROD-- » (le statut Jira « --Go Prod-- »). Depuis le 12/10/2026, le calcul sort à « --Terminé-- » et garde « --Go Prod-- » dans le WIP. Les anciens défauts « In Progress » et « Go Prod » encore enregistrés sont lus comme les statuts décorés. La casse, les accents et les espaces sont ignorés ; les tirets font partie du nom : « --In Progress-- » n'est pas « In Progress », « --GO PROD-- » n'est pas « GO PROD » ni « GO-PROD ». |

### Entrée, sortie et retours dans le WIP

Calcul sur l'historique des statuts de chaque ticket, dans l'ordre chronologique :

| Événement | Effet |
|---|---|
| Premier passage dans un statut de départ | Entre dans le WIP. |
| Ticket créé directement dans un statut de départ (statut initial lu dans l'historique, ou statut actuel s'il n'a jamais changé) | Dans le WIP depuis sa date de création. |
| Passage dans un statut d'arrivée | Sort du WIP ; compté terminé à cette date. |
| Passage dans un statut « à faire » (« --à faire-- », ou catégorie Jira à faire) | Sort du WIP, non compté terminé. |
| Passage dans un autre statut de catégorie Jira « terminé » (ex. annulé) | Sort du WIP, non compté terminé. |
| Retour dans un statut du flux après une sortie (départ ou intermédiaire) | Revient dans le WIP. |
| Passage en statut d'arrivée sans être jamais passé par un statut de départ | Ni WIP ni terminé. |

Date de terminaison d'un ticket = son **dernier** passage en statut d'arrivée (après une entrée dans le WIP).

### Changement de workflow le 12/10/2026

| Période | Sortie comptée terminée | Reste dans le WIP |
|---|---|---|
| Avant le 12/10/2026, minuit, heure de Paris | « --Terminé-- » | « --Go Recette-- », et « --GO PROD-- » s'il apparaît (ce statut n'était pas dans le flux) |
| Depuis le 12/10/2026 | « --Terminé-- » | « --Go Prod-- » et les statuts intermédiaires, dont « --Go Recette-- » |

Le graphique marque la semaine du 12/10 et rappelle ce changement. Un passage à « --Terminé-- » compte des deux côtés de minuit. « --Go Prod-- » ne fait pas sortir du WIP.

### Mesure hebdomadaire

| Notion | Règle |
|---|---|
| Semaine | Lundi → dimanche. Les semaines futures ne sont pas affichées. |
| Point de mesure | Vendredi 14:00, heure de Paris. Semaine en cours avant ce point : maintenant. |
| WIP de la semaine | Tickets dans le WIP au point de mesure : entrée ≤ point < sortie (ou pas encore sortis). |
| Terminés de la semaine | Tickets dont la date de terminaison est dans ]point de mesure précédent (vendredi d'avant 14:00) ; point de mesure]. Un ticket terminé le samedi compte donc la semaine suivante. |
| Collaborateur | Assigné Jira actuel (`displayName`). Vide : « Non assigné ». Seuls ceux qui ont plus de 2 tickets encore dans le WIP au dernier point de mesure apparaissent, en cartes. Un clic liste leurs tickets avec le statut qu'ils avaient à cet instant. |
| Plusieurs équipes | « Toutes » : total de la semaine (ticket compté une fois, même s'il est sur plusieurs équipes). Équipes cochées : somme de leurs tickets. Le seuil de cette vue ne compte que Brigade et Supply. L'équipe comptée est celle du champ Team à l'instant de la mesure (WIP) ou à la date de terminaison (terminés). |

### Seuils

| Règle | Détail |
|---|---|
| Seuil d'une équipe | Uniquement Brigade et Supply : devs × max par dev (ou valeur par défaut, 3 au départ). |
| Pas de seuil | Cook, Choco, Calson et toute autre équipe, même si des devs sont saisis. Aussi : Brigade ou Supply non réglée, 0 dev, ou « Sans équipe ». |
| Seuil global / de la sélection | Somme des seuils de Brigade et Supply parmi les équipes affichées. Les autres équipes ne s'ajoutent pas et ne rendent pas le seuil partiel. Plusieurs équipes cochées : le libellé est « Somme des seuils ». |
| Seuil partiel | Brigade ou Supply est affichée sans seuil alors que l'autre en a un : « Seuil partiel : N ». Aucune des deux avec seuil : « Seuil non défini ». |
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

Sources externes : Jira (tickets, id et nom du champ Team, historique des changements de statut et de Team, liste des statuts et de leur catégorie, filtres des boards).

| Variable d'environnement | Rôle | Défaut |
|---|---|---|
| `JIRA_WIP_BOARD_IDS` | Boards suivis (une équipe par board) | boards du dashboard |
| `JIRA_WIP_PROJECT_KEYS` | Projets suivis en repli (sans board) | projets configurés hors Support |
| `JIRA_SUPPORT_PROJECT_KEY` | Espace dont les Bug et Support sont ajoutés | SB |
| `JIRA_WIP_ISSUE_TYPES` | Types suivis hors espace Support | US, Tâche Tech, Bug, Bug dev |
| `WIP_WEEKLY_CACHE_TTL_MINUTES` | Durée du cache du calcul | 30 |
| `JIRA_TEAM_FIELD` | Champ équipe Jira | customfield_10001 |

## 5. Limites connues

- Sans id dans le champ Team, l'appartenance actuelle aux boards est appliquée à tout l'historique.
- Un id Team qui n'apparaît ni dans les filtres des boards ni dans l'historique des tickets déjà chargés n'est pas recherché.
- Un ticket présent sur deux boards, sans id Team, est compté dans chacun : la somme d'une sélection peut dépasser le total. Avec un id Team, il ne compte que pour l'équipe de cet id.
- Pas d'historique des seuils : les réglages courants s'appliquent à toutes les semaines passées.
- Résultat en cache mémoire (30 min par défaut, par instance), vidé à chaque synchronisation et à l'enregistrement des réglages. Pendant ce délai, la mesure « maintenant » de la semaine en cours n'avance pas (le calcul repart de Jira au passage du vendredi 14:00).
- Les dates de la requête Jira sont lues dans le fuseau du compte Jira : une marge d'un jour est prise de chaque côté (et la recherche part du vendredi précédant la 1re semaine) ; le filtrage exact se fait ensuite sur l'historique.
- Les statuts de catégorie « terminé » sont lus via l'API Jira : si elle ne répond pas, seuls les statuts d'arrivée font sortir du WIP (un ticket annulé reste alors compté).
- Performance : l'historique des statuts de chaque ticket est lu à chaque calcul ; une longue période (jusqu'à 52 semaines) peut être lente.
- Les tickets « Sans équipe » rendent le seuil global partiel dès qu'un autre seuil est défini.
- Le détail par collaborateur utilise l'assigné actuel, pas celui qu'avait le ticket au moment de la mesure.

## 6. Références code

- `backend/src/domain/wip/wipWeekly.ts` : entrée/sortie du WIP, point de mesure, agrégation par semaine.
- `backend/src/domain/wip/wipSettings.ts` : validation des réglages, seuil d'équipe.
- `backend/src/domain/wip/entities/WipSettings.ts` : réglages en base.
- `backend/src/application/services/WipService.ts` : lecture Jira, périmètre, cache.
- `backend/src/application/services/wipPageAccess.ts` : activation de la page pour les rôles de lead.
- `backend/src/infrastructure/jira/jql.ts` : `buildWipJql`.
- `backend/src/routes/wipRoutes.ts` : `GET /api/wip/weekly`, `GET` et `PUT /api/wip/settings`.
- `frontend/src/components/WipPage.tsx` : page.
- `frontend/src/domain/wipChart.ts` : période, seuils cumulés, lignes du graphique, détail par collaborateur.
