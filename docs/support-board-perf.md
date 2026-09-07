# Support Board — performances (issue #37)

## Problème

La page Support Board devient de plus en plus lente. Chaque ouverture / refresh déclenche des appels Jira / WorklogPro dont le volume croît avec le temps (backlog, historique, worklogs année en cours).

Issue : https://github.com/imagiroweb/jira-kpi-dashboard/issues/37  
Branche : `feature/37-fix-perf-support-board`

## Diagnostic (état actuel)

### Flux

1. **Frontend** (`SupportDashboard.tsx`) → `GET /api/worklog/support-kpi?activeSprint=…&from=&to=`
2. **Route** (`worklogRoutes.ts`) → `WorklogApplicationService.getSupportBoardKPI`
3. **À chaque appel**, en parallèle :
   - Jira JQL sprint ouvert (projet SB) — pagination `search/jql`
   - Jira JQL backlog (`Sprint is EMPTY AND statusCategory != Done`) — peut être très volumineux
   - `getSupportBuildRatio()` :
     - worklogs **sprint actif** par projet (`repo.search` — **non mis en cache**)
     - worklogs **YTD** (1er janv. → aujourd’hui) par projet (`repo.findByProject` — cache mémoire 5 min)

### Caches existants (insuffisants)

| Mécanisme | Rôle | Limite |
|-----------|------|--------|
| `CacheDecorator` (mémoire, TTL ~2–10 min) | Worklogs / sprints unitaires | `search()` **sans cache** ; TTL court ; vidé à chaque sync scheduler |
| Zustand + `localStorage` (frontend) | Dernier payload pour éviter un spinner au remount | 1er chargement / autre navigateur / autre filtre = toujours cold path Jira |
| `SupportSprintSnapshot` (Mongo) | Snapshots **manuels** de fin de sprint | Pas un cache live |

Le scheduler (`SYNC_INTERVAL_SECONDS`, défaut 4 h) fait `globalCache.clear()` puis rappelle `getSupportBoardKPI()` : utile pour préchauffer, mais **chaque miss HTTP** entre deux syncs peut re-payer le coût Jira + YTD.

### Goulot principal

**`getSupportBuildRatio` YTD** : N projets × worklogs depuis le 1er janvier. Chaîne typique (`JiraWorklogRepository`) :

1. `searchAllIssuesByJql` (issues avec `worklogDate` dans la plage)
2. **N+1** : `GET /issue/{key}/worklog` par ticket (`getIssueWorklogsForMany`, concurrence limitée)

Le coût croît linéairement dans l’année — c’est le symptôme décrit dans l’issue.

Secondaire : backlog SB non borné + pagination Jira ; `repo.search` (sprint) **sans** cache décorateur ; sync qui clear le cache puis jetteait le résultat KPI avant la phase 1.

Hors phase 1 (suivis possibles) : `?refresh=1` sur `support-kpi`, lazy-load du ratio en endpoint séparé, borne backlog (`searchIssuesLimited`).

## Options comparées

| Option | Idée | Avantages | Inconvénients | Verdict |
|--------|------|-----------|---------------|---------|
| **A. Cache résultat KPI** (mémoire → Redis plus tard) | Stocker le JSON agrégé `support-kpi` + `support-build-ratio` (TTL aligné sync) | Rapide à livrer, réutilise `globalCache`, UX immédiate | Perdu au restart process ; multi-instance = caches séparés | **Phase 1** |
| **B. Agrégats YTD persistés (Mongo)** | Table `WorklogHoursDaily` (projet, jour, heures) mise à jour par le scheduler ; ratio = somme SQL/Mongo | Scalable année après année ; survit au restart | Schéma + backfill + sync incrémental | **Phase 2** |
| **C. Miroir tickets SB en Mongo** | Sync incrémentale des issues / champs pondération | Historique custom ranges sans Jira | Complexe (champs custom, labels, drift) ; inutile pour `openSprints()` seul | Phase 3 si ranges longs restent lents |
| Snapshots manuels seuls | Déjà en place | Comparaison sprint | Ne résout pas le chargement live | Garder tel quel |

**Recommandation** : A puis B. Ne pas démarrer C tant que A+B ne suffisent pas.

## Plan d’action

### Phase 1 — Cache résultat (cette branche)

1. Clé de cache `support-kpi:active` ou `support-kpi:range:{from}:{to}`
2. Clé `support-build-ratio:{year}:{sprintFrom}:{sprintTo}` (TTL plus long, ex. 60 min)
3. Env `SUPPORT_KPI_CACHE_TTL_MINUTES` (défaut 30) et `SUPPORT_BUILD_RATIO_CACHE_TTL_MINUTES` (défaut 60)
4. Scheduler : clear → warm `getSupportBoardKPI()` (inchangé fonctionnellement, mais le warm remplit aussi ces clés)
5. Endpoint `GET /worklog/cache/stats` : exposer hits/miss simples (optionnel)
6. Tests unitaires hit/miss + bypass après invalidation

**Critère de succès** : 2ᵉ `GET /support-kpi` (mêmes filtres) < ~200 ms hors cold start ; logs `Cache HIT: support-kpi:…`

### Phase 2 — Persistance YTD (**faite**)

1. Collection Mongo `worklog_hours_daily` `{ projectKey, date, hours, updatedAt }` — `WorklogHoursDaily.ts`
2. Service `WorklogHoursDailyService` : sync J/J−1/J−2, backfill YTD si vide, somme par projet
3. `getSupportBuildRatio` lit Mongo pour YTD ; fallback Jira + upsert si projet sans couverture ; **sprint actif reste live**
4. Scheduler : `syncWorklogHoursDaily(3)` avant warm `getSupportBoardKPI`
5. Tests : `WorklogHoursDailyService.test.ts`, scheduler

**Critère de succès** : après 1er sync/backfill, chargements suivants YTD sans N+1 worklogs année entière ; logs `WorklogHoursDaily` / jql retrievalDetail contenant `(mongo worklog_hours_daily)`.

### Phase 3 — Si besoin

1. Borner le backlog (`searchIssuesLimited` / max tickets)
2. Miroir Mongo des issues SB pour filtres `from`/`to` longs
3. Redis partagé si plusieurs replicas backend

## Hors scope / non-régression

- Snapshots manuels (`POST /support-snapshot`) inchangés
- KPIs sprint / marketing / produit : ne pas casser leurs caches
- Fraîcheur : données support peuvent avoir jusqu’à TTL minutes de retard (acceptable vs sync 4 h déjà en place) ; bouton « sync » / clear cache force le refresh
