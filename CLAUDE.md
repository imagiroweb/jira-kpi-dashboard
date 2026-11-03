# Jira KPI Dashboard

Tableau de bord KPI Jira (sprints, worklogs, épics, support, performance des équipes, point hebdo) enrichi par l'IA. Monorepo yarn 1 : `backend/` (Node 20, Express, Socket.io, MongoDB, Redis, TypeScript) et `frontend/` (React 18, Vite, TailwindCSS, Recharts, Zustand).

## Commandes

Depuis la racine :

```bash
yarn install:all          # installe racine + backend + frontend
yarn lint                 # ESLint backend + frontend
yarn --cwd frontend typecheck
yarn test                 # Jest (backend) + Vitest (frontend) + récapitulatif
yarn test:backend         # ou: yarn --cwd backend test:routes
yarn test:frontend
yarn --cwd e2e test      # E2E Playwright (E2E_BASE_URL, défaut http://localhost:3000)
yarn dev                  # backend + frontend en parallèle
```

Le hook husky `pre-commit` lance lint, typecheck et tests : ils doivent passer avant chaque commit. La CI (`.github/workflows/ci.yml`) refait lint, tests, build et build Docker sur chaque PR vers `main` ou `develop`.

## Architecture backend (DDD)

- `src/domain/` : entités, value objects et règles métier pures (pas d'I/O). Chaque fichier a son `.test.ts` voisin.
- `src/application/` : services applicatifs, use cases, DTO.
- `src/infrastructure/` : clients externes (Jira, Monday, Brevo, email), cache, conteneur d'injection (`Container.ts`).
- `src/routes/` : routes Express, toutes testées avec supertest (voir `backend/docs/testing-routes.md`).

Frontend : la logique de calcul vit dans `frontend/src/domain/`, les composants dans `src/components/`, l'état global dans `src/store/useStore.ts`, les appels API dans `src/services/`.

## Conventions

- Code, commentaires et documentation en français.
- Toute nouvelle logique métier va dans `domain/` avec ses tests ; toute nouvelle route a son test de route.
- Ne jamais committer de secrets (`.env`, `env.prod.template` sont ignorés).
- Une branche par tâche (`claude/<sujet>` pour Claude), PR vers `develop` (déployée en préprod sur `jira-kpi-preprod.imagiro.fr`), puis `develop` → `main` pour la prod. Revue humaine obligatoire avant tout merge.

## Workflow agentique

La chaîne de travail est **Documentation → Analyse → Plan de tests → Dev → Sécurité → Review → Non-régression** :

1. **documentaliste** (`.claude/agents/documentaliste.md`) maintient la documentation fonctionnelle dans `docs/` à partir du code.
2. **analyste-metier** (`.claude/agents/analyste-metier.md`) cadre un besoin avec l'utilisateur en lisant **uniquement** `docs/`, puis rédige une spec (user stories + critères d'acceptation) dans une issue GitHub.
3. **qa** (`.claude/agents/qa.md`) écrit le plan de tests et les cas d'usage de la spec dans `docs/qa/plans/`.
4. La session principale (Dev) implémente la spec validée avec les tests du plan et ouvre une PR.
5. **securite** (`.claude/agents/securite.md`) audite la PR (failles, secrets, dépendances, contrôle d'accès) et propose des correctifs numérotés. Il ne modifie rien : la session principale n'applique que les correctifs validés par un humain, avec leur test.
6. **reviewer** (`.claude/agents/reviewer.md`) relit la PR contre la spec et le plan de tests avant la revue humaine.
7. Après le déploiement en préprod (push sur `develop`), `.github/workflows/e2e-preprod.yml` lance la non-régression Playwright (`e2e/`). En cas d'échec, une issue `non-regression` est ouverte et l'agent **qa** l'analyse.

Après chaque changement fonctionnel, mettre à jour la page concernée de `docs/` dans la même PR (ou déléguer au documentaliste).

### Modèles imposés et usage

| Rôle | Modèle |
|---|---|
| documentaliste, qa | Sonnet |
| analyste-metier, securite, reviewer | Opus |
| session principale (Dev) | Sonnet (`model` de `.claude/settings.json`) |
| routines (triage, veille PR, dépendances) | Haiku |

- Le modèle d'un rôle est celui de l'en-tête de `.claude/agents/<rôle>.md`. Le hook `PreToolUse` `.claude/hooks/agent-model-guard.cjs` refuse tout lancement d'un rôle avec un autre modèle (paramètre `model` de l'appel, ou `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`).
- À la fin de chaque sous-agent, le hook `SubagentStop` `.claude/hooks/agent-usage-report.cjs` affiche le modèle réellement utilisé et les tokens consommés, signale un modèle non respecté et ajoute une ligne à `.claude/logs/usage.jsonl` (non versionné). La session principale reprend cette ligne d'usage dans son compte rendu.
- Le modèle de la session principale est un choix initial : `/model` permet d'en changer pour une tâche qui le justifie.

### Économie de contexte

- Une tâche par session : `/clear` dès qu'on passe à une autre tâche, `/compact` quand une session devient longue. La compaction automatique se déclenche à 70 % de la fenêtre (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` dans `.claude/settings.json`).
- Déléguer aux rôles les lectures larges (documentation, audit, revue) : chaque sous-agent part d'un contexte vide et ne renvoie que son rapport.
- Ne pas recharger dans la session ce qu'un rapport résume déjà.

### Avec Cursor

Cursor charge ce fichier via `.cursor/rules/projet.mdc`.

- **Sous-agents (modèle imposé)** : `.cursor/agents/<rôle>.md` est généré depuis `.claude/agents/` par `node scripts/sync-cursor-agents.cjs`, avec l'identifiant de modèle Cursor (`claude-opus-5-5`, `claude-sonnet-5-5`) et `readonly: true` pour les rôles sans écriture. Lancer un rôle en sous-agent (par exemple « utilise le sous-agent securite ») pour que son modèle soit appliqué. Relancer le script après toute modification d'un rôle ; la CI vérifie que la copie est à jour.
- **Contrôle** : le hook `.cursor/hooks.json` bloque un sous-agent qui démarrerait sur un autre modèle et note chaque démarrage dans `.cursor/logs/usage.jsonl`. Cursor peut basculer sur un autre modèle si l'offre ou l'équipe ne l'autorise pas ; le hook le signale alors au lieu de laisser passer.
- **Usage** : Cursor ne donne pas les tokens à l'agent ; ils sont dans le tableau de bord https://cursor.com/dashboard/usage, ligne par modèle.
- **Règles** : `@analyste-metier`, `@documentaliste`, `@qa`, `@securite` et `@reviewer` restent disponibles, mais une règle utilise le modèle choisi dans le chat.
- **Contexte** : un nouveau chat par tâche.

Les fichiers `.claude/agents/*.md` restent la source unique des rôles.
