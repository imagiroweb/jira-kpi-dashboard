# Temps réel et planificateur

## 1. Objectif

Garder les données à jour sans action manuelle (synchronisation planifiée) et diffuser les mises à jour aux utilisateurs connectés (Socket.io). Public : tous les utilisateurs.

## 2. Parcours utilisateur

| Élément | Comportement |
|---|---|
| Indicateur « Temps réel actif » | Affiche le nombre de clients connectés. |
| Bouton « Synchroniser » | Vide le cache et resynchronise les projets configurés ; progression 0, 20, 20 à 90, 100 %. Accessible à tout utilisateur connecté. |
| Mise à jour automatique | Les écrans se rafraîchissent à la réception d'une mise à jour KPI. |
| Alertes | Message d'avertissement ou critique après une synchronisation partielle ou en échec. |

## 3. Règles métier

### Planificateur

| Paramètre | Valeur |
|---|---|
| Intervalle | 14400 s (4 h) par défaut, réglable |
| Activation | active sauf si désactivée explicitement |
| Premier passage | 2 s après le démarrage |
| Chevauchement | un passage ne démarre pas si le précédent tourne |

Chaque passage : vide le cache, synchronise les tickets de sprint par projet, met à jour les heures quotidiennes des 3 derniers jours, préchauffe les KPI support (si le projet support est défini), puis émet une mise à jour KPI. Erreurs partielles : alerte « warning » « Sync partiel : N erreur(s) sur M projets ». Échec global : alerte « critical ».

### Temps réel

- Connexion authentifiée obligatoire (même validation que l'API).
- Événements entrants : abonnement / désabonnement à un projet, un point hebdo (identifiant de 1 à 64 caractères alphanumériques, tiret ou souligné) ou aux KPI ; demande de synchro ; ping.
- Événements sortants : nombre de clients, mise à jour KPI, projet, point hebdo, progression de synchro, nouvelle alerte.

## 4. Données

Aucune donnée persistante propre ; historique quotidien des heures (voir [Support](support.md)).

## 5. Limites connues

- La demande de synchro par socket est seulement acquittée, elle ne lance pas de synchronisation.
- L'événement de fin d'analyse existe mais n'est jamais émis (IA non implémentée).
- Le README annonce une synchronisation toutes les 15 min : le code utilise 4 h par défaut.
- Planificateur et limites de débit en mémoire : pas de coordination entre plusieurs instances.

## 6. Références code

- `backend/src/services/schedulerService.ts`.
- `backend/src/websocket/socketHandler.ts`.
- `backend/src/routes/worklogRoutes.ts` : route de synchro.
- `frontend/src/contexts/SocketContext.tsx`, `frontend/src/components/Sidebar.tsx`.
