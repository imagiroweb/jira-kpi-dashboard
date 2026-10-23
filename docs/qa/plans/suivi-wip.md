# Plan de tests : page « Suivi WIP » (travail en cours hebdomadaire par équipe, seuils)
Spec : https://github.com/imagiroweb/jira-kpi-dashboard/issues/79

Périmètre : nouvelle page pilotable « Suivi WIP » (clé de page `wip`). Elle montre, semaine par semaine sur une période choisie, le WIP (tickets entre un statut de départ, défaut « In Progress », et un statut d'arrivée, défaut « Go Prod ») et les tickets terminés, au global et par équipe Jira (`customfield_10001`, vide → « Sans équipe »). Types suivis : US, Tâche Tech, Bug et Bug dev uniquement. Point de mesure hebdomadaire : **vendredi 14:00 heure de Paris** (décision BDR, commentaire de l'issue #79). Chaque équipe a un seuil = nombre de devs × maximum de tickets par dev (défaut 3). Les seuils et les statuts sont réglés par un super admin et partagés. Hors périmètre : liste des tickets d'une semaine, temps de cycle, alertes, lien avec les équipes du module Performance, historique d'équipe d'un ticket, export et snapshots.

Recette sur fixtures uniquement : aucun appel Jira réel, aucun chiffre de production comme attendu. Toutes les dates des fixtures sont données en heure de Paris et l'horloge est figée (`jest.useFakeTimers().setSystemTime` / `vi.setSystemTime`).

## Cas d'usage
| ID | Acteur (rôle) | Scénario | Résultat attendu |
|---|---|---|---|
| CU-01 | Dev, PO (rôles semés) ou rôle personnalisé dont le nom contient « lead » | Ouvre le menu latéral | L'entrée « Suivi WIP » est proposée et la page s'ouvre |
| CU-02 | Utilisateur, Product ou Marketing (rôle semé sans la page) | Ouvre le menu, puis appelle l'API WIP directement | Pas d'entrée dans le menu ; l'API répond 403 |
| CU-03 | Super admin | Crée ou modifie un rôle dans la gestion des rôles | La case « Suivi WIP » est proposée ; un nouveau rôle l'a cochée par défaut |
| CU-04 | Manager (rôle avec la page) | Ouvre la page sans rien choisir | Graphique des 12 dernières semaines (semaine en cours comprise), toutes équipes : barres des terminés, courbe du WIP, ligne de seuil global |
| CU-05 | Manager | Choisit une période (début, fin) | Une semaine lundi → dimanche par semaine touchée ; refus au-delà de 52 semaines |
| CU-06 | Manager | Sélectionne une ou plusieurs équipes (dont « Sans équipe ») | WIP et terminés = somme des équipes choisies ; une courbe par équipe ; seuil global = somme des seuils définis, « Seuil partiel » s'il en manque |
| CU-07 | Manager | Survole une semaine | Infobulle : dates, WIP, terminés, seuil, écart au seuil ; mention de dépassement si WIP > seuil |
| CU-08 | Manager (non super admin) | Consulte les seuils | Il les voit sans pouvoir les modifier (UI sans champ éditable, API PUT refusée) |
| CU-09 | Super admin | Saisit le nombre de devs et le maximum par dev d'une équipe, enregistre | Seuil mis à jour pour tous les utilisateurs, y compris sur les semaines passées ; saisie hors bornes refusée avec message |
| CU-10 | Super admin | Change les statuts de départ / d'arrivée | Le calcul suit les nouveaux statuts dès l'actualisation suivante |
| CU-11 | Tout utilisateur de la page | Une synchronisation (planifiée ou bouton « Synchroniser ») se termine | La page se recharge avec les nouvelles données |

## Cas de test
Niveaux et emplacements :
- **U-back** : unitaire Jest, `backend/src/domain/wip/*.test.ts` (calcul pur : intervalles, semaines, agrégation, validation des réglages, seuils).
- **Route** : Jest + supertest, `backend/src/routes/wipRoutes.test.ts` (GET `/api/wip/weekly`, GET et PUT `/api/wip/settings` ; service Jira mocké, modèle Mongo mocké ou en mémoire selon `backend/docs/testing-routes.md`).
- **U-front** : unitaire Vitest, `frontend/src/domain/wipChart.test.ts` (séries du graphique, somme des équipes, seuils, dépassement, période) et `frontend/src/domain/sidebarNav.test.ts` (menu).
- **Composant** : Vitest + Testing Library, `frontend/src/components/WipPage.test.tsx` (API mockée, Recharts rendu ou mocké).
- **E2E** : Playwright, `e2e/tests/wip.spec.ts`, un seul test `@smoke`.

### Calcul d'un ticket : entrée, sortie, retours (U-back)
Fonction cible : `computeWipInterval` (ou son successeur, qui doit pouvoir renvoyer **plusieurs** périodes par ticket pour CT-06 / CT-07). Configuration par défaut : départ `["In Progress"]`, arrivée `["Go Prod"]`. S = semaine du lundi 2026-09-07 au dimanche 2026-09-13, mesurée le vendredi 2026-09-11 à 14:00 Paris : WIP de S = tickets en cours à ce moment ; terminés de S = passages en Go Prod dans ]ven. 04/09 14:00 ; ven. 11/09 14:00].

| ID | Cas d'usage | Type | Préconditions | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|---|---|
| CT-01 | CU-04 (CA W1) | Unitaire | Ticket : To Do → In Progress mar. 08/09 10:00 → QA ven. 11/09 09:00 | Calcul de S | Compté dans le WIP de S (en cours le vendredi 14:00) ; 0 terminé | P1 |
| CT-02 | CU-04 (CA W2) | Unitaire | In Progress mar. 08/09, Go Prod jeu. 10/09 | Calcul de S | WIP de S = 0 ; terminés de S = 1 (une seule fois) | P1 |
| CT-03 | CU-04 (CA W3) | Unitaire | In Progress mar. 08/09, Go Prod mer. 23/09 (S+2) | Calcul de S, S+1, S+2 | WIP : 1, 1, 0 ; terminés : 0, 0, 1 | P1 |
| CT-04 | CU-04 (CA W4) | Unitaire | Ticket To Do → QA → Go Prod sans jamais passer par In Progress ; variante : jamais de transition du tout, statut actuel To Do | Calcul sur 4 semaines | Ni WIP ni terminé, sur toutes les semaines (décision n° 3) | P1 |
| CT-05 | CU-04 (CA W4, règle « premier passage ») | Unitaire | In Progress → To Do → In Progress (aller-retour avant toute sortie) | Calcul | L'entrée retenue est le **premier** passage ; le retour en To Do ne sort pas du WIP | P2 |
| CT-06 | CU-04 (CA W5) | Unitaire | In Progress S, Go Prod S+1, retour In Progress S+2, Go Prod S+4 | Calcul S → S+4 | WIP : S=1, S+1=0, S+2=1, S+3=1, S+4=0 | P1 |
| CT-07 | CU-04 (CA W6) | Unitaire | Même ticket que CT-06 | Comptage des terminés S → S+4 | Terminés : S+1=0, S+4=1 (seul le dernier passage en Go Prod compte) | P1 |
| CT-08 | CU-04 (CA W6) | Unitaire | Go Prod S+1, retour In Progress S+2, Go Prod S+4 ; période lue S → S+2 seulement | Comptage | Terminés S+1 = 0 (le dernier passage, en S+4, est hors période mais reste le seul compté). Ticket sans retour : Go Prod S+1 → terminés S+1 = 1 | P2 |
| CT-09 | CU-04 (CA W7) | Unitaire | In Progress S, puis « Annulé » (catégorie Jira « done », hors liste d'arrivée) jeu. de S+1 | Calcul S, S+1 | WIP S = 1, S+1 = 0 ; terminés = 0 partout. Nécessite la catégorie du statut dans l'entrée du calcul | P1 |
| CT-10 | CU-04 (CA W7) | Unitaire | In Progress → Annulé → In Progress (réouverture) | Calcul | Sort à l'annulation, revient au WIP à la réouverture (règle « retour en arrière ») | P2 |
| CT-11 | CU-04 (règle retour) | Unitaire | Go Prod puis passage dans un statut non terminé qui n'est **pas** un statut de départ (ex. QA) | Calcul | Revient dans le WIP dès ce passage, jusqu'au prochain Go Prod (décision n° 2 : tout statut non terminé après Go Prod) | P1 |
| CT-12 | CU-04 | Unitaire | Statuts en casse ou espaces différents (« in progress », « Go prod ») | Calcul | Reconnus (comparaison insensible à la casse et aux espaces de bord) | P2 |
| CT-13 | CU-04 | Unitaire | Ticket créé directement en In Progress (aucune transition, statut actuel In Progress) | Calcul | Entrée = date de création | P3 |
| CT-14 | CU-04 | Unitaire | Historique Jira brut : items `status` mêlés à d'autres champs, dates dans le désordre, `toString` nul | `extractStatusTransitions` | Seules les transitions de statut, triées, sans plantage | P2 |

### Point de mesure du vendredi 14:00, heure de Paris, semaine en cours (U-back)
| ID | Cas d'usage | Type | Préconditions | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|---|---|
| CT-15 | CU-04 (règle semaine) | Unitaire | In Progress mar. 08/09 ; Go Prod ven. 11/09 13:59 Paris (= 11:59 UTC) ; variante Go Prod ven. 11/09 14:00:00 pile | Calcul S, S+1 | Terminé en S, absent du WIP de S (borne de fin incluse pour la variante 14:00:00) | P1 |
| CT-16 | CU-04 (règle semaine) | Unitaire | In Progress mar. 08/09 ; Go Prod ven. 11/09 14:01 Paris ; variante Go Prod sam. 12/09 10:00 | Calcul S, S+1 | Encore dans le WIP de S ; terminé en S+1, pas en S (exemple de BDR : Go Prod le vendredi à 15:00 → terminé en S+1). **Échoue avec une coupure au dimanche ou en UTC** | P1 |
| CT-17 | CU-04 (règle WIP hebdo) | Unitaire | Ticket X In Progress ven. 11/09 13:59 ; ticket Y In Progress ven. 11/09 14:01 ; ticket Z Go Prod ven. 04/09 14:00:00 pile | Calcul S-1, S, S+1 | X au WIP de S ; Y absent du WIP de S, présent au WIP de S+1 ; Z terminé en S-1, pas en S (borne de début exclue) | P1 |
| CT-18 | CU-04 (dates) | Unitaire | Changement d'heure : ven. 23/10/2026 14:00 Paris = 12:00 UTC (été), ven. 30/10/2026 14:00 Paris = **13:00 UTC** (hiver). Go Prod ven. 30/10 12:30 UTC (13:30 Paris) ; Go Prod ven. 30/10 13:30 UTC (14:30 Paris). Même contrôle en mars : ven. 26/03/2027 14:00 = 13:00 UTC, ven. 02/04/2027 14:00 = 12:00 UTC | `listWeeks` + agrégation | 1er ticket terminé dans la semaine du 26/10, 2e dans celle du 02/11 ; lundis corrects, aucune semaine dupliquée ni manquante. **Échoue avec un décalage fixe UTC+2** | P1 |
| CT-19 | CU-04 (CA W8) | Unitaire | Horloge figée mer. 2026-10-21 15:00 Paris (avant le point du ven. 23/10 14:00). Ticket A In Progress lun. 19/10, Go Prod mar. 20/10 ; B In Progress mar. 20/10 encore en cours ; C In Progress jeu. 15/10, Go Prod jeu. 22/10 (futur, absent de l'historique) ; D Go Prod ven. 16/10 15:00 ; E Go Prod ven. 16/10 13:00 | Agrégation de la semaine du 19/10 | WIP = B + C = 2 (mesure à maintenant) ; terminés = A + D = 2 (depuis ven. 16/10 14:00 exclu) ; E compté dans la semaine du 12/10. Variante horloge ven. 23/10 16:00 : WIP mesuré au ven. 23/10 14:00, un Go Prod à 15:00 n'entre pas dans la semaine du 19/10 | P1 |
| CT-20 | CU-04 | Unitaire | Période dont la fin est dans le futur | Agrégation | Aucune semaine postérieure à la semaine en cours n'est renvoyée (ou renvoyée vide : à figer) | P3 |

### Périmètre et équipes (U-back + route)
| ID | Cas d'usage | Type | Préconditions | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|---|---|
| CT-21 | CU-04 (CA W9) | Unitaire | Sous-tâche, Epic, Légende et ticket de type Bug du projet Support, tous passés en In Progress ; un US du projet KPI | Filtre de périmètre (fonction pure, ex. `isWipEligible`) puis calcul | Les quatre premiers sont exclus (types hors liste, ou projet Support quel que soit le type) ; l'US est compté | P1 |
| CT-22 | CU-04 (CA W9) | Route | Service Jira mocké : le projet Support figure dans les projets configurés ; résultat contenant sous-tâches, épics, « Story » et « Amélioration » | GET `/api/wip/weekly` | La requête Jira exclut le projet Support et se limite aux types US, Tâche Tech, Bug, Bug dev (JQL `issuetype in (…)` vérifiée sur le mock, ou filtrage du résultat) ; la réponse ne compte aucun autre type | P1 |
| CT-23 | CU-06 (CA E1) | Unitaire | Tickets avec équipe `null`, `""`, `"  "` | Agrégation | Regroupés sous « Sans équipe », placé en dernier dans la liste des équipes | P1 |
| CT-24 | CU-06 (CA E4) | Unitaire | Ticket dont la valeur actuelle du champ équipe est « Team B » ; l'historique contient un changement d'équipe depuis « Team A » | Calcul des semaines passées | Compté uniquement dans « Team B », y compris avant la date du changement | P2 |
| CT-25 | CU-06 | Unitaire | Champ équipe sous forme d'objet Jira (`{ value }`, `{ name }`) ou tableau | Extraction de l'équipe | Nom lu correctement (même lecture que le dashboard / support) | P2 |
| CT-75 | CU-04 (CA W9, décision BDR 1) | Unitaire | `it.each` sur le type : US, Tâche Tech, Bug, Bug dev (comptés) ; Story, Tâche, Amélioration, Sous-tâche, Epic, Légende, type vide ou absent (ignorés) ; variantes de casse et d'espaces (« bug dev », « Tâche Tech␣ ») | Filtre de type puis calcul | Seuls les 4 types de la liste sont comptés ; la casse et les espaces de bord sont tolérés (comme pour les statuts) ; « Bug » et « Bug dev » sont deux types distincts, tous deux comptés | P1 |
| CT-26 | CU-04 (gros volume) | Unitaire | 5 000 tickets générés, 52 semaines, 10 équipes | Agrégation | Totaux = somme des équipes chaque semaine ; temps < 500 ms | P3 |

### Graphique : séries, filtre, période, seuils (U-front)
Module cible : `frontend/src/domain/wipChart.ts` (nom à fixer par le dev), alimenté par la réponse de l'API (semaines × équipes : `wip`, `done`) et les réglages (`devCount`, `maxPerDev` par équipe).

| ID | Cas d'usage | Type | Préconditions | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|---|---|
| CT-27 | CU-04 (CA E2) | Unitaire | Réponse à 3 équipes + « Sans équipe » ; sélection vide | Construction des séries | Série globale = somme de toutes les équipes, « Sans équipe » comprise | P1 |
| CT-28 | CU-06 (CA E3) | Unitaire | Équipes A (WIP 5, terminés 2) et B (WIP 4, terminés 1) sélectionnées, C non sélectionnée | Construction | Courbe cumulée WIP = 9, barres terminés = 3 ; une série par équipe (A, B) ; C absente | P1 |
| CT-29 | CU-06 | Unitaire | Une seule équipe sélectionnée | Construction | Une courbe, seuil de l'équipe (pas de mention « partiel ») | P2 |
| CT-30 | CU-05 (CA P1) | Unitaire | Horloge figée mer. 2026-10-21 | Période par défaut | 12 semaines, du lun. 2026-08-03 au dim. 2026-10-25 (semaine en cours = la 12e) | P1 |
| CT-31 | CU-05 (CA P2) | Unitaire | Période 2026-09-01 (mardi) → 2026-10-20 (mardi) | Liste des semaines | 8 semaines, du lun. 31/08 au dim. 25/10, première et dernière comprises. Aussi testé côté backend (`listWeeks`) | P1 |
| CT-32 | CU-05 (CA P2) | Unitaire | Période d'un seul jour ; début un lundi et fin un dimanche ; début = fin = dimanche | Liste des semaines | 1 semaine dans chaque cas, pas de semaine en trop | P2 |
| CT-33 | CU-05 (CA P3) | Unitaire | Périodes de 52 semaines exactes, 53 semaines, début après la fin, date vide | Validation de période | 52 acceptée ; 53 refusée avec « réduisez la période (52 semaines maximum) » (libellé à fixer) ; début > fin et vide refusés | P1 |
| CT-34 | CU-04 (CA P4) | Unitaire | Réponse où une semaine au milieu n'a aucune entrée (ou API qui omet la semaine) | Construction | La semaine figure avec WIP 0 et terminés 0, pas de `null` ni de trou (Recharts : pas de `connectNulls` nécessaire) | P1 |
| CT-35 | CU-06 (CA S1) | Unitaire | Équipe à 4 devs, max 3 | Calcul du seuil | 12, constant sur toutes les semaines | P1 |
| CT-36 | CU-07 (CA S2) | Unitaire | Seuil 12, WIP de la semaine = 13 | Marquage | Point marqué `depasse: true`, écart +1 | P1 |
| CT-37 | CU-07 (CA S3) | Unitaire | Seuil 12, WIP = 12 ; puis WIP = 11 | Marquage | Non marqué dans les deux cas ; écart 0 et −1 | P1 |
| CT-38 | CU-06 (CA S4) | Unitaire | Équipes sélectionnées de seuils 12 et 9 | Seuil global | 21, sans mention partielle ; dépassement global évalué contre 21 | P1 |
| CT-39 | CU-06 (CA S5) | Unitaire | Équipe sans réglage ; équipe à 0 dev | Seuil | `null` pour les deux, aucune série de seuil, libellé « Seuil non défini » | P1 |
| CT-40 | CU-06 (CA S6) | Unitaire | Sélection : A (12) + B (non défini) ; puis A (12) + « Sans équipe » ; puis « Sans équipe » seule | Seuil global | 12 + « Seuil partiel » ; 12 + « Seuil partiel » ; `null` + « Seuil non défini » | P1 |
| CT-41 | CU-06 (CA S6, sélection vide) | Unitaire | Aucune sélection, tous les tickets ont une équipe réglée sauf « Sans équipe » présent dans les données | Seuil global | Somme des seuils définis + « Seuil partiel » (« Sans équipe » n'a jamais de seuil) | P2 |
| CT-42 | CU-07 | Unitaire | Semaine 2026-09-07 → 2026-09-13, WIP 13, terminés 4, seuil 12 | Données d'infobulle | Dates « 07/09 – 13/09 », WIP 13, terminés 4, seuil 12, écart +1, mention de dépassement | P2 |
| CT-43 | CU-06 | Unitaire | Semaine où le seuil est `null` | Données d'infobulle | Seuil « non défini », écart absent, pas de mention de dépassement | P3 |

### Réglages et seuils côté backend (U-back)
| ID | Cas d'usage | Type | Préconditions | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|---|---|
| CT-44 | CU-09 (CA S7) | Unitaire | Nouvelle équipe saisie avec `devCount: 4`, sans `maxPerDev` | `validateWipSettings` puis `teamWipThreshold` | `maxPerDev` effectif 3, seuil 12 | P1 |
| CT-45 | CU-09 (CA R3) | Unitaire | `it.each` devCount : −1, 2.5, 51, `"4"`, `null` ; maxPerDev : 0, 21, 1.5 | `validateWipSettings` | Toutes refusées avec un message en français nommant l'équipe et la borne (devs 0 à 50, max 1 à 20) | P1 |
| CT-46 | CU-09 (CA R3, bornes) | Unitaire | devCount 0 et 50 ; maxPerDev 1 et 20 | `validateWipSettings` | Acceptées ; devCount 0 → seuil `null` (« Seuil non défini ») | P1 |
| CT-47 | CU-09 | Unitaire | Deux lignes « Team A » / « team a » ; nom vide ; équipe « Sans équipe » | Validation | Doublon et nom vide refusés ; « Sans équipe » refusée ou ignorée (n'a jamais de seuil) | P2 |
| CT-48 | CU-10 (CA R4) | Unitaire | Listes de statuts vides, doublons, espaces | Validation des statuts | Liste vide refusée (ou retombe sur le défaut : à figer), doublons fusionnés, noms nettoyés | P2 |
| CT-49 | CU-10 (CA R4) | Unitaire | Même ticket que CT-01 ; configuration départ `["Dev"]` au lieu de `["In Progress"]` | Calcul | Plus compté (pas de passage en « Dev ») ; avec `["In Progress","Dev"]` de nouveau compté | P1 |

### Routes API (Route)
| ID | Cas d'usage | Type | Préconditions | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|---|---|
| CT-50 | CU-02 (CA A1) | Route | Jeton d'un rôle sans la page `wip` (ex. Utilisateur) | GET `/api/wip/weekly`, GET `/api/wip/settings` | 403 sur les deux (`requirePage`) | P1 |
| CT-51 | CU-02 | Route | Sans jeton | GET `/api/wip/weekly` | 401 | P1 |
| CT-52 | CU-01 | Route | Jeton rôle Dev (page activée), Jira mocké | GET `/api/wip/weekly?from=2026-09-01&to=2026-10-20` | 200 ; 8 semaines ; pour chaque semaine `total` et `byTeam` ; liste des équipes avec « Sans équipe » en dernier | P1 |
| CT-53 | CU-05 (CA P3) | Route | Jeton Dev | GET avec une période de 53 semaines ; `from` > `to` ; dates invalides | 400 avec message clair (pas de troncature silencieuse) ; garde de la route même si le front valide déjà (décision n° 6) | P1 |
| CT-54 | CU-05 (CA P1) | Route | — | **Non applicable** (décision n° 5 : la période par défaut est portée par le front, couverte par CT-30 et CT-66). Si l'API reçoit une requête sans `from` / `to`, CT-53 s'applique (400) | — | — |
| CT-55 | CU-08 (CA R2) | Route | Jeton Dev (non super admin) | GET `/api/wip/settings` puis PUT `/api/wip/settings` | GET 200 (seuils lisibles) ; PUT 403, réglages inchangés en base | P1 |
| CT-56 | CU-09 (CA R1) | Route | Jeton super admin | PUT `{ teams: [{ team: "Team A", devCount: 4 }] }`, puis GET avec un jeton Dev | PUT 200 ; GET Dev renvoie `devCount 4`, seuil 12 (réglage partagé, pas par utilisateur) | P1 |
| CT-57 | CU-09 (CA R3) | Route | Jeton super admin | PUT avec `devCount: 51`, puis `maxPerDev: 21`, puis `devCount: -1` | 400 avec la liste des erreurs en français ; aucun enregistrement partiel. La route reste la garde même si le front valide avant envoi (décision n° 6) | P1 |
| CT-58 | CU-10 (CA R4) | Route | Jeton super admin ; Jira mocké avec un ticket passé en « Dev » | PUT statuts de départ `["Dev"]`, puis GET `/api/wip/weekly` | Le ticket apparaît dans le WIP ; le cache éventuel du calcul est invalidé par le PUT | P1 |
| CT-59 | CU-10 | Route | Jeton Dev | PUT des statuts | 403 | P1 |
| CT-60 | CU-06 | Route | — | **Non applicable** (décision n° 4 : le filtre d'équipes est fait côté front, couvert par CT-27, CT-28, CT-29) | — | — |

### Rôles, menu, page (U-back, U-front, Composant)
| ID | Cas d'usage | Type | Préconditions | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|---|---|
| CT-61 | CU-01, CU-02 (CA A1, A2, décision BDR 5) | Unitaire | Défauts des rôles semés (`backend/src/domain/user/entities/Role.ts` et semis de `index.ts`) ; rôles personnalisés existants **sans** champ `wip` : « Tech Lead », « LEAD QA », « Leadership », « Coach » | Démarrage (semis + activation unique) puis lecture de `wip` | Dev = vrai, PO = vrai ; Utilisateur, Product, Marketing = faux ; super admin = vrai ; utilisateur sans rôle = faux ; « Tech Lead », « LEAD QA » = vrai (nom contenant le mot « lead » ou « leads », casse ignorée) ; « Leadership » et « Coach » = faux | P1 |
| CT-76 | CU-01 (décision BDR 5) | Unitaire | Rôle personnalisé « Tech Lead » avec `wip: false` déjà enregistré (case décochée par un super admin) ; rôle « Lead Front » sans champ | Démarrage deux fois de suite | « Tech Lead » reste à faux (l'activation ne joue que si le champ est absent) ; « Lead Front » passe à vrai au 1er démarrage et le reste ; un 2e démarrage ne change rien (idempotent) | P1 |
| CT-62 | CU-03 (CA A3) | Unitaire | Défaut d'un nouveau rôle | Créer un rôle sans préciser les pages | `wip` = vrai (règle « tout à vrai sauf gestionUtilisateurs, performanceDashboard, couts ») | P1 |
| CT-63 | CU-03 (CA A3) | Route | Jeton super admin | Création / modification de rôle avec une liste de pages qui omet `wip` ; puis avec `wip` | Sans `wip` : refusée (« la liste des pages doit être complète ») ; avec : acceptée. Test de route existant des rôles à étendre | P2 |
| CT-64 | CU-03 (CA A3) | Composant | Écran de gestion des rôles (`UserManagementPage`) | Ouvrir création / modification d'un rôle | Une case libellée « Suivi WIP » est présente et cochable | P2 |
| CT-65 | CU-01, CU-02 (CA A1, A2) | Unitaire | `sidebarNav` avec visibilités `wip: true` puis `wip: false` | Construire le menu | Entrée « Suivi WIP » présente puis absente | P1 |
| CT-66 | CU-04 (CA P1, E2) | Composant | API mockée (12 semaines, 2 équipes), horloge figée | Rendre `WipPage` | Requête envoyée avec les 12 dernières semaines ; titre « Suivi WIP » ; filtre d'équipes vide = vue globale ; graphique rendu | P1 |
| CT-67 | CU-05 (CA P3) | Composant | Idem | Saisir une période de 60 semaines et valider | Message de réduction visible (`role="alert"` ou texte), aucune requête envoyée | P1 |
| CT-68 | CU-06 (CA S5, S6) | Composant | Réglages : A seuil défini, B non | Sélectionner A puis A + B | « Seuil non défini » visible pour B ; « Seuil partiel » visible sur le seuil global | P2 |
| CT-69 | CU-07 (CA S2) | Composant | Une semaine en dépassement | Survol du point (ou rendu de l'infobulle personnalisée isolée) | Mention de dépassement présente dans l'infobulle ; point rendu avec la couleur d'alerte (vérifier une prop / un attribut, pas une classe CSS) | P2 |
| CT-70 | CU-08 (CA R2) | Composant | Utilisateur courant non super admin | Rendre la page | Seuils affichés en lecture ; aucun champ éditable ni bouton « Enregistrer » | P1 |
| CT-71 | CU-09 (CA R1, R3) | Composant | Super admin | Modifier devs d'une équipe à 4, enregistrer ; puis saisir 51 | PUT envoyé avec la valeur, ligne de seuil recalculée sur **toutes** les semaines affichées ; pour 51 (et −1, 2,5, max par dev 21) : message d'erreur clair et **aucun envoi** (décision n° 6 : contrôle côté front avant envoi). Variante : API mockée qui répond 400 → le message de l'API est affiché | P1 |
| CT-72 | CU-11 (CA F1) | Composant | Socket mocké, page montée | Émettre l'événement de mise à jour KPI de fin de synchronisation | Nouvelle requête GET `/api/wip/weekly` et graphique mis à jour avec la nouvelle réponse | P1 |
| CT-73 | CU-04 | Composant | API qui répond 500 ; API qui renvoie 0 ticket | Rendre la page | Message d'erreur lisible ; pour 0 ticket : 12 semaines à 0, pas d'écran vide | P2 |

### E2E (Playwright)
| ID | Cas d'usage | Type | Préconditions | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|---|---|
| CT-74 | CU-01, CU-04 | E2E `@smoke` | Préprod, compte de test `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` dont le rôle a la page (Dev ou PO) ; test ignoré sans ces variables | Se connecter, cliquer sur « Suivi WIP » dans le menu (`getByRole('link' / 'button', { name: 'Suivi WIP' })`) | Le titre « Suivi WIP » et le graphique (ou l'état vide) sont visibles, sans message d'erreur. Ne dépend d'aucun chiffre Jira | P1 |

Décision de niveau : toute la logique de comptage (statuts, retours, annulations, point de mesure du vendredi 14:00 en heure de Paris, semaine en cours, types et périmètre, équipes) est pure et se teste en Jest ; les seuils, la somme des équipes, la période et le dépassement se testent en Vitest sur `frontend/src/domain/` ; les droits (403, super admin, partage des réglages, invalidation après changement de statuts) se testent en route ; la page ne vérifie que le câblage (période par défaut, messages, lecture seule, rafraîchissement). Un seul E2E, en `@smoke`, qui vérifie l'ouverture de la page.

## Correspondance avec les critères d'acceptation
| CA (spec #79) | Cas de test |
|---|---|
| A1 Accès refusé sans la page (menu + API) | CT-50, CT-51, CT-61, CT-65 |
| A2 Dev, PO (et rôles « lead ») voient la page | CT-61, CT-76, CT-65, CT-52, CT-74 |
| A3 Case « Suivi WIP » dans la gestion des rôles | CT-62, CT-63, CT-64 |
| W1 En cours au point de mesure (ven. 14:00) → WIP de S | CT-01, CT-16, CT-17 |
| W2 Go Prod dans S → pas de WIP, 1 terminé | CT-02, CT-15 |
| W3 Go Prod en S+2 → WIP S et S+1, terminé S+2 | CT-03 |
| W4 Jamais en statut de départ → jamais compté | CT-04, CT-05 |
| W5 Retour de Go Prod → de nouveau au WIP | CT-06, CT-11 |
| W6 Deux Go Prod → seul le dernier compte | CT-07, CT-08 |
| W7 Fermé sans Go Prod → sort, pas terminé | CT-09, CT-10 |
| W8 Semaine en cours → maintenant / depuis le vendredi 14:00 précédent | CT-19, CT-20 |
| W9 Sous-tâches, épics, Support et types hors liste ignorés | CT-21, CT-22, CT-75 |
| E1 Sans équipe | CT-23, CT-25 |
| E2 Aucune sélection → vue globale | CT-27, CT-66 |
| E3 Deux équipes → somme + une courbe par équipe | CT-28, CT-29 |
| E4 Équipe actuelle | CT-24 |
| P1 12 dernières semaines par défaut | CT-30, CT-66 |
| P2 Semaines touchées, bornes comprises | CT-31, CT-32, CT-52 |
| P3 Plus de 52 semaines → message | CT-33, CT-53, CT-67 |
| P4 Semaine vide → 0, sans trou | CT-34, CT-73 |
| S1 4 devs × 3 → seuil 12 | CT-35 |
| S2 WIP 13 → dépassement (couleur + survol) | CT-36, CT-42, CT-69 |
| S3 WIP = seuil → pas de dépassement | CT-37 |
| S4 Seuils 12 + 9 → 21 | CT-38 |
| S5 Sans nombre de devs → « Seuil non défini » | CT-39, CT-46, CT-68 |
| S6 Seuil partiel | CT-40, CT-41, CT-68 |
| S7 Max par dev par défaut = 3 | CT-44 |
| R1 Modification partagée, appliquée aux semaines passées | CT-56, CT-71 |
| R2 Non super admin : lecture seule | CT-55, CT-70 |
| R3 Saisie hors bornes refusée | CT-45, CT-46, CT-57, CT-71 |
| R4 Changement de statuts suivi à l'actualisation | CT-48, CT-49, CT-58, CT-59 |
| F1 Mise à jour après synchronisation | CT-72 |

## Non-régression impactée
- **Rôles et pages** (`docs/utilisateurs-roles-authentification.md`) : l'ajout d'une page pilotable change la liste complète exigée à la création / modification d'un rôle. Tests existants à relire : tests du modèle `Role` et de `authRoutes` (création de rôle, « liste des pages complète »), semis des rôles au démarrage (les cinq rôles semés sont réécrits : vérifier que Dev et PO gardent leurs pages actuelles et que Product / Marketing / Utilisateur ne gagnent que `wip: false` ; l'activation unique des rôles « lead » ne doit modifier aucune autre page de ces rôles). Les fixtures de rôles côté frontend (`sidebarNav.test.ts`, `UserManagementPage`) devront inclure la clé `wip` : adaptation légitime, pas une régression.
- **Menu latéral** : ordre et regroupements existants (« Suivi performance », « Paramètres ») inchangés ; un groupe à une seule page visible s'affiche toujours comme page simple.
- **Synchronisation** (`docs/temps-reel-planificateur.md`) : si la synchro lit désormais l'historique des statuts (`expand=changelog`), re-tester sa durée et la progression 0 → 100 %, ainsi que le dashboard de sprint, le burndown et les résolus par jour (`docs/sprints-velocite.md`), qui partagent le client Jira et le cache vidé à chaque passage.
- **Champ équipe** : la lecture de `customfield_10001` et le regroupement « Sans équipe » sont partagés avec le dashboard, le support et les épics ; si le dev factorise l'extraction, re-tester ces trois écrans.
- **Équipes du module Performance** (`docs/equipes.md`) : aucun lien ; vérifier qu'aucun réglage WIP n'écrit dans le modèle `Team`.
- **E2E à ajouter** : `e2e/tests/wip.spec.ts` avec CT-74 (`@smoke`, ignoré sans `E2E_USER_EMAIL` / `E2E_USER_PASSWORD`, sélecteurs par rôle ou libellé, jamais contre la production). Le compte de test de préprod doit avoir un rôle Dev ou PO. `smoke.spec.ts` et `auth.spec.ts` inchangés.
- **Documentation** dans la même PR : créer `docs/wip.md`, mettre à jour `docs/utilisateurs-roles-authentification.md` (liste des pages, tableau des rôles semés) et l'index `docs/README.md`.

## Décisions
Décisions de BDR publiées en commentaire de l'issue #79, appliquées dans ce plan :
1. **Types suivis** : US, Tâche Tech, Bug, Bug dev uniquement ; tout autre type est ignoré (CT-21, CT-22, CT-75).
2. **Seuils et statuts** : modifiables par le super admin uniquement, réglages partagés (inchangé : CT-55, CT-56, CT-58, CT-59, CT-70).
3. **Point de mesure** : vendredi 14:00 heure de Paris. WIP de la semaine = tickets en cours le vendredi 14:00 (semaine en cours avant ce moment : maintenant). Terminés = passages en Go Prod dans ]vendredi 14:00 précédent ; ce vendredi 14:00]. Un Go Prod le vendredi de S à 15:00 est terminé en S+1 et encore dans le WIP de S (CT-15 à CT-19). Règles de retour dans le WIP inchangées.
4. **Accès par défaut** : Dev et PO, plus les rôles personnalisés dont le nom contient « lead », activés une seule fois au démarrage si le champ est absent (CT-61, CT-76) ; nouveaux rôles : activée (CT-62).

Réponses aux points soulevés par la QA :
1. Clé de page `wip` ; routes GET `/api/wip/weekly`, GET `/api/wip/settings`, PUT `/api/wip/settings`.
2. Retour dans le WIP : règle métier, tout statut non terminé après Go Prod remet le ticket dans le WIP (CT-11).
3. Ticket jamais passé par un statut de départ : ni WIP ni terminé (CT-04).
4. Filtre d'équipes côté front : CT-60 non applicable.
5. Période par défaut portée par le front : CT-54 non applicable.
6. Saisie des réglages et de la période : contrôle côté front avant envoi **et** route en garde (CT-33, CT-53, CT-57, CT-67, CT-71).

## Données de test
Fixtures à créer, sans appel Jira réel :
- Backend `backend/src/domain/wip/__fixtures__/wipIssues.ts` (ou en tête du test) : tickets décrits par `key`, `type`, `project`, `team`, `created`, `currentStatus` (+ catégorie), `transitions` (dates ISO avec décalage Paris explicite, ex. `2026-09-11T13:59:00+02:00`). Un ticket par cas CT-01 à CT-13, plus les pièges :

| Clé | Projet / type | Équipe | Parcours | Attendu principal |
|---|---|---|---|---|
| KPI-1 | KPI / US | Team A | In Progress 08/09 → QA 11/09 | WIP S |
| KPI-2 | KPI / US | Team A | In Progress 08/09 → Go Prod 10/09 | terminé S |
| KPI-3 | KPI / Bug dev | Team B | In Progress 08/09 → Go Prod 23/09 | WIP S, S+1 ; terminé S+2 |
| KPI-4 | KPI / US | Team B | To Do → QA → Go Prod | jamais compté |
| KPI-5 | KPI / Tâche Tech | Team A | In Progress S → Go Prod S+1 → In Progress S+2 → Go Prod S+4 | WIP S, S+2, S+3 ; terminé S+4 |
| KPI-6 | KPI / US | (vide) | In Progress S → Annulé (catégorie done) S+1 | WIP S, jamais terminé, « Sans équipe » |
| KPI-7 | KPI / US | Team A | In Progress 08/09 → Go Prod ven. 11/09 13:59 Paris | terminé S, hors WIP de S |
| KPI-8 | KPI / US | Team A | In Progress 08/09 → Go Prod ven. 11/09 14:01 Paris | WIP S, terminé S+1 |
| KPI-9 | KPI / Sous-tâche | Team A | In Progress S | exclu |
| KPI-10 | KPI / Epic | Team A | In Progress S | exclu |
| SUP-1 | Support / Bug | Team A | In Progress S | exclu |
| KPI-11 | KPI / US | Team B (actuelle, ex-Team A) | In Progress S | Team B uniquement |
| KPI-12 | KPI / Story | Team A | In Progress S | exclu (type hors liste) |
| KPI-13 | KPI / Bug | Team B | In Progress ven. 30/10/2026 14:30 Paris → Go Prod lun. 02/11 | jamais au WIP (aucun point de mesure entre l'entrée et la sortie : le point du 30/10 tombe à 13:00 UTC, avant l'entrée), terminé semaine du 02/11 |

- Réglages : `{ defaultMaxPerDev: 3, startStatuses: ["In Progress"], endStatuses: ["Go Prod"], teams: [{ team: "Team A", devCount: 4 }, { team: "Team B", devCount: 3, maxPerDev: 3 }, { team: "Team C", devCount: 0 }] }` → seuils 12, 9, non défini.
- Frontend `frontend/src/test/fixtures/wip.ts` : réponse API de 12 semaines (lundi 2026-08-03 → dimanche 2026-10-25), équipes Team A, Team B, Team C, « Sans équipe », avec une semaine à 13 pour Team A (dépassement), une à 12 (égalité) et une semaine entièrement absente (trou à combler). Horloge figée au mercredi 2026-10-21 15:00 Paris (avant le point de mesure du vendredi 23/10 14:00).
- Volume (CT-26) : tickets générés dans le test, aucun fichier volumineux.
- Comptes : jetons de test des rôles Utilisateur, Dev, PO, d'un rôle personnalisé « Tech Lead » et du super admin selon les helpers de `backend/docs/testing-routes.md` ; en E2E, uniquement le compte de préprod fourni par l'environnement.
