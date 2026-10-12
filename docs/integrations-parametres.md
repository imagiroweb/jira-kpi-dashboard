# Intégrations et paramètres

## 1. Objectif

Brancher l'application sur Jira, Monday et Brevo, choisir les boards suivis et régler la rétention des données. Public : super admins.

## 2. Parcours utilisateur

| Écran | Action |
|---|---|
| Paramètres d'intégration | Saisir URL Jira, email Jira, jeton Jira, clé Monday, identifiants des boards du dashboard et des boards QA. |
| Paramètres de rétention | Régler les durées de conservation de l'organisation. |

## 3. Règles métier

### Intégrations

| Intégration | Usage | Configuration |
|---|---|---|
| Jira Cloud | sprints, worklogs, épics, support | URL, email, jeton, projets, boards |
| Monday.com | roadmap produit | clé API |
| Brevo | marketing | clé API (variable d'environnement uniquement) |
| SMTP | emails d'invitation et de reset | variables d'environnement ; Mailcow sur le même serveur : `MAILCOW_DOCKER_NETWORK` dans `.env` (voir `docker-compose.prod.mailcow.yml`) |
| Microsoft Entra | connexion SSO | identifiant client, tenant, URL de retour |
| IA | non implémentée | voir Limites |

- Les secrets sont chiffrés en base et jamais renvoyés (seulement « renseigné » et « vient de la base »). Un jeton laissé vide conserve la valeur actuelle.
- Enregistrer fixe « boards configurés » : les listes saisies remplacent alors les variables d'environnement. Les identifiants sont séparés par virgule, espace ou point-virgule.
- L'enregistrement s'applique immédiatement (clients Jira et Monday reconstruits) ; la configuration est rechargée au démarrage.

### Variables Jira notables

| Variable | Rôle | Défaut |
|---|---|---|
| `JIRA_STORY_POINTS_FIELD` | champ des SP | customfield_10127 |
| `JIRA_TEAM_FIELD` | champ équipe | customfield_10001 |
| `JIRA_SUPPORT_PROJECT_KEY` | projet support | SB |
| `JIRA_HOURS_PER_DAY`, `JIRA_DAYS_PER_WEEK` | conventions de temps | (non vérifié) |
| `JIRA_WORKLOG_DATE_TZ` | fuseau des worklogs | Europe/Paris |
| `JIRA_PROJECT_KEY`, `JIRA_BOARD_ID`, `JIRA_QA_BOARD_ID` | projets et boards (listes parallèles projet-board) | aucun |

### Rétention (organisation)

| Donnée | Plage | Défaut |
|---|---|---|
| Logs d'activité | 1 à 120 mois | 12 mois |
| Fiches de performance | 1 à 50 ans | aucune purge |
| Comptes inactifs | 1 à 120 mois | aucune purge |

Purge quotidienne, première exécution 1 min après le démarrage, désactivable par configuration.

### Routes utilitaires

Projets configurés, boards configurés (dashboard et QA), liste des projets Jira, configuration du temps.

## 4. Données

Paramètres d'intégration (secrets chiffrés), organisation (rétention, tenants), variables d'environnement.

## 5. Limites connues

- L'IA n'est pas implémentée : les dépendances et variables existent, et le README la décrit (routes `/api/ai`, `/api/kpi`, `/api/excel`), mais aucun code ne les utilise.
- Le README cite un fonctionnement obsolète (synchronisation toutes les 15 min) ; voir [Temps réel et planificateur](temps-reel-planificateur.md).
- Brevo n'est pas configurable depuis l'écran.
- Documentation de l'API : `/api-docs`, désactivée en production sauf activation explicite.
- Santé : `/api/health`, `/live`, `/ready` publics ; `/detailed` réservé au super admin.

## 6. Références code

- `backend/src/routes/authRoutes.ts` : routes `integration-settings` et organisation.
- `backend/src/domain/settings/integrationSettings.ts`.
- `backend/src/infrastructure/Container.ts` : reconstruction des clients.
- `backend/src/routes/jiraRoutes.ts` : routes utilitaires.
- `backend/src/application/services/retentionService.ts`, `backend/src/domain/organization/retention.ts`.
- `frontend/src/components/IntegrationSettingsPanel.tsx`, `RetentionSettingsPanel.tsx`.
